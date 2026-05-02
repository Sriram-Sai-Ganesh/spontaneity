import { v } from "convex/values";
import { queryWithAuth } from "./lib";
import { requireMessageChatOwner } from "./messages_guards";
import { getMessagesByChat } from "./messages_helpers";
import { toMessageOut } from "./messages_helpers";
import { latestToolCallValidator } from "./messages_schema";

export const getByChat = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      chatId: v.id("chats"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      model: v.optional(v.string()),
      userId: v.id("users"),
      clientId: v.optional(v.string()),
      isComplete: v.optional(v.boolean()),
      latestToolCall: v.union(v.null(), latestToolCallValidator),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, { chatId }) => {
    if (!await requireMessageChatOwner(ctx, chatId)) return [];
    const messages = await getMessagesByChat(ctx, chatId);
    return messages.map(toMessageOut);
  },
});
