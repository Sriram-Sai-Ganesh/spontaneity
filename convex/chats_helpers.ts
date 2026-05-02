import type { Id, Doc } from "./_generated/dataModel";
import type { AuthQueryCtx, AuthMutationCtx } from "./lib";
import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import {
  AI_ASSISTANT_CHAT_ICON,
  AI_ASSISTANT_CHAT_KIND,
  AI_ASSISTANT_CHAT_TITLE,
  GROUP_CHAT_KIND,
} from "./chats_constants";
type MembershipDoc = Doc<"group_members">;
type AnyCtx = { db: DatabaseReader | DatabaseWriter };

// ── Read helpers ─────────────────────────────────────────────────

/** Return chats the current user belongs to, joined with membership info. */
export async function getAllChats(
  ctx: AuthQueryCtx,
): Promise<{ chat: Doc<"chats">; membership: MembershipDoc }[]> {
  const memberships = await ctx.db
    .query("group_members")
    .withIndex("by_user_id", (q) => q.eq("userId", ctx.userId))
    .collect();

  const chats: { chat: Doc<"chats">; membership: MembershipDoc }[] = [];

  for (const membership of memberships) {
    const chat = await ctx.db.get(membership.chatId);
    if (chat) chats.push({ chat, membership });
  }

  // Keep newest first to match previous UX expectation
  return chats.sort((a, b) => b.chat._creationTime - a.chat._creationTime);
}

export async function getChatById(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<Doc<"chats"> | null> {
  return ctx.db.get(chatId);
}

// ── Write helpers ────────────────────────────────────────────────

export async function createChat(
  ctx: AuthMutationCtx,
  fields: { title: string; planningLocation?: string },
): Promise<Id<"chats">> {
  const chatId = await ctx.db.insert("chats", {
    title: fields.title,
    planningLocation: fields.planningLocation,
    userId: ctx.userId,
    kind: GROUP_CHAT_KIND,
  });

  // Creator automatically becomes owner member
  await ctx.db.insert("group_members", {
    chatId,
    userId: ctx.userId,
    role: "owner",
  });

  return chatId;
}

export async function getAiAssistantChat(
  ctx: AuthQueryCtx | AuthMutationCtx,
  userId: Id<"users">,
): Promise<Doc<"chats"> | null> {
  return ctx.db
    .query("chats")
    .withIndex("by_user_kind", (q) =>
      q.eq("userId", userId).eq("kind", AI_ASSISTANT_CHAT_KIND),
    )
    .first();
}

export function isAiAssistantChat(chat: Doc<"chats">): boolean {
  return chat.kind === AI_ASSISTANT_CHAT_KIND;
}

export async function ensureAiAssistantChat(
  ctx: AuthMutationCtx,
): Promise<Id<"chats">> {
  const existing = await getAiAssistantChat(ctx, ctx.userId);
  if (existing) {
    const patch: Partial<Doc<"chats">> = {};
    if (existing.title !== AI_ASSISTANT_CHAT_TITLE) {
      patch.title = AI_ASSISTANT_CHAT_TITLE;
    }
    if (existing.icon !== AI_ASSISTANT_CHAT_ICON) {
      patch.icon = AI_ASSISTANT_CHAT_ICON;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }

    const membership = await getMembership(ctx, existing._id, ctx.userId);
    if (!membership) {
      await ctx.db.insert("group_members", {
        chatId: existing._id,
        userId: ctx.userId,
        role: "owner",
      });
    }

    return existing._id;
  }

  const chatId = await ctx.db.insert("chats", {
    title: AI_ASSISTANT_CHAT_TITLE,
    userId: ctx.userId,
    icon: AI_ASSISTANT_CHAT_ICON,
    kind: AI_ASSISTANT_CHAT_KIND,
  });

  await ctx.db.insert("group_members", {
    chatId,
    userId: ctx.userId,
    role: "owner",
  });

  return chatId;
}

export async function updateChat(
  ctx: AuthMutationCtx,
  chatId: Id<"chats">,
  fields: {
    title?: string;
    icon?: string | null;
    planningLocation?: string | null;
    useDistanceRanking?: boolean | null;
    midpointLatitude?: number | null;
    midpointLongitude?: number | null;
    midpointLabel?: string | null;
  },
): Promise<void> {
  const payload: Partial<Doc<"chats">> = {};
  if (fields.title !== undefined) payload.title = fields.title;
  if (fields.icon !== undefined) payload.icon = fields.icon ?? undefined;
  if (fields.planningLocation !== undefined) {
    payload.planningLocation = fields.planningLocation ?? undefined;
  }
  if (fields.useDistanceRanking !== undefined) {
    payload.useDistanceRanking = fields.useDistanceRanking ?? undefined;
  }
  if (fields.midpointLatitude !== undefined) {
    payload.midpointLatitude = fields.midpointLatitude ?? undefined;
  }
  if (fields.midpointLongitude !== undefined) {
    payload.midpointLongitude = fields.midpointLongitude ?? undefined;
  }
  if (fields.midpointLabel !== undefined) {
    payload.midpointLabel = fields.midpointLabel ?? undefined;
  }
  await ctx.db.patch(chatId, payload);
}

export async function deleteChatWithMessages(
  ctx: AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<void> {
  // Delete members
  const members = await ctx.db
    .query("group_members")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();
  for (const member of members) {
    await ctx.db.delete(member._id);
  }

  // Delete invites
  const invites = await ctx.db
    .query("group_invites")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();
  for (const invite of invites) {
    await ctx.db.delete(invite._id);
  }

  // Delete all messages belonging to this chat
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();

  for (const message of messages) {
    await ctx.db.delete(message._id);
  }

  // Delete the chat itself
  await ctx.db.delete(chatId);
}

// ── Output transform ─────────────────────────────────────────────

export function toChatOut(
  chat: Doc<"chats">,
  membership?: MembershipDoc | null,
) {
  return {
    _id: chat._id,
    title: chat.title,
    userId: chat.userId,
    _creationTime: chat._creationTime,
    memberRole: membership?.role,
    nickname: membership?.nickname,
    icon: chat.icon,
    kind: chat.kind ?? GROUP_CHAT_KIND,
    planningLocation: chat.planningLocation,
    useDistanceRanking: chat.useDistanceRanking,
    midpointLatitude: chat.midpointLatitude,
    midpointLongitude: chat.midpointLongitude,
    midpointLabel: chat.midpointLabel,
    lastReadAt: membership?.lastReadAt,
  };
}

// ── Membership helpers ───────────────────────────────────────────

export async function getMembership(
  ctx: AnyCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<MembershipDoc | null> {
  return ctx.db
    .query("group_members")
    .withIndex("by_chat_user", (q: any) =>
      q.eq("chatId", chatId).eq("userId", userId),
    )
    .unique();
}

export async function getMembershipCount(
  ctx: AnyCtx,
  chatId: Id<"chats">,
): Promise<number> {
  const members = await ctx.db
    .query("group_members")
    .withIndex("by_chat_id", (q: any) => q.eq("chatId", chatId))
    .collect();
  return members.length;
}

export async function requireMembership(
  ctx: AnyCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<MembershipDoc> {
  const membership = await getMembership(ctx, chatId, userId);
  if (!membership) throw new Error("Forbidden");
  return membership;
}

export async function requireOwnerMembership(
  ctx: AnyCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<MembershipDoc> {
  const membership = await getMembership(ctx, chatId, userId);
  if (!membership || membership.role !== "owner") throw new Error("Forbidden");
  return membership;
}

export async function getLastMessageTimestamp(
  db: DatabaseReader,
  chatId: Id<"chats">,
): Promise<number | null> {
  const messages = await db
    .query("messages")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .collect();

  let latest: number | null = null;
  for (const message of messages) {
    if (latest === null || message._creationTime > latest) {
      latest = message._creationTime;
    }
  }
  return latest;
}
