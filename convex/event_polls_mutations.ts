import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutationWithAuth } from "./lib";
import { requireChatMember } from "./chats_guards";
import { requireMembership } from "./chats_helpers";
import { insertMessage } from "./messages_helpers";
import {
  eventPollOptionValidator,
  eventPollSourceValidator,
} from "./event_polls_schema";
import {
  getOpenPollForChat,
  normalizePollOption,
  resolveCompletedPollOutcome,
} from "./event_polls_helpers";

type PollWriterCtx = Pick<MutationCtx, "db">;

type CreatePollArgs = {
  chatId: Id<"chats">;
  createdBy: Id<"users">;
  source: Doc<"event_polls">["source"];
  surface: "chat" | "panel";
  options: Doc<"event_polls">["options"];
  prompt?: string | null;
};

function buildAcceptedEventNotificationToolCall(
  pollId: Id<"event_polls">,
  option: Doc<"event_polls">["options"][number],
) {
  return {
    toolCallId: `accepted-event-${pollId}-${option.eventId}`,
    toolName: "acceptedEventNotification",
    state: "output-available" as const,
    args: {
      pollId,
    },
    result: {
      pollId,
      eventId: option.eventId,
      title: option.title,
      startTime: option.startTime ?? null,
      venueName: option.venueName ?? null,
      venueCity: option.venueCity ?? null,
      source: option.source,
      url: option.url || null,
    },
  };
}

function normalizePollPrompt(prompt: string | null | undefined) {
  if (typeof prompt !== "string") {
    return undefined;
  }

  const trimmed = prompt.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function closePollRecord(
  ctx: PollWriterCtx,
  poll: Doc<"event_polls">,
) {
  if (poll.status !== "open") {
    throw new Error("Poll is already closed");
  }

  const closedAt = Date.now();
  await ctx.db.patch(poll._id, {
    status: "closed",
    closedAt,
  });

  return {
    pollId: poll._id,
    status: "closed" as const,
    closedAt,
  };
}

async function createPollRecord(
  ctx: PollWriterCtx,
  { chatId, createdBy, source, surface, options, prompt }: CreatePollArgs,
) {
  if (!(await ctx.db.get(chatId))) {
    throw new Error("Chat not found");
  }

  await requireMembership(ctx, chatId, createdBy);

  const normalizedPrompt =
    normalizePollPrompt(prompt) ?? "Which option should the group choose?";

  if (options.length !== 3) {
    throw new Error("Polls must include exactly 3 options");
  }

  const optionEventIds = options.map((option) => option.eventId);
  if (new Set(optionEventIds).size !== options.length) {
    throw new Error("Poll options must be unique");
  }

  const existingOpenPoll = await getOpenPollForChat(ctx, chatId);
  if (existingOpenPoll) {
    throw new Error("This group already has an open poll");
  }

  const members = await ctx.db
    .query("group_members")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();

  const eligibleVoterIds = [...new Set(members.map((member) => member.userId))];
  if (eligibleVoterIds.length === 0) {
    throw new Error("This group has no eligible voters");
  }

  return ctx.db.insert("event_polls", {
    chatId,
    createdBy,
    source,
    surface,
    prompt: normalizedPrompt,
    status: "open",
    resolution: "pending",
    options: options.map((option) => normalizePollOption(option)),
    optionEventIds,
    eligibleVoterIds,
  });
}

export const createPoll = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    source: eventPollSourceValidator,
    prompt: v.optional(v.union(v.string(), v.null())),
    options: v.array(eventPollOptionValidator),
  },
  handler: async (ctx, { chatId, source, options, prompt }) =>
    createPollRecord(ctx, {
      chatId,
      createdBy: ctx.userId,
      source,
      surface: "panel",
      options,
      prompt,
    }),
});

export const createChatPoll = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    source: eventPollSourceValidator,
    prompt: v.optional(v.union(v.string(), v.null())),
    options: v.array(eventPollOptionValidator),
  },
  handler: async (ctx, { chatId, source, options, prompt }) => {
    const pollId = await createPollRecord(ctx, {
      chatId,
      createdBy: ctx.userId,
      source,
      surface: "chat",
      options,
      prompt,
    });
    const normalizedPrompt =
      normalizePollPrompt(prompt) ?? "Which option should the group choose?";

    await insertMessage(ctx.db, {
      chatId,
      userId: ctx.userId,
      role: "assistant",
      content: normalizedPrompt,
      isComplete: true,
      latestToolCall: {
        toolCallId: `create-event-poll-${pollId}`,
        toolName: "createEventPoll",
        state: "output-available",
        args: { source, prompt: normalizedPrompt },
        result: {
          pollId,
          source,
          prompt: normalizedPrompt,
          summary_message: normalizedPrompt,
          events: options.map((option) => ({
            eventId: option.eventId,
            title: option.title,
            description: option.description ?? null,
            startTime: option.startTime ?? null,
            startLocal: option.startTime ?? null,
            localDateLabel: null,
            venueName: option.venueName ?? null,
            venueCity: option.venueCity ?? null,
            venueNeighborhood: option.venueNeighborhood ?? null,
            venueCountry: option.venueCountry ?? null,
            url: option.url || null,
            source: option.source,
            fitReasons: [],
            status: option.status ?? null,
            budgetBucket: option.budgetBucket ?? null,
            genre: option.genre ?? null,
            venueType: option.venueType ?? null,
            tags: option.tags ?? [],
          })),
        },
      },
    });

    return pollId;
  },
});

export const createPollInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    source: eventPollSourceValidator,
    prompt: v.optional(v.union(v.string(), v.null())),
    options: v.array(eventPollOptionValidator),
  },
  handler: async (ctx, { chatId, userId, source, options, prompt }) =>
    createPollRecord(ctx, {
      chatId,
      createdBy: userId,
      source,
      surface: "chat",
      options,
      prompt,
    }),
});

export const castVote = mutationWithAuth({
  args: {
    pollId: v.id("event_polls"),
    eventId: v.string(),
  },
  handler: async (ctx, { pollId, eventId }) => {
    const poll = await ctx.db.get(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    await requireChatMember(ctx, poll.chatId);

    if (poll.status !== "open") {
      throw new Error("Poll is closed");
    }

    if (!poll.eligibleVoterIds.includes(ctx.userId)) {
      throw new Error("You are not eligible to vote in this poll");
    }

    if (!poll.optionEventIds.includes(eventId)) {
      throw new Error("That event is not part of this poll");
    }

    const timestamp = Date.now();
    const existingVote = await ctx.db
      .query("event_poll_votes")
      .withIndex("by_poll_user", (q) => q.eq("pollId", pollId).eq("userId", ctx.userId))
      .unique();

    if (existingVote) {
      await ctx.db.patch(existingVote._id, { eventId, timestamp });
    } else {
      await ctx.db.insert("event_poll_votes", {
        pollId,
        userId: ctx.userId,
        eventId,
        timestamp,
      });
    }

    const votes = await ctx.db
      .query("event_poll_votes")
      .withIndex("by_poll_id", (q) => q.eq("pollId", pollId))
      .collect();

    const allEligibleVotersHaveVoted =
      votes.length === poll.eligibleVoterIds.length;

    if (allEligibleVotersHaveVoted) {
      const { resolution, acceptedEventId } = resolveCompletedPollOutcome(
        poll.optionEventIds,
        votes,
      );
      await ctx.db.patch(pollId, {
        status: "closed",
        closedAt: timestamp,
        resolution,
        resolvedAt: timestamp,
        ...(acceptedEventId != null ? { acceptedEventId } : {}),
      });

      if (resolution === "accepted" && acceptedEventId) {
        const acceptedOption = poll.options.find(
          (option) => option.eventId === acceptedEventId,
        );

        if (acceptedOption) {
          await insertMessage(ctx.db, {
            chatId: poll.chatId,
            userId: poll.createdBy,
            role: "assistant",
            content: `Agreement reached on ${acceptedOption.title}.`,
            isComplete: true,
            latestToolCall: buildAcceptedEventNotificationToolCall(
              pollId,
              acceptedOption,
            ),
          });
        }
      }

      if (resolution === "no_consensus") {
        await ctx.scheduler.runAfter(
          0,
          internal.event_polls_actions.generateNoConsensusMessage,
          { pollId },
        );
      }

      return {
        pollId,
        eventId,
        status: "closed" as const,
        resolution,
        acceptedEventId: acceptedEventId ?? null,
      };
    }

    return {
      pollId,
      eventId,
      status: "open" as const,
      resolution: "pending" as const,
      acceptedEventId: null,
    };
  },
});

export const persistNoConsensusMessageInternal = internalMutation({
  args: {
    pollId: v.id("event_polls"),
    message: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { pollId, message }) => {
    const poll = await ctx.db.get(pollId);
    if (!poll || poll.resolution !== "no_consensus") {
      return null;
    }

    if (poll.noConsensusMessage) {
      return poll.noConsensusMessage;
    }

    const normalizedMessage = message.trim();
    if (normalizedMessage.length === 0) {
      return null;
    }

    await ctx.db.patch(pollId, { noConsensusMessage: normalizedMessage });

    if (poll.surface === "chat") {
      await insertMessage(ctx.db, {
        chatId: poll.chatId,
        userId: poll.createdBy,
        role: "assistant",
        content: normalizedMessage,
        isComplete: true,
      });
    }

    return normalizedMessage;
  },
});

export const closePoll = mutationWithAuth({
  args: {
    pollId: v.id("event_polls"),
  },
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.db.get(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    await requireChatMember(ctx, poll.chatId);
    return closePollRecord(ctx, poll);
  },
});

export const dismissPoll = mutationWithAuth({
  args: {
    pollId: v.id("event_polls"),
  },
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.db.get(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    await requireChatMember(ctx, poll.chatId);

    if (poll.status !== "closed") {
      throw new Error("Only closed polls can be cleared");
    }

    const dismissedAt = Date.now();
    await ctx.db.patch(pollId, { dismissedAt });
    return { pollId, dismissedAt };
  },
});

export const markReminderSentInternal = internalMutation({
  args: { pollId: v.id("event_polls") },
  returns: v.null(),
  handler: async (ctx, { pollId }) => {
    await ctx.db.patch(pollId, { reminderSentAt: Date.now() });
    return null;
  },
});

export const closeOpenPollInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
  },
  handler: async (ctx, { chatId, userId }) => {
    await requireMembership(ctx, chatId, userId);

    const openPoll = await getOpenPollForChat(ctx, chatId);
    if (!openPoll) {
      throw new Error("There is no open poll to close");
    }

    return closePollRecord(ctx, openPoll);
  },
});
