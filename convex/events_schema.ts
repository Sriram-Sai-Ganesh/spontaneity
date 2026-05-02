import { defineTable } from "convex/server";
import { v } from "convex/values";
import { eventSourceLinksValidator, eventTagsValidator } from "./event_types";
import { venueLocationAllFields } from "./location_types";

export const eventTables = {
  events: defineTable({
    eventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),
    ...venueLocationAllFields,
    source: v.string(),
    url: v.string(),
    sourceLinks: eventSourceLinksValidator,
    image: v.optional(v.string()),
    tags: eventTagsValidator,
    tagsConfirmed: v.optional(v.boolean()),
    tagAttempts: v.optional(v.number()),
    status: v.optional(v.union(v.literal("onsale"), v.literal("offsale"), v.literal("cancelled"), v.literal("postponed"), v.literal("rescheduled"))),
    budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    genre: v.optional(v.string()),
    venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
    // Timestamp when this event was first stored
    createdAt: v.number(),
    // Timestamp when this event was last updated
    updatedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_source", ["source"])
    .index("by_start_time", ["startTime"])
    .index("by_venue_city", ["venueCity"]),
};