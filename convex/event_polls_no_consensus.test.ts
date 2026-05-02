import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
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
    tags: [],
    status: "onsale" as const,
    budgetBucket: "medium" as const,
    genre: "Concert",
  };
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

async function flushScheduledFunctions(
  t: ReturnType<typeof createTestConvex>,
) {
  await t.finishAllScheduledFunctions(() => {
    vi.runAllTimers();
  });
}

describe("no-consensus poll messages", () => {
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

  test("persists one no-consensus message and inserts it into chat for chat-origin polls", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await t.mutation(internal.event_polls_mutations.createPollInternal, {
      chatId,
      userId: owner.subject,
      source: "manual",
      options: [
        buildOption("evt-1", "Event 1"),
        buildOption("evt-2", "Event 2"),
        buildOption("evt-3", "Event 3"),
      ],
    });

    await t.withIdentity(owner).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });
    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-2",
    });

    await flushScheduledFunctions(t);

    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );
    const messages = await t
      .withIdentity(owner)
      .query(api.messages_queries.getByChat, { chatId });
    const latestPoll = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(poll!.surface).toBe("chat");
    expect(poll!.noConsensusMessage).toBe(
      "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
    );
    expect(latestPoll!.noConsensusMessage).toBe(poll!.noConsensusMessage);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: poll!.noConsensusMessage,
    });
  });

  test("persists one no-consensus message without inserting a chat message for panel polls", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await t.withIdentity(owner).mutation(api.event_polls_mutations.createPoll, {
      chatId,
      source: "recommendation",
      options: [
        buildOption("evt-1", "Event 1"),
        buildOption("evt-2", "Event 2"),
        buildOption("evt-3", "Event 3"),
      ],
    });

    await t.withIdentity(owner).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });
    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-2",
    });

    await flushScheduledFunctions(t);

    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );
    const messages = await t
      .withIdentity(owner)
      .query(api.messages_queries.getByChat, { chatId });
    const latestPoll = await t
      .withIdentity(owner)
      .query(api.event_polls_queries.getLatestForChat, { chatId });

    expect(poll!.surface).toBe("panel");
    expect(poll!.noConsensusMessage).toBe(
      "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
    );
    expect(latestPoll!.noConsensusMessage).toBe(poll!.noConsensusMessage);
    expect(messages).toEqual([]);
  });

  test("does not regenerate or duplicate a persisted no-consensus outcome message", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Poll Chat");
    await addMemberToChat(t, owner, member, chatId);

    const pollId = await t.mutation(internal.event_polls_mutations.createPollInternal, {
      chatId,
      userId: owner.subject,
      source: "manual",
      options: [
        buildOption("evt-1", "Event 1"),
        buildOption("evt-2", "Event 2"),
        buildOption("evt-3", "Event 3"),
      ],
    });

    await t.withIdentity(owner).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-1",
    });
    await t.withIdentity(member).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "evt-2",
    });

    await flushScheduledFunctions(t);

    streamTextMock.mockClear();

    const secondResult = await t.action(
      internal.event_polls_actions.generateNoConsensusMessage,
      { pollId },
    );

    const messages = await t
      .withIdentity(owner)
      .query(api.messages_queries.getByChat, { chatId });
    const poll = await t.run(
      async (ctx): Promise<EventPollDoc | null> => ctx.db.get(pollId),
    );

    expect(secondResult).toBe(poll!.noConsensusMessage);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(messages).toHaveLength(1);
  });
});
