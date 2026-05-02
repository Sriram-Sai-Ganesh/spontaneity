import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { queryWithAuth } from "./lib";
import {
  getAllChats,
  getLastMessageTimestamp,
  toChatOut,
} from "./chats_helpers";
import { getChatIfMember, requireChatMember } from "./chats_guards";
import { chatKindValidator } from "./chats_schema";

/**
 * Resolve a member's name or nickname to userId in a chat. Used by the chat action for "what are X's preferences".
 */
export const resolveChatMemberNameToUserId = internalQuery({
  args: {
    chatId: v.id("chats"),
    nameOrNickname: v.string(),
  },
  handler: async (ctx, { chatId, nameOrNickname }) => {
    const normalized = nameOrNickname.trim().toLowerCase();
    if (!normalized) return null;
    const members = await ctx.db
      .query("group_members")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      const nickname = member.nickname?.trim().toLowerCase();
      const fullName = user?.name?.trim().toLowerCase();
      const firstName = fullName?.split(/\s+/)[0];
      if (
        nickname === normalized ||
        fullName === normalized ||
        firstName === normalized
      ) {
        return member.userId;
      }
    }
    return null;
  },
});

export const getAll = queryWithAuth({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("chats"),
      title: v.string(),
      userId: v.id("users"),
      _creationTime: v.number(),
      memberRole: v.optional(v.union(v.literal("owner"), v.literal("member"))),
      nickname: v.optional(v.string()),
      icon: v.optional(v.string()),
      kind: v.optional(chatKindValidator),
      planningLocation: v.optional(v.string()),
      useDistanceRanking: v.optional(v.boolean()),
      midpointLatitude: v.optional(v.number()),
      midpointLongitude: v.optional(v.number()),
      midpointLabel: v.optional(v.string()),
      lastReadAt: v.optional(v.number()),
      lastMessageAt: v.optional(v.number()),
      hasUnread: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx) => {
    const chats = await getAllChats(ctx);
    const withUnread = await Promise.all(
      chats.map(async ({ chat, membership }) => {
        const lastMessageAt = await getLastMessageTimestamp(ctx.db, chat._id);
        const hasUnread =
          lastMessageAt !== null &&
          (membership?.lastReadAt ?? 0) < lastMessageAt;

        return {
          ...toChatOut(chat, membership),
          lastMessageAt: lastMessageAt ?? undefined,
          hasUnread,
        };
      }),
    );
    return withUnread;
  },
});

export const getOne = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.union(
    v.object({
      _id: v.id("chats"),
      title: v.string(),
      userId: v.id("users"),
      _creationTime: v.number(),
      memberRole: v.optional(v.union(v.literal("owner"), v.literal("member"))),
      nickname: v.optional(v.string()),
      icon: v.optional(v.string()),
      kind: v.optional(chatKindValidator),
      planningLocation: v.optional(v.string()),
      useDistanceRanking: v.optional(v.boolean()),
      midpointLatitude: v.optional(v.number()),
      midpointLongitude: v.optional(v.number()),
      midpointLabel: v.optional(v.string()),
      lastReadAt: v.optional(v.number()),
      lastMessageAt: v.optional(v.number()),
      hasUnread: v.optional(v.boolean()),
    }),
    v.null(),
  ),
  handler: async (ctx, { chatId }) => {
    try {
      const chat = await requireChatMember(ctx, chatId);
      const membership = await ctx.db
        .query("group_members")
        .withIndex("by_chat_user", (q) =>
          q.eq("chatId", chatId).eq("userId", ctx.userId),
        )
        .unique();
      const lastMessageAt = await getLastMessageTimestamp(ctx.db, chatId);
      const hasUnread =
        lastMessageAt !== null && (membership?.lastReadAt ?? 0) < lastMessageAt;

      return {
        ...toChatOut(chat, membership ?? undefined),
        lastMessageAt: lastMessageAt ?? undefined,
        hasUnread,
      };
    } catch {
      return null;
    }
  },
});

export const getMembers = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("group_members"),
      chatId: v.id("chats"),
      userId: v.id("users"),
      nickname: v.optional(v.string()),
      role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
      lastReadAt: v.optional(v.number()),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];
    return ctx.db
      .query("group_members")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
  },
});

export const getChatInternal = internalQuery({
  args: { chatId: v.id("chats") },
  returns: v.union(
    v.object({
      _id: v.id("chats"),
      title: v.string(),
      planningLocation: v.optional(v.string()),
      useDistanceRanking: v.optional(v.boolean()),
      midpointLatitude: v.optional(v.number()),
      midpointLongitude: v.optional(v.number()),
      midpointLabel: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat) return null;
    return {
      _id: chat._id,
      title: chat.title,
      planningLocation: chat.planningLocation,
      useDistanceRanking: chat.useDistanceRanking,
      midpointLatitude: chat.midpointLatitude,
      midpointLongitude: chat.midpointLongitude,
      midpointLabel: chat.midpointLabel,
    };
  },
});

export const getChatCacheStatus = internalQuery({
  args: { chatId: v.id("chats") },
  returns: v.union(
    v.object({
      _creationTime: v.number(),
      venueCacheReady: v.optional(v.boolean()),
    }),
    v.null(),
  ),
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat) return null;
    return {
      _creationTime: chat._creationTime,
      venueCacheReady: chat.venueCacheReady,
    };
  },
});

export const getVenueCacheReady = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
    return chat?.venueCacheReady ?? null;
  },
});

export const getMembersInternal = internalQuery({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("group_members"),
      chatId: v.id("chats"),
      userId: v.id("users"),
      nickname: v.optional(v.string()),
      role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
      lastReadAt: v.optional(v.number()),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, { chatId }) => {
    return ctx.db
      .query("group_members")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
  },
});

export const getMemberProfiles = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("group_members"),
      chatId: v.id("chats"),
      userId: v.id("users"),
      nickname: v.optional(v.string()),
      role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
      lastReadAt: v.optional(v.number()),
      _creationTime: v.number(),
      user: v.object({
        _id: v.id("users"),
        name: v.optional(v.string()),
        image: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];

    const members = await ctx.db
      .query("group_members")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    const withProfiles = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        if (!user) return null;

        return {
          ...member,
          user: {
            _id: user._id,
            name: user.name,
            image: user.image,
            email: user.email,
          },
        } as const;
      }),
    );

    return withProfiles.filter((m): m is NonNullable<typeof m> => Boolean(m));
  },
});

export const getChatsWithPlanningLocationInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chats = await ctx.db.query("chats").collect();
    return chats
      .filter((c) => c.planningLocation && c.planningLocation.trim().length > 0)
      .map((c) => ({ _id: c._id, planningLocation: c.planningLocation! }));
  },
});
