import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { DEFAULT_MODEL } from "@/config/models";

const mockUseMutation = vi.fn();
const mockUseQuery = vi.fn();
vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("@legendapp/state/react", () => ({
  useSelector: (fn: () => unknown) => fn(),
}));

vi.mock("@/hooks/use-auth-token", () => ({
  useAuthToken: () => "test-token",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/convex", () => ({
  CONVEX_SITE_URL: "https://test.convex.site",
}));

const mockStreamChatSSE = vi.fn();
vi.mock("@/lib/sse", () => ({
  streamChatSSE: (...args: unknown[]) => mockStreamChatSSE(...args),
}));

vi.mock("@/settings/hooks/use-query-settings", () => ({
  useQuerySettings: () => ({
    data: { displayName: "Tester", openRouterApiKey: "test-openrouter-key" },
    loading: false,
    error: false,
  }),
}));

const mockSetAppearance = vi.fn();
const mockSetTheme = vi.fn();
vi.mock("@/store/appearance", () => ({
  setAppearance: (...args: unknown[]) => mockSetAppearance(...args),
}));
vi.mock("@/store/theme", () => ({
  setTheme: (...args: unknown[]) => mockSetTheme(...args),
}));

const mockAddOptimisticMessage = vi.fn();
const mockRemoveOptimisticMessage = vi.fn();
const mockStartStreaming = vi.fn();
const mockAppendStreamingContent = vi.fn();
const mockSetStreamingMessageId = vi.fn();
const mockSetStreamingToolCalls = vi.fn();
const mockClearStreaming = vi.fn();
const mockGetStreamingState = vi.fn().mockReturnValue({
  isStreaming: false,
  content: "",
  messageId: null,
  toolCalls: [],
});

vi.mock("@/messages/store/messages", async () => {
  const legendState = await import("@legendapp/state");
  return {
    addOptimisticMessage: (...args: unknown[]) =>
      mockAddOptimisticMessage(...args),
    removeOptimisticMessage: (...args: unknown[]) =>
      mockRemoveOptimisticMessage(...args),
    startStreaming: (...args: unknown[]) => mockStartStreaming(...args),
    appendStreamingContent: (...args: unknown[]) =>
      mockAppendStreamingContent(...args),
    setStreamingMessageId: (...args: unknown[]) =>
      mockSetStreamingMessageId(...args),
    setStreamingToolCalls: (...args: unknown[]) =>
      mockSetStreamingToolCalls(...args),
    clearStreaming: (...args: unknown[]) => mockClearStreaming(...args),
    getStreamingState: (...args: unknown[]) => mockGetStreamingState(...args),
    chatMessages$: legendState.observable({}),
  };
});

import { useChat } from "../use-chat";

let mockCreateMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMessage = vi.fn().mockResolvedValue("msg-id");
  mockUseMutation.mockReturnValue(mockCreateMessage);
  mockUseQuery.mockReturnValue({ _id: "user-1" });

  vi.stubEnv("VITE_CONVEX_URL", "https://test.convex.cloud");
});

describe("useChat", () => {
  it("sendMessage adds optimistic message and starts stream", async () => {
    mockStreamChatSSE.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat("chat-1"));

    await act(async () => {
      await result.current.sendMessage("@ai Hello", DEFAULT_MODEL);
    });

    // Optimistic message should be added before mutation
    expect(mockAddOptimisticMessage).toHaveBeenCalledWith(
      "chat-1",
      expect.any(String),
      expect.objectContaining({
        chatId: "chat-1",
        role: "user",
        content: "@ai Hello",
        clientId: expect.any(String),
      }),
    );

    // Mutation should include clientId
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        role: "user",
        content: "@ai Hello",
        clientId: expect.any(String),
      }),
    );

    expect(mockStreamChatSSE).toHaveBeenCalled();
  });

  it("startStreaming is called when sending a message", async () => {
    mockStreamChatSSE.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat("chat-1"));

    await act(async () => {
      await result.current.sendMessage("@ai Hello", DEFAULT_MODEL);
    });

    expect(mockStartStreaming).toHaveBeenCalledWith("chat-1");
  });

  it("starts stream without @ai when the assistant chat option is enabled", async () => {
    mockStreamChatSSE.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useChat("chat-1", { alwaysUseAi: true }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello", DEFAULT_MODEL);
    });

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        role: "user",
        content: "Hello",
      }),
    );
    expect(mockStartStreaming).toHaveBeenCalledWith("chat-1");
    expect(mockStreamChatSSE).toHaveBeenCalled();
  });

  it("onMessageCreated callback is passed to streamChatSSE", async () => {
    mockStreamChatSSE.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat("chat-1"));

    await act(async () => {
      await result.current.sendMessage("@ai Hello", DEFAULT_MODEL);
    });

    const sseArgs = mockStreamChatSSE.mock.calls[0][0];
    expect(sseArgs.onMessageCreated).toBeDefined();

    // Simulate the callback
    act(() => {
      sseArgs.onMessageCreated({ messageId: "msg-123" });
    });

    expect(mockSetStreamingMessageId).toHaveBeenCalledWith("chat-1", "msg-123");
  });

  it("applies saved appearance preference tool results locally", async () => {
    mockStreamChatSSE.mockResolvedValue(undefined);
    const themes = {
      light: {
        colors: {
          primary: "#f8fafc",
          secondary: "#e2e8f0",
          accent: "#2563eb",
        },
        typography: {
          fontPreset: "manrope",
          fontSize: "large",
        },
      },
      dark: {
        colors: {
          primary: "#020617",
          secondary: "#111827",
          accent: "#60a5fa",
        },
        typography: {
          fontPreset: "manrope",
          fontSize: "large",
        },
      },
    };

    const { result } = renderHook(() =>
      useChat("chat-1", { alwaysUseAi: true }),
    );

    await act(async () => {
      await result.current.sendMessage(
        "Make my theme dark and larger.",
        DEFAULT_MODEL,
      );
    });

    const sseArgs = mockStreamChatSSE.mock.calls[0][0];
    act(() => {
      sseArgs.onToolResult({
        toolCallId: "tool-appearance-1",
        toolName: "setUserAppearancePreferences",
        result: {
          saved: true,
          mode: "dark",
          themes,
        },
      });
    });

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(mockSetAppearance).toHaveBeenCalledWith(themes);
    expect(mockSetStreamingToolCalls).toHaveBeenCalledWith("chat-1", [
      expect.objectContaining({
        toolCallId: "tool-appearance-1",
        toolName: "setUserAppearancePreferences",
        state: "output-available",
        result: expect.objectContaining({ saved: true }),
      }),
    ]);
  });

  it("abort calls clearStreaming", async () => {
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    mockStreamChatSSE.mockImplementation(async () => {
      await streamPromise;
    });

    const { result } = renderHook(() => useChat("chat-1"));

    act(() => {
      void result.current.sendMessage("@ai Hello", DEFAULT_MODEL);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.abort();
    });

    expect(mockClearStreaming).toHaveBeenCalledWith("chat-1");

    await act(async () => {
      resolveStream!();
    });
  });

  it("removes optimistic message on mutation failure", async () => {
    mockCreateMessage.mockRejectedValue(new Error("Mutation failed"));
    mockStreamChatSSE.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat("chat-1"));

    await act(async () => {
      await result.current.sendMessage("Hello", DEFAULT_MODEL);
    });

    // Wait for the rejected promise to propagate
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockRemoveOptimisticMessage).toHaveBeenCalledWith(
      "chat-1",
      expect.any(String),
    );
  });
});
