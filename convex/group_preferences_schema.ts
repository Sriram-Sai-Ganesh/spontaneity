import { defineTable } from "convex/server";
import { v } from "convex/values";

export const budgetBucketValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.null(),
);

export const budgetPreferenceValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("mixed"),
  v.literal("unknown"),
);

export const distancePreferenceValidator = v.union(
  v.literal("nearby"),
  v.literal("citywide"),
  v.literal("far"),
  v.literal("mixed"),
  v.literal("unknown"),
);

export const categorySignalFields = {
  category: v.string(),
  acceptCount: v.number(),
  rejectCount: v.number(),
  moreLikeThisCount: v.number(),
};

export const categorySignalValidator = v.object(categorySignalFields);

export const groupPreferenceProfileFields = {
  chatId: v.id("chats"),
  categorySignals: v.array(categorySignalValidator),
  budgetPreference: budgetPreferenceValidator,
  distancePreference: distancePreferenceValidator,
  feedbackCount: v.number(),
  lastUpdatedAt: v.number(),
};

export const groupPreferenceProfileValidator = v.object(
  groupPreferenceProfileFields,
);

export const groupRecommendationSnapshotFields = {
  chatId: v.id("chats"),
  eventId: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  startTime: v.union(v.string(), v.null()),
  venueName: v.union(v.string(), v.null()),
  venueCity: v.union(v.string(), v.null()),
  source: v.string(),
  budgetBucket: budgetBucketValidator,
  lastRecommendedAt: v.number(),
  // Unified tags: EventTag[] for activity events, FoodTag[] for food venues.
  tags: v.optional(v.array(v.string())),
  // Kept optional for backwards compatibility with existing rows written before the
  // foodTags→tags consolidation. No longer written by new code.
  foodTags: v.optional(v.array(v.string())),
};

export const groupRecommendationSnapshotValidator = v.object(
  groupRecommendationSnapshotFields,
);

export const groupPreferenceTables = {
  groupPreferenceProfiles: defineTable(groupPreferenceProfileFields).index(
    "by_chat_id",
    ["chatId"],
  ),
  groupRecommendationSnapshots: defineTable(
    groupRecommendationSnapshotFields,
  )
    .index("by_chat_event_recommended_at", [
      "chatId",
      "eventId",
      "lastRecommendedAt",
    ])
    .index("by_chat_event", ["chatId", "eventId"]),
};
