import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";
import {
  eventSourceLinksValidator,
  eventTagsValidator,
  normalizeEventTags,
  type EventTag,
} from "./event_types";

/**
 * Insert a new custom event created via the AI chat.
 * The "Custom" tag is always injected server-side regardless of what the caller passes.
 */
export const createCustomEvent = internalMutation({
  args: {
    eventId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    location: v.optional(v.string()),
    venueName: v.optional(v.string()),
    venueCity: v.optional(v.string()),
    venueNeighborhood: v.optional(v.string()),
    venueCountry: v.optional(v.string()),
    tags: eventTagsValidator,
    tagsConfirmed: v.optional(v.boolean()),
    budgetBucket: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    source: v.optional(v.string()),
    url: v.optional(v.string()),
    sourceLinks: eventSourceLinksValidator,
    chatId: v.id("chats"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Always include "Custom" tag
    const baseTags: EventTag[] = normalizeEventTags(args.tags);
    const tags: EventTag[] = baseTags.includes("Custom")
      ? baseTags
      : ["Custom", ...baseTags];

    const id = await ctx.db.insert("custom_events", {
      eventId: args.eventId,
      title: args.title,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      location: args.location,
      venueName: args.venueName,
      venueCity: args.venueCity,
      venueNeighborhood: args.venueNeighborhood,
      venueCountry: args.venueCountry,
      tags,
      tagsConfirmed: args.tagsConfirmed ?? true,
      budgetBucket: args.budgetBucket,
      source: args.source ?? "custom",
      url: args.url,
      sourceLinks: args.sourceLinks,
      chatId: args.chatId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return { id, eventId: args.eventId, tags };
  },
});

/**
 * Retrieve all custom events for a specific chat (most recent first).
 */
export const getCustomEventsForChat = internalQuery({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("custom_events")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .collect()
      .then((events) =>
        events.map((event) => ({
          ...event,
          tags: normalizeEventTags(event.tags),
        })),
      );
  },
});

export const listForChat = queryWithAuth({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    if (!await getChatIfMember(ctx, args.chatId)) return [];
    const events = await ctx.db
      .query("custom_events")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .collect();

    return events.map((event) => ({
      ...event,
      tags: normalizeEventTags(event.tags),
    }));
  },
});

/**
 * Retrieve all custom events created by a specific user in a chat (most recent first).
 */
export const getCustomEventsByUser = internalQuery({
  args: {
    chatId: v.id("chats"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("custom_events")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .collect();
    return events
      .filter((e) => e.createdBy === args.createdBy)
      .map((event) => ({
        ...event,
        tags: normalizeEventTags(event.tags),
      }));
  },
});

/**
 * Delete a custom event. Only the user who created it may delete it.
 * Returns { deleted: true } on success, or throws if not found / not owner.
 */
export const deleteCustomEvent = internalMutation({
  args: {
    eventId: v.string(),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("custom_events")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (!event) {
      throw new Error(`Custom event '${args.eventId}' not found.`);
    }

    if (event.createdBy !== args.requestingUserId) {
      throw new Error("You can only delete events you created.");
    }

    await ctx.db.delete(event._id);
    return { deleted: true, eventId: args.eventId, title: event.title };
  },
});

/**
 * Delete all custom events whose end time (or start time when end is absent)
 * is in the past. Called by the daily cron job.
 */
export const deleteExpiredCustomEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const allEvents = await ctx.db.query("custom_events").collect();
    let deletedCount = 0;
    for (const event of allEvents) {
      const expiryTime = event.endTime ?? event.startTime;
      if (expiryTime && expiryTime < now) {
        await ctx.db.delete(event._id);
        deletedCount++;
      }
    }
    return { deletedCount };
  },
});
