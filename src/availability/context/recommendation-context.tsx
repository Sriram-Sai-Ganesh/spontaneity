import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type React from "react";

/**
 * Shared event type used across SuggestedEvents and ChatEventCards.
 * Superset of both SuggestedEventItem and ChatEventCardData.
 */
export type SharedRecommendedEvent = {
  eventId: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
  /** Display label for start time. Corresponds to startLocal/localDateLabel in chat cards. */
  startLabel?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  venueNeighborhood?: string | null;
  venueCountry?: string | null;
  source: string;
  url?: string | null;
  status?: string | null;
  budgetBucket?: string | null;
  genre?: string | null;
  venueType?: "food" | "activity" | null;
  openHours?: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
  }> | null;
  tags?: string[];
  score?: number;
};

export type SharedFeedbackType = "accept" | "reject" | "more-like-this";

type FeedbackHandler = (
  event: SharedRecommendedEvent,
  feedbackType: SharedFeedbackType,
) => Promise<void>;

interface RecommendationContextValue {
  /** Current top events from the suggested events panel (shared across components). */
  displayEvents: SharedRecommendedEvent[];
  /** True while a new findGroupAvailableEvents tool call is in-flight. */
  isFindingGroupEvents: boolean;
  /** Submit feedback through the suggested events panel's handler (updates both sides). */
  handleFeedback: FeedbackHandler;
  /** Internal: called by SuggestedEvents to push its current display pool. */
  _setDisplayEvents: (events: SharedRecommendedEvent[]) => void;
  /** Internal: called by SuggestedEvents to register its feedback handler via a stable ref. */
  _setFeedbackHandler: (handler: FeedbackHandler) => void;
  /** Internal: called by MessageList while tool calls are in-flight. */
  _setIsFindingGroupEvents: (finding: boolean) => void;
}

const RecommendationContext = createContext<RecommendationContextValue | null>(null);

/**
 * Provider that bridges SuggestedEvents (right panel) and ChatEventCards (chat messages).
 * Place this around both components so they share the same ranked event pool.
 * Use `key={chatId}` to reset state when switching chats.
 */
export function RecommendationProvider({ children }: { children: React.ReactNode }) {
  const [displayEvents, setDisplayEvents] = useState<SharedRecommendedEvent[]>([]);
  const [isFindingGroupEvents, setIsFindingGroupEvents] = useState(false);
  const handlerRef = useRef<FeedbackHandler | null>(null);

  const handleFeedback = useCallback<FeedbackHandler>(async (event, feedbackType) => {
    await handlerRef.current?.(event, feedbackType);
  }, []);

  const _setDisplayEvents = useCallback((events: SharedRecommendedEvent[]) => {
    // Guard against no-op [] → [] transitions: Object.is([], []) is false so React
    // would re-render even though nothing changed, causing an infinite update loop
    // when MessageList calls _setDisplayEvents([]) while isFindingGroupEvents is true.
    setDisplayEvents((prev) =>
      prev.length === 0 && events.length === 0 ? prev : events,
    );
  }, []);

  const _setFeedbackHandler = useCallback((handler: FeedbackHandler) => {
    handlerRef.current = handler;
  }, []);

  const contextValue = useMemo(
    () => ({
      displayEvents,
      isFindingGroupEvents,
      handleFeedback,
      _setDisplayEvents,
      _setFeedbackHandler,
      _setIsFindingGroupEvents: setIsFindingGroupEvents,
    }),
    [displayEvents, isFindingGroupEvents, handleFeedback, _setDisplayEvents, _setFeedbackHandler],
  );

  return (
    <RecommendationContext.Provider value={contextValue}>
      {children}
    </RecommendationContext.Provider>
  );
}

/** Returns the shared recommendation pool context, or null if not inside a provider. */
export function useRecommendationPool() {
  return useContext(RecommendationContext);
}
