import { useRef, useEffect, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MessageType } from "@/messages/types/message";
import { useQuerySettings } from "@/settings/hooks/use-query-settings";
import { DEFAULT_MODEL } from "@/config/models";

/** Trigger extraction after every N user messages. */
const EXTRACTION_TRIGGER_EVERY_N = 5;
/** Minimum milliseconds between two extractions for the same chat. */
const EXTRACTION_COOLDOWN_MS = 60_000;
/** Maximum number of recent user messages sent to the LLM. */
const MESSAGE_WINDOW_SIZE = 20;

export type PendingSignal = {
  _id: Id<"passivePreferenceSignals">;
  type: string;
  value: string;
  polarity: "positive" | "negative";
  strength: number;
  confidence: number;
  timeScope: "short_term" | "long_term";
  createdAt: number;
};

type DebugWindow = Window & {
  __debugExtractSignals?: () => Promise<void>;
};

/**
 * Passively extracts event preference signals from recent chat messages and
 * surfaces them to the current user as accept/reject suggestions.
 *
 * Extraction triggers every EXTRACTION_TRIGGER_EVERY_N user messages.
 * The popup is shown only when the current user sent the most recent message,
 * matching the "sender of the most recent message gets the popup" requirement.
 */
export function usePassivePreferenceExtraction(
  chatId: string,
  messages: MessageType[],
  currentUserId: string,
  enabled = true,
) {
  const { data: settings } = useQuerySettings();
  const extractAndSave = useAction(
    api.passive_preference_extraction.extractAndSaveSignals,
  );
  const pendingSignals = useQuery(
    api.passive_preference_extraction.getPendingSignals,
    enabled
      ? {
          chatId: chatId as Id<"chats">,
        }
      : "skip",
  );
  const acceptSignal = useMutation(api.passive_preference_extraction.acceptSignal);
  const rejectSignal = useMutation(api.passive_preference_extraction.rejectSignal);

  const lastExtractionTimeRef = useRef<number>(0);
  const lastProcessedCountRef = useRef<number>(0);
  const isExtractingRef = useRef<boolean>(false);
  // Store messages in a ref so triggerExtraction can read the latest value
  // without being listed as a dependency (avoids recreating the callback every render)
  const userMessagesRef = useRef<MessageType[]>([]);

  const userMessages = messages.filter((m) => m.role === "user");
  userMessagesRef.current = userMessages;

  const triggerExtraction = useCallback(async () => {
    if (!enabled) return;
    if (isExtractingRef.current) return;
    const openRouterApiKey = settings?.openRouterApiKey?.trim();
    if (!openRouterApiKey) return;

    const now = Date.now();
    if (now - lastExtractionTimeRef.current < EXTRACTION_COOLDOWN_MS) return;

    isExtractingRef.current = true;
    lastExtractionTimeRef.current = now;

    try {
      const recentMessages = userMessagesRef.current
        .slice(-MESSAGE_WINDOW_SIZE)
        .map((m) => ({
          id: m._id,
          userId: m.userId as Id<"users">,
          text: m.content,
        }));

      if (recentMessages.length === 0) return;

      await extractAndSave({
        chatId: chatId as Id<"chats">,
        messages: recentMessages,
        openRouterApiKey,
        model: DEFAULT_MODEL,
      });
    } catch (err) {
      console.error("[usePassivePreferenceExtraction] extraction failed:", err);
    } finally {
      isExtractingRef.current = false;
    }
  }, [chatId, enabled, settings?.openRouterApiKey, extractAndSave]);

  // Expose a debug helper on window in development for manual testing
  useEffect(() => {
    if (!enabled) return;
    if (!import.meta.env.DEV) return;
    const run = async () => {
      const openRouterApiKey = settings?.openRouterApiKey?.trim();
      if (!openRouterApiKey) {
        console.warn("[debugExtractSignals] No OpenRouter API key in settings.");
        return;
      }
      const recentMessages = userMessagesRef.current
        .slice(-MESSAGE_WINDOW_SIZE)
        .map((m) => ({ id: m._id, userId: m.userId as Id<"users">, text: m.content }));
      if (recentMessages.length === 0) {
        console.warn("[debugExtractSignals] No user messages to analyse.");
        return;
      }
      try {
        await extractAndSave({
          chatId: chatId as Id<"chats">,
          messages: recentMessages,
          openRouterApiKey,
          model: DEFAULT_MODEL,
        });
      } catch (err) {
        console.error("[debugExtractSignals] Extraction failed:", err);
      }
    };
    const debugWindow = window as DebugWindow;
    debugWindow.__debugExtractSignals = run;
    return () => {
      delete debugWindow.__debugExtractSignals;
    };
  }, [chatId, enabled, settings?.openRouterApiKey, extractAndSave]);

  // Trigger extraction whenever we cross a multiple of EXTRACTION_TRIGGER_EVERY_N
  useEffect(() => {
    if (!enabled) return;
    const prevCount = lastProcessedCountRef.current;
    const newCount = userMessages.length;

    if (
      newCount > 0 &&
      Math.floor(newCount / EXTRACTION_TRIGGER_EVERY_N) >
        Math.floor(prevCount / EXTRACTION_TRIGGER_EVERY_N)
    ) {
      lastProcessedCountRef.current = newCount;
      void triggerExtraction();
    }
  }, [enabled, userMessages.length, triggerExtraction]);

  // Only surface the popup to the sender of the most recent user message
  const mostRecentUserMsg = userMessages[userMessages.length - 1];
  const currentUserSentLast = mostRecentUserMsg?.userId === currentUserId;

  const signalsToShow: PendingSignal[] =
    enabled && currentUserSentLast && pendingSignals
      ? (pendingSignals as PendingSignal[])
      : [];

  const handleAccept = useCallback(
    async (signalId: Id<"passivePreferenceSignals">) => {
      await acceptSignal({ signalId });
    },
    [acceptSignal],
  );

  const handleReject = useCallback(
    async (signalId: Id<"passivePreferenceSignals">) => {
      await rejectSignal({ signalId });
    },
    [rejectSignal],
  );

  return { signalsToShow, handleAccept, handleReject };
}
