import { describe, expect, test, vi, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";
import type { EventTag } from "./event_types";

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mockSend } };
  }),
}));

beforeEach(() => {
  mockSend.mockReset();
});

function buildOption(eventId: string, startTime: string) {
  return {
    eventId,
    title: `Event ${eventId}`,
    source: "ticketmaster",
    url: `https://example.com/${eventId}`,
    tags: [] as EventTag[],
    startTime,
    status: "onsale" as const,
    budgetBucket: "medium" as const,
    genre: "Concert",
    venueName: "Test Venue",
    venueCity: "Baltimore",
    venueCountry: "USA",
    description: null,
    image: null,
  };
}

async function addMember(
  t: ReturnType<typeof createTestConvex>,
  ownerIdentity: { subject: string; tokenIdentifier: string },
  memberIdentity: { subject: string; tokenIdentifier: string },
  chatId: Awaited<ReturnType<typeof createTestChat>>,
) {
  const invite = await t
    .withIdentity(ownerIdentity)
    .mutation(api.chats_mutations.createInvite, { chatId });
  await t
    .withIdentity(memberIdentity)
    .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
}

async function insertClosedPollWithVote(
  t: ReturnType<typeof createTestConvex>,
  chatId: Awaited<ReturnType<typeof createTestChat>>,
  userId: Id<"users">,
  winningEventId: string,
  startTime: string,
) {
  const pollId = await t.run(async (ctx) => {
    return ctx.db.insert("event_polls", {
      chatId,
      createdBy: userId,
      source: "manual",
      status: "closed",
      resolution: "accepted",
      acceptedEventId: winningEventId,
      options: [
        buildOption(winningEventId, startTime),
        buildOption(`${winningEventId}-b`, startTime),
        buildOption(`${winningEventId}-c`, startTime),
      ],
      optionEventIds: [winningEventId, `${winningEventId}-b`, `${winningEventId}-c`],
      eligibleVoterIds: [userId],
      closedAt: Date.now(),
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("event_poll_votes", {
      pollId,
      userId,
      eventId: winningEventId,
      timestamp: Date.now(),
    });
  });

  return pollId;
}

describe("sendEventReminderEmails RSVP filtering", () => {
  test("sends reminder to member with no RSVP, skips member who RSVPed not_going", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

    const t = createTestConvex();
    const { userId: ownerId, identity: ownerIdentity } = await createTestUser(t);
    const { userId: memberId, identity: memberIdentity } = await createTestUser(t);
    const chatId = await createTestChat(t, ownerIdentity);
    await addMember(t, ownerIdentity, memberIdentity, chatId);

    // Give both users emails
    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { email: "owner@example.com" });
      await ctx.db.patch(memberId, { email: "member@example.com" });
    });

    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h from now
    const pollId = await insertClosedPollWithVote(t, chatId, ownerId, "evt-1", startTime);

    // Member RSVPs not_going
    await t.withIdentity(memberIdentity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "not_going",
    });

    await t.action(internal.email_notifications.sendEventReminderEmails, { pollId });

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    const sentLogs = logs.filter((l) => l.status === "sent");
    const skippedLogs = logs.filter((l) => l.status === "skipped");

    // Owner (no RSVP) should receive reminder
    expect(sentLogs.some((l) => l.userId === ownerId)).toBe(true);
    // Member (not_going) should not receive any email at all
    expect(logs.some((l) => l.userId === memberId)).toBe(false);
  });

  test("sends reminder to all members when no one has RSVPed not_going", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

    const t = createTestConvex();
    const { userId: ownerId, identity: ownerIdentity } = await createTestUser(t);
    const { userId: memberId, identity: memberIdentity } = await createTestUser(t);
    const chatId = await createTestChat(t, ownerIdentity);
    await addMember(t, ownerIdentity, memberIdentity, chatId);

    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { email: "owner@example.com" });
      await ctx.db.patch(memberId, { email: "member@example.com" });
    });

    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const pollId = await insertClosedPollWithVote(t, chatId, ownerId, "evt-1", startTime);

    await t.action(internal.email_notifications.sendEventReminderEmails, { pollId });

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    const sentLogs = logs.filter((l) => l.status === "sent");

    expect(sentLogs.some((l) => l.userId === ownerId)).toBe(true);
    expect(sentLogs.some((l) => l.userId === memberId)).toBe(true);
  });
});

describe("submitRSVPAndNotify", () => {
  test("sends immediate reminder when RSVPing going within 24h", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "user@example.com" });
    });

    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h from now
    const pollId = await insertClosedPollWithVote(t, chatId, userId, "evt-1", startTime);

    await t.withIdentity(identity).action(api.rsvp_actions.submitRSVPAndNotify, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
      eventTitle: "Test Event",
      startTime,
    });

    const logs = await t.run(async (ctx) =>
      ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
    );
    const reminderLog = logs.find((l) => l.notificationType === "event_reminder");
    expect(reminderLog?.status).toBe("sent");
  });

  test("does not send reminder when RSVPing going for event more than 24h away", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "user@example.com" });
    });

    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h from now
    const pollId = await insertClosedPollWithVote(t, chatId, userId, "evt-1", startTime);

    await t.withIdentity(identity).action(api.rsvp_actions.submitRSVPAndNotify, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
      eventTitle: "Test Event",
      startTime,
    });

    const logs = await t.run(async (ctx) =>
      ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
    );
    const reminderLog = logs.find((l) => l.notificationType === "event_reminder");
    expect(reminderLog).toBeUndefined();
  });

  test("does not send reminder when RSVPing maybe", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "user@example.com" });
    });

    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const pollId = await insertClosedPollWithVote(t, chatId, userId, "evt-1", startTime);

    await t.withIdentity(identity).action(api.rsvp_actions.submitRSVPAndNotify, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "maybe",
      eventTitle: "Test Event",
      startTime,
    });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
