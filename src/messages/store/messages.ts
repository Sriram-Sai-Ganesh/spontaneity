import { observable } from "@legendapp/state";
import type { MessageType } from "@/messages/types/message";
import type { ToolCallPart } from "@/messages/types/tool-call";

// ── Types ────────────────────────────────────────────────────────

export interface StreamingState {
  isStreaming: boolean;
  content: string;
  messageId: string | null;
  toolCalls: ToolCallPart[];
}

interface ChatMessageState {
  persisted: MessageType[];
  streaming: StreamingState;
  optimistic: Record<string, MessageType>;
}

function createDefaultChatState(): ChatMessageState {
  return {
    persisted: [],
    streaming: {
      isStreaming: false,
      content: "",
      messageId: null,
      toolCalls: [],
    },
    optimistic: {},
  };
}

// ── Observable ───────────────────────────────────────────────────

/** Per-chat message state keyed by chatId. */
const chatMessages$ = observable<Record<string, ChatMessageState>>({});

// ── Internal helpers ─────────────────────────────────────────────

function ensureChat(chatId: string): void {
  if (!chatMessages$[chatId].peek()) {
    chatMessages$[chatId].set(createDefaultChatState());
  }
}

// ── Operations ───────────────────────────────────────────────────

/**
 * Sync persisted messages from Convex into the store.
 * Reconciles: removes optimistic messages whose clientId appears in persisted.
 */
export function syncPersistedMessages(
  chatId: string,
  messages: MessageType[],
): void {
  ensureChat(chatId);

  const persistedClientIds = new Set(
    messages.filter((m) => m.clientId).map((m) => m.clientId!),
  );

  const currentOptimistic = chatMessages$[chatId].optimistic.peek() ?? {};
  const reconciled: Record<string, MessageType> = {};
  for (const [clientId, msg] of Object.entries(currentOptimistic)) {
    if (!persistedClientIds.has(clientId)) {
      reconciled[clientId] = msg;
    }
  }

  chatMessages$[chatId].persisted.set(messages);
  chatMessages$[chatId].optimistic.set(reconciled);
}

/**
 * Add an optimistic (local-first) message keyed by clientId.
 */
export function addOptimisticMessage(
  chatId: string,
  clientId: string,
  message: MessageType,
): void {
  ensureChat(chatId);
  chatMessages$[chatId].optimistic[clientId].set(message);
}

/**
 * Remove an optimistic message (e.g., on mutation failure).
 */
export function removeOptimisticMessage(
  chatId: string,
  clientId: string,
): void {
  ensureChat(chatId);
  chatMessages$[chatId].optimistic[clientId].delete();
}

/**
 * Update a persisted message locally after a successful mutation.
 */
export function updatePersistedMessage(
  chatId: string,
  messageId: string,
  updates: Partial<MessageType>,
): void {
  ensureChat(chatId);
  const persisted = chatMessages$[chatId].persisted.peek() ?? [];
  chatMessages$[chatId].persisted.set(
    persisted.map((message) =>
      message._id === messageId ? { ...message, ...updates } : message,
    ),
  );
}

/**
 * Remove a persisted message locally after a successful delete mutation.
 */
export function removePersistedMessage(chatId: string, messageId: string): void {
  ensureChat(chatId);
  const persisted = chatMessages$[chatId].persisted.peek() ?? [];
  chatMessages$[chatId].persisted.set(
    persisted.filter((message) => message._id !== messageId),
  );
}

/**
 * Start a new streaming session.
 */
export function startStreaming(chatId: string): void {
  ensureChat(chatId);
  chatMessages$[chatId].streaming.set({
    isStreaming: true,
    content: "",
    messageId: null,
    toolCalls: [],
  });
}

/**
 * Append streaming content (replace with accumulated text).
 */
export function appendStreamingContent(
  chatId: string,
  accumulated: string,
): void {
  ensureChat(chatId);
  chatMessages$[chatId].streaming.content.set(accumulated);
}

/**
 * Set the server-assigned message ID for the streaming message.
 */
export function setStreamingMessageId(chatId: string, messageId: string): void {
  ensureChat(chatId);
  chatMessages$[chatId].streaming.messageId.set(messageId);
}

/**
 * Update tool calls during streaming.
 */
export function setStreamingToolCalls(
  chatId: string,
  toolCalls: ToolCallPart[],
): void {
  ensureChat(chatId);
  chatMessages$[chatId].streaming.toolCalls.set(toolCalls);
}

/**
 * Clear streaming state (after handoff to persisted or on abort).
 */
export function clearStreaming(chatId: string): void {
  ensureChat(chatId);
  chatMessages$[chatId].streaming.set({
    isStreaming: false,
    content: "",
    messageId: null,
    toolCalls: [],
  });
}

/**
 * Get merged messages: persisted + remaining optimistic, sorted by creation time.
 */
export function getMergedMessages(chatId: string): MessageType[] {
  ensureChat(chatId);

  const persisted = chatMessages$[chatId].persisted.get() ?? [];
  const optimistic = chatMessages$[chatId].optimistic.get() ?? {};
  const streaming = chatMessages$[chatId].streaming.get();

  // While streaming, hide the in-progress persisted assistant placeholder to
  // avoid showing an empty/partial DB row alongside the streaming overlay.
  const filtered =
    streaming.isStreaming && streaming.messageId
      ? persisted.filter((m) => m._id !== streaming.messageId)
      : persisted;

  // Hide placeholder assistant rows that haven't finished streaming yet.
  const withoutPlaceholders = filtered.filter(
    (m) => !(m.role === "assistant" && m.isComplete === false),
  );

  const optimisticList = Object.values(optimistic);

  if (optimisticList.length === 0) return withoutPlaceholders;

  return [...withoutPlaceholders, ...optimisticList].sort(
    (a, b) => a._creationTime - b._creationTime,
  );
}

/**
 * Get current streaming state for a chat.
 */
export function getStreamingState(chatId: string): StreamingState {
  ensureChat(chatId);
  return chatMessages$[chatId].streaming.peek();
}

/**
 * Clean up all state for a chat (on unmount).
 */
export function disposeChatMessages(chatId: string): void {
  chatMessages$[chatId].delete();
}

/** Expose the observable for useSelector reactivity. */
export { chatMessages$ };

/** Reset all chat/message state (e.g., on logout). */
export function resetAllMessages(): void {
  chatMessages$.set({});
}
