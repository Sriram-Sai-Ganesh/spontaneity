import { defineTable } from "convex/server";
import { v } from "convex/values";

export const passivePreferenceSignalFields = {
  chatId: v.id("chats"),
  userId: v.id("users"),
  messageId: v.optional(v.string()),
  type: v.string(),
  value: v.string(),
  polarity: v.union(v.literal("positive"), v.literal("negative")),
  strength: v.number(),
  confidence: v.number(),
  timeScope: v.union(v.literal("short_term"), v.literal("long_term")),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected"),
  ),
  createdAt: v.number(),
  extractionBatchId: v.string(),
};

export const passivePreferenceTables = {
  passivePreferenceSignals: defineTable(passivePreferenceSignalFields)
    .index("by_chat_user_status", ["chatId", "userId", "status"])
    .index("by_batch", ["extractionBatchId"]),
};
