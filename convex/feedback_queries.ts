import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";

/** Internal version — callable from actions without user auth context. */
export const listForChatInternal = internalQuery({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    return ctx.db
      .query("feedback")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
  },
});

/** Return all feedback records for a chat (all members, all events). */
export const listForChat = queryWithAuth({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];
    return ctx.db
      .query("feedback")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
  },
});
