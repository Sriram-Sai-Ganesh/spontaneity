import type { ChatType } from "@/chats/types/chat";
import type { MessageType } from "@/messages/types/message";

export function createTestChat(overrides: Partial<ChatType> = {}): ChatType {
  return {
    _id: crypto.randomUUID(),
    title: "Test Chat",
    _creationTime: Date.now(),
    ...overrides,
  };
}

export function createTestMessage(
  overrides: Partial<MessageType> = {},
): MessageType {
  return {
    _id: crypto.randomUUID(),
    chatId: "chat-1",
    role: "user",
    content: "Hello",
    _creationTime: Date.now(),
    userId: "user-1",
    latestToolCall: null,
    ...overrides,
  };
}
