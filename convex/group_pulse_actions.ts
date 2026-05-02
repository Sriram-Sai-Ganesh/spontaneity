import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { internal } from "./_generated/api";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Generate an AI summary of the group's event preferences and
 * recommendation history for display in the Group Pulse panel.
 */
export const generateGroupPulseSummary = actionWithAuth({
  args: {
    chatId: v.id("chats"),
  },
  returns: v.string(),
  handler: async (ctx, { chatId }) => {
    // Verify membership
    const ownership = await ctx.runQuery(
      internal.messages_internals.verifyChatOwnership,
      { chatId, userId: ctx.userId },
    );
    if (!ownership.ok) throw new Error(ownership.error);

    const [metrics, preferences] = await Promise.all([
      ctx.runQuery(internal.recommendation_metrics_queries.getRecommendationMetricsForChatInternal, {
        chatId,
      }),
      ctx.runQuery(internal.group_preferences_queries.getGroupPreferenceProfileForChatId, {
        chatId,
      }),
    ]);

    if (metrics.recommendationRunsCount === 0 && metrics.actionableFeedbackCount === 0) {
      return "Not enough activity to generate a summary yet.";
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Server API key not configured");

    // Build context for the prompt
    const parts: string[] = [];

    if (metrics.recommendationRunsCount > 0) {
      parts.push(
        `The group has run ${metrics.recommendationRunsCount} recommendation search(es), returning ${metrics.returnedEventsCount} events total.`,
      );
    }

    if (metrics.actionableFeedbackCount > 0) {
      const acceptPct =
        metrics.acceptRate !== null ? Math.round(metrics.acceptRate * 100) : null;
      parts.push(
        `Out of ${metrics.actionableFeedbackCount} decisions: ${metrics.acceptedCount} accepted${acceptPct !== null ? ` (${acceptPct}%)` : ""}, ${metrics.rejectedCount} rejected, ${metrics.cancelledCount} cancelled.`,
      );
    }

    if (metrics.moreLikeThisCount > 0) {
      parts.push(`The group requested ${metrics.moreLikeThisCount} "more like this" suggestion(s).`);
    }

    if (metrics.fallbackUsageCount > 0 && metrics.fallbackUsageRate !== null) {
      parts.push(
        `Search fell back to broader results ${metrics.fallbackUsageCount} time(s) (${Math.round(metrics.fallbackUsageRate * 100)}% of searches).`,
      );
    }

    if (preferences) {
      if (preferences.budgetPreference !== "unknown") {
        parts.push(`Budget preference: ${preferences.budgetPreference}.`);
      }
      if (preferences.distancePreference !== "unknown") {
        parts.push(`Distance preference: ${preferences.distancePreference}.`);
      }

      const topCategories = [...preferences.categorySignals]
        .filter((s) => s.acceptCount + s.rejectCount + s.moreLikeThisCount > 0)
        .sort(
          (a, b) =>
            b.acceptCount + b.moreLikeThisCount - (a.acceptCount + a.moreLikeThisCount),
        )
        .slice(0, 5);

      if (topCategories.length > 0) {
        const lines = topCategories.map(
          (c) =>
            `${c.category} (${c.acceptCount} accepts, ${c.rejectCount} rejects, ${c.moreLikeThisCount} more-like-this)`,
        );
        parts.push(`Category signals: ${lines.join("; ")}.`);
      }
    }

    const context = parts.join(" ");

    try {
      const openrouter = createOpenRouter({ apiKey });
      const result = streamText({
        model: openrouter.chat("anthropic/claude-sonnet-4.5"),
        system:
          "You are a concise analyst summarizing a group's event preferences. Write 2-3 sentences in a friendly, direct tone. Focus on what the group clearly prefers or avoids based on their data.",
        messages: [
          {
            role: "user",
            content: `Summarize this group's event preferences and behavior:\n\n${context}`,
          },
        ],
        maxOutputTokens: 150,
      });

      let summary = "";
      for await (const chunk of (await result).textStream) {
        summary += chunk;
      }

      return summary.trim() || "Unable to generate a summary from the available data.";
    } catch {
      return "Unable to generate summary at this time.";
    }
  },
});
