import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";

export const listForChat = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.any(),
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];
    return ctx.db
      .query("event_shortlists")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();
  },
});

export const getByIdInternal = internalQuery({
  args: { shortlistId: v.id("event_shortlists") },
  returns: v.any(),
  handler: async (ctx, { shortlistId }) => ctx.db.get(shortlistId),
});
