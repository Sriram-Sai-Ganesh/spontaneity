import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";

function buildPollOption(eventId: string, startTime: string) {
  return {
    eventId,
    title: `Event ${eventId}`,
    source: "ticketmaster",
    url: `https://example.com/${eventId}`,
    tags: [],
    startTime,
  };
}

async function insertClosedPoll(
  t: ReturnType<typeof createTestConvex>,
  chatId: Awaited<ReturnType<typeof createTestChat>>,
  userId: string,
  startTime: string,
  reminderSentAt?: number,
) {
  return t.run(async (ctx) => {
    const eventId = `evt-${Math.random().toString(36).slice(2)}`;
    return ctx.db.insert("event_polls", {
      chatId,
      createdBy: userId as Id<"users">,
      source: "manual",
      prompt: "Which option?",
      status: "closed",
      resolution: "pending" as const,
      options: [
        buildPollOption(eventId, startTime),
        buildPollOption(`${eventId}-b`, startTime),
        buildPollOption(`${eventId}-c`, startTime),
      ],
      optionEventIds: [eventId, `${eventId}-b`, `${eventId}-c`],
      eligibleVoterIds: [userId as Id<"users">],
      closedAt: Date.now(),
      ...(reminderSentAt !== undefined ? { reminderSentAt } : {}),
    });
  });
}

describe("event reminder", () => {
  test("getClosedPollsWithoutReminderInternal returns closed polls without reminderSentAt", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const futureTime = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // 10h from now
    await insertClosedPoll(t, chatId, userId, futureTime);

    const polls = await t.query(
      internal.event_polls_queries.getClosedPollsWithoutReminderInternal,
      {},
    );

    expect(polls.length).toBeGreaterThanOrEqual(1);
    expect(polls.every((p: { reminderSentAt?: number }) => !p.reminderSentAt)).toBe(true);
  });

  test("getClosedPollsWithoutReminderInternal excludes polls that already have reminderSentAt", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const futureTime = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    await insertClosedPoll(t, chatId, userId, futureTime, Date.now());

    const polls = await t.query(
      internal.event_polls_queries.getClosedPollsWithoutReminderInternal,
      {},
    );

    expect(polls.every((p: { reminderSentAt?: number }) => !p.reminderSentAt)).toBe(true);
  });

  test("markReminderSentInternal sets reminderSentAt on the poll", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const futureTime = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const pollId = await insertClosedPoll(t, chatId, userId, futureTime);

    await t.mutation(internal.event_polls_mutations.markReminderSentInternal, { pollId });

    const poll = await t.run(async (ctx) => ctx.db.get(pollId));
    expect(poll!.reminderSentAt).toBeDefined();
    expect(typeof poll!.reminderSentAt).toBe("number");
  });
});
