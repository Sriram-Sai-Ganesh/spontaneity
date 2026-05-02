import { defineTable } from "convex/server";
import { v } from "convex/values";

export const rsvpStatusValidator = v.union(
  v.literal("going"),
  v.literal("maybe"),
  v.literal("not_going"),
);

export const rsvpTables = {
  rsvps: defineTable({
    eventId: v.string(),
    userId: v.id("users"),
    pollId: v.optional(v.id("event_polls")),
    chatId: v.id("chats"),
    status: rsvpStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_event_user", ["eventId", "userId"])
    .index("by_event_id", ["eventId"])
    .index("by_chat_id", ["chatId"])
    .index("by_user_id", ["userId"]),
};
