import { v } from "convex/values";
import { defineTable } from "convex/server";

export const feedbackTypeValidator = v.union(
  v.literal("accept"),
  v.literal("reject"),
  v.literal("cancel"),
  v.literal("more-like-this"),
);

export const feedbackFields = {
  eventId: v.string(), // external provider event ID (e.g. Ticketmaster ID)
  userId: v.id("users"),
  chatId: v.id("chats"),
  feedbackType: feedbackTypeValidator,
  timestamp: v.number(), // Unix ms timestamp
  // How many times this type has been submitted. Resets to 1 on type change.
  clickCount: v.optional(v.number()),
};

export const feedbackTables = {
  feedback: defineTable(feedbackFields)
    .index("by_chat_id", ["chatId"])
    .index("by_user_id", ["userId"])
    .index("by_chat_event", ["chatId", "eventId"]),
};
