import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { internal } from "./_generated/api";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Generate a title suggestion for a chat based on its messages.
 * Called from the edit-chat dialog's "suggest title" button.
 */
export const suggestTitle = actionWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { chatId }) => {
    // Verify ownership
    const ownership = await ctx.runQuery(
      internal.messages_internals.verifyChatOwnership,
      { chatId, userId: ctx.userId },
    );
    if (!ownership.ok) throw new Error(ownership.error);

    // Get messages
    const messages = await ctx.runQuery(
      internal.messages_internals.getMessagesByChat,
      { chatId },
    );
    if (messages.length === 0) return null;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Server API key not configured");

    const openrouter = createOpenRouter({ apiKey });

    const excerpt = messages
      .slice(0, 6)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const result = streamText({
        model: openrouter.chat("anthropic/claude-sonnet-4-5"),
        messages: [
          {
            role: "user",
            content: `Generate a short title (3-6 words) for the following conversation. Return only the title, no quotes or punctuation.\n\n${excerpt}`,
          },
        ],
        //maxOutputTokens: 200, // titles are short and cheap
      });

      let title = "";
      for await (const chunk of (await result).textStream) {
        title += chunk;
      }

      return title.trim() || null;
    } catch {
      return null;
    }
  },
});
