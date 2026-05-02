import type { Id, Doc } from "./_generated/dataModel";
import type { AuthQueryCtx, AuthMutationCtx } from "./lib";
import { requireMembership, requireOwnerMembership } from "./chats_helpers";

/**
 * Fetch a chat and verify the current user owns it.
 * Returns the doc so callers avoid a redundant `ctx.db.get()`.
 * Throws on not-found or forbidden.
 */
export async function requireChatOwner(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Chat not found");
  if (chat.userId !== ctx.userId) throw new Error("Forbidden");
  return chat;
}

/**
 * Like requireChatMember but returns null when the chat no longer exists.
 * Use in queries/subscriptions so re-runs after deletion don't throw.
 */
export async function getChatIfMember(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<Doc<"chats"> | null> {
  const chat = await ctx.db.get(chatId);
  if (!chat) return null;
  await requireMembership(ctx, chatId, ctx.userId);
  return chat;
}

/** Ensure the user is a member of the chat; returns the chat doc. */
export async function requireChatMember(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Chat not found");
  await requireMembership(ctx, chatId, ctx.userId);
  return chat;
}

/** Ensure the user is an owner member of the chat; returns the chat doc. */
export async function requireChatOwnerMember(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Chat not found");
  await requireOwnerMembership(ctx, chatId, ctx.userId);
  return chat;
}
