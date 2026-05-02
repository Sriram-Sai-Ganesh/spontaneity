import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  budgetBucketValidator,
  combinedVenueTagValidator,
  eventStatusValidator,
} from "./event_types";

export const shortlistedEventSnapshotValidator = v.object({
  eventId: v.string(),
  title: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  startTime: v.optional(v.union(v.string(), v.null())),
  venueName: v.optional(v.union(v.string(), v.null())),
  venueCity: v.optional(v.union(v.string(), v.null())),
  venueNeighborhood: v.optional(v.union(v.string(), v.null())),
  venueCountry: v.optional(v.union(v.string(), v.null())),
  formattedAddress: v.optional(v.union(v.string(), v.null())),
  latitude: v.optional(v.union(v.number(), v.null())),
  longitude: v.optional(v.union(v.number(), v.null())),
  googlePlaceId: v.optional(v.union(v.string(), v.null())),
  source: v.string(),
  url: v.optional(v.union(v.string(), v.null())),
  image: v.optional(v.union(v.string(), v.null())),
  tags: v.optional(v.array(combinedVenueTagValidator)),
  status: v.optional(v.union(eventStatusValidator, v.null())),
  budgetBucket: v.optional(v.union(budgetBucketValidator, v.null())),
  genre: v.optional(v.union(v.string(), v.null())),
  venueType: v.optional(v.union(v.literal("food"), v.literal("activity"), v.null())),
  openHours: v.optional(v.union(
    v.array(v.object({
      dayOfWeek: v.number(),
      openTime: v.string(),
      closeTime: v.string(),
    })),
    v.null(),
  )),
});

export const eventShortlistTables = {
  event_shortlists: defineTable({
    chatId: v.id("chats"),
    eventId: v.string(),
    createdBy: v.id("users"),
    event: shortlistedEventSnapshotValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    startTimeMs: v.optional(v.number()),
    reminderSentAt: v.optional(v.number()),
  })
    .index("by_chat_id", ["chatId"])
    .index("by_chat_event", ["chatId", "eventId"])
    .index("by_start_time", ["startTimeMs"]),
};
