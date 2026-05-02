import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { queryWithAuth } from "./lib";
import { getChatIfMember, requireChatMember } from "./chats_guards";
import {
  computePollTallies,
  getLatestPollForChat,
  normalizePollOption,
} from "./event_polls_helpers";

async function getAcceptedPlansForUser(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
) {
  const memberships = await ctx.db
    .query("group_members")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();

  const acceptedPlans = [];

  for (const membership of memberships) {
    const chat = await ctx.db.get(membership.chatId);
    if (!chat) {
      continue;
    }

    const polls = await ctx.db
      .query("event_polls")
      .withIndex("by_chat_id", (q) => q.eq("chatId", membership.chatId))
      .collect();

    for (const poll of polls) {
      if (poll.status !== "closed" || (poll.resolution ?? "pending") !== "accepted") {
        continue;
      }

      let acceptedEventId = poll.acceptedEventId ?? null;
      if (!acceptedEventId) {
        const votes = await ctx.db
          .query("event_poll_votes")
          .withIndex("by_poll_id", (q) => q.eq("pollId", poll._id))
          .collect();
        const { leadingEventIds } = computePollTallies(poll.optionEventIds, votes);
        acceptedEventId = leadingEventIds.length === 1 ? leadingEventIds[0] : null;
      }

      if (!acceptedEventId) {
        continue;
      }

      const acceptedOption = poll.options.find(
        (option) => option.eventId === acceptedEventId,
      );
      if (!acceptedOption?.startTime) {
        continue;
      }

      const normalizedOption = normalizePollOption(acceptedOption);
      acceptedPlans.push({
        pollId: poll._id,
        chatId: chat._id,
        chatTitle: chat.title,
        chatIcon: chat.icon ?? null,
        eventId: normalizedOption.eventId,
        title: normalizedOption.title,
        startTime: acceptedOption.startTime,
        venueName: normalizedOption.venueName,
        venueCity: normalizedOption.venueCity,
        source: normalizedOption.source,
        url: normalizedOption.url,
        resolvedAt: poll.resolvedAt ?? poll.closedAt ?? poll._creationTime,
      });
    }
  }

  return acceptedPlans.sort((left, right) =>
    left.startTime.localeCompare(right.startTime),
  );
}

export const getLatestForChat = queryWithAuth({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return null;

    const poll = await getLatestPollForChat(ctx, chatId);
    if (!poll) {
      return null;
    }

    const votes = await ctx.db
      .query("event_poll_votes")
      .withIndex("by_poll_id", (q) => q.eq("pollId", poll._id))
      .collect();

    const currentUserVote = votes.find((vote) => vote.userId === ctx.userId) ?? null;
    const resultsVisible = poll.status === "closed" || currentUserVote !== null;
    const { tallyByEventId, leadingEventIds } = computePollTallies(
      poll.optionEventIds,
      votes,
    );

    return {
      _id: poll._id,
      chatId: poll.chatId,
      createdBy: poll.createdBy,
      createdAt: poll._creationTime,
      source: poll.source,
      prompt: poll.prompt ?? null,
      status: poll.status,
      resolution: poll.resolution ?? "pending",
      acceptedEventId: poll.acceptedEventId ?? null,
      closedAt: poll.closedAt ?? null,
      resolvedAt: poll.resolvedAt ?? null,
      noConsensusMessage: poll.noConsensusMessage ?? null,
      hasVoted: currentUserVote !== null,
      canVote:
        poll.status === "open" && poll.eligibleVoterIds.includes(ctx.userId),
      canClose: poll.status === "open",
      currentUserVoteEventId: currentUserVote?.eventId ?? null,
      resultsVisible,
      totalEligibleVoters: poll.eligibleVoterIds.length,
      totalVotes: resultsVisible ? votes.length : null,
      leadingEventIds: resultsVisible ? leadingEventIds : [],
      options: poll.options.map((option) => ({
        ...normalizePollOption(option),
        isSelected: currentUserVote?.eventId === option.eventId,
        tally: resultsVisible ? (tallyByEventId.get(option.eventId) ?? 0) : null,
      })),
    };
  },
});

export const getPollByIdInternal = internalQuery({
  args: { pollId: v.id("event_polls") },
  returns: v.any(),
  handler: async (ctx, { pollId }) => {
    return ctx.db.get(pollId);
  },
});

export const getVotesForPollInternal = internalQuery({
  args: { pollId: v.id("event_polls") },
  returns: v.any(),
  handler: async (ctx, { pollId }) => {
    return ctx.db
      .query("event_poll_votes")
      .withIndex("by_poll_id", (q) => q.eq("pollId", pollId))
      .collect();
  },
});

export const getClosedPollsWithoutReminderInternal = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const polls = await ctx.db
      .query("event_polls")
      .filter((q) => q.eq(q.field("status"), "closed"))
      .collect();
    return polls.filter((p) => !p.reminderSentAt);
  },
});

export const getAcceptedPlansForViewer = queryWithAuth({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return getAcceptedPlansForUser(ctx, ctx.userId);
  },
});

export const getAcceptedPlansForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    return getAcceptedPlansForUser(ctx, userId);
  },
});

export const getAcceptedPlansForChatInternal = internalQuery({
  args: { chatId: v.id("chats") },
  returns: v.any(),
  handler: async (ctx, { chatId }) => {
    const polls = await ctx.db
      .query("event_polls")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    const acceptedPlans = [];

    for (const poll of polls) {
      if (poll.status !== "closed" || (poll.resolution ?? "pending") !== "accepted") {
        continue;
      }

      let acceptedEventId = poll.acceptedEventId ?? null;
      if (!acceptedEventId) {
        const votes = await ctx.db
          .query("event_poll_votes")
          .withIndex("by_poll_id", (q) => q.eq("pollId", poll._id))
          .collect();
        const { leadingEventIds } = computePollTallies(poll.optionEventIds, votes);
        acceptedEventId = leadingEventIds.length === 1 ? leadingEventIds[0] : null;
      }

      if (!acceptedEventId) {
        continue;
      }

      const acceptedOption = poll.options.find(
        (option) => option.eventId === acceptedEventId,
      );
      if (!acceptedOption?.startTime) {
        continue;
      }

      const normalizedOption = normalizePollOption(acceptedOption);
      const startTime = acceptedOption.startTime;
      acceptedPlans.push({
        pollId: poll._id,
        eventId: normalizedOption.eventId,
        title: normalizedOption.title,
        startTime,
        venueName: normalizedOption.venueName,
        venueCity: normalizedOption.venueCity,
        source: normalizedOption.source,
        url: normalizedOption.url,
        resolvedAt: poll.resolvedAt ?? poll.closedAt ?? poll._creationTime,
      });
    }

    return acceptedPlans.sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
  },
});
