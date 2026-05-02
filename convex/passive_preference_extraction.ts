import { v } from "convex/values";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { actionWithAuth, mutationWithAuth, queryWithAuth } from "./lib";
import type { Id } from "./_generated/dataModel";

const CONFIDENCE_THRESHOLD = 0.7;

const KNOWN_CATEGORIES =
  "charity, dinner, brunch, lunch, movie, theater, sports, concert, music, outdoor, nightlife, bar, festival, comedy, art, party, casual";

function buildExtractionPrompt(formattedMessages: string): string {
  return `You are a preference signal extractor for an event recommendation system. Analyze these group chat messages and identify event preference signals for each user.

A preference signal is when a user explicitly or implicitly expresses what types of events or activities they like or dislike.

Messages (format: [messageId|userId] text):
${formattedMessages}

Return a JSON object with this exact structure (no markdown, no extra text):
{
  "signals": [
    {
      "message_id": "m0",
      "user_id": "u0",
      "type": "event_category",
      "value": "brunch",
      "polarity": "positive",
      "strength": 0.8,
      "confidence": 0.85,
      "time_scope": "short_term"
    }
  ]
}

Rules:
- Only include signals with confidence >= ${CONFIDENCE_THRESHOLD}
- polarity "positive" means the user wants this event type; "negative" means they dislike or want to avoid it
- value must be a lowercase event category from: ${KNOWN_CATEGORIES}
- Only extract signals with clear or reasonably strong evidence.
- Ignore weak suggestions unless reinforced.
- Ignore jokes unless multiple users reinforce them.
- Prefer normalized labels (e.g., "brunch", "outdoor", "cheap", "nightlife").
- If unclear, DO NOT include the signal.
- Do not hallucinate preferences.
- time_scope "short_term" = preference expressed for soon/this weekend; "long_term" = general ongoing preference
- If no clear signals found, return {"signals": []}`;
}

type RawSignal = {
  message_id: string;
  user_id: string;
  type: string;
  value: string;
  polarity: "positive" | "negative";
  strength: number;
  confidence: number;
  time_scope: "short_term" | "long_term";
};

// ── Public action: extract preference signals from recent user messages ────────

export const extractAndSaveSignals = actionWithAuth({
  args: {
    chatId: v.id("chats"),
    messages: v.array(
      v.object({
        id: v.string(),
        userId: v.id("users"),
        text: v.string(),
      }),
    ),
    openRouterApiKey: v.string(),
    model: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, { chatId, messages, openRouterApiKey, model }): Promise<number> => {
    if (messages.length === 0) return 0;

    // Verify membership
    const ownership = await ctx.runQuery(
      internal.messages_internals.verifyChatOwnership,
      { chatId, userId: ctx.userId },
    );
    if (!ownership.ok) throw new Error("Forbidden");

    // Map long Convex user IDs to short labels for the prompt
    const uniqueUserIds = [...new Set(messages.map((m) => m.userId))];
    const userIdToLabel = new Map(uniqueUserIds.map((uid, i) => [uid, `u${i}`]));
    const labelToUserId = new Map(uniqueUserIds.map((uid, i) => [`u${i}`, uid as Id<"users">]));

    const labelToMsgId: Record<string, string> = {};
    const formattedMessages = messages
      .map((m, i) => {
        labelToMsgId[`m${i}`] = m.id;
        return `[m${i}|${userIdToLabel.get(m.userId) ?? "u?"}] ${m.text}`;
      })
      .join("\n");

    // Call LLM to extract signals
    const effectiveApiKey = openRouterApiKey.trim() || process.env.OPENROUTER_API_KEY;
    if (!effectiveApiKey) {
      console.warn("[extractAndSaveSignals] No OpenRouter API key available, skipping extraction.");
      return 0;
    }

    let rawSignals: RawSignal[] = [];
    try {
      const openrouter = createOpenRouter({ apiKey: effectiveApiKey });
      const result = streamText({
        model: openrouter.chat(model),
        maxOutputTokens: 1200,
        messages: [{ role: "user", content: buildExtractionPrompt(formattedMessages) }],
      });
      let rawText = "";
      for await (const chunk of (await result).textStream) {
        rawText += chunk;
      }
      const text = rawText
        .trim()
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
      if (!text) {
        console.warn("[extractAndSaveSignals] LLM returned empty response, skipping.");
        return 0;
      }
      const parsed = JSON.parse(text) as { signals: RawSignal[] };
      rawSignals = Array.isArray(parsed.signals) ? parsed.signals : [];
    } catch (err) {
      console.error("[extractAndSaveSignals] LLM call or parse failed:", err);
      return 0;
    }

    const batchId = crypto.randomUUID();
    const now = Date.now();

    const validSignals = rawSignals
      .filter((s) => typeof s.confidence === "number" && s.confidence >= CONFIDENCE_THRESHOLD)
      .flatMap((s) => {
        const userId = labelToUserId.get(s.user_id);
        if (!userId) return [];
        if (s.polarity !== "positive" && s.polarity !== "negative") return [];
        if (s.time_scope !== "short_term" && s.time_scope !== "long_term") return [];
        return [
          {
            chatId,
            userId,
            messageId: labelToMsgId[s.message_id],
            type: s.type ?? "event_category",
            value: String(s.value).toLowerCase().trim(),
            polarity: s.polarity,
            strength: Math.min(1, Math.max(0, Number(s.strength) || 0.5)),
            confidence: Math.min(1, Math.max(0, Number(s.confidence))),
            timeScope: s.time_scope,
            status: "pending" as const,
            createdAt: now,
            extractionBatchId: batchId,
          },
        ];
      });

    if (validSignals.length === 0) return 0;

    return ctx.runMutation(
      internal.passive_preference_extraction.savePendingSignalsInternal,
      { signals: validSignals, currentUserId: ctx.userId },
    );
  },
});

// ── Internal mutation: persist extracted signals, skip duplicates ─────────────

export const savePendingSignalsInternal = internalMutation({
  args: {
    signals: v.array(
      v.object({
        chatId: v.id("chats"),
        userId: v.id("users"),
        messageId: v.optional(v.string()),
        type: v.string(),
        value: v.string(),
        polarity: v.union(v.literal("positive"), v.literal("negative")),
        strength: v.number(),
        confidence: v.number(),
        timeScope: v.union(v.literal("short_term"), v.literal("long_term")),
        status: v.literal("pending"),
        createdAt: v.number(),
        extractionBatchId: v.string(),
      }),
    ),
    currentUserId: v.id("users"),
  },
  returns: v.number(),
  handler: async (ctx, { signals, currentUserId }) => {
    let countForCurrentUser = 0;

    // Cache explicit preferences per user to avoid redundant DB queries
    const prefCache = new Map<string, { preferredEventTypes: string[]; negativeEventTypes: string[] }>();
    const getExplicitPrefs = async (userId: Id<"users">) => {
      const cached = prefCache.get(userId);
      if (cached) return cached;
      const row = await ctx.db
        .query("userEventPreferences")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .first();
      const prefs = {
        preferredEventTypes: row?.preferredEventTypes ?? [],
        negativeEventTypes: row?.negativeEventTypes ?? [],
      };
      prefCache.set(userId, prefs);
      return prefs;
    };

    for (const signal of signals) {
      // Skip if the user already has this preference explicitly set
      const prefs = await getExplicitPrefs(signal.userId);
      if (
        (signal.polarity === "positive" && prefs.preferredEventTypes.includes(signal.value)) ||
        (signal.polarity === "negative" && prefs.negativeEventTypes.includes(signal.value))
      ) {
        continue;
      }

      // Skip if a pending signal for this user+chat+value+polarity already exists
      const existing = await ctx.db
        .query("passivePreferenceSignals")
        .withIndex("by_chat_user_status", (q) =>
          q
            .eq("chatId", signal.chatId)
            .eq("userId", signal.userId)
            .eq("status", "pending"),
        )
        .collect();

      const duplicate = existing.find(
        (e) => e.value === signal.value && e.polarity === signal.polarity,
      );
      if (duplicate) continue;

      await ctx.db.insert("passivePreferenceSignals", signal);
      if (signal.userId === currentUserId) countForCurrentUser++;
    }

    return countForCurrentUser;
  },
});

// ── Public mutation: accept a signal → apply to user preferences ──────────────

export const acceptSignal = mutationWithAuth({
  args: { signalId: v.id("passivePreferenceSignals") },
  returns: v.null(),
  handler: async (ctx, { signalId }) => {
    const signal = await ctx.db.get(signalId);
    if (!signal || signal.userId !== ctx.userId) throw new Error("Not found");

    await ctx.db.patch(signalId, { status: "accepted" });

    if (signal.type !== "event_category") return null;

    const value = signal.value;
    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (signal.polarity === "positive") {
      const preferred = Array.from(
        new Set([...(existing?.preferredEventTypes ?? []), value]),
      );
      const negative = (existing?.negativeEventTypes ?? []).filter((t) => t !== value);
      if (existing) {
        await ctx.db.patch(existing._id, {
          preferredEventTypes: preferred,
          negativeEventTypes: negative,
        });
      } else {
        await ctx.db.insert("userEventPreferences", {
          userId: ctx.userId,
          preferredEventTypes: preferred,
          negativeEventTypes: negative,
        });
      }
    } else {
      const negative = Array.from(
        new Set([...(existing?.negativeEventTypes ?? []), value]),
      );
      const preferred = (existing?.preferredEventTypes ?? []).filter((t) => t !== value);
      if (existing) {
        await ctx.db.patch(existing._id, {
          preferredEventTypes: preferred,
          negativeEventTypes: negative,
        });
      } else {
        await ctx.db.insert("userEventPreferences", {
          userId: ctx.userId,
          preferredEventTypes: preferred,
          negativeEventTypes: negative,
        });
      }
    }

    return null;
  },
});

// ── Public mutation: reject/dismiss a signal ──────────────────────────────────

export const rejectSignal = mutationWithAuth({
  args: { signalId: v.id("passivePreferenceSignals") },
  returns: v.null(),
  handler: async (ctx, { signalId }) => {
    const signal = await ctx.db.get(signalId);
    if (!signal || signal.userId !== ctx.userId) throw new Error("Not found");
    await ctx.db.patch(signalId, { status: "rejected" });
    return null;
  },
});

// ── Public query: pending signals for the current user in a chat ──────────────

export const getPendingSignals = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("passivePreferenceSignals"),
      type: v.string(),
      value: v.string(),
      polarity: v.union(v.literal("positive"), v.literal("negative")),
      strength: v.number(),
      confidence: v.number(),
      timeScope: v.union(v.literal("short_term"), v.literal("long_term")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { chatId }) => {
    const signals = await ctx.db
      .query("passivePreferenceSignals")
      .withIndex("by_chat_user_status", (q) =>
        q
          .eq("chatId", chatId)
          .eq("userId", ctx.userId)
          .eq("status", "pending"),
      )
      .order("desc")
      .collect();

    return signals.map((s) => ({
      _id: s._id,
      type: s.type,
      value: s.value,
      polarity: s.polarity,
      strength: s.strength,
      confidence: s.confidence,
      timeScope: s.timeScope,
      createdAt: s.createdAt,
    }));
  },
});
