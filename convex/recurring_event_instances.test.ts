import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";
import { generateInstances } from "./recurring_event_instances";
import type { Doc } from "./_generated/dataModel";

type FakeConfig = Omit<Doc<"recurring_event_configs">, "_id" | "_creationTime" | "createdBy" | "createdAt" | "updatedAt">;

function makeConfig(overrides: Partial<FakeConfig> = {}): Doc<"recurring_event_configs"> {
  return {
    _id: "cfg1" as Doc<"recurring_event_configs">["_id"],
    _creationTime: 0,
    chatId: "chat1" as Doc<"recurring_event_configs">["chatId"],
    createdBy: "user1" as Doc<"recurring_event_configs">["createdBy"],
    eventId: "evt-1",
    title: "Weekly Trivia",
    cadence: "weekly",
    interval: 1,
    startDate: "2026-05-01",
    endCondition: { type: "never" },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("generateInstances (pure utility)", () => {
  test("weekly cadence generates correct dates", () => {
    const config = makeConfig({ startDate: "2026-05-01", cadence: "weekly", interval: 1 });
    const instances = generateInstances(config, "2026-05-01", 3);
    expect(instances.map((i) => i.instanceDate)).toEqual([
      "2026-05-01",
      "2026-05-08",
      "2026-05-15",
    ]);
  });

  test("daily cadence with interval 2", () => {
    const config = makeConfig({ startDate: "2026-05-01", cadence: "daily", interval: 2 });
    const instances = generateInstances(config, "2026-05-01", 3);
    expect(instances.map((i) => i.instanceDate)).toEqual([
      "2026-05-01",
      "2026-05-03",
      "2026-05-05",
    ]);
  });

  test("monthly cadence", () => {
    const config = makeConfig({ startDate: "2026-01-15", cadence: "monthly", interval: 1 });
    const instances = generateInstances(config, "2026-01-15", 3);
    expect(instances.map((i) => i.instanceDate)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });

  test("skips dates before fromDate", () => {
    const config = makeConfig({ startDate: "2026-05-01", cadence: "weekly", interval: 1 });
    const instances = generateInstances(config, "2026-05-10", 3);
    expect(instances.every((i) => i.instanceDate >= "2026-05-10")).toBe(true);
    expect(instances[0].instanceDate).toBe("2026-05-15");
  });

  test("respects on_date end condition", () => {
    const config = makeConfig({
      startDate: "2026-05-01",
      cadence: "weekly",
      interval: 1,
      endCondition: { type: "on_date", date: "2026-05-15" },
    });
    const instances = generateInstances(config, "2026-05-01", 10);
    expect(instances.map((i) => i.instanceDate)).toEqual([
      "2026-05-01",
      "2026-05-08",
      "2026-05-15",
    ]);
  });

  test("respects after_occurrences end condition", () => {
    const config = makeConfig({
      startDate: "2026-05-01",
      cadence: "weekly",
      interval: 1,
      endCondition: { type: "after_occurrences", count: 2 },
    });
    const instances = generateInstances(config, "2026-05-01", 10);
    expect(instances).toHaveLength(2);
  });

  test("returns empty when all occurrences are before fromDate and end condition exhausted", () => {
    const config = makeConfig({
      startDate: "2026-01-01",
      cadence: "weekly",
      interval: 1,
      endCondition: { type: "on_date", date: "2026-01-31" },
    });
    const instances = generateInstances(config, "2026-06-01", 10);
    expect(instances).toHaveLength(0);
  });

  test("instance fields are populated correctly", () => {
    const config = makeConfig({ title: "Monthly Dinner", cadence: "monthly" });
    const instances = generateInstances(config, "2026-05-01", 1);
    expect(instances[0]).toMatchObject({
      configId: "cfg1",
      eventId: "evt-1",
      title: "Monthly Dinner",
      cadence: "monthly",
      interval: 1,
    });
  });
});

describe("getUpcomingRecurringInstances query", () => {
  test("returns instances across multiple configs sorted by date", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.withIdentity(identity).mutation(
      api.recurring_event_mutations.createRecurringEventConfig,
      {
        chatId,
        eventId: "evt-a",
        title: "Weekly Trivia",
        cadence: "weekly",
        interval: 1,
        startDate: "2026-05-01",
        endCondition: { type: "never" },
      },
    );
    await t.withIdentity(identity).mutation(
      api.recurring_event_mutations.createRecurringEventConfig,
      {
        chatId,
        eventId: "evt-b",
        title: "Monthly Dinner",
        cadence: "monthly",
        interval: 1,
        startDate: "2026-05-10",
        endCondition: { type: "never" },
      },
    );

    const instances = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getUpcomingRecurringInstances, {
        chatId,
        fromDate: "2026-05-01",
        maxPerConfig: 3,
      });

    expect(instances.length).toBe(6);
    // Should be sorted by instanceDate
    for (let i = 1; i < instances.length; i++) {
      expect(instances[i].instanceDate >= instances[i - 1].instanceDate).toBe(true);
    }
  });

  test("rejects non-member from reading instances", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);

    await expect(
      t.withIdentity(outsider).query(
        api.recurring_event_queries.getUpcomingRecurringInstances,
        { chatId },
      ),
    ).rejects.toThrow();
  });

  test("returns empty array when no configs exist", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const instances = await t
      .withIdentity(identity)
      .query(api.recurring_event_queries.getUpcomingRecurringInstances, { chatId });

    expect(instances).toEqual([]);
  });
});
