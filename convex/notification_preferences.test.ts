import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

describe("notification preferences", () => {
  describe("getMyNotificationPreferences", () => {
    test("rejects unauthenticated users", async () => {
      const t = createTestConvex();

      await expect(
        t.query(api.notification_preferences_queries.getMyNotificationPreferences, {}),
      ).rejects.toThrow("Not authenticated");
    });

    test("defaults to enabled when no preference record exists", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const prefs = await t
        .withIdentity(identity)
        .query(api.notification_preferences_queries.getMyNotificationPreferences, {});

      expect(prefs.emailNotificationsEnabled).toBe(true);
    });
  });

  describe("updateNotificationPreferences", () => {
    test("rejects unauthenticated users", async () => {
      const t = createTestConvex();

      await expect(
        t.mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: false,
        }),
      ).rejects.toThrow("Not authenticated");
    });

    test("persists opt-out", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      await t
        .withIdentity(identity)
        .mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: false,
        });

      const prefs = await t
        .withIdentity(identity)
        .query(api.notification_preferences_queries.getMyNotificationPreferences, {});

      expect(prefs.emailNotificationsEnabled).toBe(false);
    });

    test("persists opt-in after opt-out", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      await t
        .withIdentity(identity)
        .mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: false,
        });

      await t
        .withIdentity(identity)
        .mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: true,
        });

      const prefs = await t
        .withIdentity(identity)
        .query(api.notification_preferences_queries.getMyNotificationPreferences, {});

      expect(prefs.emailNotificationsEnabled).toBe(true);
    });
  });

  describe("isEmailEnabledForUser (internal)", () => {
    test("returns true when no record exists", async () => {
      const t = createTestConvex();
      const { userId } = await createTestUser(t);

      const enabled = await t.query(
        internal.notification_preferences_queries.isEmailEnabledForUser,
        { userId },
      );

      expect(enabled).toBe(true);
    });

    test("returns false after user opts out", async () => {
      const t = createTestConvex();
      const { identity, userId } = await createTestUser(t);

      await t
        .withIdentity(identity)
        .mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: false,
        });

      const enabled = await t.query(
        internal.notification_preferences_queries.isEmailEnabledForUser,
        { userId },
      );

      expect(enabled).toBe(false);
    });
  });
});
