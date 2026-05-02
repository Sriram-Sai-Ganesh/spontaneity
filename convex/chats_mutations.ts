import { v } from "convex/values";
import { mutationWithAuth } from "./lib";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  requireChatOwner,
  requireChatOwnerMember,
  requireChatMember,
} from "./chats_guards";
import {
  createChat,
  updateChat,
  deleteChatWithMessages,
  getMembershipCount,
  ensureAiAssistantChat,
  isAiAssistantChat,
} from "./chats_helpers";
const MAX_MEMBERS = 16;

function generateToken(): string {
  // Simple, collision-resistant enough for invite links without crypto.
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

export const create = mutationWithAuth({
  args: {
    title: v.string(),
    planningLocation: v.optional(v.string()),
  },
  returns: v.id("chats"),
  handler: async (ctx, { title, planningLocation }) => {
    const chatId = await createChat(ctx, { title, planningLocation });
    // convex-test's scheduler implementation can produce "write outside of transaction"
    // unhandled rejections under Vitest. Skip warm-cache scheduling in tests.
    const isTestEnv =
      process.env.NODE_ENV === "test" ||
      process.env.VITEST !== undefined;
    if (!isTestEnv && planningLocation?.trim()) {
      await ctx.scheduler.runAfter(
        0,
        internal.availability_action.warmEventCacheForChat,
        { chatId, city: planningLocation.trim(), userId: ctx.userId },
      );
    }
    return chatId;
  },
});

export const ensureAiAssistant = mutationWithAuth({
  args: {},
  returns: v.id("chats"),
  handler: async (ctx) => {
    return ensureAiAssistantChat(ctx);
  },
});

export const update = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    title: v.optional(v.string()),
    icon: v.optional(v.union(v.string(), v.null())),
    planningLocation: v.optional(v.union(v.string(), v.null())),
    useDistanceRanking: v.optional(v.union(v.boolean(), v.null())),
    midpointLatitude: v.optional(v.union(v.number(), v.null())),
    midpointLongitude: v.optional(v.union(v.number(), v.null())),
    midpointLabel: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { chatId, title, icon, planningLocation, useDistanceRanking, midpointLatitude, midpointLongitude, midpointLabel }) => {
    // Allow any group member to edit the group name
    const chat = await requireChatMember(ctx, chatId);
    if (isAiAssistantChat(chat)) {
      throw new Error("Spontaneity AI cannot be edited");
    }
    await updateChat(ctx, chatId, {
      title,
      icon: icon ?? undefined,
      planningLocation,
      useDistanceRanking,
      midpointLatitude,
      midpointLongitude,
      midpointLabel,
    });
    return null;
  },
});

export const remove = mutationWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const chat = await requireChatOwner(ctx, chatId); // legacy owner field support
    if (isAiAssistantChat(chat)) {
      throw new Error("Spontaneity AI cannot be deleted");
    }
    await requireChatOwnerMember(ctx, chatId);
    await deleteChatWithMessages(ctx, chatId);
    return null;
  },
});

export const joinWithInvite = mutationWithAuth({
  args: { token: v.string(), nickname: v.optional(v.string()) },
  returns: v.object({ chatId: v.id("chats") }),
  handler: async (ctx, { token, nickname }) => {
    // Find invite
    const invite = await ctx.db
      .query("group_invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite) throw new Error("Invalid invite");
    if (invite.expiresAt < Date.now()) throw new Error("Invite expired");

    const chat = await ctx.db.get(invite.chatId);
    if (!chat || isAiAssistantChat(chat)) throw new Error("Invalid invite");

    // Check membership
    const existing = await ctx.db
      .query("group_members")
      .withIndex("by_chat_user", (q) =>
        q.eq("chatId", invite.chatId).eq("userId", ctx.userId),
      )
      .unique();
    if (existing) {
      // Update nickname if provided
      if (nickname && existing.nickname !== nickname) {
        await ctx.db.patch(existing._id, { nickname });
      }
      return { chatId: invite.chatId };
    }

    // Capacity guard
    const count = await getMembershipCount(ctx, invite.chatId);
    if (count >= MAX_MEMBERS) throw new Error("Group is full");

    await ctx.db.insert("group_members", {
      chatId: invite.chatId,
      userId: ctx.userId,
      nickname,
      role: "member",
    });

    return { chatId: invite.chatId };
  },
});

export const createInvite = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    expiresInHours: v.optional(v.number()),
  },
  returns: v.object({
    token: v.string(),
    expiresAt: v.number(),
    chatId: v.id("chats"),
  }),
  handler: async (ctx, { chatId, expiresInHours }) => {
    const chat = await requireChatMember(ctx, chatId);
    if (isAiAssistantChat(chat)) {
      throw new Error("Invite links cannot be created for Spontaneity AI");
    }

    const ttlHours = expiresInHours && expiresInHours > 0 ? expiresInHours : 72;
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
    const token = generateToken();

    await ctx.db.insert("group_invites", {
      chatId,
      token,
      createdBy: ctx.userId,
      expiresAt,
    });

    return { token, expiresAt, chatId };
  },
});

export const leave = mutationWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, { chatId }) => {
    const chat = await requireChatMember(ctx, chatId);
    if (isAiAssistantChat(chat)) {
      throw new Error("Spontaneity AI cannot be left");
    }

    const membership = await ctx.db
      .query("group_members")
      .withIndex("by_chat_user", (q) =>
        q.eq("chatId", chatId).eq("userId", ctx.userId),
      )
      .unique();

    if (!membership) throw new Error("Forbidden");

    // Prevent leaving if this is the last owner; enforce at least 1 owner.
    if (membership.role === "owner") {
      const owners = await ctx.db
        .query("group_members")
        .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();
      if (owners.length <= 1) {
        throw new Error("You must transfer ownership before leaving");
      }
    }

    await ctx.db.delete(membership._id);

    const remaining = await ctx.db
      .query("group_members")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    if (remaining.length === 0) {
      // Clean up empty group
      await deleteChatWithMessages(ctx, chatId);
    }

    return null;
  },
});

export const setNickname = mutationWithAuth({
  args: { chatId: v.id("chats"), nickname: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { chatId, nickname }) => {
    const membership = await ctx.db
      .query("group_members")
      .withIndex("by_chat_user", (q) =>
        q.eq("chatId", chatId).eq("userId", ctx.userId),
      )
      .unique();
    if (!membership) throw new Error("Forbidden");

    await ctx.db.patch(membership._id, { nickname: nickname ?? undefined });
    return null;
  },
});

export const markRead = mutationWithAuth({
  args: { chatId: v.id("chats"), at: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { chatId, at }) => {
    const membership = await ctx.db
      .query("group_members")
      .withIndex("by_chat_user", (q) =>
        q.eq("chatId", chatId).eq("userId", ctx.userId),
      )
      .unique();

    if (!membership) return null;

    await ctx.db.patch(membership._id, {
      lastReadAt: at ?? Date.now(),
    });

    return null;
  },
});

export const setVenueCacheReady = internalMutation({
  args: { chatId: v.id("chats"), ready: v.boolean() },
  handler: async (ctx, { chatId, ready }) => {
    await ctx.db.patch(chatId, { venueCacheReady: ready });
  },
});
