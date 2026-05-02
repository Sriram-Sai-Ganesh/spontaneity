import { useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSelector } from "@legendapp/state/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthToken } from "@/hooks/use-auth-token";
import { streamChatSSE } from "@/lib/sse";
import { CONVEX_SITE_URL } from "@/lib/convex";
import type { ToolCallPart } from "@/messages/types/tool-call";
import { useQuerySettings } from "@/settings/hooks/use-query-settings";
import { setAppearance } from "@/store/appearance";
import { setTheme } from "@/store/theme";
import { userAppearancePreferencesSchema } from "@/types/theme";
import {
  startStreaming,
  appendStreamingContent,
  setStreamingMessageId,
  setStreamingToolCalls,
  clearStreaming,
  addOptimisticMessage,
  removeOptimisticMessage,
  chatMessages$,
  getStreamingState,
} from "@/messages/store/messages";

function friendlyErrorMessage(err: Error): string {
  const msg = err.message.toLowerCase();
  if (
    msg.includes("api key") ||
    msg.includes("api_key") ||
    msg.includes("unauthorized") ||
    msg.includes("401")
  ) {
    return "Authentication error. Please refresh the page.";
  }
  if (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("429")
  ) {
    return "You've hit the API rate limit. Please wait a moment and try again.";
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("econnrefused")
  ) {
    return "Network error. Check your internet connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

function applyAppearanceToolResult(toolName: string, result: unknown) {
  if (
    toolName !== "setUserAppearancePreferences" ||
    typeof result !== "object" ||
    result === null
  ) {
    return;
  }

  const payload = result as Record<string, unknown>;
  if (payload.saved !== true) {
    return;
  }

  const parsed = userAppearancePreferencesSchema.safeParse({
    mode: payload.mode,
    themes: payload.themes,
  });
  if (!parsed.success) {
    return;
  }

  setTheme(parsed.data.mode);
  setAppearance(parsed.data.themes);
}

/**
 * Wait for a persisted message with the given ID to appear with isComplete !== false.
 * Uses `!== false` (not `=== true`) for backward compatibility with messages that
 * predate the isComplete field — those have `undefined`, which should count as complete.
 * Polls at 50ms intervals with a 5s timeout.
 */
function waitForPersistedMessage(
  chatId: string,
  messageId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const TIMEOUT = 5000;
    const INTERVAL = 50;

    const check = () => {
      const persisted = chatMessages$[chatId]?.persisted?.peek() ?? [];
      const found = persisted.find(
        (m) => m._id === messageId && m.isComplete !== false,
      );
      if (found) {
        resolve(true);
        return;
      }
      if (Date.now() - startTime >= TIMEOUT) {
        resolve(false);
        return;
      }
      setTimeout(check, INTERVAL);
    };
    check();
  });
}

export function useChat(
  chatId: string,
  options: { alwaysUseAi?: boolean } = {},
) {
  const alwaysUseAi = options.alwaysUseAi ?? false;
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const toolCallsRef = useRef<Map<string, ToolCallPart>>(new Map());
  const token = useAuthToken();
  const createMessage = useMutation(api.messages_mutations.create);
  const viewer = useQuery(api.users_queries.me);
  const { data: settings } = useQuerySettings();

  // Read streaming state from Legend-State
  const isStreaming = useSelector(
    () => chatMessages$[chatId]?.streaming?.isStreaming?.get() ?? false,
  );
  const streamingContent = useSelector(
    () => chatMessages$[chatId]?.streaming?.content?.get() ?? "",
  );
  const toolCalls = useSelector(
    () => chatMessages$[chatId]?.streaming?.toolCalls?.get() ?? [],
  );

  useEffect(() => {
    return () => {
      // Invalidate any pending callbacks for the current request and cancel it.
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, model: string): Promise<boolean> => {
      if (!token) {
        toast.error("Not authenticated", {
          description: "Please refresh the page to sign in.",
        });
        return false;
      }

      // If a previous request is still streaming, stop it before starting a new one.
      if (abortControllerRef.current) {
        requestIdRef.current += 1;
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        clearStreaming(chatId);
      }

      // Local-first: add optimistic user message immediately
      const clientId = crypto.randomUUID();
      const viewerId = viewer?._id ?? "local-user";
      addOptimisticMessage(chatId, clientId, {
        _id: `optimistic-${clientId}`,
        chatId,
        role: "user",
        content,
        clientId,
        _creationTime: Date.now(),
        userId: viewerId,
        latestToolCall: null,
      });

      // Persist user message via Convex mutation — must complete before starting
      // the SSE stream so the server reads the latest message from the DB.
      try {
        await createMessage({
          chatId: chatId as Id<"chats">,
          role: "user",
          content,
          clientId,
        });
      } catch (err: unknown) {
        removeOptimisticMessage(chatId, clientId);
        toast.error("Failed to save message", {
          description: (err as Error).message,
        });
        return false;
      }

      const shouldCallAssistant = alwaysUseAi || /(^|\s)@ai\b/i.test(content);
      if (!shouldCallAssistant) {
        // Treat as a regular group chat message with no assistant call.
        clearStreaming(chatId);
        toolCallsRef.current = new Map();
        abortControllerRef.current = null;
        return true;
      }

      const openRouterApiKey = settings?.openRouterApiKey?.trim();
      if (!openRouterApiKey) {
        toast.error(
          alwaysUseAi
            ? "Set an OpenRouter API key in Settings to use Spontaneity AI."
            : "Set an OpenRouter API key in Settings to use @ai.",
        );
        clearStreaming(chatId);
        toolCallsRef.current = new Map();
        abortControllerRef.current = null;
        return false;
      }

      // Set up streaming state
      startStreaming(chatId);
      toolCallsRef.current = new Map();

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      streamChatSSE({
        siteUrl: CONVEX_SITE_URL,
        token,
        chatId,
        model,
        openRouterApiKey,
        signal: abortController.signal,
        onMessageCreated: (data) => {
          if (requestIdRef.current !== requestId) return;
          setStreamingMessageId(chatId, data.messageId);
        },
        onChunk: (accumulated) => {
          if (requestIdRef.current !== requestId) return;
          appendStreamingContent(chatId, accumulated);
        },
        onToolCall: ({ toolCallId, toolName, args }) => {
          if (requestIdRef.current !== requestId) return;
          const part: ToolCallPart = {
            toolCallId,
            toolName,
            state: "input-available",
            args,
          };
          toolCallsRef.current.set(toolCallId, part);
          setStreamingToolCalls(
            chatId,
            Array.from(toolCallsRef.current.values()),
          );
        },
        onToolResult: ({ toolCallId, toolName, result }) => {
          if (requestIdRef.current !== requestId) return;
          applyAppearanceToolResult(toolName, result);
          const existing = toolCallsRef.current.get(toolCallId);
          const part: ToolCallPart = {
            toolCallId,
            toolName,
            state: "output-available",
            args: existing?.args ?? {},
            result,
          };
          toolCallsRef.current.set(toolCallId, part);
          setStreamingToolCalls(
            chatId,
            Array.from(toolCallsRef.current.values()),
          );
        },
        onDone: () => {
          if (requestIdRef.current !== requestId) return;
          abortControllerRef.current = null;
          toolCallsRef.current = new Map();

          // Wait for persisted message before clearing streaming state
          const { messageId } = getStreamingState(chatId);
          if (messageId) {
            void waitForPersistedMessage(chatId, messageId).then(() => {
              if (requestIdRef.current !== requestId) return;
              clearStreaming(chatId);
            });
          } else {
            clearStreaming(chatId);
          }
        },
        onError: (err) => {
          if (requestIdRef.current !== requestId) return;
          abortControllerRef.current = null;
          toolCallsRef.current = new Map();
          clearStreaming(chatId);
          console.error("[useChat] streaming failed:", err);
          const friendly = friendlyErrorMessage(err);
          toast.error(friendly, { duration: 8000 });
        },
      }).catch((err: unknown) => {
        // Safety net: if onError itself throws, ensure streaming state is cleaned up.
        clearStreaming(chatId);
        console.error("[useChat] unexpected streaming error:", err);
      });

      return true;
    },
    [
      alwaysUseAi,
      chatId,
      token,
      createMessage,
      viewer?._id,
      settings?.openRouterApiKey,
    ],
  );

  const abort = useCallback(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    toolCallsRef.current = new Map();
    clearStreaming(chatId);
  }, [chatId]);

  return {
    sendMessage,
    isStreaming,
    streamingContent,
    error: null as Error | null,
    abort,
    toolCalls,
  };
}
