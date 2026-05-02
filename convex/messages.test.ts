import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import {
  createTestConvex,
  createTestUser,
  createTestChat,
  createTestMessage,
} from "./test.setup";

describe("messages", () => {
  describe("auth", () => {
    test("create rejects unauthenticated users", async () => {
      const t = createTestConvex();

      // We need a valid chatId, so create a user + chat first
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      await expect(
        t.mutation(api.messages_mutations.create, {
          chatId,
          role: "user",
          content: "Hello",
        }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("CRUD", () => {
    test("create and list messages", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "Test Chat");
      const msgId = await createTestMessage(t, identity, chatId, "Hello world");
      expect(msgId).toBeDefined();

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello world");
      expect(messages[0].role).toBe("user");
      expect(messages[0].chatId).toBe(chatId);
    });

    test("messages are ordered chronologically", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "Test Chat");
      await createTestMessage(t, identity, chatId, "First");
      await createTestMessage(t, identity, chatId, "Second", "assistant");
      await createTestMessage(t, identity, chatId, "Third");

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
      expect(messages[1].role).toBe("assistant");
      expect(messages[2].content).toBe("Third");
    });
  });

  describe("ownership", () => {
    test("user cannot read messages from another user's chat", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      const chatId = await createTestChat(t, user1, "User 1 Chat");
      await createTestMessage(t, user1, chatId, "Secret message");

      await expect(
        t.withIdentity(user2).query(api.messages_queries.getByChat, { chatId }),
      ).rejects.toThrow("Forbidden");
    });

    test("user cannot create messages in another user's chat", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      const chatId = await createTestChat(t, user1, "User 1 Chat");

      await expect(
        t.withIdentity(user2).mutation(api.messages_mutations.create, {
          chatId,
          role: "user",
          content: "Injected",
        }),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("clientId support", () => {
    test("create message with clientId stores and returns it", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      await t.withIdentity(identity).mutation(api.messages_mutations.create, {
        chatId,
        role: "user",
        content: "Hello",
        clientId: "client-uuid-123",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(1);
      expect(messages[0].clientId).toBe("client-uuid-123");
    });

    test("create message without clientId works (backward compat)", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      await t.withIdentity(identity).mutation(api.messages_mutations.create, {
        chatId,
        role: "user",
        content: "Hello",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(1);
      expect(messages[0].clientId).toBeUndefined();
    });
  });

  describe("editing and deletion", () => {
    test("user can update their own message", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");
      const messageId = await createTestMessage(t, identity, chatId, "Before");

      await t.withIdentity(identity).mutation(api.messages_mutations.update, {
        messageId,
        content: "  After  ",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("After");
    });

    test("user can delete their own message", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");
      const messageId = await createTestMessage(t, identity, chatId, "Delete me");

      await t.withIdentity(identity).mutation(api.messages_mutations.remove, {
        messageId,
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(0);
    });

    test("member cannot update another user's message", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Shared Chat");
      const invite = await t
        .withIdentity(owner)
        .mutation(api.chats_mutations.createInvite, { chatId });
      const { identity: member } = await createTestUser(t);

      await t
        .withIdentity(member)
        .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });

      const messageId = await createTestMessage(
        t,
        owner,
        chatId,
        "Owner message",
      );

      await expect(
        t.withIdentity(member).mutation(api.messages_mutations.update, {
          messageId,
          content: "Edited by member",
        }),
      ).rejects.toThrow("Forbidden");
    });

    test("user cannot delete an assistant message", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");
      const messageId = await createTestMessage(
        t,
        identity,
        chatId,
        "Assistant reply",
        "assistant",
      );

      await expect(
        t.withIdentity(identity).mutation(api.messages_mutations.remove, {
          messageId,
        }),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("streaming lifecycle", () => {
    test("createStreamingMessage inserts incomplete message", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );
      expect(messageId).toBeDefined();

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("");
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].isComplete).toBe(false);
    });

    test("updateStreamingContent patches content", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );

      await t.mutation(internal.messages_internals.updateStreamingContent, {
        messageId,
        content: "Hello world",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].content).toBe("Hello world");
      expect(messages[0].isComplete).toBe(false);
    });

    test("completeStreamingMessage marks complete with final content", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );

      await t.mutation(internal.messages_internals.completeStreamingMessage, {
        messageId,
        content: "Final answer",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].content).toBe("Final answer");
      expect(messages[0].isComplete).toBe(true);
    });

    test("updateStreamingLatestToolCall persists a completed tool result", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );

      await t.mutation(
        internal.messages_internals.updateStreamingLatestToolCall,
        {
          messageId,
          latestToolCall: {
            toolCallId: "tool-1",
            toolName: "displayEventCards",
            state: "output-available",
            args: {
              summary_message: "Top picks for tonight.",
            },
            result: {
              summary_message: "Top picks for tonight.",
              events: [
                {
                  eventId: "evt-1",
                  title: "Jazz Night",
                },
              ],
            },
          },
        },
      );

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].latestToolCall).toEqual({
        toolCallId: "tool-1",
        toolName: "displayEventCards",
        state: "output-available",
        args: {
          summary_message: "Top picks for tonight.",
        },
        result: {
          summary_message: "Top picks for tonight.",
          events: [
            {
              eventId: "evt-1",
              title: "Jazz Night",
            },
          ],
        },
      });
      expect(messages[0].isComplete).toBe(false);
    });

    test("only the latest completed tool result remains after completion", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );

      await t.mutation(
        internal.messages_internals.updateStreamingLatestToolCall,
        {
          messageId,
          latestToolCall: {
            toolCallId: "tool-1",
            toolName: "findGroupAvailableEvents",
            state: "output-available",
            args: { city: "Baltimore" },
            result: {
              constraintStatus: "ok",
              events: [{ eventId: "evt-1", title: "First Event" }],
            },
          },
        },
      );

      await t.mutation(
        internal.messages_internals.updateStreamingLatestToolCall,
        {
          messageId,
          latestToolCall: {
            toolCallId: "tool-2",
            toolName: "createCalendarEvent",
            state: "output-available",
            args: { title: "Dinner" },
            result: {
              filename: "dinner.ics",
              ics: "BEGIN:VCALENDAR",
            },
          },
        },
      );

      await t.mutation(internal.messages_internals.completeStreamingMessage, {
        messageId,
        content: "Finished",
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].content).toBe("Finished");
      expect(messages[0].isComplete).toBe(true);
      expect(messages[0].latestToolCall).toEqual({
        toolCallId: "tool-2",
        toolName: "createCalendarEvent",
        state: "output-available",
        args: { title: "Dinner" },
        result: {
          filename: "dinner.ics",
          ics: "BEGIN:VCALENDAR",
        },
      });
    });

    test("full streaming lifecycle: create → update → complete", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      // Create
      const messageId = await t.mutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model: "test-model" },
      );

      // Flush partial content
      await t.mutation(internal.messages_internals.updateStreamingContent, {
        messageId,
        content: "The answer",
      });

      let messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].isComplete).toBe(false);
      expect(messages[0].content).toBe("The answer");

      // Complete
      await t.mutation(internal.messages_internals.completeStreamingMessage, {
        messageId,
        content: "The answer is 42.",
      });

      messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messages[0].isComplete).toBe(true);
      expect(messages[0].content).toBe("The answer is 42.");
    });

    test("legacy toolCalls rows hydrate through latestToolCall", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Test Chat");

      await t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          chatId,
          userId,
          role: "assistant",
          content: "Hydrated legacy tool calls",
          model: "test-model",
          isComplete: true,
          toolCalls: [
            {
              toolCallId: "tool-1",
              toolName: "findGroupAvailableEvents",
              state: "output-available",
              args: { city: "Baltimore" },
              result: {
                constraintStatus: "ok",
                events: [{ eventId: "evt-1", title: "First Event" }],
              },
            },
            {
              toolCallId: "tool-2",
              toolName: "createEventPoll",
              state: "output-available",
              args: { source: "recommendation" },
              result: {
                pollId: "poll-1",
                summary_message: "Poll created",
              },
            },
          ],
        });
      });

      const messages = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });

      expect(messages).toHaveLength(1);
      expect(messages[0].latestToolCall).toEqual({
        toolCallId: "tool-2",
        toolName: "createEventPoll",
        state: "output-available",
        args: { source: "recommendation" },
        result: {
          pollId: "poll-1",
          summary_message: "Poll created",
        },
      });
    });
  });
});
