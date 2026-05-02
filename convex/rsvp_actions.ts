import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { api, internal } from "./_generated/api";
import { rsvpStatusValidator } from "./rsvp_schema";
import { getSiteUrl } from "./email_templates";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const submitRSVPAndNotify = actionWithAuth({
  args: {
    eventId: v.string(),
    pollId: v.optional(v.id("event_polls")),
    chatId: v.id("chats"),
    status: rsvpStatusValidator,
    eventTitle: v.optional(v.string()),
    startTime: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, pollId, chatId, status, eventTitle, startTime }) => {
    await ctx.runMutation(api.rsvp_mutations.submitRSVP, {
      eventId,
      pollId,
      chatId,
      status,
    });

    if (status !== "going" || !startTime) return;

    const eventTime = new Date(startTime).getTime();
    const now = Date.now();
    const isWithin24h = eventTime > now && eventTime - now <= TWENTY_FOUR_HOURS_MS;
    if (!isWithin24h) return;

    const chat = await ctx.runQuery(internal.chats_queries.getChatInternal, { chatId });
    if (!chat) return;

    const planUrl = `${getSiteUrl()}/groups/${chatId}`;

    await ctx.runAction(internal.email_service.sendNotification, {
      userId: ctx.userId,
      notificationType: "event_reminder",
      context: {
        groupName: chat.title,
        eventTitle,
        eventDate: startTime,
        planUrl,
      },
    });
  },
});
