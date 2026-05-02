import { defineTable } from "convex/server";
import { v } from "convex/values";

export const recommendationRunFields = {
  chatId: v.id("chats"),
  returnedEventCount: v.number(),
  fallbackUsed: v.boolean(),
  fallbackReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
};

export const recommendationRunValidator = v.object(recommendationRunFields);

export const recommendationMetricsTables = {
  recommendationRuns: defineTable(recommendationRunFields)
    .index("by_chat_id", ["chatId"])
    .index("by_chat_created_at", ["chatId", "createdAt"]),
};
