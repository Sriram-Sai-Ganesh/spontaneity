import { v } from "convex/values";
import { queryWithAuth } from "./lib";
import type { Id } from "./_generated/dataModel";

/**
 * Returns a helper that checks whether two users are friends.
 */
async function areFriends(
  ctx: { db: { query: Function } },
  userIdA: Id<"users">,
  userIdB: Id<"users">,
): Promise<boolean> {
  const [a, b] =
    userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  const friendship = await ctx.db
    .query("friendships")
    .withIndex("by_pair", (q: any) => q.eq("userIdA", a).eq("userIdB", b))
    .unique();
  return Boolean(friendship);
}

/**
 * Look up event details across all event tables by eventId string.
 * Returns a minimal shape: { title, startTime, location, eventStatus }.
 */
async function resolveEvent(
  ctx: { db: { query: Function } },
  eventId: string,
): Promise<{
  title: string;
  startTime: string | null;
  location: string | null;
  eventStatus: string | null;
} | null> {
  // Check Ticketmaster / external events
  const ticketEvent = await ctx.db
    .query("events")
    .withIndex("by_event_id", (q: any) => q.eq("eventId", eventId))
    .first();
  if (ticketEvent) {
    return {
      title: ticketEvent.title,
      startTime: ticketEvent.startTime ?? null,
      location: ticketEvent.venueName ?? ticketEvent.venueCity ?? null,
      eventStatus: ticketEvent.status ?? null,
    };
  }

  // Check custom (user-created) events
  const customEvent = await ctx.db
    .query("custom_events")
    .withIndex("by_event_id", (q: any) => q.eq("eventId", eventId))
    .first();
  if (customEvent) {
    return {
      title: customEvent.title,
      startTime: customEvent.startTime ?? null,
      location:
        customEvent.location ??
        customEvent.venueName ??
        customEvent.venueCity ??
        null,
      eventStatus: null,
    };
  }

  // Check non-ticket venue events
  const nonTicketEvent = await ctx.db
    .query("non_ticket_events")
    .withIndex("by_place_id", (q: any) => q.eq("placeId", eventId))
    .first();
  if (nonTicketEvent) {
    return {
      title: nonTicketEvent.title,
      startTime: null,
      location:
        nonTicketEvent.location ??
        nonTicketEvent.venueName ??
        nonTicketEvent.venueCity ??
        null,
      eventStatus: null,
    };
  }

  return null;
}

/**
 * Returns the planning history (accepted RSVPs + event details) for a user.
 *
 * - If `targetUserId` is omitted, returns the calling user's own history.
 * - If `targetUserId` is provided, the caller must be friends with that user.
 * - Results are sorted by rsvp.updatedAt descending (most recent first).
 */
export const getUserPlanningHistory = queryWithAuth({
  args: {
    targetUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { targetUserId }) => {
    const subjectId: Id<"users"> = targetUserId ?? ctx.userId;

    // Access control: only the owner or a friend may view history
    if (subjectId !== ctx.userId) {
      const friends = await areFriends(ctx, ctx.userId, subjectId);
      if (!friends) {
        throw new Error("Not authorized to view this user's history");
      }
    }

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user_id", (q: any) => q.eq("userId", subjectId))
      .filter((q: any) => q.eq(q.field("status"), "going"))
      .collect();

    // Sort most-recent first
    rsvps.sort((a: any, b: any) => b.updatedAt - a.updatedAt);

    const results = await Promise.all(
      rsvps.map(async (rsvp: any) => {
        const event = await resolveEvent(ctx, rsvp.eventId);
        return {
          rsvpId: rsvp._id as Id<"rsvps">,
          eventId: rsvp.eventId as string,
          chatId: rsvp.chatId as Id<"chats">,
          rsvpStatus: rsvp.status as string,
          updatedAt: rsvp.updatedAt as number,
          title: event?.title ?? null,
          startTime: event?.startTime ?? null,
          location: event?.location ?? null,
          eventStatus: event?.eventStatus ?? null,
        };
      }),
    );

    return results;
  },
});
