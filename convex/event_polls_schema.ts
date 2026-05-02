import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  budgetBucketValidator,
  eventStatusValidator,
  legacyCompatibleEventTagsValidator,
} from "./event_types";

export const eventPollSourceValidator = v.union(
  v.literal("recommendation"),
  v.literal("manual"),
);

export const eventPollStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
);

export const eventPollResolutionValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("no_consensus"),
);

export const eventPollSurfaceValidator = v.union(
  v.literal("chat"),
  v.literal("panel"),
);

export const eventPollOptionValidator = v.object({
  eventId: v.string(),
  title: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  startTime: v.optional(v.union(v.string(), v.null())),
  venueName: v.optional(v.union(v.string(), v.null())),
  venueCity: v.optional(v.union(v.string(), v.null())),
  venueNeighborhood: v.optional(v.union(v.string(), v.null())),
  venueCountry: v.optional(v.union(v.string(), v.null())),
  source: v.string(),
  url: v.string(),
  image: v.optional(v.union(v.string(), v.null())),
  tags: legacyCompatibleEventTagsValidator,
  status: v.optional(v.union(eventStatusValidator, v.null())),
  budgetBucket: v.optional(v.union(budgetBucketValidator, v.null())),
  genre: v.optional(v.union(v.string(), v.null())),
  venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
});

export const eventPollTables = {
  event_polls: defineTable({
    chatId: v.id("chats"),
    createdBy: v.id("users"),
    source: eventPollSourceValidator,
    surface: v.optional(eventPollSurfaceValidator),
    prompt: v.optional(v.string()),
    status: eventPollStatusValidator,
    resolution: v.optional(eventPollResolutionValidator),
    acceptedEventId: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    noConsensusMessage: v.optional(v.string()),
    options: v.array(eventPollOptionValidator),
    optionEventIds: v.array(v.string()),
    eligibleVoterIds: v.array(v.id("users")),
    closedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    reminderSentAt: v.optional(v.number()),
  })
    .index("by_chat_id", ["chatId"])
    .index("by_chat_status", ["chatId", "status"]),
  event_poll_votes: defineTable({
    pollId: v.id("event_polls"),
    userId: v.id("users"),
    eventId: v.string(),
    timestamp: v.number(),
  })
    .index("by_poll_id", ["pollId"])
    .index("by_poll_user", ["pollId", "userId"])
    .index("by_poll_event", ["pollId", "eventId"]),
};
