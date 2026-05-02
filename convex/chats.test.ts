import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createTestConvex,
  createTestUser,
  createTestChat,
  createTestMessage,
} from "./test.setup";
import {
  AI_ASSISTANT_CHAT_ICON,
  AI_ASSISTANT_CHAT_TITLE,
} from "./chats_constants";

describe("chats", () => {
  describe("auth", () => {
    test("getAll rejects unauthenticated users", async () => {
      const t = createTestConvex();
      await expect(t.query(api.chats_queries.getAll, {})).rejects.toThrow(
        "Not authenticated",
      );
    });

    test("create rejects unauthenticated users", async () => {
      const t = createTestConvex();
      await expect(
        t.mutation(api.chats_mutations.create, { title: "Test" }),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("CRUD", () => {
    test("create and list chats", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "My Chat");
      expect(chatId).toBeDefined();

      const chats = await t
        .withIdentity(identity)
        .query(api.chats_queries.getAll, {});
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe("My Chat");
      expect(chats[0]._id).toBe(chatId);
    });

    test("getOne returns chat owned by user", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "My Chat");
      const chat = await t
        .withIdentity(identity)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat).not.toBeNull();
      expect(chat!.title).toBe("My Chat");
    });

    test("create and query chat planning location", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await t.withIdentity(identity).mutation(
        api.chats_mutations.create,
        {
          title: "Planning Chat",
          planningLocation: "Washington, DC",
        },
      );

      const chats = await t
        .withIdentity(identity)
        .query(api.chats_queries.getAll, {});
      expect(chats).toHaveLength(1);
      expect(chats[0]).toMatchObject({
        _id: chatId,
        title: "Planning Chat",
        planningLocation: "Washington, DC",
      });

      const chat = await t
        .withIdentity(identity)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat?.planningLocation).toBe("Washington, DC");
    });

    test("update chat title", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "Old Title");
      await t
        .withIdentity(identity)
        .mutation(api.chats_mutations.update, { chatId, title: "New Title" });

      const chat = await t
        .withIdentity(identity)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat!.title).toBe("New Title");
    });

    test("update chat planning location and allow clearing it", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "Planning Chat");
      await t.withIdentity(identity).mutation(api.chats_mutations.update, {
        chatId,
        planningLocation: "Boston, MA",
      });

      let chat = await t
        .withIdentity(identity)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat?.planningLocation).toBe("Boston, MA");

      await t.withIdentity(identity).mutation(api.chats_mutations.update, {
        chatId,
        planningLocation: null,
      });

      chat = await t
        .withIdentity(identity)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat?.planningLocation).toBeUndefined();
    });

    test("remove chat cascades to messages", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const chatId = await createTestChat(t, identity, "Chat to delete");
      await createTestMessage(t, identity, chatId, "msg1");
      await createTestMessage(t, identity, chatId, "msg2");

      // Verify messages exist
      const messagesBefore = await t
        .withIdentity(identity)
        .query(api.messages_queries.getByChat, { chatId });
      expect(messagesBefore).toHaveLength(2);

      // Delete chat
      await t
        .withIdentity(identity)
        .mutation(api.chats_mutations.remove, { chatId });

      // Chat should be gone
      const chats = await t
        .withIdentity(identity)
        .query(api.chats_queries.getAll, {});
      expect(chats).toHaveLength(0);
    });

    test("ensureAiAssistant creates one fixed assistant chat for the user", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);

      const firstId = await t
        .withIdentity(identity)
        .mutation(api.chats_mutations.ensureAiAssistant, {});
      const secondId = await t
        .withIdentity(identity)
        .mutation(api.chats_mutations.ensureAiAssistant, {});

      expect(secondId).toBe(firstId);

      const chats = await t
        .withIdentity(identity)
        .query(api.chats_queries.getAll, {});
      expect(chats).toHaveLength(1);
      expect(chats[0]).toMatchObject({
        _id: firstId,
        title: AI_ASSISTANT_CHAT_TITLE,
        icon: AI_ASSISTANT_CHAT_ICON,
        kind: "ai",
      });

      const members = await t
        .withIdentity(identity)
        .query(api.chats_queries.getMembers, { chatId: firstId });
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(identity.subject);
    });

    test("assistant chat cannot be edited, deleted, or invited", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await t
        .withIdentity(identity)
        .mutation(api.chats_mutations.ensureAiAssistant, {});

      await expect(
        t
          .withIdentity(identity)
          .mutation(api.chats_mutations.update, { chatId, title: "Renamed" }),
      ).rejects.toThrow("Spontaneity AI cannot be edited");

      await expect(
        t.withIdentity(identity).mutation(api.chats_mutations.createInvite, {
          chatId,
        }),
      ).rejects.toThrow("Invite links cannot be created for Spontaneity AI");

      await expect(
        t.withIdentity(identity).mutation(api.chats_mutations.remove, {
          chatId,
        }),
      ).rejects.toThrow("Spontaneity AI cannot be deleted");
    });
  });

  describe("ownership", () => {
    test("user cannot access another user's chat", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      const chatId = await createTestChat(t, user1, "User 1 Chat");

      // User 2 should get null (not throw) for getOne
      const chat = await t
        .withIdentity(user2)
        .query(api.chats_queries.getOne, { chatId });
      expect(chat).toBeNull();
    });

    test("user cannot update another user's chat", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      const chatId = await createTestChat(t, user1, "User 1 Chat");

      await expect(
        t
          .withIdentity(user2)
          .mutation(api.chats_mutations.update, { chatId, title: "Hacked" }),
      ).rejects.toThrow("Forbidden");
    });

    test("user cannot delete another user's chat", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      const chatId = await createTestChat(t, user1, "User 1 Chat");

      await expect(
        t.withIdentity(user2).mutation(api.chats_mutations.remove, { chatId }),
      ).rejects.toThrow("Forbidden");
    });

    test("users only see their own chats", async () => {
      const t = createTestConvex();
      const { identity: user1 } = await createTestUser(t);
      const { identity: user2 } = await createTestUser(t);

      await createTestChat(t, user1, "User 1 Chat");
      await createTestChat(t, user2, "User 2 Chat");

      const user1Chats = await t
        .withIdentity(user1)
        .query(api.chats_queries.getAll, {});
      expect(user1Chats).toHaveLength(1);
      expect(user1Chats[0].title).toBe("User 1 Chat");

      const user2Chats = await t
        .withIdentity(user2)
        .query(api.chats_queries.getAll, {});
      expect(user2Chats).toHaveLength(1);
      expect(user2Chats[0].title).toBe("User 2 Chat");
    });
  });

  describe("invites and membership", () => {
    test("create invite and join flow adds member", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Owner Chat");

      const invite = await t
        .withIdentity(owner)
        .mutation(api.chats_mutations.createInvite, { chatId });

      const { identity: member } = await createTestUser(t);
      const joinResult = await t
        .withIdentity(member)
        .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });

      expect(joinResult.chatId).toBe(chatId);

      const memberChats = await t
        .withIdentity(member)
        .query(api.chats_queries.getAll, {});
      expect(memberChats).toHaveLength(1);
      expect(memberChats[0]._id).toBe(chatId);
    });

    test("member can leave group and owner remains", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Group Chat");

      const invite = await t
        .withIdentity(owner)
        .mutation(api.chats_mutations.createInvite, { chatId });

      const { identity: member } = await createTestUser(t);
      await t
        .withIdentity(member)
        .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });

      await t
        .withIdentity(member)
        .mutation(api.chats_mutations.leave, { chatId });

      const ownerChats = await t
        .withIdentity(owner)
        .query(api.chats_queries.getAll, {});
      expect(ownerChats).toHaveLength(1);
      expect(ownerChats[0]._id).toBe(chatId);
    });

    test("nickname persists on membership", async () => {
      const t = createTestConvex();
      const { identity: owner } = await createTestUser(t);
      const chatId = await createTestChat(t, owner, "Nick Chat");

      const invite = await t
        .withIdentity(owner)
        .mutation(api.chats_mutations.createInvite, { chatId });

      const { identity: member } = await createTestUser(t);
      await t
        .withIdentity(member)
        .mutation(api.chats_mutations.joinWithInvite, {
          token: invite.token,
          nickname: "Alex",
        });

      const members = await t
        .withIdentity(owner)
        .query(api.chats_queries.getMembers, { chatId });

      const nick = members.find(
        (m: { userId: Id<"users">; nickname?: string }) =>
          m.userId === member.subject,
      );
      expect(nick?.nickname).toBe("Alex");
    });
  });
});
