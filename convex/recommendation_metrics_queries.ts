import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";

const metricsReturnValidator = v.object({
  recommendationRunsCount: v.number(),
  returnedEventsCount: v.number(),
  fallbackUsageCount: v.number(),
  fallbackUsageRate: v.union(v.number(), v.null()),
  acceptedCount: v.number(),
  rejectedCount: v.number(),
  cancelledCount: v.number(),
  moreLikeThisCount: v.number(),
  actionableFeedbackCount: v.number(),
  acceptRate: v.union(v.number(), v.null()),
  lastRecommendedAt: v.union(v.number(), v.null()),
  lastFallbackAt: v.union(v.number(), v.null()),
  lastFallbackReason: v.union(v.string(), v.null()),
});

export const getRecommendationMetricsForChatInternal = internalQuery({
  args: {
    chatId: v.id("chats"),
  },
  returns: metricsReturnValidator,
  handler: async (ctx, { chatId }) => {
    const [runs, feedbackRows] = await Promise.all([
      ctx.db
        .query("recommendationRuns")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .collect(),
      ctx.db
        .query("feedback")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .collect(),
    ]);

    const acceptedCount = feedbackRows.filter((row) => row.feedbackType === "accept").length;
    const rejectedCount = feedbackRows.filter((row) => row.feedbackType === "reject").length;
    const cancelledCount = feedbackRows.filter((row) => row.feedbackType === "cancel").length;
    const moreLikeThisCount = feedbackRows.filter(
      (row) => row.feedbackType === "more-like-this",
    ).length;
    const actionableFeedbackCount = acceptedCount + rejectedCount + cancelledCount;

    const fallbackRuns = runs.filter((row) => row.fallbackUsed);
    const lastRun = runs.reduce<(typeof runs)[number] | null>(
      (latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest),
      null,
    );
    const lastFallbackRun = fallbackRuns.reduce<(typeof fallbackRuns)[number] | null>(
      (latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest),
      null,
    );

    return {
      recommendationRunsCount: runs.length,
      returnedEventsCount: runs.reduce((sum, row) => sum + row.returnedEventCount, 0),
      fallbackUsageCount: fallbackRuns.length,
      fallbackUsageRate: runs.length > 0 ? fallbackRuns.length / runs.length : null,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      moreLikeThisCount,
      actionableFeedbackCount,
      acceptRate: actionableFeedbackCount > 0 ? acceptedCount / actionableFeedbackCount : null,
      lastRecommendedAt: lastRun?.createdAt ?? null,
      lastFallbackAt: lastFallbackRun?.createdAt ?? null,
      lastFallbackReason: lastFallbackRun?.fallbackReason ?? null,
    };
  },
});

export const getRecommendationMetricsForChat = queryWithAuth({
  args: {
    chatId: v.id("chats"),
  },
  returns: v.union(metricsReturnValidator, v.null()),
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return null;

    const [runs, feedbackRows] = await Promise.all([
      ctx.db
        .query("recommendationRuns")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .collect(),
      ctx.db
        .query("feedback")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .collect(),
    ]);

    const acceptedCount = feedbackRows.filter((row) => row.feedbackType === "accept").length;
    const rejectedCount = feedbackRows.filter((row) => row.feedbackType === "reject").length;
    const cancelledCount = feedbackRows.filter((row) => row.feedbackType === "cancel").length;
    const moreLikeThisCount = feedbackRows.filter(
      (row) => row.feedbackType === "more-like-this",
    ).length;
    const actionableFeedbackCount = acceptedCount + rejectedCount + cancelledCount;

    const fallbackRuns = runs.filter((row) => row.fallbackUsed);
    const lastRun = runs.reduce<(typeof runs)[number] | null>(
      (latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest),
      null,
    );
    const lastFallbackRun = fallbackRuns.reduce<(typeof fallbackRuns)[number] | null>(
      (latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest),
      null,
    );

    return {
      recommendationRunsCount: runs.length,
      returnedEventsCount: runs.reduce((sum, row) => sum + row.returnedEventCount, 0),
      fallbackUsageCount: fallbackRuns.length,
      fallbackUsageRate: runs.length > 0 ? fallbackRuns.length / runs.length : null,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      moreLikeThisCount,
      actionableFeedbackCount,
      acceptRate: actionableFeedbackCount > 0 ? acceptedCount / actionableFeedbackCount : null,
      lastRecommendedAt: lastRun?.createdAt ?? null,
      lastFallbackAt: lastFallbackRun?.createdAt ?? null,
      lastFallbackReason: lastFallbackRun?.fallbackReason ?? null,
    };
  },
});
