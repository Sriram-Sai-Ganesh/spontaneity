import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";
import type { Doc, Id } from "./_generated/dataModel";

const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

async function collectGoingRSVPEvents(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
) {
  const myGoingRSVPs = await ctx.db
    .query("rsvps")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect()
    .then((r) => r.filter((rsvp) => rsvp.status === "going"));

  const eventIds = new Set(myGoingRSVPs.map((r) => r.eventId));
  const coRSVPs = await Promise.all(
    [...eventIds].map((eventId) =>
      ctx.db.query("rsvps").withIndex("by_event_id", (q) => q.eq("eventId", eventId)).collect(),
    ),
  );
  const goingByEventId = new Map<string, Id<"users">[]>();
  for (const rsvps of coRSVPs) {
    for (const rsvp of rsvps) {
      if (rsvp.status !== "going") continue;
      if (!goingByEventId.has(rsvp.eventId)) goingByEventId.set(rsvp.eventId, []);
      goingByEventId.get(rsvp.eventId)!.push(rsvp.userId);
    }
  }

  type EventPollDoc = Doc<"event_polls">;
  const pollsByChat = new Map<string, EventPollDoc[]>();

  const results: {
    eventId: string;
    chatId: string;
    title: string;
    startTime: string;
    endTime: string;
    source: string;
    goingUserIds: string[];
  }[] = [];

  for (const rsvp of myGoingRSVPs) {
    const { eventId, chatId } = rsvp;
    const goingUserIds = goingByEventId.get(eventId) ?? [];

    if (eventId.startsWith("recurring:")) {
      const parts = eventId.split(":");
      if (parts.length !== 3) continue;
      const [, configIdStr, instanceDate] = parts;
      const config = await ctx.db.get(configIdStr as Id<"recurring_event_configs">);
      if (!config) continue;
      const recurringChat = await ctx.db.get(chatId);
      if (!recurringChat) continue;
      const startTime = config.startTime
        ? `${instanceDate}T${config.startTime}:00`
        : `${instanceDate}T00:00:00`;
      // Keep endTime as a naive datetime (no Z) to match startTime's convention.
      // Both will be parsed as local time in the browser, keeping them consistent.
      const endMs = new Date(startTime).getTime() + DEFAULT_EVENT_DURATION_MS;
      const ed = new Date(endMs);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const endTime = `${ed.getFullYear()}-${pad(ed.getMonth() + 1)}-${pad(ed.getDate())}T${pad(ed.getHours())}:${pad(ed.getMinutes())}:00`;
      results.push({ eventId, chatId, title: config.title, startTime, endTime, source: "recurring", goingUserIds });
    } else {
      const chat = await ctx.db.get(chatId);
      if (!chat) continue;
      if (!pollsByChat.has(chatId)) {
        const fetched = await ctx.db.query("event_polls").withIndex("by_chat_id", (q) => q.eq("chatId", chatId)).collect();
        pollsByChat.set(chatId, fetched);
      }
      const polls = pollsByChat.get(chatId)!;
      for (const poll of polls) {
        const option = poll.options.find((o: { eventId: string }) => o.eventId === eventId);
        if (!option?.startTime) continue;
        const endTime = new Date(new Date(option.startTime).getTime() + DEFAULT_EVENT_DURATION_MS).toISOString();
        results.push({ eventId, chatId, title: option.title, startTime: option.startTime, endTime, source: poll.source ?? "ticketmaster", goingUserIds });
        break;
      }
    }
  }

  return results;
}

export const getGoingRSVPEventsForViewerInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return collectGoingRSVPEvents(ctx, userId);
  },
});

export const getGoingRSVPEventsForViewer = queryWithAuth({
  args: {},
  handler: async (ctx) => {
    return collectGoingRSVPEvents(ctx, ctx.userId);
  },
});

export const getRSVPsForEventInternal = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    return ctx.db
      .query("rsvps")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .collect();
  },
});

export const getRSVPsForEvent = queryWithAuth({
  args: {
    eventId: v.string(),
    chatId: v.id("chats"),
  },
  handler: async (ctx, { eventId, chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .collect();

    const withUsers = await Promise.all(
      rsvps.map(async (rsvp) => {
        const user = await ctx.db.get(rsvp.userId);
        return {
          ...rsvp,
          userName: user?.name ?? "Unknown",
          userImage: user?.image ?? null,
        };
      }),
    );

    return withUsers;
  },
});

export const getUserRSVP = queryWithAuth({
  args: {
    eventId: v.string(),
    chatId: v.id("chats"),
  },
  handler: async (ctx, { eventId, chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return null;

    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", ctx.userId),
      )
      .unique();
    return rsvp?.chatId === chatId ? rsvp : null;
  },
});
