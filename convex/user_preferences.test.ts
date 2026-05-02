import { describe, it, expect } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex } from "./test.setup";

describe("user preferences", () => {
  it("should set and get user event preferences", async () => {
    const t = createTestConvex();

    // Create a user
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    // Set user preferences
    const preferences = ["sports", "concert", "dinner"];
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setUserEventPreferences,
      { preferredEventTypes: preferences }
    );

    // Get user preferences
    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result).toEqual({
      userId,
      preferredEventTypes: preferences,
      negativeEventTypes: [],
    });
  });

  it("should set and get negative preferences", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setUserEventPreferences,
      { preferredEventTypes: ["concert"], negativeEventTypes: ["sports"] }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result).toEqual({
      userId,
      preferredEventTypes: ["concert"],
      negativeEventTypes: ["sports"],
    });
  });

  it("should overwrite existing preferences", async () => {
    const t = createTestConvex();

    // Create a user
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    // Set initial preferences
    const initialPreferences = ["sports", "concert"];
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setUserEventPreferences,
      { preferredEventTypes: initialPreferences }
    );

    // Overwrite with new preferences including negatives
    const newPreferences = ["dinner", "movie"];
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setUserEventPreferences,
      { preferredEventTypes: newPreferences, negativeEventTypes: ["sports"] }
    );

    // Get user preferences
    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result).toEqual({
      userId,
      preferredEventTypes: newPreferences,
      negativeEventTypes: ["sports"],
    });
  });

  it("should add an individual preferred event type without overwriting others", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    // Set initial preferences
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert", "sports"],
      negativeEventTypes: ["dinner"],
      action: "replace",
    });

    // Add a new preferred event type
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["movie"],
      action: "add",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.preferredEventTypes).toEqual(
      expect.arrayContaining(["concert", "sports", "movie"])
    );
    expect(result?.preferredEventTypes).toHaveLength(3);
    expect(result?.negativeEventTypes).toEqual(["dinner"]);
  });

  it("should not duplicate an already-preferred event type when adding", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert"],
      action: "replace",
    });

    // Add a type that already exists
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert"],
      action: "add",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.preferredEventTypes).toEqual(["concert"]);
  });

  it("should move a type from negative to preferred when adding it as preferred", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert"],
      negativeEventTypes: ["sports"],
      action: "replace",
    });

    // Add "sports" as preferred — it should be removed from negative
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["sports"],
      action: "add",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.preferredEventTypes).toEqual(
      expect.arrayContaining(["concert", "sports"])
    );
    expect(result?.negativeEventTypes).toEqual([]);
  });

  it("should remove an individual preferred event type", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert", "sports", "dinner"],
      action: "replace",
    });

    // Remove one preferred type
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["sports"],
      action: "remove",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.preferredEventTypes).toEqual(
      expect.arrayContaining(["concert", "dinner"])
    );
    expect(result?.preferredEventTypes).not.toContain("sports");
    expect(result?.preferredEventTypes).toHaveLength(2);
  });

  it("should remove an individual negative event type", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert"],
      negativeEventTypes: ["sports", "dinner"],
      action: "replace",
    });

    // Remove one negative type
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      negativeEventTypes: ["dinner"],
      preferredEventTypes: [],
      action: "remove",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.negativeEventTypes).toEqual(["sports"]);
    expect(result?.preferredEventTypes).toEqual(["concert"]);
  });

  it("should not error when removing a type that does not exist", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["concert"],
      action: "replace",
    });

    // Remove a type that was never in the list
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["sports"],
      action: "remove",
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.preferredEventTypes).toEqual(["concert"]);
  });

  it("should return null for user with no preferences", async () => {
    const t = createTestConvex();

    // Create a user
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
      });
    });

    // Get user preferences (should be null)
    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result).toBeNull();
  });
});

describe("person-specific preferences", () => {
  it("should set person-specific likes and dislikes via setPersonSpecificPreferences (replace)", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const otherId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      {
        otherUserId: otherId,
        likes: ["Hiking"],
        dislikes: ["Basketball"],
        action: "replace",
      }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.personSpecificLikes?.[otherId]).toEqual(["Hiking"]);
    expect(result?.personSpecificDislikes?.[otherId]).toEqual(["Basketball"]);
  });

  it("should add to existing person-specific likes without overwriting other entries", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const johnId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );
    const alexId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Alex", email: "alex@example.com" })
    );

    // Set initial likes for John
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Hiking"], dislikes: [], action: "replace" }
    );

    // Add a like for Alex separately
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: alexId, likes: ["Bowling"], dislikes: [], action: "replace" }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    // Both entries should coexist
    expect(result?.personSpecificLikes?.[johnId]).toEqual(["Hiking"]);
    expect(result?.personSpecificLikes?.[alexId]).toEqual(["Bowling"]);
  });

  it("should add tags to an existing person entry without duplicates (action=add)", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const johnId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Hiking"], dislikes: [], action: "replace" }
    );

    // Add more likes including one duplicate
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Hiking", "Cycling"], dislikes: [], action: "add" }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.personSpecificLikes?.[johnId]).toEqual(
      expect.arrayContaining(["Hiking", "Cycling"])
    );
    expect(result?.personSpecificLikes?.[johnId]).toHaveLength(2);
  });

  it("should remove specific tags from an existing person entry (action=remove)", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const johnId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      {
        otherUserId: johnId,
        likes: ["Hiking", "Cycling"],
        dislikes: ["Basketball", "Concert"],
        action: "replace",
      }
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      {
        otherUserId: johnId,
        likes: ["Hiking"],
        dislikes: ["Basketball"],
        action: "remove",
      }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.personSpecificLikes?.[johnId]).toEqual(["Cycling"]);
    expect(result?.personSpecificDislikes?.[johnId]).toEqual(["Concert"]);
  });

  it("should replace only the specified person entry, leaving other persons untouched", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const johnId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );
    const alexId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Alex", email: "alex@example.com" })
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Hiking"], dislikes: ["Basketball"], action: "replace" }
    );
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: alexId, likes: ["Concert"], dislikes: [], action: "replace" }
    );

    // Replace John's entry only
    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Yoga"], dislikes: ["Concert"], action: "replace" }
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );

    expect(result?.personSpecificLikes?.[johnId]).toEqual(["Yoga"]);
    expect(result?.personSpecificDislikes?.[johnId]).toEqual(["Concert"]);
    // Alex's entry is unchanged
    expect(result?.personSpecificLikes?.[alexId]).toEqual(["Concert"]);
  });

  it("should create a preferences row if none exists when setting person-specific prefs", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "David", email: "david@example.com" })
    );
    const johnId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "John", email: "john@example.com" })
    );

    // No preferences set yet
    const before = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );
    expect(before).toBeNull();

    await t.withIdentity({ subject: userId }).mutation(
      api.user_preferences_mutations.setPersonSpecificPreferences,
      { otherUserId: johnId, likes: ["Hiking"], dislikes: [], action: "replace" }
    );

    const after = await t.withIdentity({ subject: userId }).query(
      api.user_preferences_queries.getUserEventPreferences,
      {}
    );
    expect(after).not.toBeNull();
    expect(after?.personSpecificLikes?.[johnId]).toEqual(["Hiking"]);
    // General prefs still default to empty
    expect(after?.preferredEventTypes).toEqual([]);
  });
});