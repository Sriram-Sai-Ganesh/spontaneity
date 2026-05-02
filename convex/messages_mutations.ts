import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { AuthMutationCtx } from "./lib";
import { mutationWithAuth } from "./lib";
import { requireMessageChatOwner } from "./messages_guards";
import {
  createMessage,
  deleteMessage as deleteStoredMessage,
  getMessageById,
} from "./messages_helpers";

async function requireOwnedUserMessage(
  ctx: AuthMutationCtx,
  messageId: Id<"messages">,
) {
  const message = await getMessageById(ctx, messageId);
  if (!message) throw new Error("Message not found");
  await requireMessageChatOwner(ctx, message.chatId);
  if (message.userId !== ctx.userId || message.role !== "user") {
    throw new Error("Forbidden");
  }
  return message;
}

export const create = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    clientId: v.optional(v.string()),
  },
  returns: v.id("messages"),
  handler: async (ctx, { chatId, role, content, clientId }) => {
    await requireMessageChatOwner(ctx, chatId);
    return createMessage(ctx, { chatId, role, content, clientId });
  },
});

export const update = mutationWithAuth({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, content }) => {
    await requireOwnedUserMessage(ctx, messageId);
    const nextContent = content.trim();
    if (!nextContent) throw new Error("Message content is required");
    await ctx.db.patch(messageId, { content: nextContent });
    return null;
  },
});

export const remove = mutationWithAuth({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    await requireOwnedUserMessage(ctx, messageId);
    await deleteStoredMessage(ctx, messageId);
    return null;
  },
});
