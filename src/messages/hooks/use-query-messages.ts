import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useSelector } from "@legendapp/state/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MessageType } from "@/messages/types/message";
import {
  syncPersistedMessages,
  getMergedMessages,
  disposeChatMessages,
} from "@/messages/store/messages";

export function useQueryMessages(chatId: string, enabled = true) {
  const rawMessages = useQuery(
    api.messages_queries.getByChat,
    enabled
      ? {
          chatId: chatId as Id<"chats">,
        }
      : "skip",
  ) as MessageType[] | undefined;

  // Sync Convex data into Legend-State store
  useEffect(() => {
    if (!enabled) return;
    if (rawMessages !== undefined) {
      syncPersistedMessages(chatId, rawMessages);
    }
  }, [chatId, enabled, rawMessages]);

  // Cleanup on unmount — safe mid-stream because ensureChat in the store
  // prevents crashes if streaming callbacks fire after disposal.
  useEffect(() => {
    return () => {
      disposeChatMessages(chatId);
    };
  }, [chatId]);

  // Subscribe to Legend-State for reactivity (merged = persisted + optimistic).
  // getMergedMessages calls .get() internally, so Legend-State tracks dependencies.
  const merged = useSelector(() => getMergedMessages(chatId));

  return {
    data: merged,
    loading: enabled && rawMessages === undefined,
    error: false,
  };
}
