import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const generateNoConsensusMessage = internalAction({
  args: {
    pollId: v.id("event_polls"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { pollId }): Promise<string | null> => {
    const poll = (await ctx.runQuery(
      internal.event_polls_queries.getPollByIdInternal,
      { pollId },
    )) as Doc<"event_polls"> | null;

    if (!poll || poll.resolution !== "no_consensus") {
      return null;
    }

    if (poll.noConsensusMessage) {
      return poll.noConsensusMessage;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("Server API key not configured");
    }

    const openrouter = createOpenRouter({ apiKey });
    const optionTitles = poll.options
      .map((option: { title: string }, index: number) => `${index + 1}. ${option.title}`)
      .join("\n");

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4.5"),
      system:
        "You write one short assistant follow-up for a group poll that ended without consensus. Be direct, natural, and helpful. Mention that the group did not reach consensus and suggest trying again or adjusting the options. Return only the message text.",
      messages: [
        {
          role: "user",
          content: `Poll prompt: ${poll.prompt ?? "Which option should the group choose?"}\nOptions:\n${optionTitles}`,
        },
      ],
      maxOutputTokens: 80,
    });

    let message = "";
    for await (const chunk of (await result).textStream) {
      message += chunk;
    }

    const normalizedMessage = message.trim();
    if (normalizedMessage.length === 0) {
      return null;
    }

    return ctx.runMutation(
      internal.event_polls_mutations.persistNoConsensusMessageInternal,
      {
        pollId,
        message: normalizedMessage,
      },
    );
  },
});
