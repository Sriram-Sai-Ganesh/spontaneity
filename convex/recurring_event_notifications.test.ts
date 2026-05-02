import { describe, expect, test, vi, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mockSend } };
  }),
}));

beforeEach(() => {
  mockSend.mockReset();
});

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

const baseConfig = {
  eventId: "evt-recurring-1",
  title: "Weekly Trivia Night",
  cadence: "weekly" as const,
  interval: 1,
  startDate: "2026-05-01",
  endCondition: { type: "never" as const },
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("recurring event reminder notifications", () => {
  test("sendRecurringInstanceReminderEmails sends to all members by default", async () => {
    const t = createTestConvex();
    const { identity: owner, userId: ownerId } = await createTestUser(t);
    const { identity: member2, userId: member2Id } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    await addMember(t, owner, member2, chatId);

    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { email: "owner@example.com" });
      await ctx.db.patch(member2Id, { email: "member2@example.com" });
    });
    mockSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });

    const configId = await t
      .withIdentity(owner)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    await t.action(internal.email_notifications.sendRecurringInstanceReminderEmails, {
      configId,
      instanceDate: "2026-05-01",
      instanceEventId: `recurring:${configId}:2026-05-01`,
      eventTitle: "Weekly Trivia Night",
      chatId,
    });

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    expect(logs.filter((l) => l.status === "sent")).toHaveLength(2);
  });

  test("sendRecurringInstanceReminderEmails excludes not_going members", async () => {
    const t = createTestConvex();
    const { identity: owner, userId: ownerId } = await createTestUser(t);
    const { identity: member2, userId: member2Id } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    await addMember(t, owner, member2, chatId);

    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { email: "owner@example.com" });
      await ctx.db.patch(member2Id, { email: "member2@example.com" });
    });
    mockSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });

    const configId = await t
      .withIdentity(owner)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    const instanceEventId = `recurring:${configId}:2026-05-01`;

    // member2 RSVPs not_going
    await t.run(async (ctx) => {
      await ctx.db.insert("rsvps", {
        eventId: instanceEventId,
        userId: member2Id,
        chatId,
        status: "not_going",
        updatedAt: Date.now(),
      });
    });

    await t.action(internal.email_notifications.sendRecurringInstanceReminderEmails, {
      configId,
      instanceDate: "2026-05-01",
      instanceEventId,
      eventTitle: "Weekly Trivia Night",
      chatId,
    });

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    const sentLogs = logs.filter((l) => l.status === "sent");
    // owner gets email, member2 (not_going) does not
    expect(sentLogs).toHaveLength(1);
    expect(sentLogs[0].userId).toBe(ownerId);
  });

  test("sendRecurringInstanceReminderEmails creates a reminder log entry", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const configId = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    const instanceDate = "2026-05-01";

    await t.action(internal.email_notifications.sendRecurringInstanceReminderEmails, {
      configId,
      instanceDate,
      instanceEventId: `recurring:${configId}:${instanceDate}`,
      eventTitle: "Weekly Trivia Night",
      chatId,
    });

    const log = await t.run(async (ctx) =>
      ctx.db
        .query("recurring_instance_reminder_log")
        .withIndex("by_config_and_date", (q) =>
          q.eq("configId", configId).eq("instanceDate", instanceDate),
        )
        .unique(),
    );

    expect(log).not.toBeNull();
    expect(log?.instanceDate).toBe(instanceDate);
  });

  test("checkAndSendRecurringEventReminders does not resend if already logged", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const now = Date.now();
    const instanceDate = new Date(now + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const configId = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        startDate: instanceDate,
        startTime: new Date(now + 2 * 60 * 60 * 1000).toTimeString().slice(0, 5),
      });

    // Pre-log the reminder as already sent
    await t.run(async (ctx) => {
      await ctx.db.insert("recurring_instance_reminder_log", {
        configId,
        instanceDate,
        sentAt: Date.now(),
      });
    });

    mockSend.mockReset();

    await t.action(internal.email_notifications.checkAndSendRecurringEventReminders, {});

    expect(mockSend).not.toHaveBeenCalled();
  });

  test("checkAndSendRecurringEventReminders sends for instance within 25h window", async () => {
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "user@example.com" });
    });
    mockSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });

    const now = Date.now();
    const soonMs = now + 2 * 60 * 60 * 1000; // 2 hours from now
    const soon = new Date(soonMs);
    const instanceDate = formatLocalDate(soon);
    const startTime = soon.toTimeString().slice(0, 5);

    await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        startDate: instanceDate,
        startTime,
      });

    await t.action(internal.email_notifications.checkAndSendRecurringEventReminders, {});

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    expect(logs.filter((l) => l.status === "sent")).toHaveLength(1);
  });

  test("checkAndSendRecurringEventReminders skips instances outside 25h window", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    // Instance is 30 hours away — outside the 25h window
    const now = Date.now();
    const farMs = now + 30 * 60 * 60 * 1000;
    const far = new Date(farMs);
    const instanceDate = formatLocalDate(far);
    const startTime = far.toTimeString().slice(0, 5);

    await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        startDate: instanceDate,
        startTime,
      });

    mockSend.mockReset();

    await t.action(internal.email_notifications.checkAndSendRecurringEventReminders, {});

    expect(mockSend).not.toHaveBeenCalled();
  });
});
