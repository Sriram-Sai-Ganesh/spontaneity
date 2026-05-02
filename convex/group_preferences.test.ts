import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

describe("group preference persistence", () => {
  test("stores and reads a persisted profile through helpers", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Preference Chat");

    const profileId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [
          {
            category: "concert",
            acceptCount: 2,
            rejectCount: 0,
            moreLikeThisCount: 1,
          },
        ],
        budgetPreference: "medium",
        distancePreference: "nearby",
        feedbackCount: 3,
        lastUpdatedAt: 1_711_000_000_000,
      },
    );
    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profileId).toBeDefined();
    expect(profile).toEqual({
      chatId,
      categorySignals: [
        {
          category: "concert",
          acceptCount: 2,
          rejectCount: 0,
          moreLikeThisCount: 1,
        },
      ],
      budgetPreference: "medium",
      distancePreference: "nearby",
      feedbackCount: 3,
      lastUpdatedAt: 1_711_000_000_000,
    });
  });

  test("upserts one profile row per chat", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Upsert Chat");

    const firstId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [],
        budgetPreference: "unknown",
        distancePreference: "unknown",
        feedbackCount: 0,
        lastUpdatedAt: 1_711_000_000_000,
      },
    );
    const secondId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [
          {
            category: "theater",
            acceptCount: 1,
            rejectCount: 0,
            moreLikeThisCount: 0,
          },
        ],
        budgetPreference: "low",
        distancePreference: "citywide",
        feedbackCount: 1,
        lastUpdatedAt: 1_712_000_000_000,
      },
    );
    const rows = await t.run(async (ctx) =>
      ctx.db.query("groupPreferenceProfiles" as never).collect(),
    );

    expect(secondId).toBe(firstId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chatId,
      categorySignals: [
        {
          category: "theater",
          acceptCount: 1,
          rejectCount: 0,
          moreLikeThisCount: 0,
        },
      ],
      budgetPreference: "low",
      distancePreference: "citywide",
      feedbackCount: 1,
      lastUpdatedAt: 1_712_000_000_000,
    });
  });

  test("stores and reads a recommendation snapshot through helpers", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Snapshot Chat");

    const snapshotId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "tm-123",
        title: "Baltimore Symphony Night",
        description: "An evening orchestral concert downtown.",
        startTime: "2026-04-15T23:30:00.000Z",
        venueName: "Meyerhoff Symphony Hall",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: null,
        lastRecommendedAt: 1_713_000_000_000,
      },
    );
    const snapshot = await t.query(
      internal.group_preferences_queries.getGroupRecommendationSnapshotForChatEvent,
      {
        chatId,
        eventId: "tm-123",
      },
    );

    expect(snapshotId).toBeDefined();
    expect(snapshot).toEqual({
      chatId,
      eventId: "tm-123",
      title: "Baltimore Symphony Night",
      description: "An evening orchestral concert downtown.",
      startTime: "2026-04-15T23:30:00.000Z",
      venueName: "Meyerhoff Symphony Hall",
      venueCity: "Baltimore",
      source: "ticketmaster",
      budgetBucket: null,
      lastRecommendedAt: 1_713_000_000_000,
    });
  });

  test("upserts the existing snapshot row and patches with latest data", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Snapshot Upsert Chat");

    const firstId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "tm-456",
        title: "Comedy Showcase",
        description: null,
        startTime: "2026-04-20T00:00:00.000Z",
        venueName: "CFG Bank Arena",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: null,
        lastRecommendedAt: 1_714_000_000_000,
      },
    );
    const secondId = await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "tm-456",
        title: "Comedy Showcase Late Show",
        description: "Updated event snapshot for the same recommendation.",
        startTime: "2026-04-20T01:00:00.000Z",
        venueName: "CFG Bank Arena",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: null,
        lastRecommendedAt: 1_714_500_000_000,
      },
    );
    const snapshot = await t.query(
      internal.group_preferences_queries.getGroupRecommendationSnapshotForChatEvent,
      {
        chatId,
        eventId: "tm-456",
      },
    );
    const allSnapshots = await t.run(async (ctx) =>
      ctx.db
        .query("groupRecommendationSnapshots")
        .withIndex("by_chat_event_recommended_at", (q) =>
          q.eq("chatId", chatId).eq("eventId", "tm-456"),
        )
        .collect(),
    );

    // Second upsert patches the existing row — same DB id, one row total.
    expect(secondId).toBe(firstId);
    expect(allSnapshots).toHaveLength(1);
    expect(snapshot).toEqual({
      chatId,
      eventId: "tm-456",
      title: "Comedy Showcase Late Show",
      description: "Updated event snapshot for the same recommendation.",
      startTime: "2026-04-20T01:00:00.000Z",
      venueName: "CFG Bank Arena",
      venueCity: "Baltimore",
      source: "ticketmaster",
      budgetBucket: null,
      lastRecommendedAt: 1_714_500_000_000,
    });
  });

  test("matches feedback to the snapshot when feedback timestamp is after lastRecommendedAt", async () => {
    const t = createTestConvex();
    const { identity: owner, userId: ownerId } = await createTestUser(t);
    const { userId: secondUserId } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Timestamp Matching Chat");

    // Single snapshot — feedback is matched when its timestamp >= lastRecommendedAt.
    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-repeat",
        title: "Untitled Gathering",
        description: "Invite-only experience.",
        startTime: "2026-04-20T00:00:00.000Z",
        venueName: "Warehouse 9",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: "low",
        lastRecommendedAt: 1_714_000_000_000,
      },
    );
    // Both feedbacks occur after lastRecommendedAt → both matched to the snapshot.
    await t.run(async (ctx) => {
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-repeat",
        userId: ownerId,
        feedbackType: "accept",
        timestamp: 1_714_100_000_000,
      });
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-repeat",
        userId: secondUserId,
        feedbackType: "accept",
        timestamp: 1_714_200_000_000,
      });
    });

    await t.mutation(
      internal.group_preferences_mutations.rebuildGroupPreferenceProfileFromFeedbackInternal,
      { chatId },
    );

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();
    expect(profile?.categorySignals).toEqual([]);
    expect(profile?.budgetPreference).toBe("low");
    expect(profile?.feedbackCount).toBe(2);
  });

  test("rebuilds a persisted profile from snapshot-backed feedback", async () => {
    const t = createTestConvex();
    const { identity: owner, userId: ownerId } = await createTestUser(t);
    const { userId: secondUserId } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Feedback Profile Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-concert",
        title: "Live Concert Night",
        description: "A downtown concert with a local band.",
        startTime: "2026-05-01T23:00:00.000Z",
        venueName: "Ottobar",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: null,
        lastRecommendedAt: 1_715_000_000_000,
      },
    );
    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-sports",
        title: "Baseball Game Night",
        description: "A division baseball matchup.",
        startTime: "2026-05-02T23:00:00.000Z",
        venueName: "Oriole Park",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: null,
        lastRecommendedAt: 1_715_100_000_000,
      },
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-concert",
        userId: ownerId,
        feedbackType: "accept",
        timestamp: 1_715_200_000_000,
      });
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-concert",
        userId: secondUserId,
        feedbackType: "more-like-this",
        timestamp: 1_715_300_000_000,
      });
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-sports",
        userId: ownerId,
        feedbackType: "reject",
        timestamp: 1_715_400_000_000,
      });
    });

    const profileId = await t.mutation(
      internal.group_preferences_mutations.rebuildGroupPreferenceProfileFromFeedbackInternal,
      { chatId },
    );
    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profileId).toBeDefined();
    expect(profile).toEqual({
      chatId,
      categorySignals: [
        {
          category: "baseball",
          acceptCount: 0,
          rejectCount: 1,
          moreLikeThisCount: 0,
        },
        {
          category: "concert",
          acceptCount: 1,
          rejectCount: 0,
          moreLikeThisCount: 1,
        },
        {
          category: "other sports",
          acceptCount: 0,
          rejectCount: 1,
          moreLikeThisCount: 0,
        },
      ],
      budgetPreference: "unknown",
      distancePreference: "unknown",
      feedbackCount: 3,
      lastUpdatedAt: 1_715_400_000_000,
    });
  });

  test("ignores feedback rows without matching snapshots", async () => {
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Missing Snapshot Chat");

    await t.run(async (ctx) => {
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-missing",
        userId,
        feedbackType: "accept",
        timestamp: 1_716_000_000_000,
      });
    });

    const profileId = await t.mutation(
      internal.group_preferences_mutations.rebuildGroupPreferenceProfileFromFeedbackInternal,
      { chatId },
    );
    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profileId).toBeNull();
    expect(profile).toBeNull();
  });

  test("learns budget preference from feedback-backed snapshot buckets", async () => {
    const t = createTestConvex();
    const { identity: owner, userId: ownerId } = await createTestUser(t);
    const { userId: secondUserId } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Budget Preference Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-low",
        title: "Affordable Concert",
        description: "Live concert downtown.",
        startTime: "2026-06-01T23:00:00.000Z",
        venueName: "Ottobar",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: "low",
        lastRecommendedAt: 1_718_100_000_000,
      },
    );
    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-high",
        title: "Premium Theater Night",
        description: "A theater show with premium seating.",
        startTime: "2026-06-02T23:00:00.000Z",
        venueName: "Hippodrome",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: "high",
        lastRecommendedAt: 1_718_200_000_000,
      },
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-low",
        userId: ownerId,
        feedbackType: "accept",
        timestamp: 1_718_300_000_000,
      });
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-low",
        userId: secondUserId,
        feedbackType: "more-like-this",
        timestamp: 1_718_400_000_000,
      });
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-high",
        userId: ownerId,
        feedbackType: "reject",
        timestamp: 1_718_500_000_000,
      });
    });

    await t.mutation(
      internal.group_preferences_mutations.rebuildGroupPreferenceProfileFromFeedbackInternal,
      { chatId },
    );

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();
    expect(profile?.budgetPreference).toBe("low");
    expect(profile?.distancePreference).toBe("unknown");
  });

  test("getGroupPreferenceProfile returns profile for a chat member", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Auth Profile Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [{ category: "concert", acceptCount: 1, rejectCount: 0, moreLikeThisCount: 0 }],
        budgetPreference: "low",
        distancePreference: "nearby",
        feedbackCount: 1,
        lastUpdatedAt: 1_720_000_000_000,
      },
    );

    const profile = await t
      .withIdentity(identity)
      .query(api.group_preferences_queries.getGroupPreferenceProfile, { chatId });

    expect(profile).not.toBeNull();
    expect(profile?.chatId).toBe(chatId);
    expect(profile?.categorySignals).toContainEqual(
      expect.objectContaining({ category: "concert", acceptCount: 1 }),
    );
    expect(profile?.budgetPreference).toBe("low");
  });

  test("getGroupPreferenceProfile rejects a non-member", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner, "Members Only Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [],
        budgetPreference: "unknown",
        distancePreference: "unknown",
        feedbackCount: 0,
        lastUpdatedAt: 1_720_000_000_000,
      },
    );

    await expect(
      t
        .withIdentity(outsider)
        .query(api.group_preferences_queries.getGroupPreferenceProfile, { chatId }),
    ).rejects.toThrow();
  });

  test("learns budget preference even when category inference fails", async () => {
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Budget Only Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupRecommendationSnapshotInternal,
      {
        chatId,
        eventId: "evt-budget-only",
        title: "Untitled Gathering",
        description: "Invite-only experience.",
        startTime: "2026-06-03T23:00:00.000Z",
        venueName: "Warehouse 9",
        venueCity: "Baltimore",
        source: "ticketmaster",
        budgetBucket: "medium",
        lastRecommendedAt: 1_718_600_000_000,
      },
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("feedback", {
        chatId,
        eventId: "evt-budget-only",
        userId,
        feedbackType: "accept",
        timestamp: 1_718_700_000_000,
      });
    });

    await t.mutation(
      internal.group_preferences_mutations.rebuildGroupPreferenceProfileFromFeedbackInternal,
      { chatId },
    );

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();
    expect(profile?.categorySignals).toEqual([]);
    expect(profile?.budgetPreference).toBe("medium");
    expect(profile?.feedbackCount).toBe(1);
  });
});
