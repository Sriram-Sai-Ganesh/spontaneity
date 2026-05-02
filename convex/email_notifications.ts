import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { actionWithAuth } from "./lib";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { computePollTallies } from "./event_polls_helpers";
import { getSiteUrl } from "./email_templates";

type CastVoteResult = {
  pollId: Id<"event_polls">;
  eventId: string;
  status: "open" | "closed";
  resolution?: "pending" | "accepted" | "no_consensus";
  acceptedEventId?: string | null;
};

/**
 * Fan out new_recommendations emails to all members of a chat.
 * Called from findAvailableEventsForChatInternal after recommendations are computed.
 */
export const sendNewRecommendationsEmails = internalAction({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const [members, chat] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId }),
    ]);

    if (!chat) return null;

    const planUrl = `${getSiteUrl()}/groups/${chatId}`;

    await Promise.all(
      members.map((member) =>
        ctx.runAction(internal.email_service.sendNotification, {
          userId: member.userId,
          notificationType: "new_recommendations",
          context: { groupName: chat.title, planUrl },
        }),
      ),
    );

    return null;
  },
});

/**
 * Fan out plan_accepted emails to all members of a chat when a poll closes.
 * Scheduled from castVote when all eligible voters have voted.
 */
export const sendPlanAcceptedEmails = internalAction({
  args: { pollId: v.id("event_polls") },
  returns: v.null(),
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.runQuery(internal.event_polls_queries.getPollByIdInternal, { pollId });
    if (!poll) return null;

    const votes = await ctx.runQuery(internal.event_polls_queries.getVotesForPollInternal, {
      pollId,
    });

    const { leadingEventIds } = computePollTallies(poll.optionEventIds, votes);
    const winningEventId = leadingEventIds[0];
    const winningOption = poll.options.find((o) => o.eventId === winningEventId);

    const [members, chat] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId: poll.chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId: poll.chatId }),
    ]);

    if (!chat) return null;

    const planUrl = `${getSiteUrl()}/groups/${poll.chatId}`;

    await Promise.all(
      members.map((member) =>
        ctx.runAction(internal.email_service.sendNotification, {
          userId: member.userId,
          notificationType: "plan_accepted",
          context: {
            groupName: chat.title,
            eventTitle: winningOption?.title,
            eventDate: winningOption?.startTime ?? undefined,
            planUrl,
          },
        }),
      ),
    );

    if (winningOption?.startTime) {
      const eventTime = new Date(winningOption.startTime).getTime();
      const now = Date.now();
      if (eventTime > now) {
        const reminderAt = Math.max(now, eventTime - 24 * 60 * 60 * 1000);
        await ctx.scheduler.runAt(
          reminderAt,
          internal.email_notifications.sendEventReminderEmails,
          { pollId },
        );
      }
    }

    return null;
  },
});

/**
 * Fan out event_reminder emails for a single closed poll's accepted event.
 * Called from checkAndSendEventReminders for each due poll.
 */
export const sendEventReminderEmails = internalAction({
  args: { pollId: v.id("event_polls") },
  returns: v.null(),
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.runQuery(internal.event_polls_queries.getPollByIdInternal, { pollId });
    if (!poll || poll.status !== "closed") return null;

    const votes = await ctx.runQuery(internal.event_polls_queries.getVotesForPollInternal, {
      pollId,
    });

    const { leadingEventIds } = computePollTallies(poll.optionEventIds, votes);
    const winningEventId = leadingEventIds[0];
    const winningOption = poll.options.find((o: { eventId: string }) => o.eventId === winningEventId);

    if (!winningOption?.startTime) return null;

    const [members, chat, rsvps] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId: poll.chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId: poll.chatId }),
      ctx.runQuery(internal.rsvp_queries.getRSVPsForEventInternal, { eventId: winningEventId! }),
    ]);

    if (!chat) return null;

    const notGoingIds = new Set(
      rsvps.filter((r) => r.status === "not_going").map((r) => r.userId),
    );

    const eligibleMembers = members.filter(
      (member: { userId: Id<"users"> }) => !notGoingIds.has(member.userId),
    );

    const planUrl = `${getSiteUrl()}/groups/${poll.chatId}`;

    await Promise.all(
      eligibleMembers.map((member: { userId: Id<"users"> }) =>
        ctx.runAction(internal.email_service.sendNotification, {
          userId: member.userId,
          notificationType: "event_reminder",
          context: {
            groupName: chat.title,
            eventTitle: winningOption.title,
            eventDate: winningOption.startTime ?? undefined,
            planUrl,
          },
        }),
      ),
    );

    await ctx.runMutation(internal.event_polls_mutations.markReminderSentInternal, { pollId });

    return null;
  },
});

export const sendShortlistReminderEmails = internalAction({
  args: { shortlistId: v.id("event_shortlists") },
  returns: v.null(),
  handler: async (ctx, { shortlistId }) => {
    const shortlist = await ctx.runQuery(
      internal.event_shortlists_queries.getByIdInternal,
      { shortlistId },
    );
    if (!shortlist || shortlist.reminderSentAt || !shortlist.startTimeMs) return null;
    if (shortlist.startTimeMs <= Date.now()) return null;

    const [members, chat] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId: shortlist.chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId: shortlist.chatId }),
    ]);

    if (!chat) return null;

    const planUrl = `${getSiteUrl()}/groups/${shortlist.chatId}`;

    await Promise.all(
      members.map((member: { userId: Id<"users"> }) =>
        ctx.runAction(internal.email_service.sendNotification, {
          userId: member.userId,
          notificationType: "shortlist_reminder",
          context: {
            groupName: chat.title,
            eventTitle: shortlist.event.title,
            eventDate: shortlist.event.startTime ?? undefined,
            planUrl,
          },
        }),
      ),
    );

    await ctx.runMutation(
      internal.event_shortlists_mutations.markReminderSentInternal,
      { shortlistId },
    );

    return null;
  },
});

/**
 * Daily cron target: find closed polls whose accepted event starts within the
 * next 25 hours and send reminder emails if not already sent.
 */
export const checkAndSendEventReminders = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const polls = await ctx.runQuery(
      internal.event_polls_queries.getClosedPollsWithoutReminderInternal,
      {},
    );

    const now = Date.now();
    const windowMs = 25 * 60 * 60 * 1000; // 25 hours

    for (const poll of polls) {
      const votes = await ctx.runQuery(internal.event_polls_queries.getVotesForPollInternal, {
        pollId: poll._id,
      });

      const { leadingEventIds } = computePollTallies(poll.optionEventIds, votes);
      const winningEventId = leadingEventIds[0];
      const winningOption = poll.options.find((o: { eventId: string }) => o.eventId === winningEventId);

      if (!winningOption?.startTime) continue;

      const eventTime = new Date(winningOption.startTime).getTime();
      if (eventTime > now && eventTime <= now + windowMs) {
        await ctx.runAction(internal.email_notifications.sendEventReminderEmails, {
          pollId: poll._id,
        });
      }
    }

    return null;
  },
});

/**
 * Send reminder emails for a single upcoming recurring event instance.
 * Excludes members who RSVPed "not_going" for that instance.
 */
export const sendRecurringInstanceReminderEmails = internalAction({
  args: {
    configId: v.id("recurring_event_configs"),
    instanceDate: v.string(),
    instanceEventId: v.string(),
    eventTitle: v.string(),
    chatId: v.id("chats"),
    startTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { configId, instanceDate, instanceEventId, eventTitle, chatId, startTime }) => {
    const [members, chat, rsvps] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId }),
      ctx.runQuery(internal.rsvp_queries.getRSVPsForEventInternal, { eventId: instanceEventId }),
    ]);

    if (!chat) return null;

    const notGoingIds = new Set(
      rsvps.filter((r) => r.status === "not_going").map((r) => r.userId),
    );
    const eligibleMembers = members.filter(
      (member: { userId: Id<"users"> }) => !notGoingIds.has(member.userId),
    );

    const planUrl = `${getSiteUrl()}/groups/${chatId}`;
    const eventDate = startTime ? `${instanceDate}T${startTime}:00` : instanceDate;

    await Promise.all(
      eligibleMembers.map((member: { userId: Id<"users"> }) =>
        ctx.runAction(internal.email_service.sendNotification, {
          userId: member.userId,
          notificationType: "event_reminder",
          context: {
            groupName: chat.title,
            eventTitle,
            eventDate,
            planUrl,
          },
        }),
      ),
    );

    await ctx.runMutation(
      internal.recurring_event_mutations.markRecurringReminderSentInternal,
      { configId, instanceDate },
    );

    return null;
  },
});

/**
 * Daily cron target: find recurring event instances starting within the next
 * 25 hours and send reminder emails if not already sent.
 */
export const checkAndSendRecurringEventReminders = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const configs = await ctx.runQuery(
      internal.recurring_event_queries.getAllRecurringEventConfigsInternal,
      {},
    );

    const now = Date.now();
    const windowMs = 25 * 60 * 60 * 1000;
    const today = new Date().toISOString().slice(0, 10);

    for (const config of configs) {
      const instances = await ctx.runQuery(
        internal.recurring_event_queries.getUpcomingRecurringInstancesInternal,
        { configId: config._id, fromDate: today, maxCount: 3 },
      );

      for (const instance of instances) {
        const instanceTime = config.startTime
          ? new Date(`${instance.instanceDate}T${config.startTime}:00`).getTime()
          : new Date(instance.instanceDate).getTime();

        if (instanceTime <= now || instanceTime > now + windowMs) continue;

        const alreadySent = await ctx.runQuery(
          internal.recurring_event_queries.getReminderLogInternal,
          { configId: config._id, instanceDate: instance.instanceDate },
        );
        if (alreadySent) continue;

        await ctx.runAction(
          internal.email_notifications.sendRecurringInstanceReminderEmails,
          {
            configId: config._id,
            instanceDate: instance.instanceDate,
            instanceEventId: instance.eventId,
            eventTitle: config.title,
            chatId: config.chatId,
            startTime: config.startTime,
          },
        );
      }
    }

    return null;
  },
});

/**
 * Cast a vote and, if the poll just closed, immediately fan out plan_accepted emails.
 * Use this action from the frontend instead of castVote directly.
 */
export const castVoteAndNotify = actionWithAuth({
  args: {
    pollId: v.id("event_polls"),
    eventId: v.string(),
  },
  returns: v.object({
    pollId: v.id("event_polls"),
    eventId: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    resolution: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("no_consensus"))),
    acceptedEventId: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, { pollId, eventId }): Promise<CastVoteResult> => {
    const result = await ctx.runMutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId,
    });

    if (result.status === "closed") {
      await ctx.runAction(internal.email_notifications.sendPlanAcceptedEmails, { pollId });
    }

    return result as CastVoteResult;
  },
});
