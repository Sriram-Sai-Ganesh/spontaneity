import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { EventTag, LegacyEventTag } from "./event_types";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

const streamTextMock = vi.fn();
const createOpenRouterMock = vi.fn();

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...args),
}));

type TestChatId = Awaited<ReturnType<typeof createTestChat>>;
type Identity = { subject: string; tokenIdentifier: string };
type PollOptionTag = EventTag | LegacyEventTag;
type EventPollDoc = Doc<"event_polls">;

function makeTextStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function buildOption(eventId: string, title: string) {
  return {
    eventId,
    title,
    description: null,
    startTime: "2026-04-12T22:00:00.000Z",
    venueName: "Test Venue",
    venueCity: "Baltimore",
    venueCountry: "USA",
    source: "ticketmaster",
    url: `https://example.com/${eventId}`,
    image: null,
    tags: [] as PollOptionTag[],
    status: "onsale" as const,
    budgetBucket: "medium" as const,
    genre: "Concert",
  };
}

function buildPollOptions(prefix: string) {
  return [
    buildOption(`${prefix}-1`, `${prefix} 1`),
    buildOption(`${prefix}-2`, `${prefix} 2`),
    buildOption(`${prefix}-3`, `${prefix} 3`),
  ];
}

async function addMemberToChat(
  t: ReturnType<typeof createTestConvex>,
  ownerIdentity: Identity,
  memberIdentity: Identity,
  chatId: TestChatId,
) {
  const invite = await t
    .withIdentity(ownerIdentity)
    .mutation(api.chats_mutations.createInvite, { chatId });

  await t
    .withIdentity(memberIdentity)
    .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
}

async function createPoll(
  t: ReturnType<typeof createTestConvex>,
  identity: Identity,
  chatId: TestChatId,
  options = buildPollOptions("Event"),
  source: "manual" | "recommendation" = "manual",
) {
  return t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
    chatId,
    source,
    options,
  });
}

async function flushScheduledFunctions(
  t: ReturnType<typeof createTestConvex>,
) {
  await t.finishAllScheduledFunctions(() => {
    vi.runAllTimers();
  });
}

describe("event polls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createOpenRouterMock.mockReset();
    streamTextMock.mockReset();
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    createOpenRouterMock.mockReturnValue({
      chat: vi.fn((model: string) => model),
    });
    streamTextMock.mockResolvedValue({
      textStream: makeTextStream([
        "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
      ]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENROUTER_API_KEY;
  });

  test("creates a 3-option poll record", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(
      t,
      owner,
      chatId,
      buildPollOptions("Event"),
      "recommendation",
    );

    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );

    expect(poll).not.toBeNull();
    expect(poll).toMatchObject({
      chatId,
      createdBy: owner.subject,
      source: "recommendation",
      surface: "panel",
      prompt: "Which option should the group choose?",
      status: "open",
      resolution: "pending",
      eligibleVoterIds: [owner.subject, member.subject],
      optionEventIds: ["Event-1", "Event-2", "Event-3"],
    });
    expect(poll!.options).toHaveLength(3);
  });

  test("rejects invalid poll setup", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");

    await expect(
      createPoll(t, owner, chatId, buildPollOptions("Short").slice(0, 2)),
    ).rejects.toThrow("Polls must include exactly 3 options");

    await expect(
      createPoll(t, owner, chatId, [
        buildOption("dup", "Event 1"),
        buildOption("dup", "Event 2"),
        buildOption("unique", "Event 3"),
      ]),
    ).rejects.toThrow("Poll options must be unique");
  });

  test("freezes eligible voters at creation time", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const { userId: lateJoinerId, identity: lateJoiner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId);
    await addMemberToChat(t, owner, lateJoiner, chatId);

    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );

    expect(poll!.eligibleVoterIds).toHaveLength(2);
    expect(poll!.eligibleVoterIds).not.toContain(lateJoinerId);
  });

  test("normalizes legacy tags before storing new poll options", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");

    const pollId = await createPoll(t, owner, chatId, [
      {
        ...buildOption("legacy-1", "Legacy Event 1"),
        tags: ["Concerts", "Theatre", "Asian Cuisine", "Concerts"],
      },
      {
        ...buildOption("legacy-2", "Legacy Event 2"),
        tags: ["Festivals", "Athletics"],
      },
      {
        ...buildOption("legacy-3", "Legacy Event 3"),
        tags: ["Indoor", "Games"],
      },
    ]);

    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );

    expect(poll).not.toBeNull();
    expect(poll!.options[0].tags).toEqual(["Concert", "Theater"]);
    expect(poll!.options[1].tags).toEqual(["Festival", "Other Sports"]);
    expect(poll!.options[2].tags).toEqual(["Board Games"]);
  });

  test("normalizes legacy tags when reading existing poll rows", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");

    await t.run(async (ctx) => {
      await ctx.db.insert("event_polls", {
        chatId,
        createdBy: owner.subject,
        source: "manual",
        prompt: "Which option should the group choose?",
        status: "closed",
        resolution: "pending",
        options: [
          {
            ...buildOption("legacy-1", "Legacy Event 1"),
            tags: ["Concerts", "Concert", "Theatre", "Asian Cuisine", "Indoor"],
          },
          {
            ...buildOption("legacy-2", "Legacy Event 2"),
            tags: ["Festivals", "Athletics"],
          },
          buildOption("legacy-3", "Legacy Event 3"),
        ],
        optionEventIds: ["legacy-1", "legacy-2", "legacy-3"],
        eligibleVoterIds: [owner.subject],
        closedAt: Date.now(),
      });
    });

    const latestPoll = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestPoll).not.toBeNull();
    expect(latestPoll!.options[0].tags).toEqual([
      "Concert",
      "Theater",
    ]);
    expect(latestPoll!.options[1].tags).toEqual(["Festival", "Other Sports"]);
    expect(latestPoll!.options[2].tags).toEqual([]);
  });

  test("defaults legacy polls without resolution to pending when reading", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");

    await t.run(async (ctx) => {
      await ctx.db.insert("event_polls", {
        chatId,
        createdBy: owner.subject,
        source: "manual",
        prompt: "Which option should the group choose?",
        status: "closed",
        options: buildPollOptions("Legacy"),
        optionEventIds: ["Legacy-1", "Legacy-2", "Legacy-3"],
        eligibleVoterIds: [owner.subject],
        closedAt: Date.now(),
      });
    });

    const latestPoll = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestPoll).not.toBeNull();
    expect(latestPoll!.status).toBe("closed");
    expect(latestPoll!.resolution).toBe("pending");
    expect(latestPoll!.acceptedEventId).toBeNull();
    expect(latestPoll!.noConsensusMessage).toBeNull();
  });

  test("rejects creating a second open poll in the same chat", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");

    await createPoll(t, owner, chatId, buildPollOptions("First"));

    await expect(
      createPoll(t, owner, chatId, buildPollOptions("Second"), "recommendation"),
    ).rejects.toThrow("This group already has an open poll");
  });

  test("hides results until the current user votes", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    await createPoll(t, owner, chatId, buildPollOptions("Event"), "recommendation");

    const latestForMember = await t
      .withIdentity(member)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestForMember).not.toBeNull();
    expect(latestForMember!.status).toBe("open");
    expect(latestForMember!.hasVoted).toBe(false);
    expect(latestForMember!.resultsVisible).toBe(false);
    expect(latestForMember!.totalVotes).toBeNull();
    expect(latestForMember!.leadingEventIds).toEqual([]);
    expect(
      latestForMember!.options.every(
        (option: { tally: number | null }) => option.tally === null,
      ),
    ).toBe(true);
  });

  test("reveals results only after the current user votes", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-2",
    });

    const latestForMember = await t
      .withIdentity(member)
      .query(api.event_polls_queries.getLatestForChat, { chatId });
    const latestForOwner = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestForMember!.resultsVisible).toBe(true);
    expect(latestForMember!.currentUserVoteEventId).toBe("evt-2");
    expect(
      latestForMember!.options.find(
        (option: { eventId: string; tally: number | null }) =>
          option.eventId === "evt-2",
      )?.tally,
    ).toBe(1);

    expect(latestForOwner!.resultsVisible).toBe(false);
    expect(latestForOwner!.currentUserVoteEventId).toBeNull();
  });

  test("castVoteAndNotify allows null acceptedEventId while a poll remains open", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    const voteResult = await t
      .withIdentity(member)
      .action(api.email_notifications.castVoteAndNotify, {
        pollId,
        eventId: "evt-2",
      });

    expect(voteResult.status).toBe("open");
    expect(voteResult.resolution).toBe("pending");
    expect(voteResult.acceptedEventId).toBeNull();
  });

  test("replaces a user's vote while the poll is still open", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const { identity: memberTwo } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);
    await addMemberToChat(t, owner, memberTwo, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });
    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-3",
    });

    const latestForMember = await t
      .withIdentity(member)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestForMember!.status).toBe("open");
    expect(latestForMember!.currentUserVoteEventId).toBe("evt-3");
    expect(
      latestForMember!.options.find(
        (option: { eventId: string; tally: number | null }) =>
          option.eventId === "evt-1",
      )?.tally,
    ).toBe(0);
    expect(
      latestForMember!.options.find(
        (option: { eventId: string; tally: number | null }) =>
          option.eventId === "evt-3",
      )?.tally,
    ).toBe(1);
  });

  test("closes the poll automatically once every eligible voter has voted", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(owner).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });

    const memberVoteResult = await t
      .withIdentity(member)
      .mutation(api.event_polls_mutations.castVote, {
        pollId,
        eventId: "evt-2",
      });

    await flushScheduledFunctions(t);

    expect(memberVoteResult.status).toBe("closed");
    expect(memberVoteResult.resolution).toBe("no_consensus");
    expect(memberVoteResult.acceptedEventId).toBeNull();

    const latestForOwner = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestForOwner!.status).toBe("closed");
    expect(latestForOwner!.resolution).toBe("no_consensus");
    expect(latestForOwner!.acceptedEventId).toBeNull();
    expect(latestForOwner!.noConsensusMessage).not.toBeNull();
    expect(latestForOwner!.resultsVisible).toBe(true);
    expect(latestForOwner!.totalVotes).toBe(2);
    expect(latestForOwner!.closedAt).not.toBeNull();
    expect(latestForOwner!.resolvedAt).not.toBeNull();
  });

  test("marks a sole leader as accepted once every eligible voter has voted", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const { identity: memberTwo } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);
    await addMemberToChat(t, owner, memberTwo, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(owner).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });
    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });

    const finalVoteResult = await t
      .withIdentity(memberTwo)
      .mutation(api.event_polls_mutations.castVote, {
        pollId,
        eventId: "evt-2",
      });

    expect(finalVoteResult.status).toBe("closed");
    expect(finalVoteResult.resolution).toBe("accepted");
    expect(finalVoteResult.acceptedEventId).toBe("evt-1");

    const latestForOwner = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestForOwner!.status).toBe("closed");
    expect(latestForOwner!.resolution).toBe("accepted");
    expect(latestForOwner!.acceptedEventId).toBe("evt-1");
    expect(latestForOwner!.noConsensusMessage).toBeNull();
    expect(latestForOwner!.resolvedAt).not.toBeNull();

    const messages = await t.run((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .collect(),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "Agreement reached on Event 1.",
      userId: owner.subject,
      isComplete: true,
      latestToolCall: {
        toolName: "acceptedEventNotification",
        state: "output-available",
        args: {
          pollId,
        },
        result: {
          pollId,
          eventId: "evt-1",
          title: "Event 1",
          startTime: "2026-04-12T22:00:00.000Z",
          venueName: "Test Venue",
          venueCity: "Baltimore",
          source: "ticketmaster",
          url: "https://example.com/evt-1",
        },
      },
    });
  });

  test("allows manually closing an open poll and then creating a new one", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const firstPollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    const closeResult = await t
      .withIdentity(member)
      .mutation(api.event_polls_mutations.closePoll, {
        pollId: firstPollId,
      });

    expect(closeResult.status).toBe("closed");

    const latestAfterClose = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestAfterClose).not.toBeNull();
    expect(latestAfterClose!.status).toBe("closed");
    expect(latestAfterClose!.resolution).toBe("pending");
    expect(latestAfterClose!.acceptedEventId).toBeNull();
    expect(latestAfterClose!.noConsensusMessage).toBeNull();
    expect(latestAfterClose!.canClose).toBe(false);
    expect(latestAfterClose!.resultsVisible).toBe(true);
    expect(latestAfterClose!.closedAt).not.toBeNull();
    expect(latestAfterClose!.resolvedAt).toBeNull();

    const secondPollId = await createPoll(t, owner, chatId, [
      buildOption("evt-4", "Event 4"),
      buildOption("evt-5", "Event 5"),
      buildOption("evt-6", "Event 6"),
    ]);

    expect(secondPollId).not.toBe(firstPollId);

    const latestAfterNewPoll = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latestAfterNewPoll!.status).toBe("open");
    expect(latestAfterNewPoll!.canClose).toBe(true);
    expect(latestAfterNewPoll!._id).toBe(secondPollId);
  });

  test("does not report leaders when a closed poll has zero votes", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(member).mutation(api.event_polls_mutations.closePoll, {
      pollId,
    });

    const latest = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latest).not.toBeNull();
    expect(latest!.status).toBe("closed");
    expect(latest!.resolution).toBe("pending");
    expect(latest!.acceptedEventId).toBeNull();
    expect(latest!.noConsensusMessage).toBeNull();
    expect(latest!.resultsVisible).toBe(true);
    expect(latest!.totalVotes).toBe(0);
    expect(latest!.leadingEventIds).toEqual([]);
    expect(
      latest!.options.map((option: { tally: number | null }) => option.tally),
    ).toEqual([0, 0, 0]);
    expect(latest!.resolvedAt).toBeNull();
  });

  test("dismisses a closed poll from the latest poll query", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await createPoll(t, owner, chatId, [
      buildOption("evt-1", "Event 1"),
      buildOption("evt-2", "Event 2"),
      buildOption("evt-3", "Event 3"),
    ]);

    await t.withIdentity(member).mutation(api.event_polls_mutations.closePoll, {
      pollId,
    });

    const dismissResult = await t
      .withIdentity(owner)
      .mutation(api.event_polls_mutations.dismissPoll, { pollId });

    expect(dismissResult.pollId).toBe(pollId);
    expect(dismissResult.dismissedAt).toEqual(expect.any(Number));

    const latest = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latest).toBeNull();
  });

  test("does not reveal older closed polls after dismissing the latest poll", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const olderPollId = await createPoll(t, owner, chatId, [
      buildOption("older-1", "Older 1"),
      buildOption("older-2", "Older 2"),
      buildOption("older-3", "Older 3"),
    ]);
    await t.withIdentity(member).mutation(api.event_polls_mutations.closePoll, {
      pollId: olderPollId,
    });

    vi.advanceTimersByTime(1);

    const latestPollId = await createPoll(t, owner, chatId, [
      buildOption("latest-1", "Latest 1"),
      buildOption("latest-2", "Latest 2"),
      buildOption("latest-3", "Latest 3"),
    ]);
    await t.withIdentity(member).mutation(api.event_polls_mutations.closePoll, {
      pollId: latestPollId,
    });
    await t.withIdentity(owner).mutation(api.event_polls_mutations.dismissPoll, {
      pollId: latestPollId,
    });

    const latest = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(latest).toBeNull();
  });
});
