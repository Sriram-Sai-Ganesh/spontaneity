import { defineTable } from "convex/server";
import { v } from "convex/values";
import { combinedVenueTagValidator, eventSourceLinksValidator, eventTagsValidator } from "./event_types";
import { venueLocationAllFields } from "./location_types";

/**
 * Custom events created by users in chat (formerly stored in non_ticket_events).
 * These are one-off, user-defined events with a specific start/end time.
 */
export const customEventTables = {
  custom_events: defineTable({
    // Unique identifier (UUID generated at creation)
    eventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),   // ISO 8601
    endTime: v.optional(v.string()),     // ISO 8601
    location: v.optional(v.string()),    // free-text location / address
    ...venueLocationAllFields,
    source: v.optional(v.string()),
    url: v.optional(v.string()),
    sourceLinks: eventSourceLinksValidator,
    image: v.optional(v.string()),
    genre: v.optional(v.string()),
    // Always includes "Custom"; may include additional AI-assigned tags
    tags: eventTagsValidator,
    tagsConfirmed: v.optional(v.boolean()),
    budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    // The chat the event was created in
    chatId: v.id("chats"),
    // The user who created the event
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_chat_id", ["chatId"])
    .index("by_created_by", ["createdBy"])
    .index("by_start_time", ["startTime"]),
};

/**
 * Non-ticket events: evergreen venues from Google Places, Yelp, or similar
 * sources that have regular weekly open/close hours rather than a single
 * ticket-sale start time.
 *
 * Each row is either a food spot (restaurant, café, bar, etc.) or an activity
 * spot (gym, bowling alley, etc.) distinguished by `venueType`.
 *
 * Both types share a single `tags` column: food spots store FoodTag values
 * (cuisine types), activity spots store EventTag values. venueType determines
 * which kind of tags are present.
 */
export const nonTicketEventTables = {
  non_ticket_events: defineTable({
    // Unique identifier — prefixed by source, e.g. "gp_ChIJ…" or "yelp_abc123"
    placeId: v.string(),
    // Data source identifier
    source: v.string(),    // "google_places" | "yelp"
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),    // formatted address
    ...venueLocationAllFields,
    url: v.optional(v.string()),
    // Classify this place as a food spot or an activity spot
    venueType: v.union(v.literal("food"), v.literal("activity")),
    // Weekly open hours — one entry per open period
    // dayOfWeek: 0 = Sunday, 1 = Monday, …, 6 = Saturday
    openHours: v.optional(v.array(v.object({
      dayOfWeek: v.number(),
      openTime: v.string(),    // "HH:MM" 24-hour local time
      closeTime: v.string(),   // "HH:MM" 24-hour local time
    }))),
    // Unified tags column: FoodTag[] for food venues, EventTag[] for activity venues.
    tags: v.optional(v.array(combinedVenueTagValidator)),
    // AI tagging bookkeeping (only meaningful for venueType === "activity")
    tagsConfirmed: v.optional(v.boolean()),
    tagAttempts: v.optional(v.number()),
    budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    // Chat this place was fetched for (used for scoping)
    chatId: v.id("chats"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_place_id", ["placeId"])
    .index("by_chat_id", ["chatId"])
    .index("by_venue_type", ["venueType"])
    .index("by_chat_and_place_id", ["chatId", "placeId"])
    .index("by_venue_city", ["venueCity"]),
};
