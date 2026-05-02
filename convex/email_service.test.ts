import { describe, expect, test, vi, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

// Mock Resend before any imports resolve
const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mockSend } };
  }),
}));

beforeEach(() => {
  mockSend.mockReset();
});

const context = {
  groupName: "Weekend Crew",
  eventTitle: "Jazz Night",
  eventDate: "Friday, April 18",
  planUrl: "https://example.com/plan/123",
};

describe("email_service", () => {
  describe("getUserEmailQuery", () => {
    test("returns email for existing user", async () => {
      const t = createTestConvex();
      const { userId } = await createTestUser(t);

      // Patch email onto user
      await t.run(async (ctx) => {
        await ctx.db.patch(userId, { email: "alice@example.com" });
      });

      const result = await t.query(internal.email_service.getUserEmailQuery, { userId });
      expect(result?.email).toBe("alice@example.com");
    });

    test("returns null for non-existent user", async () => {
      const t = createTestConvex();
      // Use a valid-looking but non-existent id
      const { userId } = await createTestUser(t);
      await t.run(async (ctx) => { await ctx.db.delete(userId); });

      const result = await t.query(internal.email_service.getUserEmailQuery, { userId });
      expect(result).toBeNull();
    });
  });

  describe("logEmail", () => {
    test("inserts a log record", async () => {
      const t = createTestConvex();
      const { userId } = await createTestUser(t);

      await t.mutation(internal.email_service.logEmail, {
        userId,
        recipientEmail: "alice@example.com",
        notificationType: "new_recommendations",
        status: "sent",
        resendId: "resend-abc",
      });

      const logs = await t.run(async (ctx) => {
        return ctx.db
          .query("emailLogs")
          .withIndex("userId", (q) => q.eq("userId", userId))
          .collect();
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("sent");
      expect(logs[0].resendId).toBe("resend-abc");
    });
  });

  describe("sendNotification", () => {
    test("skips and logs when user has opted out", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);

      // Opt out
      await t
        .withIdentity(identity)
        .mutation(api.notification_preferences_mutations.updateNotificationPreferences, {
          emailNotificationsEnabled: false,
        });

      await t.action(internal.email_service.sendNotification, {
        userId,
        notificationType: "new_recommendations",
        context,
      });

      expect(mockSend).not.toHaveBeenCalled();

      const logs = await t.run(async (ctx) =>
        ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      );
      expect(logs[0].status).toBe("skipped");
    });

    test("skips and logs when user has no email", async () => {
      const t = createTestConvex();
      const { userId } = await createTestUser(t);
      // user has no email field

      await t.action(internal.email_service.sendNotification, {
        userId,
        notificationType: "plan_accepted",
        context,
      });

      expect(mockSend).not.toHaveBeenCalled();

      const logs = await t.run(async (ctx) =>
        ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      );
      expect(logs[0].status).toBe("skipped");
      expect(logs[0].errorMessage).toBe("No email address on file");
    });

    test("sends email and logs sent on success", async () => {
      mockSend.mockResolvedValue({ data: { id: "resend-xyz" }, error: null });

      const t = createTestConvex();
      const { userId } = await createTestUser(t);
      await t.run(async (ctx) => { await ctx.db.patch(userId, { email: "alice@example.com" }); });

      await t.action(internal.email_service.sendNotification, {
        userId,
        notificationType: "new_recommendations",
        context,
      });

      expect(mockSend).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: "alice@example.com" }),
      );

      const logs = await t.run(async (ctx) =>
        ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      );
      expect(logs[0].status).toBe("sent");
      expect(logs[0].resendId).toBe("resend-xyz");
    });

    test("logs failed when Resend returns an error", async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: "invalid_api_key" } });

      const t = createTestConvex();
      const { userId } = await createTestUser(t);
      await t.run(async (ctx) => { await ctx.db.patch(userId, { email: "alice@example.com" }); });

      await t.action(internal.email_service.sendNotification, {
        userId,
        notificationType: "plan_accepted",
        context,
      });

      const logs = await t.run(async (ctx) =>
        ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      );
      expect(logs[0].status).toBe("failed");
      expect(logs[0].errorMessage).toBe("invalid_api_key");
    });

    test("logs failed when Resend throws an exception", async () => {
      mockSend.mockRejectedValue(new Error("Network error"));

      const t = createTestConvex();
      const { userId } = await createTestUser(t);
      await t.run(async (ctx) => { await ctx.db.patch(userId, { email: "alice@example.com" }); });

      await t.action(internal.email_service.sendNotification, {
        userId,
        notificationType: "event_reminder",
        context,
      });

      const logs = await t.run(async (ctx) =>
        ctx.db.query("emailLogs").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      );
      expect(logs[0].status).toBe("failed");
      expect(logs[0].errorMessage).toBe("Network error");
    });
  });
});
