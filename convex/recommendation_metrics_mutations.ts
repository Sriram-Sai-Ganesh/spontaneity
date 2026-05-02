import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const recordRecommendationRunInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    returnedEventCount: v.number(),
    fallbackUsed: v.boolean(),
    fallbackReason: v.union(v.string(), v.null()),
  },
  returns: v.id("recommendationRuns"),
  handler: async (ctx, args) => {
    return ctx.db.insert("recommendationRuns", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
