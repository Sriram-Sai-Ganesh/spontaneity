import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { insertMessage } from "./messages_helpers";
import { requireMembership } from "./chats_helpers";
import { latestToolCallValidator } from "./messages_schema";
import { AI_ASSISTANT_CHAT_KIND, GROUP_CHAT_KIND } from "./chats_constants";

/**
 * Create a placeholder assistant message before streaming begins.
 * Returns the message ID for subsequent updates.
 */
export const createStreamingMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, userId, model }) => {
    await requireMembership(ctx, chatId, userId);
    return insertMessage(ctx.db, {
      chatId,
      userId,
      role: "assistant",
      content: "",
      model,
      isComplete: false,
    });
  },
});

/**
 * Flush accumulated streaming content to an existing message.
 */
export const updateStreamingContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, { messageId, content }) => {
    await ctx.db.patch(messageId, { content });
  },
});

/**
 * Persist the most recent completed tool call for a streaming assistant message.
 */
export const updateStreamingLatestToolCall = internalMutation({
  args: {
    messageId: v.id("messages"),
    latestToolCall: latestToolCallValidator,
  },
  handler: async (ctx, { messageId, latestToolCall }) => {
    await ctx.db.patch(messageId, { latestToolCall });
  },
});

/**
 * Mark a streaming message as complete with final content.
 */
export const completeStreamingMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, { messageId, content }) => {
    await ctx.db.patch(messageId, { content, isComplete: true });
  },
});

/**
 * Save the assistant's response after the stream completes.
 */
export const saveAssistantMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    content: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, userId, content, model }) => {
    await requireMembership(ctx, chatId, userId);
    await insertMessage(ctx.db, {
      chatId,
      userId,
      role: "assistant",
      content,
      model,
    });
  },
});

/**
 * Insert a one-off assistant message (e.g. "Events ranked and displayed in Find available events").
 */
export const insertAssistantMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, { chatId, userId, content }) => {
    await requireMembership(ctx, chatId, userId);
    return insertMessage(ctx.db, {
      chatId,
      userId,
      role: "assistant",
      content,
      isComplete: true,
    });
  },
});

/**
 * Auto-generate a title for a chat after the first exchange.
 */
export const updateChatTitle = internalMutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, { chatId, title }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.kind === AI_ASSISTANT_CHAT_KIND) return;
    await ctx.db.patch(chatId, { title });
  },
});

/**
 * Get messages for a chat as { role, content }[] for AI context.
 */
export const getMessagesByChat = internalQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    // Auth handled by caller; keep helper simple
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    return messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  },
});

/**
 * Insert a completed assistant message that displays event recommendation cards.
 * Used by the feedback regeneration action to persist regen results into the chat
 * so the chat interface updates reactively after panel feedback.
 */
export const insertAssistantEventCardsMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    events: v.array(v.any()),
    summaryMessage: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, userId, events, summaryMessage }) => {
    await requireMembership(ctx, chatId, userId);
    const toolCallId = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toolCallPayload = {
      toolCallId,
      toolName: "displayEventCards",
      state: "output-available" as const,
      args: { events, summary_message: summaryMessage ?? null },
      result: { events, summary_message: summaryMessage ?? null },
    };
    return insertMessage(ctx.db, {
      chatId,
      userId,
      role: "assistant",
      content: summaryMessage ?? "Here are updated suggestions based on your feedback.",
      isComplete: true,
      latestToolCall: toolCallPayload,
    });
  },
});

/**
 * Verify that a user owns a chat. Used by the HTTP action for auth.
 */
export const verifyChatOwnership = internalQuery({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
  },
  handler: async (ctx, { chatId, userId }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat) return { ok: false as const, error: "Chat not found" };

    const membership = await ctx.db
      .query("group_members")
      .withIndex("by_chat_user", (q) =>
        q.eq("chatId", chatId).eq("userId", userId),
      )
      .unique();

    if (!membership) return { ok: false as const, error: "Forbidden" };
    const kind = chat.kind ?? GROUP_CHAT_KIND;
    return { ok: true as const, title: chat.title, kind };
  },
});
