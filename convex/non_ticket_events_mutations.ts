import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { combinedVenueTagValidator, normalizeEventTags, type NormalizedEvent, type EventSourceLink } from "./event_types";
import { venueLocationAllFields } from "./location_types";

/**
 * Upsert a venue-based place (from Google Places, Yelp, etc.) into the
 * non_ticket_events table. If a row with the same placeId already exists for
 * this chat it is updated; otherwise a new row is inserted.
 */
export const upsertNonTicketPlace = internalMutation({
  args: {
    placeId: v.string(),
    source: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    ...venueLocationAllFields,
    url: v.optional(v.string()),
    venueType: v.union(v.literal("food"), v.literal("activity")),
    openHours: v.optional(v.array(v.object({
      dayOfWeek: v.number(),
      openTime: v.string(),
      closeTime: v.string(),
    }))),
    tags: v.optional(v.array(combinedVenueTagValidator)),
    tagsConfirmed: v.optional(v.boolean()),
    tagAttempts: v.optional(v.number()),
    budgetBucket: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("non_ticket_events")
      .withIndex("by_chat_and_place_id", (q) =>
        q.eq("chatId", args.chatId).eq("placeId", args.placeId),
      )
      .first();

    if (existing) {
      // Never overwrite confirmed activity tags.
      const preserveConfirmedTags =
        existing.venueType === "activity" &&
        existing.tagsConfirmed === true &&
        Array.isArray(existing.tags) &&
        existing.tags.length > 0;
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        venueName: args.venueName,
        venueCity: args.venueCity,
        venueNeighborhood: args.venueNeighborhood,
        venueCountry: args.venueCountry,
        latitude: args.latitude,
        longitude: args.longitude,
        formattedAddress: args.formattedAddress,
        googlePlaceId: args.googlePlaceId,
        url: args.url,
        venueType: args.venueType,
        openHours: args.openHours,
        ...(preserveConfirmedTags
          ? null
          : {
              tags: args.tags,
              tagsConfirmed: args.tagsConfirmed,
              tagAttempts: args.tagAttempts,
            }),
        budgetBucket: args.budgetBucket,
        updatedAt: now,
      });
      return { id: existing._id, placeId: args.placeId, upserted: "updated" as const };
    }

    const id = await ctx.db.insert("non_ticket_events", {
      placeId: args.placeId,
      source: args.source,
      title: args.title,
      description: args.description,
      location: args.location,
      venueName: args.venueName,
      venueCity: args.venueCity,
      venueNeighborhood: args.venueNeighborhood,
      venueCountry: args.venueCountry,
      latitude: args.latitude,
      longitude: args.longitude,
      formattedAddress: args.formattedAddress,
      googlePlaceId: args.googlePlaceId,
      url: args.url,
      venueType: args.venueType,
      openHours: args.openHours,
      tags: args.tags,
      tagsConfirmed: args.tagsConfirmed,
      tagAttempts: args.tagAttempts,
      budgetBucket: args.budgetBucket,
      chatId: args.chatId,
      createdAt: now,
      updatedAt: now,
    });
    return { id, placeId: args.placeId, upserted: "created" as const };
  },
});

export const getNonTicketPlacesForChatAndPlaceIds = internalQuery({
  args: {
    chatId: v.id("chats"),
    placeIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.placeIds.length === 0) return [];
    const rows = await Promise.all(
      args.placeIds.map((placeId) =>
        ctx.db
          .query("non_ticket_events")
          .withIndex("by_chat_and_place_id", (q) =>
            q.eq("chatId", args.chatId).eq("placeId", placeId),
          )
          .unique(),
      ),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

/**
 * Retrieve all non-ticket places for a specific chat, optionally filtered by
 * venue type.
 */
export const getNonTicketPlacesForChat = internalQuery({
  args: {
    chatId: v.id("chats"),
    venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("non_ticket_events")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .order("asc");

    const places = await query.collect();
    if (args.venueType) {
      return places.filter((p) => p.venueType === args.venueType);
    }
    return places;
  },
});

/**
 * Delete non-ticket places older than 7 days that were cached for a specific
 * chat session. Called by the daily cron job to prevent stale venue data.
 */
export const deleteExpiredNonTicketPlaces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    const all = await ctx.db.query("non_ticket_events").collect();
    const expired = all.filter((p) => p.updatedAt < cutoff);
    await Promise.all(expired.map((p) => ctx.db.delete(p._id)));
    return { deletedCount: expired.length };
  },
});

// Helper to map a stored non-ticket place row back to a NormalizedEvent.
// Used by availability_action.ts when reading places back from the DB.
export function mapNonTicketEventToNormalized(
  event: {
    eventId?: string;
    placeId?: string;
    title: string;
    description?: string;
    startTime?: string;
    venueName?: string;
    venueCity?: string;
    venueNeighborhood?: string;
    venueCountry?: string;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
    googlePlaceId?: string;
    source?: string;
    url?: string;
    sourceLinks?: EventSourceLink[];
    image?: string;
    genre?: string;
    tags?: readonly string[] | null;
    budgetBucket?: "low" | "medium" | "high";
    venueType?: "food" | "activity";
  },
): NormalizedEvent {
  return {
    eventId: event.eventId ?? event.placeId ?? "",
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    latitude: event.latitude ?? undefined,
    longitude: event.longitude ?? undefined,
    formattedAddress: event.formattedAddress ?? undefined,
    googlePlaceId: event.googlePlaceId ?? undefined,
    source: event.source ?? "custom",
    url: event.url || "",
    image: event.image ?? null,
    tags: normalizeEventTags(event.tags),
    status: null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    sourceLinks: event.sourceLinks,
    venueType: event.venueType,
  };
}

/**
 * Returns unique places (deduped by placeId) for a given city across all chats.
 * Used by the warm cache to avoid re-fetching from Google Places when the city
 * is already covered by another group's cache.
 */
export const getExistingPlacesByCity = internalQuery({
  args: { venueCity: v.string() },
  handler: async (ctx, { venueCity }) => {
    const normalized = venueCity.trim().toLowerCase();
    // Full scan with case-insensitive match — more reliable than index alone
    // since venueCity can have case variations.
    const all = await ctx.db.query("non_ticket_events").collect();
    const seen = new Set<string>();
    return all.filter((p) => {
      if (p.venueCity?.trim().toLowerCase() !== normalized) return false;
      if (seen.has(p.placeId)) return false;
      seen.add(p.placeId);
      return true;
    });
  },
});

/**
 * Public reactive query — returns place count and confirmed-tag count for a chat.
 * The frontend subscribes to this to detect when the warm cache adds or tags new
 * venues, then triggers a lightweight re-rank (isRegen: true) to update the pool.
 */
export const getNonTicketPlacesStats = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const places = await ctx.db
      .query("non_ticket_events")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
    return {
      count: places.length,
      taggedCount: places.filter((p) => p.tagsConfirmed === true).length,
    };
  },
});
