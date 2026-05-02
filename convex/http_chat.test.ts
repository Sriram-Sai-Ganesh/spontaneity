import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";

type CapturedStreamOptions = {
  tools: Record<string, { description?: string; execute: (args: unknown) => Promise<unknown> }>;
  system: string;
  messages: Array<Record<string, unknown>>;
};

let capturedStreamOptions: CapturedStreamOptions | null = null;

const POLL_TYPE_SELECTION_PROMPT =
  "Would you like this poll to use recommended events or custom options?";
const CUSTOM_POLL_OPTIONS_PROMPT =
  "Tell me the three specific events or activities you want in the poll, and I'll create it.";

const streamTextMock = vi.fn();
const createOpenRouterMock = vi.fn();

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  tool: (config: unknown) => config,
  stepCountIs: (count: number) => count,
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...args),
}));

function makeEmptyStream<T = unknown>() {
  return (async function* () {
    const _unused: T[] = [];
    if (_unused.length > 0) {
      yield _unused[0];
    }
  })();
}

function makeTextStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function makeFullStream(parts: unknown[]) {
  return (async function* () {
    for (const part of parts) {
      yield part;
    }
  })();
}

function makeCtx(
  messageHistory: Array<Record<string, unknown>> = [],
  options: {
    ownership?: Record<string, unknown>;
    chatMeta?: Record<string, unknown> | null;
  } = {},
) {
  let chatOnlyQueryCount = 0;
  const runQuery = vi.fn<
    (fn: unknown, args: Record<string, unknown>) => Promise<unknown>
  >(async (_fn: unknown, args: Record<string, unknown>) => {
    // getDisplayNameForUserId(userId)
    if ("userId" in args && !("chatId" in args)) {
      return "Test User";
    }
    // verifyChatOwnership(chatId, userId)
    if ("chatId" in args && "userId" in args) {
      return options.ownership ?? { ok: true, title: "Group Chat" };
    }
    // getChatInternal(chatId)
    if (_fn === internal.chats_queries.getChatInternal) {
      return options.chatMeta ?? null;
    }
    // getMessagesByChat(chatId)
    if ("chatId" in args) {
      if ("chatMeta" in options) {
        chatOnlyQueryCount += 1;
        return chatOnlyQueryCount % 2 === 0 ? (options.chatMeta ?? null) : messageHistory;
      }
      return messageHistory;
    }
    throw new Error("Unexpected runQuery call");
  });

  const runMutation = vi.fn<
    (fn: unknown, args: Record<string, unknown>) => Promise<unknown>
  >(async (fn: unknown, args: Record<string, unknown>) => {
    if ("userId" in args && "mode" in args && "themes" in args) {
      return {
        userId: args.userId,
        mode: args.mode,
        themes: args.themes,
      };
    }
    void fn;
    if ("limitPerWindow" in args && "windowMs" in args) return { ok: true };
    if ("chatId" in args && "userId" in args && "model" in args) return "msg-1";
    if (
      args.chatId === "chat-1" &&
      args.userId === "user-1" &&
      args.prompt === "Which type of event would you like to attend?"
    ) {
      return args.source === "recommendation" ? "poll-2" : "poll-1";
    }
    if (
      "chatId" in args &&
      "userId" in args &&
      !("model" in args) &&
      !("content" in args) &&
      !("prompt" in args) &&
      !("latestToolCall" in args)
    ) {
      return {
        pollId: "poll-1",
        status: "closed",
        closedAt: 123,
      };
    }
    return null;
  });

  const runAction = vi.fn<
    (fn: unknown, args: Record<string, unknown>) => Promise<unknown>
  >(async (fn: unknown) => {
    void fn;
    throw new Error("runAction not stubbed for this test");
  });

  return {
    runQuery,
    runMutation,
    runAction,
  };
}

async function loadApp() {
  const mod = await import("./http_chat");
  return mod.default;
}

async function bootChatRoute(ctx: ReturnType<typeof makeCtx>) {
  const app = await loadApp();
  const response = await app.request(
    "http://localhost/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId: "chat-1",
        model: "openai/gpt-4.1-mini",
        openRouterApiKey: "test-openrouter-key",
      }),
    },
    { ctx, userId: "user-1" } as never,
  );

  const text = await response.text();
  expect(response.status).toBe(200);
  expect(capturedStreamOptions).not.toBeNull();
  expect(text).toContain("[DONE]");
}

async function postChatRoute(
  ctx: ReturnType<typeof makeCtx>,
  body: Record<string, unknown>,
) {
  const app = await loadApp();
  return app.request(
    "http://localhost/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    { ctx, userId: "user-1" } as never,
  );
}

describe("http_chat orchestration", () => {
  beforeEach(() => {
    vi.resetModules();
    capturedStreamOptions = null;
    createOpenRouterMock.mockReset();
    streamTextMock.mockReset();

    createOpenRouterMock.mockReturnValue({
      chat: vi.fn(() => "mock-provider-model"),
    });

    streamTextMock.mockImplementation((options) => {
      if (
        typeof options === "object" &&
        options !== null &&
        "tools" in options
      ) {
        capturedStreamOptions = options as CapturedStreamOptions;
      }
      return {
        fullStream: makeEmptyStream(),
        textStream: makeEmptyStream<string>(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("registers availability tools and enforces prompt orchestration rules", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const tools = capturedStreamOptions!.tools;
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "getSharedAvailability",
        "findGroupAvailableEvents",
        "displayEventCards",
        "createEventPoll",
        "closeCurrentPoll",
        "getCurrentDateTime",
      ]),
    );
    expect(Object.keys(tools)).not.toContain("searchEvents");

    const system = capturedStreamOptions!.system;
    expect(system).toContain("ALWAYS call findGroupAvailableEvents first");
    expect(system).toContain("branch ONLY from findGroupAvailableEvents.constraintStatus");
    expect(system).toContain("ALWAYS call displayEventCards immediately");
    expect(system).toContain("If the user asks to close, end, or remove the active/current poll, call closeCurrentPoll");
    expect(system).toContain("Never compute or guess weekday names yourself");
    expect(system).toContain("constraintStatus is 'no_shared_availability'");
    expect(system).toContain("Never render event results as a markdown table");
    expect(system).toContain("use those exact learned preference reasons");
    expect(system).toContain("Outside the poll-creation clarification flow above, do not ask follow-up questions");
  });

  test("includes active midpoint context in the chat system prompt", async () => {
    const ctx = makeCtx([], {
      chatMeta: {
        useDistanceRanking: true,
        midpointLatitude: 40.6782,
        midpointLongitude: -73.9442,
        midpointLabel: "Brooklyn",
      },
    });

    await bootChatRoute(ctx);

    const system = capturedStreamOptions!.system;
    expect(system).toContain("This group's midpoint is set to: Brooklyn");
    expect(system).toContain("finally distance-ranked from this midpoint");
  });

  test("exposes appearance preference updates only in the assistant chat", async () => {
    const groupCtx = makeCtx();
    await bootChatRoute(groupCtx);
    expect(capturedStreamOptions!.tools).not.toHaveProperty(
      "setUserAppearancePreferences",
    );

    capturedStreamOptions = null;
    const assistantCtx = makeCtx([], {
      ownership: { ok: true, title: "Spontaneity AI", kind: "ai" },
    });
    await bootChatRoute(assistantCtx);

    expect(capturedStreamOptions!.tools).toHaveProperty(
      "setUserAppearancePreferences",
    );
    expect(capturedStreamOptions!.system).toContain(
      "change page theme, light/dark/system/random mode",
    );
  });

  test("assistant chat appearance tool persists page theme settings", async () => {
    const ctx = makeCtx([], {
      ownership: { ok: true, title: "Spontaneity AI", kind: "ai" },
    });
    await bootChatRoute(ctx);

    const result = await capturedStreamOptions!.tools.setUserAppearancePreferences.execute({
      mode: "dark",
      fontSize: "large",
      dark: {
        colors: {
          accent: "#2563eb",
        },
      },
    }) as {
      saved: boolean;
      mode: string;
      themes: {
        light: { typography?: { fontSize?: string } };
        dark: {
          colors: { accent: string };
          typography?: { fontSize?: string };
        };
      };
    };

    const appearanceMutation = ctx.runMutation.mock.calls.find(
      ([, args]) => "userId" in args && "mode" in args && "themes" in args,
    );

    expect(appearanceMutation).toBeDefined();
    expect(appearanceMutation?.[1]).toEqual(
      expect.objectContaining({
        userId: "user-1",
        mode: "dark",
        themes: expect.objectContaining({
          light: expect.objectContaining({
            typography: expect.objectContaining({ fontSize: "large" }),
          }),
          dark: expect.objectContaining({
            colors: expect.objectContaining({ accent: "#2563eb" }),
            typography: expect.objectContaining({ fontSize: "large" }),
          }),
        }),
      }),
    );
    expect(result.saved).toBe(true);
    expect(result.mode).toBe("dark");
    expect(result.themes.dark.colors.accent).toBe("#2563eb");
    expect(result.themes.light.typography?.fontSize).toBe("large");
    expect(result.themes.dark.typography?.fontSize).toBe("large");
  });

  test("assistant chat appearance tool switches to the saved random preset without regenerating colors", async () => {
    const ctx = makeCtx([], {
      ownership: { ok: true, title: "Spontaneity AI", kind: "ai" },
    });
    await bootChatRoute(ctx);
    ctx.runQuery.mockResolvedValue({
      mode: "light",
      themes: {
        light: {
          colors: {
            primary: "#f0f0f0",
            secondary: "#d9d9d9",
            accent: "#5e5e5e",
          },
          typography: { fontPreset: "roboto", fontSize: "medium" },
        },
        dark: {
          colors: {
            primary: "#141414",
            secondary: "#232323",
            accent: "#b0b0b0",
          },
          typography: { fontPreset: "roboto", fontSize: "medium" },
        },
        random: {
          colors: {
            primary: "#102030",
            secondary: "#405060",
            accent: "#708090",
          },
          typography: { fontPreset: "lora", fontSize: "large" },
        },
      },
    });

    const result = await capturedStreamOptions!.tools.setUserAppearancePreferences.execute({
      randomPreset: "use_saved",
    }) as {
      saved: boolean;
      mode: string;
      themes: { random?: { colors: { accent: string } } };
    };

    const appearanceMutation = ctx.runMutation.mock.calls.find(
      ([, args]) => "userId" in args && "mode" in args && "themes" in args,
    );

    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(appearanceMutation?.[1]).toEqual(
      expect.objectContaining({
        mode: "random",
        themes: expect.objectContaining({
          random: expect.objectContaining({
            colors: expect.objectContaining({ accent: "#708090" }),
          }),
        }),
      }),
    );
    expect(result.saved).toBe(true);
    expect(result.mode).toBe("random");
    expect(result.themes.random?.colors.accent).toBe("#708090");
  });

  test("assistant chat appearance tool generates and saves new random preset colors", async () => {
    const ctx = makeCtx([], {
      ownership: { ok: true, title: "Spontaneity AI", kind: "ai" },
    });
    ctx.runAction.mockResolvedValue({
      primary: "#112233",
      secondary: "#445566",
      accent: "#778899",
    });
    await bootChatRoute(ctx);

    const result = await capturedStreamOptions!.tools.setUserAppearancePreferences.execute({
      randomPreset: "generate_new",
    }) as {
      saved: boolean;
      mode: string;
      themes: { random?: { colors: { primary: string; accent: string } } };
    };

    const appearanceMutation = ctx.runMutation.mock.calls.find(
      ([, args]) => "userId" in args && "mode" in args && "themes" in args,
    );

    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(), {});
    expect(appearanceMutation?.[1]).toEqual(
      expect.objectContaining({
        mode: "random",
        themes: expect.objectContaining({
          random: expect.objectContaining({
            colors: {
              primary: "#112233",
              secondary: "#445566",
              accent: "#778899",
            },
          }),
        }),
      }),
    );
    expect(result.saved).toBe(true);
    expect(result.mode).toBe("random");
    expect(result.themes.random?.colors.primary).toBe("#112233");
  });

  test("assistant chat sends only the current message and four previous messages to the model", async () => {
    const messageHistory = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index + 1}`,
    }));
    const ctx = makeCtx(messageHistory, {
      ownership: { ok: true, title: "Spontaneity AI", kind: "ai" },
    });

    await bootChatRoute(ctx);

    expect(capturedStreamOptions!.messages.map((message) => message.content)).toEqual([
      "message-4",
      "message-5",
      "message-6",
      "message-7",
      "message-8",
    ]);
  });

  test("group chats still send the full message history to the model", async () => {
    const messageHistory = Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `group-message-${index + 1}`,
    }));
    const ctx = makeCtx(messageHistory);

    await bootChatRoute(ctx);

    expect(capturedStreamOptions!.messages.map((message) => message.content)).toEqual(
      messageHistory.map((message) => message.content),
    );
  });

  test("asks whether a new poll should use recommended events or custom options", async () => {
    const ctx = makeCtx([
      {
        role: "user",
        content: "@ai let's create a poll",
      },
    ]);

    const response = await postChatRoute(ctx, {
      chatId: "chat-1",
      model: "openai/gpt-4.1-mini",
      openRouterApiKey: "test-openrouter-key",
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(POLL_TYPE_SELECTION_PROMPT);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("asks for the three custom options after the user chooses a custom poll", async () => {
    const ctx = makeCtx([
      {
        role: "assistant",
        content: POLL_TYPE_SELECTION_PROMPT,
      },
      {
        role: "user",
        content: "@ai custom",
      },
    ]);

    const response = await postChatRoute(ctx, {
      chatId: "chat-1",
      model: "openai/gpt-4.1-mini",
      openRouterApiKey: "test-openrouter-key",
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(CUSTOM_POLL_OPTIONS_PROMPT);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("closes the current open poll directly for close-poll chat commands", async () => {
    const ctx = makeCtx([
      {
        role: "user",
        content: "@ai close all existing polls",
      },
    ]);

    const response = await postChatRoute(ctx, {
      chatId: "chat-1",
      model: "openai/gpt-4.1-mini",
      openRouterApiKey: "test-openrouter-key",
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "Closed the current open poll.",
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.event_polls_mutations.closeOpenPollInternal,
      {
        chatId: "chat-1",
        userId: "user-1",
      },
    );
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("enables unfiltered searchEvents tool only when user explicitly asks to ignore availability", async () => {
    const ctx = makeCtx([
      {
        role: "user",
        content: "Show unfiltered events regardless of availability constraints.",
      },
    ]);
    await bootChatRoute(ctx);

    const tools = capturedStreamOptions!.tools;
    expect(Object.keys(tools)).toContain("searchEvents");
    expect(tools.searchEvents.description).toContain("current user's saved city");
    expect(capturedStreamOptions!.system).toContain("unfiltered; only use when user explicitly asks");
  });

  test("persists only completed tool results and keeps the latest one", async () => {
    streamTextMock.mockImplementation((options) => {
      if (
        typeof options === "object" &&
        options !== null &&
        "tools" in options
      ) {
        capturedStreamOptions = options as CapturedStreamOptions;
      }
      return {
        fullStream: makeFullStream([
          {
            type: "tool-call",
            toolCallId: "tool-1",
            toolName: "findGroupAvailableEvents",
            input: { city: "Baltimore" },
          },
          {
            type: "tool-result",
            toolCallId: "tool-1",
            toolName: "findGroupAvailableEvents",
            output: {
              constraintStatus: "ok",
              events: [{ eventId: "evt-1", title: "First Event" }],
            },
          },
          {
            type: "tool-call",
            toolCallId: "tool-2",
            toolName: "createCalendarEvent",
            input: { title: "Dinner" },
          },
          {
            type: "tool-result",
            toolCallId: "tool-2",
            toolName: "createCalendarEvent",
            output: {
              filename: "dinner.ics",
              ics: "BEGIN:VCALENDAR",
            },
          },
        ]),
        textStream: makeEmptyStream<string>(),
      };
    });

    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const latestToolCallPatches = ctx.runMutation.mock.calls.filter(
      ([, args]: [unknown, Record<string, unknown>]) => "latestToolCall" in args,
    );

    expect(latestToolCallPatches).toHaveLength(2);
    expect(latestToolCallPatches[0][1]).toEqual({
      messageId: "msg-1",
      latestToolCall: {
        toolCallId: "tool-1",
        toolName: "findGroupAvailableEvents",
        state: "output-available",
        args: { city: "Baltimore" },
        result: {
          constraintStatus: "ok",
          events: [{ eventId: "evt-1", title: "First Event" }],
        },
      },
    });
    expect(latestToolCallPatches[1][1]).toEqual({
      messageId: "msg-1",
      latestToolCall: {
        toolCallId: "tool-2",
        toolName: "createCalendarEvent",
        state: "output-available",
        args: { title: "Dinner" },
        result: {
          filename: "dinner.ics",
          ics: "BEGIN:VCALENDAR",
        },
      },
    });
    expect(
      ctx.runMutation.mock.calls.some(
        ([, args]: [unknown, Record<string, unknown>]) =>
          args.messageId === "msg-1" && args.content === "",
      ),
    ).toBe(true);
  });

  test("persists createEventPoll results for shared chat rehydration", async () => {
    streamTextMock.mockImplementation((options) => {
      if (
        typeof options === "object" &&
        options !== null &&
        "tools" in options
      ) {
        capturedStreamOptions = options as CapturedStreamOptions;
      }
      return {
        fullStream: makeFullStream([
          {
            type: "tool-call",
            toolCallId: "tool-poll-1",
            toolName: "createEventPoll",
            input: {
              source: "manual",
              prompt: "Which event should we attend this weekend?",
              options: [
                { title: "Ravens Game" },
                { title: "Concert" },
                { title: "JHU Game" },
              ],
            },
          },
          {
            type: "tool-result",
            toolCallId: "tool-poll-1",
            toolName: "createEventPoll",
            output: {
              pollId: "poll-1",
              prompt: "Which event should we attend this weekend?",
              summary_message: "Which event should we attend this weekend?",
              events: [
                {
                  eventId: "poll-option-1",
                  title: "Ravens Game",
                  description: "Attend a Baltimore Ravens football game.",
                  source: "manual",
                },
              ],
            },
          },
          {
            type: "text-delta",
            text: "Here's the poll.",
          },
        ]),
        textStream: makeEmptyStream<string>(),
      };
    });

    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const latestToolCallPatch = ctx.runMutation.mock.calls.find(
      ([, args]: [unknown, Record<string, unknown>]) =>
        args.messageId === "msg-1" && "latestToolCall" in args,
    );

    expect(latestToolCallPatch?.[1]).toEqual({
      messageId: "msg-1",
      latestToolCall: {
        toolCallId: "tool-poll-1",
        toolName: "createEventPoll",
        state: "output-available",
        args: {
          source: "manual",
          prompt: "Which event should we attend this weekend?",
          options: [
            { title: "Ravens Game" },
            { title: "Concert" },
            { title: "JHU Game" },
          ],
        },
        result: {
          pollId: "poll-1",
          prompt: "Which event should we attend this weekend?",
          summary_message: "Which event should we attend this weekend?",
          events: [
            {
              eventId: "poll-option-1",
              title: "Ravens Game",
              description: "Attend a Baltimore Ravens football game.",
              source: "manual",
            },
          ],
        },
      },
    });
    expect(
      ctx.runMutation.mock.calls.some(
        ([, args]: [unknown, Record<string, unknown>]) =>
          args.messageId === "msg-1" && args.content === "Here's the poll.",
      ),
    ).toBe(true);
  });

  test("createEventPoll creates a manual poll and returns chat card payload", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const result = await capturedStreamOptions!.tools.createEventPoll.execute({
      source: "manual",
      prompt: "Which type of event would you like to attend?",
      options: [
        {
          title: "Concert",
          description: "Let's see a live music show.",
        },
        {
          title: "Sports",
          description: "Catch a game or match.",
        },
        {
          title: "Dinner",
          description: "Group dinner or food festival.",
        },
      ],
    }) as {
      pollId: string;
      source: string;
      summary_message: string;
      events: Array<Record<string, unknown>>;
    };

    const pollCall = ctx.runMutation.mock.calls.find(
      ([, args]) =>
        args.chatId === "chat-1" &&
        args.userId === "user-1" &&
        args.source === "manual" &&
        args.prompt === "Which type of event would you like to attend?",
    );

    expect(pollCall).toBeDefined();
    expect((pollCall?.[1] as { options: Array<Record<string, unknown>> }).options)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Concert",
            description: "Let's see a live music show.",
            source: "manual",
            url: "",
          }),
        ]),
      );
    expect(result.pollId).toBe("poll-1");
    expect(result.summary_message).toBe(
      "Which type of event would you like to attend?",
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Concert",
          description: "Let's see a live music show.",
          source: "manual",
          url: null,
        }),
      ]),
    );
  });

  test("createEventPoll preserves recommendation source for recommendation-based polls", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const result = await capturedStreamOptions!.tools.createEventPoll.execute({
      source: "recommendation",
      prompt: "Which type of event would you like to attend?",
      options: [
        {
          eventId: "evt-1",
          title: "Concert",
          description: "Let's see a live music show.",
          source: "ticketmaster",
          url: "https://example.com/concert",
        },
        {
          eventId: "evt-2",
          title: "Sports",
          description: "Catch a game or match.",
          source: "ticketmaster",
          url: "https://example.com/sports",
        },
        {
          eventId: "evt-3",
          title: "Dinner",
          description: "Group dinner or food festival.",
          source: "yelp",
          url: "https://example.com/dinner",
        },
      ],
    }) as {
      pollId: string;
      source: string;
      events: Array<Record<string, unknown>>;
    };

    const pollCall = ctx.runMutation.mock.calls.find(
      ([, args]) =>
        args.chatId === "chat-1" &&
        args.userId === "user-1" &&
        args.source === "recommendation" &&
        args.prompt === "Which type of event would you like to attend?",
    );
    expect(result.pollId).toBe("poll-2");
    expect(pollCall).toBeDefined();
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt-1",
          title: "Concert",
          source: "ticketmaster",
          url: "https://example.com/concert",
        }),
      ]),
    );
  });

  test("createEventPoll strips Convex stack details from open-poll errors", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);
    ctx.runMutation.mockImplementation(async (fn: unknown, args: Record<string, unknown>) => {
      if ("limitPerWindow" in args && "windowMs" in args) return { ok: true };
      if (fn === internal.messages_internals.createStreamingMessage) return "msg-1";
      if (
        args.chatId === "chat-1" &&
        args.userId === "user-1" &&
        args.prompt === "Which type of event would you like to attend?"
      ) {
        throw new Error(
          "Uncaught Error: This group already has an open poll at createPollRecord (../convex/event_polls_mutations.ts:59:18)",
        );
      }
      return null;
    });

    const result = await capturedStreamOptions!.tools.createEventPoll.execute({
      source: "manual",
      prompt: "Which type of event would you like to attend?",
      options: [
        {
          title: "Concert",
          description: "Let's see a live music show.",
        },
        {
          title: "Sports",
          description: "Catch a game or match.",
        },
        {
          title: "Dinner",
          description: "Group dinner or food festival.",
        },
      ],
    }) as {
      error: string;
    };

    expect(result).toEqual({
      error:
        "This group already has an open poll. Vote on or close it before creating another one.",
    });
  });

  test("closeCurrentPoll closes the current open poll", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);

    const result = await capturedStreamOptions!.tools.closeCurrentPoll.execute({}) as {
      pollId: string;
      status: string;
      message: string;
    };

    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.event_polls_mutations.closeOpenPollInternal,
      {
        chatId: "chat-1",
        userId: "user-1",
      },
    );
    expect(result).toEqual({
      pollId: "poll-1",
      status: "closed",
      message: "Closed the current open poll.",
    });
  });

  test("closeCurrentPoll strips Convex stack details from close errors", async () => {
    const ctx = makeCtx();
    await bootChatRoute(ctx);
    ctx.runMutation.mockImplementation(async (fn: unknown, args: Record<string, unknown>) => {
      if ("limitPerWindow" in args && "windowMs" in args) return { ok: true };
      if (fn === internal.messages_internals.createStreamingMessage) return "msg-1";
      if (
        args.chatId === "chat-1" &&
        args.userId === "user-1" &&
        !("model" in args) &&
        !("content" in args) &&
        !("prompt" in args) &&
        !("latestToolCall" in args)
      ) {
        throw new Error(
          "Uncaught Error: There is no open poll to close at closeOpenPollInternal (../convex/event_polls_mutations.ts:201:12)",
        );
      }
      return null;
    });

    const result = await capturedStreamOptions!.tools.closeCurrentPoll.execute({}) as {
      error: string;
    };

    expect(result).toEqual({
      error: "There is no open poll to close",
    });
  });

  test("getSharedAvailability returns canonical local labels from tool output", async () => {
    const ctx = makeCtx();
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if ("chatId" in args && "userId" in args && !("size" in args)) {
        return {
          memberCount: 2,
          dateRange: {
            start: "2026-03-07T00:00:00Z",
            end: "2026-03-14T00:00:00Z",
          },
          durationMinutes: 120,
          sharedWindows: [
            {
              start: "2026-03-12T22:00:00Z",
              end: "2026-03-13T02:30:00Z",
            },
          ],
        };
      }
      throw new Error("Unexpected runAction call");
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.getSharedAvailability.execute({
      date: "2026-03-12",
      timeZone: "America/New_York",
    }) as {
      matchingSharedWindowsCount: number;
      matchingSharedWindows: Array<{ localWeekday: string; localDateLabel: string }>;
      dateContext: { todayLocalDate: string };
    };

    expect(ctx.runAction).toHaveBeenCalledWith(
      internal.availability_action.getSharedAvailabilityForChatInternal,
      expect.objectContaining({
        chatId: "chat-1",
        userId: "user-1",
      }),
    );
    expect(result.matchingSharedWindowsCount).toBe(1);
    expect(result.matchingSharedWindows[0].localWeekday).toBe("Thursday");
    expect(result.matchingSharedWindows[0].localDateLabel).toContain("Mar");
    expect(result.dateContext.todayLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("findGroupAvailableEvents retries without city filter when city is inferred from keyword", async () => {
    const ctx = makeCtx();
    const firstResult = {
      memberCount: 2,
      dateRange: {
        start: "2026-03-07T00:00:00Z",
        end: "2026-03-14T00:00:00Z",
      },
      durationMinutes: 120,
      sharedWindows: [],
      totalEvents: 0,
      allEvents: [],
      filteredEvents: [],
    };
    const secondResult = {
      memberCount: 2,
      dateRange: {
        start: "2026-03-07T00:00:00Z",
        end: "2026-03-14T00:00:00Z",
      },
      durationMinutes: 120,
      sharedWindows: [
        { start: "2026-03-07T21:00:00Z", end: "2026-03-08T03:00:00Z" },
      ],
      totalEvents: 1,
      allEvents: [
        {
          eventId: "evt-1",
          title: "D.C. United vs Inter Miami CF",
          description: null,
          startTime: "2026-03-07T21:30:00Z",
          venueName: "M&T Bank Stadium",
          venueCity: "Baltimore",
          venueCountry: "United States Of America",
          source: "ticketmaster",
          url: "https://example.com/event/1",
          image: null,
          status: "onsale",
        },
      ],
      filteredEvents: [
        {
          eventId: "evt-1",
          title: "D.C. United vs Inter Miami CF",
          description: null,
          startTime: "2026-03-07T21:30:00Z",
          venueName: "M&T Bank Stadium",
          venueCity: "Baltimore",
          venueCountry: "United States Of America",
          source: "ticketmaster",
          url: "https://example.com/event/1",
          image: null,
          status: "onsale",
        },
      ],
    };

    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      if (ctx.runAction.mock.calls.length === 1) return firstResult;
      return secondResult;
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      city: "Miami",
      keyword: "Inter Miami",
      daysAhead: 7,
      maxEvents: 10,
      timeZone: "America/New_York",
    }) as {
      events: Array<{ title: string; startLocal: string }>;
      warning?: string;
    };

    expect(ctx.runAction).toHaveBeenCalledTimes(2);
    expect(ctx.runAction.mock.calls[0][1].city).toBe("Miami");
    expect(ctx.runAction.mock.calls[1][1].city).toBeUndefined();
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.recommendation_metrics_mutations.recordRecommendationRunInternal,
      expect.objectContaining({
        chatId: "chat-1",
        returnedEventCount: 1,
        fallbackUsed: true,
      }),
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toContain("Inter Miami");
    expect(result.events[0].startLocal).toContain("Sat");
    expect(result.warning).toContain("Retried without city filter");
  });

  test("findGroupAvailableEvents lets availability resolve the saved group location when city is omitted", async () => {
    const ctx = makeCtx();
    ctx.runAction.mockResolvedValue({
      memberCount: 1,
      dateRange: {
        start: "2026-03-06T12:00:00Z",
        end: "2026-03-13T00:00:00Z",
      },
      durationMinutes: 120,
      sharedWindows: [],
      totalEvents: 0,
      allEvents: [],
      availabilityFilteredEvents: [],
      filteredEvents: [],
      rankedEvents: [],
      learnedProfileSummary: [],
      rankingConfidence: null,
    });

    await bootChatRoute(ctx);
    await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      keyword: "jazz",
      daysAhead: 7,
      maxEvents: 10,
      timeZone: "America/New_York",
    });

    expect(ctx.runAction).toHaveBeenCalledTimes(1);
    expect(ctx.runAction.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        chatId: "chat-1",
        userId: "user-1",
        city: undefined,
        keyword: "jazz",
        daysAhead: 7,
        size: 30,
      }),
    );
  });

  test("findGroupAvailableEvents prefers ranked events when available", async () => {
    const ctx = makeCtx();
    streamTextMock.mockImplementation((options) => {
      if (
        typeof options === "object" &&
        options !== null &&
        "tools" in options
      ) {
        capturedStreamOptions = options as CapturedStreamOptions;
        return {
          fullStream: makeEmptyStream(),
          textStream: makeEmptyStream<string>(),
        };
      }

      return {
        fullStream: makeEmptyStream(),
        textStream: makeTextStream([
          "Ranked First leads, with Ranked Second and Filtered Third also fitting the group's tastes.",
        ]),
      };
    });
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        sharedWindows: [
          { start: "2026-03-07T21:00:00Z", end: "2026-03-08T03:00:00Z" },
        ],
        totalEvents: 2,
        allEvents: [],
        filteredEvents: [
          {
            eventId: "evt-1",
            title: "Filtered First",
            description: null,
            startTime: "2026-03-07T21:30:00Z",
            venueName: "Venue A",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/1",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "low",
          },
          {
            eventId: "evt-2",
            title: "Filtered Second",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Venue B",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/2",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "low",
          },
          {
            eventId: "evt-3",
            title: "Filtered Third",
            description: null,
            startTime: "2026-03-07T22:30:00Z",
            venueName: "Venue C",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/3",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "low",
          },
        ],
        rankedEvents: [
          {
            eventId: "evt-2",
            title: "Ranked First",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Venue B",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/2",
            image: null,
            status: "onsale",
            fitReasons: ["Matches the group's positive history with concert events."],
            budgetBucket: "low",
          },
          {
            eventId: "evt-1",
            title: "Ranked Second",
            description: null,
            startTime: "2026-03-07T21:30:00Z",
            venueName: "Venue A",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/1",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "low",
          },
          {
            eventId: "evt-3",
            title: "Filtered Third",
            description: null,
            startTime: "2026-03-07T22:30:00Z",
            venueName: "Venue C",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/3",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "low",
          },
        ],
        learnedProfileSummary: [
          "The group has responded most positively to concert events.",
          "The group shows a learned lower-budget preference.",
        ],
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      timeZone: "America/New_York",
      maxEvents: 10,
    }) as {
      events: Array<{ eventId: string; title: string; fitReasons: string[] }>;
      learnedProfileSummary: string[];
      summary_message: string | null;
    };

    expect(result.events.map((event) => event.eventId)).toEqual([
      "evt-2",
      "evt-1",
      "evt-3",
    ]);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internal.recommendation_metrics_mutations.recordRecommendationRunInternal,
      expect.objectContaining({
        chatId: "chat-1",
        returnedEventCount: 3,
        fallbackUsed: false,
        fallbackReason: null,
      }),
    );
    expect(result.events.map((event) => event.title)).toEqual([
      "Ranked First",
      "Ranked Second",
      "Filtered Third",
    ]);
    expect(result.learnedProfileSummary).toEqual([
      "The group has responded most positively to concert events.",
      "The group shows a learned lower-budget preference.",
    ]);
    expect(result.events[0].fitReasons).toEqual([
      "Matches the group's positive history with concert events.",
    ]);
    expect(result.summary_message).toContain("Ranked First");
    expect(result.summary_message).toContain("learned lower-budget preference");
    expect(result.summary_message).toContain("120-minute shared availability windows");
    expect(result.summary_message!.trim().split(/\s+/).length).toBeLessThanOrEqual(75);
  });

  test("findGroupAvailableEvents forces food results for dinner and restaurant prompts", async () => {
    const ctx = makeCtx([
      {
        role: "user",
        content: "@ai suggest dinner spots",
      },
    ]);
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        sharedWindows: [
          { start: "2026-03-07T21:00:00Z", end: "2026-03-08T03:00:00Z" },
        ],
        totalEvents: 3,
        allEvents: [],
        filteredEvents: [],
        rankedFoodEvents: [
          {
            eventId: "gp-dinner",
            title: "Midpoint Bistro",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Midpoint Bistro",
            venueCity: "Brooklyn",
            venueCountry: "US",
            source: "google_places",
            url: "https://example.com/midpoint-bistro",
            image: null,
            status: null,
            tags: ["Italian"],
            venueType: "food",
            fitReasons: [],
            budgetBucket: "medium",
          },
        ],
        rankedActivityEvents: [
          {
            eventId: "yelp-event",
            title: "Yelp Dinner-Themed Event",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Yelp Venue",
            venueCity: "Brooklyn",
            venueCountry: "US",
            source: "yelp",
            url: "https://example.com/yelp-event",
            image: null,
            status: "onsale",
            tags: [],
            venueType: "activity",
            fitReasons: [],
            budgetBucket: "medium",
          },
        ],
        rankedEvents: [
          {
            eventId: "tm-event",
            title: "Ticketmaster Dinner Show",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Ticketmaster Venue",
            venueCity: "Brooklyn",
            venueCountry: "US",
            source: "ticketmaster",
            url: "https://example.com/tm-event",
            image: null,
            status: "onsale",
            tags: [],
            venueType: "activity",
            fitReasons: [],
            budgetBucket: "medium",
          },
        ],
        learnedProfileSummary: [],
        rankingConfidence: null,
        allergenWarnings: "",
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      maxEvents: 10,
      timeZone: "America/New_York",
    }) as {
      events: Array<{ eventId: string; source: string; venueType: string }>;
    };

    expect(ctx.runAction.mock.calls[0][1]).toEqual(
      expect.objectContaining({ venueTypeFilter: "food" }),
    );
    expect(result.events).toEqual([
      expect.objectContaining({
        eventId: "gp-dinner",
        source: "google_places",
        venueType: "food",
      }),
    ]);
  });

  test("findGroupAvailableEvents mentions the active midpoint in its summary", async () => {
    const ctx = makeCtx([], {
      chatMeta: {
        useDistanceRanking: true,
        midpointLatitude: 40.6782,
        midpointLongitude: -73.9442,
        midpointLabel: "Brooklyn",
      },
    });
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        sharedWindows: [
          { start: "2026-03-07T21:00:00Z", end: "2026-03-08T03:00:00Z" },
        ],
        totalEvents: 1,
        allEvents: [],
        filteredEvents: [],
        rankedEvents: [
          {
            eventId: "evt-brooklyn",
            title: "Brooklyn Dinner",
            description: null,
            startTime: "2026-03-07T22:00:00Z",
            venueName: "Brooklyn Venue",
            venueCity: "Brooklyn",
            venueCountry: "US",
            source: "ticketmaster",
            url: "https://example.com/brooklyn",
            image: null,
            status: "onsale",
            fitReasons: [],
            budgetBucket: "medium",
          },
        ],
        learnedProfileSummary: [],
        rankingConfidence: null,
        allergenWarnings: "",
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      timeZone: "America/New_York",
      maxEvents: 3,
    }) as {
      summary_message: string | null;
    };

    expect(result.summary_message).toContain("Using group midpoint: Brooklyn.");
  });

  test("findGroupAvailableEvents marks no_shared_availability when date has no shared windows", async () => {
    const ctx = makeCtx();
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        sharedWindows: [
          { start: "2026-03-09T13:00:00Z", end: "2026-03-09T15:30:00Z" },
        ],
        totalEvents: 2,
        allEvents: [],
        filteredEvents: [
          {
            eventId: "evt-2",
            title: "Monday Event",
            description: null,
            startTime: "2026-03-09T13:30:00Z",
            venueName: "Venue A",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/2",
            image: null,
            status: "onsale",
          },
        ],
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      date: "2026-03-08",
      timeZone: "America/New_York",
      maxEvents: 10,
    }) as {
      constraintStatus: string;
      constraintMessage: string;
      matchingSharedWindowsCount: number;
      returnedEventsCount: number;
      summary_message: string | null;
    };

    expect(result.constraintStatus).toBe("no_shared_availability");
    expect(result.constraintMessage).toContain("2026-03-08");
    expect(result.matchingSharedWindowsCount).toBe(0);
    expect(result.returnedEventsCount).toBe(0);
    expect(result.summary_message).toBeNull();
  });

  test("findGroupAvailableEvents marks no_events_in_shared_availability when windows exist but events do not fit", async () => {
    const ctx = makeCtx();
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        sharedWindows: [
          { start: "2026-03-08T15:00:00Z", end: "2026-03-08T18:00:00Z" },
        ],
        totalEvents: 3,
        allEvents: [],
        filteredEvents: [],
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      date: "2026-03-08",
      timeZone: "America/New_York",
      maxEvents: 10,
    }) as {
      constraintStatus: string;
      constraintMessage: string;
      matchingSharedWindowsCount: number;
      returnedEventsCount: number;
      summary_message: string | null;
    };

    expect(result.constraintStatus).toBe("no_events_in_shared_availability");
    expect(result.constraintMessage).toContain("no events were found");
    expect(result.matchingSharedWindowsCount).toBe(1);
    expect(result.returnedEventsCount).toBe(0);
    expect(result.summary_message).toBeNull();
  });

  test("findGroupAvailableEvents treats cross-midnight windows as matching the requested date", async () => {
    const ctx = makeCtx();
    ctx.runAction.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if (!("size" in args)) throw new Error("Unexpected runAction call");
      return {
        memberCount: 2,
        dateRange: {
          start: "2026-03-07T00:00:00Z",
          end: "2026-03-14T00:00:00Z",
        },
        durationMinutes: 120,
        // 11:00 PM (Mar 7 ET) -> 3:00 AM (Mar 8 ET), overlaps Mar 8 locally.
        sharedWindows: [
          { start: "2026-03-08T04:00:00Z", end: "2026-03-08T07:00:00Z" },
        ],
        totalEvents: 1,
        allEvents: [],
        filteredEvents: [
          {
            eventId: "evt-3",
            title: "Late Night Show",
            description: null,
            startTime: "2026-03-08T05:30:00Z",
            venueName: "Venue B",
            venueCity: "Baltimore",
            venueCountry: "United States Of America",
            source: "ticketmaster",
            url: "https://example.com/event/3",
            image: null,
            status: "onsale",
          },
        ],
      };
    });

    await bootChatRoute(ctx);
    const result = await capturedStreamOptions!.tools.findGroupAvailableEvents.execute({
      date: "2026-03-08",
      timeZone: "America/New_York",
      maxEvents: 10,
    }) as {
      constraintStatus: string;
      matchingSharedWindowsCount: number;
      returnedEventsCount: number;
      events: Array<{ title: string }>;
    };

    expect(result.matchingSharedWindowsCount).toBe(1);
    expect(result.returnedEventsCount).toBe(1);
    expect(result.constraintStatus).toBe("ok");
    expect(result.events[0].title).toContain("Late Night Show");
  });
});

describe("http_chat rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 429 when per-user AI rate limit is exceeded", async () => {
    const mod = await import("./http_chat");
    const app = mod.default;

    const mockCtx = {
      runQuery: vi.fn().mockResolvedValue({ ok: true, title: "Test Chat" }),
      runMutation: vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 30_000 }),
    };

    const response = await app.request(
      "http://localhost/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: "chat-1", model: "openai/gpt-4.1-mini" }),
      },
      { ctx: mockCtx, userId: "user-1" } as never,
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain("Rate limit exceeded");
    expect(body.error).toContain("30s");
  });

  test("makeEventTools returns error object when Ticketmaster rate limit is exceeded", async () => {
    const mod = await import("./http_chat");
    const tools = mod.makeEventTools({
      runMutation: vi.fn().mockResolvedValue({ ok: false, retryAfterMs: 20_000 }),
      runQuery: vi.fn(),
    } as never, "user-1" as never);

    const result = await tools.searchEvents.execute!(
      { city: "Baltimore" },
      { toolCallId: "tc-1", messages: [] } as never,
    );
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("search limit");
    expect((result as { error: string }).error).toContain("20s");
  });

  test("makeEventTools uses the saved user city when city is omitted", async () => {
    const originalApiKey = process.env.TICKETMASTER_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.TICKETMASTER_API_KEY = "test-key";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(new URL(url).searchParams.get("city")).toBe("Chicago, IL");
      return new Response(JSON.stringify({ _embedded: { events: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    try {
      const mod = await import("./http_chat");
      const tools = mod.makeEventTools({
        runMutation: vi.fn().mockResolvedValue({ ok: true }),
        runQuery: vi.fn().mockResolvedValue("Chicago, IL"),
      } as never, "user-1" as never);

      await tools.searchEvents.execute!(
        {},
        { toolCallId: "tc-1", messages: [] } as never,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (originalApiKey === undefined) delete process.env.TICKETMASTER_API_KEY;
      else process.env.TICKETMASTER_API_KEY = originalApiKey;
      globalThis.fetch = originalFetch;
    }
  });

  test("makeEventTools returns an error when no city is provided and no saved user city exists", async () => {
    const mod = await import("./http_chat");
    const tools = mod.makeEventTools({
      runMutation: vi.fn().mockResolvedValue({ ok: true }),
      runQuery: vi.fn().mockResolvedValue(null),
    } as never, "user-1" as never);

    const result = await tools.searchEvents.execute!(
      {},
      { toolCallId: "tc-1", messages: [] } as never,
    );

    expect(result).toEqual({
      error:
        "No default city is saved for your profile. Add a city in your profile or specify one in your request.",
    });
  });
});
