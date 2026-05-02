import { v } from "convex/values";
import { defineTable } from "convex/server";

export const friendActivityTypeValidator = v.union(
  v.literal("accepted_friend"),
  v.literal("rsvp_going"),
);

export const friendActivityMetadataValidator = v.object({
  eventId: v.optional(v.string()),
  eventTitle: v.optional(v.string()),
  chatId: v.optional(v.id("chats")),
});

export const friendActivityTables = {
  friend_activities: defineTable({
    userId: v.id("users"),
    activityType: friendActivityTypeValidator,
    metadata: friendActivityMetadataValidator,
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created_at", ["userId", "createdAt"]),
};
