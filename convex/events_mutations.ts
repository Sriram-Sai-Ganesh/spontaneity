import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  eventSourceLinksValidator,
  eventTagsValidator,
  normalizeEventTags,
  type EventTag,
} from "./event_types";
import { venueLocationAllFields } from "./location_types";
// Store or update events in the database

export const storeEvents = internalMutation({
  args: {
    events: v.array(v.object({
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
      status: v.optional(v.union(v.literal("onsale"), v.literal("offsale"), v.literal("cancelled"), v.literal("postponed"), v.literal("rescheduled"))),
      budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
      genre: v.optional(v.string()),
      venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
      tagsConfirmed: v.optional(v.boolean()),
      tagAttempts: v.optional(v.number()),
    } )),

  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const event of args.events) {
      let existing = await ctx.db
        .query("events")
        .withIndex("by_event_id", (q) => q.eq("eventId", event.eventId))
        .first();
      if (!existing && event.startTime && event.venueCity) {
        const sameCityCandidates = await ctx.db
          .query("events")
          .withIndex("by_venue_city", (q) => q.eq("venueCity", event.venueCity!))
          .collect();
        existing = sameCityCandidates.find(
          (e) =>
            e.source === event.source &&
            e.venueName?.toLowerCase().trim() === event.venueName?.toLowerCase().trim() &&
            e.startTime === event.startTime
          
        ) ?? null;
        if (existing) {
        }
      }
      let finalTags: EventTag[] = normalizeEventTags(event.tags);
      let tagsConfirmed = event.tagsConfirmed ?? false;
      const tagAttempts = event.tagAttempts ?? existing?.tagAttempts ?? 0;

      if (existing?.tagsConfirmed) {
        // Already confirmed — never overwrite
        finalTags = normalizeEventTags(existing.tags);
        tagsConfirmed = true;
      } else if (event.tagsConfirmed && (event.tags ?? []).length > 0) {
        // Caller already tagged (e.g. storeAndTagEvents action) — accept as-is
        finalTags = normalizeEventTags(event.tags);
        tagsConfirmed = true;
      }

      const cleanEvent = {
        ...Object.fromEntries(
          Object.entries(event).filter(([_, v]) => v !== undefined)
        ) as typeof event,
        tags: finalTags,
        tagsConfirmed,
        tagAttempts,
      };

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...cleanEvent,
          createdAt: existing.createdAt, // never overwrite original createdAt
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("events", {
          ...cleanEvent,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});     

// Update a single event
export const updateEvent = internalMutation({
  args: {
    eventId: v.string(),
    updates: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      startTime: v.optional(v.string()),
      ...venueLocationAllFields,
      source: v.optional(v.string()),
      url: v.optional(v.string()),
      sourceLinks: eventSourceLinksValidator,
      image: v.optional(v.string()),
      tags: eventTagsValidator,
      tagsConfirmed: v.optional(v.boolean()),
      tagAttempts: v.optional(v.number()),
      status: v.optional(v.union(v.literal("onsale"), v.literal("offsale"), v.literal("cancelled"), v.literal("postponed"), v.literal("rescheduled"))),
      budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
      genre: v.optional(v.string()),
      venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();

    if (!existing) {
      throw new Error(`Event with eventId ${args.eventId} not found`);
    }

    await ctx.db.patch(existing._id, {
      ...args.updates,
      ...(args.updates.tags !== undefined
        ? { tags: normalizeEventTags(args.updates.tags) }
        : null),
      updatedAt: Date.now(),
    });
  },
});

// Delete an event
export const deleteEvent = internalMutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();

    if (!existing) {
      throw new Error(`Event with eventId ${args.eventId} not found`);
    }

    await ctx.db.delete(existing._id);
  },
});

//function used to set tags as [] to events previously stored as unset
export const backfillEmptyTags = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    for (const event of events) {
      if (!event.tags) {
        await ctx.db.patch(event._id, { 
          tags: [],
          tagsConfirmed: false,
          tagAttempts: 0,
        });
      }
    }
  },
});

export const deduplicateEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    const seen = new Map<string, typeof events[0]>();

    for (const event of events) {
      // Skip events with no time and no venue — can't reliably dedup
      if (!event.startTime && !event.venueName) continue;

      const key = `${event.startTime ?? ""}|${event.venueName?.toLowerCase().trim() ?? ""}`;

      if (seen.has(key)) {
        const existing = seen.get(key)!;

        // Keep the one with confirmed tags, or the earlier createdAt
        const keepExisting =
          existing.tagsConfirmed ||
          (!event.tagsConfirmed && existing.createdAt <= event.createdAt);

        if (keepExisting) {
          await ctx.db.delete(event._id);
        } else {
          await ctx.db.delete(existing._id);
          seen.set(key, event);
        }
      } else {
        seen.set(key, event);
      }
    }
  },
});

export const deleteExpiredEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const expiredEvents = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q) => q.lt("startTime", now))
      .collect();

    for (const event of expiredEvents) {
      await ctx.db.delete(event._id);
    }

  },
});

/** Removes Ticketmaster-sourced rows in the shared availability window so a refetch can repopulate from providers. */
export const deleteEventsInDateRange = internalMutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q) =>
        q.gte("startTime", args.startDate).lte("startTime", args.endDate),
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});
