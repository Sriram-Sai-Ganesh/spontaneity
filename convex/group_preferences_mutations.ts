import { v, type GenericId } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  budgetPreferenceValidator,
  categorySignalValidator,
  distancePreferenceValidator,
  groupRecommendationSnapshotFields,
} from "./group_preferences_schema";
import { inferTagsFromText } from "./ranking";

type GroupPreferenceProfileInput = {
  chatId: GenericId<"chats">;
  categorySignals: Array<{
    category: string;
    acceptCount: number;
    rejectCount: number;
    moreLikeThisCount: number;
  }>;
  budgetPreference: "low" | "medium" | "high" | "mixed" | "unknown";
  distancePreference: "nearby" | "citywide" | "far" | "mixed" | "unknown";
  feedbackCount: number;
  lastUpdatedAt: number;
};

type BudgetPreference = GroupPreferenceProfileInput["budgetPreference"];
type BudgetCounts = { low: number; medium: number; high: number };

/**
 * Returns all category tags that should receive feedback credit for a snapshot.
 * Uses the snapshot's stored EventTag values when available (more accurate),
 * falling back to text pattern matching for older snapshots without tags.
 * Also includes food tags (e.g. "Italian", "Seafood") so that rejecting a
 * restaurant accumulates a learned penalty for that cuisine type.
 * Returns lowercase strings for consistent Map key usage.
 */
function inferTagsFromSnapshot(snapshot: {
  title: string;
  description: string | null;
  venueName: string | null;
  venueCity: string | null;
  tags?: string[];
}): string[] {
  // tags holds both EventTag[] (activity events) and FoodTag[] (food venues) in the
  // unified column. Filter sentinel values and lowercase for Map key consistency.
  const storedTags = (snapshot.tags ?? [])
    .filter((t) => t !== "Custom" && t !== "None")
    .map((t) => t.toLowerCase());

  if (storedTags.length > 0) {
    return [...new Set(storedTags)];
  }

  // Fallback: infer from text using TAG_PATTERNS (covers older snapshots without tags).
  const text = [
    snapshot.title,
    snapshot.description,
    snapshot.venueName,
    snapshot.venueCity,
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(" ");
  return inferTagsFromText(text).map((t) => t.toLowerCase());
}

function applyFeedbackToCategoryCounts(
  counts: { acceptCount: number; rejectCount: number; moreLikeThisCount: number },
  feedbackType: "accept" | "reject" | "cancel" | "more-like-this",
) {
  if (feedbackType === "accept") {
    counts.acceptCount += 1;
    return;
  }

  if (feedbackType === "reject" || feedbackType === "cancel") {
    counts.rejectCount += 1;
    return;
  }

  counts.moreLikeThisCount += 1;
}

function applyFeedbackToBudgetCounts(
  counts: BudgetCounts,
  feedbackType: "accept" | "reject" | "cancel" | "more-like-this",
  budgetBucket: "low" | "medium" | "high",
) {
  const weight =
    feedbackType === "accept"
      ? 2
      : feedbackType === "more-like-this"
        ? 1
        : -1;
  counts[budgetBucket] += weight;
}

function inferBudgetPreference(counts: BudgetCounts): BudgetPreference {
  const ranked = Object.entries(counts)
    .sort(([, left], [, right]) => right - left) as Array<
      ["low" | "medium" | "high", number]
    >;

  const [topBucket, topScore] = ranked[0];
  const [, secondScore] = ranked[1];

  if (topScore <= 0) return "unknown";
  if (topScore === secondScore) return "mixed";
  return topBucket;
}

async function upsertGroupPreferenceProfile(
  ctx: MutationCtx,
  args: GroupPreferenceProfileInput,
) {
  const existing = await ctx.db
    .query("groupPreferenceProfiles")
    .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, args);
    return existing._id;
  }

  return ctx.db.insert("groupPreferenceProfiles", args);
}

export async function rebuildGroupPreferenceProfileFromFeedback(
  ctx: MutationCtx,
  chatId: GenericId<"chats">,
) {
  const feedbackRows = await ctx.db
    .query("feedback")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();

  if (feedbackRows.length === 0) {
    return null;
  }

  const snapshotEntries = await Promise.all(
    [...new Set(feedbackRows.map((row) => row.eventId))].map(async (eventId) => {
      const snapshots = await ctx.db
        .query("groupRecommendationSnapshots")
        .withIndex("by_chat_event_recommended_at", (q) =>
          q.eq("chatId", chatId).eq("eventId", eventId),
        )
        .collect();

      return [eventId, snapshots] as const;
    }),
  );

  const snapshotsByEventId = new Map<
    string,
    Array<(typeof snapshotEntries)[number][1][number]>
  >();
  for (const [eventId, snapshots] of snapshotEntries) {
    if (snapshots.length > 0) {
      snapshotsByEventId.set(
        eventId,
        [...snapshots].sort(
          (left, right) => left.lastRecommendedAt - right.lastRecommendedAt,
        ),
      );
    }
  }
  const signals = new Map<
    string,
    { acceptCount: number; rejectCount: number; moreLikeThisCount: number }
  >();
  const budgetCounts: BudgetCounts = {
    low: 0,
    medium: 0,
    high: 0,
  };
  let feedbackCount = 0;
  let lastUpdatedAt = 0;

  for (const feedbackRow of feedbackRows) {
    const snapshots = snapshotsByEventId.get(feedbackRow.eventId);
    const snapshot = snapshots
      ?.filter((candidate) => candidate.lastRecommendedAt <= feedbackRow.timestamp)
      .slice(-1)[0];
    if (!snapshot) {
      continue;
    }

    let usedFeedback = false;
    // Apply feedback credit to every inferred tag (e.g. a Rock Concert updates
    // both "concert" and "rock" signals). This makes feedback more granular:
    // "more like this" on a bowling event now boosts future bowling events.
    const inferredTags = inferTagsFromSnapshot(snapshot);
    for (const tag of inferredTags) {
      const counts = signals.get(tag) ?? {
        acceptCount: 0,
        rejectCount: 0,
        moreLikeThisCount: 0,
      };
      applyFeedbackToCategoryCounts(counts, feedbackRow.feedbackType);
      signals.set(tag, counts);
      usedFeedback = true;
    }

    if (snapshot.budgetBucket) {
      applyFeedbackToBudgetCounts(
        budgetCounts,
        feedbackRow.feedbackType,
        snapshot.budgetBucket,
      );
      usedFeedback = true;
    }

    if (!usedFeedback) {
      continue;
    }

    feedbackCount += 1;
    lastUpdatedAt = Math.max(lastUpdatedAt, feedbackRow.timestamp);
  }

  if (feedbackCount === 0) {
    return null;
  }

  return upsertGroupPreferenceProfile(ctx, {
    chatId,
    categorySignals: [...signals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, counts]) => ({
        category,
        acceptCount: counts.acceptCount,
        rejectCount: counts.rejectCount,
        moreLikeThisCount: counts.moreLikeThisCount,
      })),
    budgetPreference: inferBudgetPreference(budgetCounts),
    distancePreference: "unknown",
    feedbackCount,
    lastUpdatedAt,
  });
}

export const upsertGroupPreferenceProfileInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    categorySignals: v.array(categorySignalValidator),
    budgetPreference: budgetPreferenceValidator,
    distancePreference: distancePreferenceValidator,
    feedbackCount: v.number(),
    lastUpdatedAt: v.number(),
  },
  returns: v.id("groupPreferenceProfiles"),
  handler: (ctx, args) => upsertGroupPreferenceProfile(ctx, args),
});

export const upsertGroupRecommendationSnapshotInternal = internalMutation({
  args: groupRecommendationSnapshotFields,
  returns: v.id("groupRecommendationSnapshots"),
  handler: async (ctx, args) => {
    // Dedup by [chatId, eventId] only — lastRecommendedAt is always Date.now() so
    // the old by_chat_event_recommended_at lookup never matched, creating one new row
    // per event per query call and growing the table unboundedly.
    const existing = await ctx.db
      .query("groupRecommendationSnapshots")
      .withIndex("by_chat_event", (q) =>
        q.eq("chatId", args.chatId).eq("eventId", args.eventId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return ctx.db.insert("groupRecommendationSnapshots", args);
  },
});

export const rebuildGroupPreferenceProfileFromFeedbackInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
  },
  returns: v.union(v.id("groupPreferenceProfiles"), v.null()),
  handler: (ctx, { chatId }) =>
    rebuildGroupPreferenceProfileFromFeedback(ctx, chatId),
});

/**
 * Directly applies a single feedback action to the group preference profile.
 * Looks up the event's current tags from non_ticket_events (Google Places) or
 * events (Ticketmaster/Yelp) and additively increments the matching category
 * signal counts. Never undoes previous contributions — all feedback accumulates.
 */
export const applyFeedbackToProfileInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    eventId: v.string(),
    feedbackType: v.union(
      v.literal("accept"),
      v.literal("reject"),
      v.literal("cancel"),
      v.literal("more-like-this"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { chatId, eventId, feedbackType }) => {
    // 1. Look up event tags — non_ticket_events first, then events table.
    let tags: string[] = [];
    let budgetBucket: "low" | "medium" | "high" | null = null;

    const nonTicketPlace = await ctx.db
      .query("non_ticket_events")
      .filter((q) => q.eq(q.field("placeId"), eventId))
      .first();

    if (nonTicketPlace) {
      tags = ((nonTicketPlace.tags ?? []) as string[])
        .filter((t) => t !== "Custom" && t !== "None")
        .map((t) => t.toLowerCase());
      // non_ticket_events has no genre field; fall back to first tag if empty
      budgetBucket = nonTicketPlace.budgetBucket ?? null;
    } else {
      const event = await ctx.db
        .query("events")
        .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
        .first();
      if (event) {
        tags = ((event.tags ?? []) as string[])
          .filter((t) => t !== "Custom" && t !== "None")
          .map((t) => t.toLowerCase());
        if (tags.length === 0 && event.genre) tags = [event.genre.toLowerCase()];
        budgetBucket = event.budgetBucket ?? null;
      }
    }

    if (tags.length === 0) return null; // no tags to learn from

    // 2. Get or create profile.
    const existing = await ctx.db
      .query("groupPreferenceProfiles")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .unique();

    const signals = new Map<string, { acceptCount: number; rejectCount: number; moreLikeThisCount: number }>();
    if (existing) {
      for (const s of existing.categorySignals) {
        signals.set(s.category, { acceptCount: s.acceptCount, rejectCount: s.rejectCount, moreLikeThisCount: s.moreLikeThisCount });
      }
    }

    // 3. Additively apply feedback to each tag (never undo).
    for (const tag of tags) {
      const s = signals.get(tag) ?? { acceptCount: 0, rejectCount: 0, moreLikeThisCount: 0 };
      if (feedbackType === "accept") s.acceptCount += 1;
      else if (feedbackType === "reject" || feedbackType === "cancel") s.rejectCount += 1;
      else if (feedbackType === "more-like-this") s.moreLikeThisCount += 1;
      signals.set(tag, s);
    }

    const categorySignals = [...signals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, counts]) => ({ category, ...counts }));

    // 4. Update budget preference if available.
    const budgetCounts = existing
      ? { low: 0, medium: 0, high: 0 }
      : { low: 0, medium: 0, high: 0 };
    // Carry forward existing budget by re-deriving from current signals is complex;
    // for simplicity just track in the existing budgetPreference field as-is and
    // use the rebuild path if full recalculation is needed.
    const budgetPreference = existing?.budgetPreference ?? "unknown";

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        categorySignals,
        feedbackCount: (existing.feedbackCount ?? 0) + 1,
        lastUpdatedAt: now,
      });
    } else {
      await ctx.db.insert("groupPreferenceProfiles", {
        chatId,
        categorySignals,
        budgetPreference,
        distancePreference: "unknown",
        feedbackCount: 1,
        lastUpdatedAt: now,
      });
    }

    return null;
  },
});
