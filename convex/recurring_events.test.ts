import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

type Identity = { subject: string; tokenIdentifier: string };
type TestChatId = Awaited<ReturnType<typeof createTestChat>>;

async function addMember(
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

const baseConfig = {
  eventId: "evt-1",
  title: "Weekly Trivia Night",
  cadence: "weekly" as const,
  interval: 1,
  startDate: "2026-05-01",
  endCondition: { type: "never" as const },
};

describe("recurring event config", () => {
  test("creates a recurring event config", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    expect(id).toBeDefined();

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config?.title).toBe("Weekly Trivia Night");
    expect(config?.cadence).toBe("weekly");
    expect(config?.interval).toBe(1);
    expect(config?.endCondition).toEqual({ type: "never" });
  });

  test("stores on_date end condition correctly", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        endCondition: { type: "on_date", date: "2026-12-31" },
      });

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config?.endCondition).toEqual({ type: "on_date", date: "2026-12-31" });
  });

  test("stores after_occurrences end condition correctly", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        endCondition: { type: "after_occurrences", count: 10 },
      });

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config?.endCondition).toEqual({ type: "after_occurrences", count: 10 });
  });

  test("rejects interval less than 1", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await expect(
      t.withIdentity(identity).mutation(
        api.recurring_event_mutations.createRecurringEventConfig,
        { chatId, ...baseConfig, interval: 0 },
      ),
    ).rejects.toThrow("Interval must be at least 1");
  });

  test("getRecurringEventConfigsForChat returns all configs for a chat", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.withIdentity(identity).mutation(
      api.recurring_event_mutations.createRecurringEventConfig,
      { chatId, ...baseConfig, title: "Trivia Night" },
    );
    await t.withIdentity(identity).mutation(
      api.recurring_event_mutations.createRecurringEventConfig,
      { chatId, ...baseConfig, title: "Monthly Dinner", cadence: "monthly", interval: 1 },
    );

    const configs = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigsForChat, { chatId });

    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.title).sort()).toEqual(["Monthly Dinner", "Trivia Night"]);
  });

  test("updates cadence and end condition", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    await t.withIdentity(identity).mutation(
      api.recurring_event_mutations.updateRecurringEventConfig,
      { id, cadence: "monthly", endCondition: { type: "after_occurrences", count: 6 } },
    );

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config?.cadence).toBe("monthly");
    expect(config?.endCondition).toEqual({ type: "after_occurrences", count: 6 });
  });

  test("deletes a config", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
      });

    await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.deleteRecurringEventConfig, { id });

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config).toBeNull();
  });

  test("rejects non-member from creating a config", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);

    await expect(
      t.withIdentity(outsider).mutation(
        api.recurring_event_mutations.createRecurringEventConfig,
        { chatId, ...baseConfig },
      ),
    ).rejects.toThrow();
  });

  test("stores startTime on create and returns it", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const id = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        startTime: "19:00",
      });

    const config = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigById, { id });

    expect(config?.startTime).toBe("19:00");
  });

  test("occurrencesRemaining is null for never end condition", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        endCondition: { type: "never" },
      });

    const configs = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigsForChat, { chatId });

    expect(configs[0].occurrencesRemaining).toBeNull();
  });

  test("occurrencesRemaining counts remaining future occurrences", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    // startDate is in the past so some occurrences have already passed
    await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        ...baseConfig,
        cadence: "weekly",
        startDate: "2026-01-01",
        endCondition: { type: "after_occurrences", count: 100 },
      });

    const configs = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getRecurringEventConfigsForChat, { chatId });

    expect(configs[0].occurrencesRemaining).not.toBeNull();
    expect(configs[0].occurrencesRemaining!).toBeLessThan(100);
    expect(configs[0].occurrencesRemaining!).toBeGreaterThanOrEqual(0);
  });

  test("rejects non-member from reading configs", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);

    await expect(
      t.withIdentity(outsider).query(
        api.recurring_event_queries.getRecurringEventConfigsForChat,
        { chatId },
      ),
    ).rejects.toThrow();
  });
});
