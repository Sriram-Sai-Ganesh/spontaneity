import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ChatType } from "@/chats/types/chat";
import { AI_ASSISTANT_CHAT_KIND } from "@/chats/constants";

export function useQueryChats() {
  const chats = useQuery(api.chats_queries.getAll) as ChatType[] | undefined;
  const ensureAiAssistant = useMutation(api.chats_mutations.ensureAiAssistant);
  const ensureInFlightRef = useRef(false);
  const ensureRequestedRef = useRef(false);
  const [ensureFailed, setEnsureFailed] = useState(false);

  const hasAiAssistantChat =
    chats?.some((chat) => chat.kind === AI_ASSISTANT_CHAT_KIND) ?? false;

  useEffect(() => {
    if (chats === undefined || hasAiAssistantChat) {
      return;
    }

    if (
      ensureRequestedRef.current ||
      ensureInFlightRef.current ||
      ensureFailed
    ) {
      return;
    }

    ensureRequestedRef.current = true;
    ensureInFlightRef.current = true;
    void ensureAiAssistant()
      .catch((error) => {
        console.error(
          "[useQueryChats] failed to ensure AI assistant chat",
          error,
        );
        setEnsureFailed(true);
      })
      .finally(() => {
        ensureInFlightRef.current = false;
      });
  }, [chats, ensureAiAssistant, ensureFailed, hasAiAssistantChat]);

  return {
    data: chats ?? [],
    loading: chats === undefined || (!hasAiAssistantChat && !ensureFailed),
    error: false,
  };
}
