import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

describe("recommendation metrics", () => {
  test("rejects unauthenticated users", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Metrics Chat");

    await expect(
      t.query(api.recommendation_metrics_queries.getRecommendationMetricsForChat, { chatId }),
    ).rejects.toThrow("Not authenticated");
  });

  test("rejects non-members", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Metrics Chat");

    await expect(
      t.withIdentity(outsider).query(
        api.recommendation_metrics_queries.getRecommendationMetricsForChat,
        { chatId },
      ),
    ).rejects.toThrow("Forbidden");
  });

  test("returns empty metrics when no runs or feedback exist", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Metrics Chat");

    const result = await t.withIdentity(identity).query(
      api.recommendation_metrics_queries.getRecommendationMetricsForChat,
      { chatId },
    );

    expect(result).toMatchObject({
      recommendationRunsCount: 0,
      returnedEventsCount: 0,
      fallbackUsageCount: 0,
      fallbackUsageRate: null,
      acceptedCount: 0,
      rejectedCount: 0,
      cancelledCount: 0,
      moreLikeThisCount: 0,
      actionableFeedbackCount: 0,
      acceptRate: null,
      lastRecommendedAt: null,
      lastFallbackAt: null,
      lastFallbackReason: null,
    });
  });

  test("aggregates accept rate and fallback usage for a chat", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Metrics Chat");

    await t.mutation(internal.recommendation_metrics_mutations.recordRecommendationRunInternal, {
      chatId,
      returnedEventCount: 3,
      fallbackUsed: false,
      fallbackReason: null,
    });

    await t.mutation(internal.recommendation_metrics_mutations.recordRecommendationRunInternal, {
      chatId,
      returnedEventCount: 1,
      fallbackUsed: true,
      fallbackReason: "No results found with city 'Miami'. Retried without city filter.",
    });

    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      chatId,
      eventId: "evt-1",
      feedbackType: "accept",
    });
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      chatId,
      eventId: "evt-2",
      feedbackType: "reject",
    });
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      chatId,
      eventId: "evt-3",
      feedbackType: "cancel",
    });
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      chatId,
      eventId: "evt-4",
      feedbackType: "more-like-this",
    });

    const result = await t.withIdentity(identity).query(
      api.recommendation_metrics_queries.getRecommendationMetricsForChat,
      { chatId },
    );

    expect(result).not.toBeNull();
    expect(result!.recommendationRunsCount).toBe(2);
    expect(result!.returnedEventsCount).toBe(4);
    expect(result!.fallbackUsageCount).toBe(1);
    expect(result!.fallbackUsageRate).toBe(0.5);
    expect(result!.acceptedCount).toBe(1);
    expect(result!.rejectedCount).toBe(1);
    expect(result!.cancelledCount).toBe(1);
    expect(result!.moreLikeThisCount).toBe(1);
    expect(result!.actionableFeedbackCount).toBe(3);
    expect(result!.acceptRate).toBeCloseTo(1 / 3);
    expect(result!.lastRecommendedAt).toBeGreaterThan(0);
    expect(result!.lastFallbackAt).toBeGreaterThan(0);
    expect(result!.lastFallbackReason).toContain("Retried without city filter");
  });
});
