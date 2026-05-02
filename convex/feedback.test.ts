import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";

const EVENT_ID = "tm-event-abc123";

describe("feedback", () => {
  describe("submitFeedback", () => {
    test("rejects unauthenticated users", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      await expect(
        t.mutation(api.feedback_mutations.submitFeedback, {
          eventId: EVENT_ID,
          chatId,
          feedbackType: "accept",
        }),
      ).rejects.toThrow("Not authenticated");
    });

    test("rejects non-member of chat", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const { identity: outsider } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Owner Chat");

      await expect(
        t.withIdentity(outsider).mutation(api.feedback_mutations.submitFeedback, {
          eventId: EVENT_ID,
          chatId,
          feedbackType: "accept",
        }),
      ).rejects.toThrow("Forbidden");
    });

    test("stores accept feedback with correct fields", async () => {
      const t = createTestConvex();
      const { identity, userId } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      const feedbackId = await t
        .withIdentity(identity)
        .mutation(api.feedback_mutations.submitFeedback, {
          eventId: EVENT_ID,
          chatId,
          feedbackType: "accept",
        });

      const record = await t.run(async (ctx) => ctx.db.get(feedbackId));
      expect(record).not.toBeNull();
      expect((record as any).eventId).toBe(EVENT_ID);
      expect((record as any).userId).toBe(userId);
      expect((record as any).chatId).toBe(chatId);
      expect((record as any).feedbackType).toBe("accept");
      expect((record as any).timestamp).toBeGreaterThan(0);
    });

    test.each(["accept", "reject", "cancel", "more-like-this"] as const)(
      "stores %s feedback type",
      async (feedbackType) => {
        const t = createTestConvex();
        const { identity } = await createTestUser(t);
        const chatId = await createTestChat(t, identity, "Chat");

        const feedbackId = await t
          .withIdentity(identity)
          .mutation(api.feedback_mutations.submitFeedback, {
            eventId: EVENT_ID,
            chatId,
            feedbackType,
          });

        const record = await t.run(async (ctx) => ctx.db.get(feedbackId));
        expect((record as any).feedbackType).toBe(feedbackType);
      },
    );

    test("submitting feedback twice updates instead of duplicating", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      const firstId = await t
        .withIdentity(identity)
        .mutation(api.feedback_mutations.submitFeedback, {
          eventId: EVENT_ID,
          chatId,
          feedbackType: "reject",
        });

      const secondId = await t
        .withIdentity(identity)
        .mutation(api.feedback_mutations.submitFeedback, {
          eventId: EVENT_ID,
          chatId,
          feedbackType: "accept",
        });

      // Same record ID returned (upserted)
      expect(secondId).toBe(firstId);

      // Only one record exists
      const all = await t.run(async (ctx) =>
        ctx.db.query("feedback").collect(),
      );
      expect(all).toHaveLength(1);
      expect(all[0].feedbackType).toBe("accept");
    });

    test("two different users can each submit feedback on the same event", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Group Chat");

      // Invite and join a second member
      const invite = await t
        .withIdentity(owner)
        .mutation(api.chats_mutations.createInvite, { chatId });
      const { identity: member } = await createTestUser(t);
      await t
        .withIdentity(member)
        .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });

      await t.withIdentity(owner).mutation(api.feedback_mutations.submitFeedback, {
        eventId: EVENT_ID,
        chatId,
        feedbackType: "accept",
      });
      await t.withIdentity(member).mutation(api.feedback_mutations.submitFeedback, {
        eventId: EVENT_ID,
        chatId,
        feedbackType: "reject",
      });

      const all = await t.run(async (ctx) =>
        ctx.db.query("feedback").collect(),
      );
      expect(all).toHaveLength(2);
    });
  });

  describe("listForChat", () => {
    test("rejects unauthenticated users", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      await expect(
        t.query(api.feedback_queries.listForChat, { chatId }),
      ).rejects.toThrow("Not authenticated");
    });

    test("rejects non-member of chat", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const { identity: outsider } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Chat");

      await expect(
        t
          .withIdentity(outsider)
          .query(api.feedback_queries.listForChat, { chatId }),
      ).rejects.toThrow("Forbidden");
    });

    test("returns empty list when no feedback exists", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      const result = await t
        .withIdentity(identity)
        .query(api.feedback_queries.listForChat, { chatId });

      expect(result).toEqual([]);
    });

    test("returns all feedback records for the chat", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
        eventId: "evt-1",
        chatId,
        feedbackType: "accept",
      });
      await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
        eventId: "evt-2",
        chatId,
        feedbackType: "reject",
      });

      const result = await t
        .withIdentity(identity)
        .query(api.feedback_queries.listForChat, { chatId });

      expect(result).toHaveLength(2);
      const types = result.map((r: any) => r.feedbackType);
      expect(types).toContain("accept");
      expect(types).toContain("reject");
    });

    test("does not return feedback from a different chat", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chat1 = await createTestChat(t, identity, "Chat 1");
      const chat2 = await createTestChat(t, identity, "Chat 2");

      await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
        eventId: EVENT_ID,
        chatId: chat1,
        feedbackType: "accept",
      });

      const result = await t
        .withIdentity(identity)
        .query(api.feedback_queries.listForChat, { chatId: chat2 });

      expect(result).toHaveLength(0);
    });
  });
});
