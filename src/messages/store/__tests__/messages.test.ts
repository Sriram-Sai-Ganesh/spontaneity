import { describe, it, expect, beforeEach } from "vitest";
import { createTestMessage } from "@/test/helpers";
import {
  syncPersistedMessages,
  addOptimisticMessage,
  removeOptimisticMessage,
  updatePersistedMessage,
  removePersistedMessage,
  startStreaming,
  appendStreamingContent,
  setStreamingMessageId,
  setStreamingToolCalls,
  clearStreaming,
  getMergedMessages,
  getStreamingState,
  disposeChatMessages,
} from "../messages";

const CHAT_ID = "chat-1";

beforeEach(() => {
  disposeChatMessages(CHAT_ID);
});

describe("messages store", () => {
  describe("reconciliation", () => {
    it("removes optimistic messages when persisted arrives with matching clientId", () => {
      const clientId = crypto.randomUUID();
      const optimisticMsg = createTestMessage({
        _id: "temp-1",
        chatId: CHAT_ID,
        clientId,
        content: "Hello",
        _creationTime: 100,
      });
      addOptimisticMessage(CHAT_ID, clientId, optimisticMsg);

      expect(getMergedMessages(CHAT_ID)).toHaveLength(1);

      // Persisted version arrives with the same clientId
      const persistedMsg = createTestMessage({
        _id: "server-1",
        chatId: CHAT_ID,
        clientId,
        content: "Hello",
        _creationTime: 100,
      });
      syncPersistedMessages(CHAT_ID, [persistedMsg]);

      const merged = getMergedMessages(CHAT_ID);
      expect(merged).toHaveLength(1);
      expect(merged[0]._id).toBe("server-1");
    });

    it("keeps optimistic messages without matching persisted clientId", () => {
      const clientId = crypto.randomUUID();
      const optimisticMsg = createTestMessage({
        _id: "temp-1",
        chatId: CHAT_ID,
        clientId,
        content: "Hello",
        _creationTime: 200,
      });
      addOptimisticMessage(CHAT_ID, clientId, optimisticMsg);

      // Persist a different message (no clientId match)
      const persistedMsg = createTestMessage({
        _id: "server-1",
        chatId: CHAT_ID,
        content: "Earlier",
        _creationTime: 100,
      });
      syncPersistedMessages(CHAT_ID, [persistedMsg]);

      const merged = getMergedMessages(CHAT_ID);
      expect(merged).toHaveLength(2);
      expect(merged[0]._id).toBe("server-1");
      expect(merged[1]._id).toBe("temp-1");
    });
  });

  describe("merged messages", () => {
    it("returns persisted in order when no optimistic", () => {
      const msgs = [
        createTestMessage({ _id: "m1", content: "A", _creationTime: 100 }),
        createTestMessage({ _id: "m2", content: "B", _creationTime: 200 }),
      ];
      syncPersistedMessages(CHAT_ID, msgs);

      const merged = getMergedMessages(CHAT_ID);
      expect(merged).toHaveLength(2);
      expect(merged[0].content).toBe("A");
      expect(merged[1].content).toBe("B");
    });

    it("sorts optimistic + persisted by creation time", () => {
      const clientId = crypto.randomUUID();
      addOptimisticMessage(
        CHAT_ID,
        clientId,
        createTestMessage({
          _id: "temp-1",
          clientId,
          content: "Opt",
          _creationTime: 150,
        }),
      );

      syncPersistedMessages(CHAT_ID, [
        createTestMessage({
          _id: "m1",
          content: "Pers1",
          _creationTime: 100,
        }),
        createTestMessage({
          _id: "m2",
          content: "Pers2",
          _creationTime: 200,
        }),
      ]);

      const merged = getMergedMessages(CHAT_ID);
      expect(merged).toHaveLength(3);
      expect(merged[0]._id).toBe("m1");
      expect(merged[1]._id).toBe("temp-1");
      expect(merged[2]._id).toBe("m2");
    });

    it("returns no duplicates when clientId matches", () => {
      const clientId = crypto.randomUUID();
      addOptimisticMessage(
        CHAT_ID,
        clientId,
        createTestMessage({
          _id: "temp-1",
          clientId,
          content: "Hello",
          _creationTime: 100,
        }),
      );

      syncPersistedMessages(CHAT_ID, [
        createTestMessage({
          _id: "server-1",
          clientId,
          content: "Hello",
          _creationTime: 100,
        }),
      ]);

      expect(getMergedMessages(CHAT_ID)).toHaveLength(1);
    });
  });

  describe("streaming state lifecycle", () => {
    it("starts streaming with correct initial state", () => {
      startStreaming(CHAT_ID);
      const state = getStreamingState(CHAT_ID);

      expect(state.isStreaming).toBe(true);
      expect(state.content).toBe("");
      expect(state.messageId).toBeNull();
      expect(state.toolCalls).toEqual([]);
    });

    it("appends streaming content", () => {
      startStreaming(CHAT_ID);
      appendStreamingContent(CHAT_ID, "Hello");
      expect(getStreamingState(CHAT_ID).content).toBe("Hello");

      appendStreamingContent(CHAT_ID, "Hello world");
      expect(getStreamingState(CHAT_ID).content).toBe("Hello world");
    });

    it("sets message ID", () => {
      startStreaming(CHAT_ID);
      setStreamingMessageId(CHAT_ID, "msg-123");
      expect(getStreamingState(CHAT_ID).messageId).toBe("msg-123");
    });

    it("sets tool calls", () => {
      startStreaming(CHAT_ID);
      const toolCalls = [
        {
          toolCallId: "tc-1",
          toolName: "getWeather",
          state: "input-available" as const,
          args: { city: "NYC" },
        },
      ];
      setStreamingToolCalls(CHAT_ID, toolCalls);
      expect(getStreamingState(CHAT_ID).toolCalls).toEqual(toolCalls);
    });

    it("clears streaming state", () => {
      startStreaming(CHAT_ID);
      appendStreamingContent(CHAT_ID, "Some content");
      setStreamingMessageId(CHAT_ID, "msg-123");
      clearStreaming(CHAT_ID);

      const state = getStreamingState(CHAT_ID);
      expect(state.isStreaming).toBe(false);
      expect(state.content).toBe("");
      expect(state.messageId).toBeNull();
    });
  });

  describe("removeOptimisticMessage", () => {
    it("removes a specific optimistic message", () => {
      const clientId = crypto.randomUUID();
      addOptimisticMessage(
        CHAT_ID,
        clientId,
        createTestMessage({ _id: "temp-1", clientId, content: "Hello" }),
      );

      expect(getMergedMessages(CHAT_ID)).toHaveLength(1);

      removeOptimisticMessage(CHAT_ID, clientId);
      expect(getMergedMessages(CHAT_ID)).toHaveLength(0);
    });
  });

  describe("persisted message updates", () => {
    it("updates a persisted message locally", () => {
      syncPersistedMessages(CHAT_ID, [
        createTestMessage({ _id: "m1", content: "Before" }),
      ]);

      updatePersistedMessage(CHAT_ID, "m1", { content: "After" });

      expect(getMergedMessages(CHAT_ID)[0]?.content).toBe("After");
    });

    it("removes a persisted message locally", () => {
      syncPersistedMessages(CHAT_ID, [
        createTestMessage({ _id: "m1", content: "First" }),
        createTestMessage({ _id: "m2", content: "Second" }),
      ]);

      removePersistedMessage(CHAT_ID, "m1");

      const merged = getMergedMessages(CHAT_ID);
      expect(merged).toHaveLength(1);
      expect(merged[0]?._id).toBe("m2");
    });
  });

  describe("dispose", () => {
    it("cleans up all state for a chat", () => {
      syncPersistedMessages(CHAT_ID, [
        createTestMessage({ _id: "m1", content: "Hello" }),
      ]);
      startStreaming(CHAT_ID);

      disposeChatMessages(CHAT_ID);

      // After dispose, getMergedMessages reinitializes with empty state
      expect(getMergedMessages(CHAT_ID)).toHaveLength(0);
      expect(getStreamingState(CHAT_ID).isStreaming).toBe(false);
    });
  });
});
