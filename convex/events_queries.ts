import { v } from "convex/values";
import { query } from "./_generated/server";
import { normalizeEventTags, type NormalizedEvent } from "./event_types";

function normalizeStoredEvent<T extends { tags?: readonly string[] | undefined }>(
  event: T,
) {
  return {
    ...event,
    tags: normalizeEventTags(event.tags),
  };
}

// Get all events
export const getAllEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    return events.map(normalizeStoredEvent);
  },
});

// Get events for the Explore page: upcoming first, then events without a date.
// Uses all stored events so the page is populated even before upcoming events are available.
export const getUpcomingEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;
    const now = new Date().toISOString();

    // Prefer upcoming events; fall back to all events if none exist yet
    const upcoming = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q) => q.gte("startTime", now))
      .take(limit);

    if (upcoming.length > 0) {
      return upcoming.map(normalizeStoredEvent);
    }

    // No upcoming events — return all events (sorted by startTime asc, undated last)
    const all = await ctx.db.query("events").collect();
    const sorted = all.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });
    return sorted.slice(0, limit).map(normalizeStoredEvent);
  },
});

// Get recent events (last 30 days)
export const getRecentEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const events = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q) => q.gte("startTime", thirtyDaysAgo))
      .take(limit);
    
    return events.map(normalizeStoredEvent);
  },
});

// Get events by city
export const getEventsByCity = query({
  args: {
    city: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_venue_city", (q) => q.eq("venueCity", args.city))
      .collect();
    return events.map(normalizeStoredEvent);
  },
});

// Get events within a date range
export const getEventsByDateRange = query({
  args: {
    startDate: v.string(), // ISO date string
    endDate: v.string(),   // ISO date string
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q) =>
        q.gte("startTime", args.startDate).lte("startTime", args.endDate)
      )
      .collect();
    return events.map(normalizeStoredEvent);
  },
});

// Get a specific event by eventId
export const getEventById = query({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    return event ? normalizeStoredEvent(event) : null;
  },
});

// Get multiple events by their IDs (batch query)
export const getEventsByIds = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const events = await Promise.all(
      args.eventIds.map((eventId) =>
        ctx.db
          .query("events")
          .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
          .first()
      )
    );
    return events.map((event) => (event ? normalizeStoredEvent(event) : null));
  },
});

// Search events with filters
export const searchEvents = query({
  args: {
    keyword: v.optional(v.string()),
    city: v.optional(v.string()),
    source: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;

    // Apply filters - only one index can be used per query
    if (args.city) {
      q = ctx.db.query("events").withIndex("by_venue_city", (query) => query.eq("venueCity", args.city!));
    } else if (args.startDate && args.endDate) {
      q = ctx.db.query("events").withIndex("by_start_time", (query) =>
        query.gte("startTime", args.startDate).lte("startTime", args.endDate)
      );
    } else if (args.source) {
      q = ctx.db.query("events").withIndex("by_source", (query) => query.eq("source", args.source!));
    } else {
      q = ctx.db.query("events");
    }

    let results = await q.collect();

    // Apply additional filters that can't use indexes
    if (args.keyword) {
      const keyword = args.keyword.toLowerCase();
      results = results.filter(event =>
        event.title.toLowerCase().includes(keyword) ||
        (event.description && event.description.toLowerCase().includes(keyword)) ||
        (event.venueName && event.venueName.toLowerCase().includes(keyword))
      );
    }

    if (args.budgetBucket) {
      results = results.filter(event => event.budgetBucket === args.budgetBucket);
    }

    // Sort by start time (earliest first)
    results.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    // Apply limit
    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results.map(normalizeStoredEvent);
  },
});

// Convert database event to NormalizedEvent format
export function dbEventToNormalizedEvent(dbEvent: any): NormalizedEvent {
  return {
    eventId: dbEvent.eventId,
    title: dbEvent.title,
    description: dbEvent.description || null,
    startTime: dbEvent.startTime || null,
    venueName: dbEvent.venueName || null,
    venueCity: dbEvent.venueCity || null,
    venueNeighborhood: dbEvent.venueNeighborhood ?? null,
    venueCountry: dbEvent.venueCountry || null,
    latitude: dbEvent.latitude ?? undefined,
    longitude: dbEvent.longitude ?? undefined,
    formattedAddress: dbEvent.formattedAddress ?? undefined,
    googlePlaceId: dbEvent.googlePlaceId ?? undefined,
    source: dbEvent.source,
    url: dbEvent.url,
    sourceLinks: dbEvent.sourceLinks ?? undefined,
    image: dbEvent.image || null,
    tags: normalizeEventTags(dbEvent.tags),
    status: dbEvent.status || null,
    budgetBucket: dbEvent.budgetBucket || null,
    genre: dbEvent.genre ?? null,
    venueType: dbEvent.venueType === "food" ? "food" : "activity",
  };
}
