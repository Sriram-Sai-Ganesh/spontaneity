import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  RefreshCw,
  AlertCircle,
  Sparkles,
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Repeat2,
  CalendarPlus,
  Link2,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RightPanelToggle } from "@/components/right-panel-toggle";
import { useInviteLink } from "@/chats/hooks/use-invite-link";
import {
  formatEventSourceLabel,
  formatEventSourceLinkLabel,
} from "@/lib/event-source-presentation";
import {
  buildCalendarIcsPayload,
  downloadCalendarIcs,
} from "@/lib/calendar-ics";
import { getChatEventCardsPayload, formatOpenHours } from "@/messages/components/chat-event-cards";
import type { MessageType } from "@/messages/types/message";
import CreateEventPollDialog from "@/polls/components/create-event-poll-dialog";
import EventPollActions from "@/polls/components/event-poll-actions";
import {
  EVENT_POLL_OPTION_COUNT,
  getEventPollOptionAnchorId,
  isEventPollView,
  pollMatchesEventIds,
  type EventPollOptionView,
  type EventPollView,
} from "@/polls/lib";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { NormalizedEvent } from "../../../convex/event_types";
import { EventRSVPPanel } from "@/messages/components/event-rsvp-panel";
import { rankEventsForGroup, inferTagsFromText, type GroupPreferenceProfileSummary } from "../../../convex/ranking";
import { useRecommendationPool, type SharedRecommendedEvent } from "@/availability/context/recommendation-context";

interface SuggestedEventsProps {
  chatId: string;
  collapsed?: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

type FeedbackListItem = {
  feedbackType: "accept" | "reject" | "cancel" | "more-like-this";
  eventId: string;
  timestamp: number;
};

const EMPTY_FEEDBACK_LIST: FeedbackListItem[] = [];

const SCORE_SHIFT = 8;

type SuggestedEventItem = {
  eventId: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
  startLabel?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  venueNeighborhood?: string | null;
  venueCountry?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  source: string;
  url?: string | null;
  status?: NormalizedEvent["status"];
  budgetBucket?: NormalizedEvent["budgetBucket"];
  genre?: string | null;
  venueType?: "food" | "activity" | null;
  openHours?: import("../../../convex/event_types").OpenHoursPeriod[] | null;
  /** Combined event tags + foodTags used for similarity-based rank shifting. */
  tags?: string[];
};

type CustomEventCandidate = {
  eventId: string;
  title: string;
  description?: string;
  startTime?: string;
  location?: string;
  venueName?: string;
  venueCity?: string;
  venueCountry?: string;
  source?: string;
  url?: string;
  tags?: NormalizedEvent["tags"];
  budgetBucket?: NormalizedEvent["budgetBucket"];
};

type LocationAreaOption = {
  key: string;
  label: string;
};

type ShortlistedEventRecord = {
  _id: string;
  eventId: string;
  event: SuggestedEventItem & { image?: string | null };
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBudget(
  budgetBucket: NormalizedEvent["budgetBucket"] | null | undefined,
): string | null {
  if (!budgetBucket) return null;
  const labels: Record<string, string> = { low: "Budget-friendly", medium: "Moderate", high: "Premium" };
  return labels[budgetBucket] ?? null;
}

function normalizeLocationAreaLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function toLocationFilterKey(label: string): string {
  return label.toLowerCase();
}

function buildLocationAreaOptions(labels: string[]): LocationAreaOption[] {
  const options = new Map<string, LocationAreaOption>();
  for (const label of labels) {
    const normalized = normalizeLocationAreaLabel(label);
    if (!normalized) continue;
    const key = toLocationFilterKey(normalized);
    if (!options.has(key)) {
      options.set(key, { key, label: normalized });
    }
  }
  return Array.from(options.values());
}

function isSearchRecommendationEvent(event: { source?: string | null }): boolean {
  return event.source !== "custom" && event.source !== "manual";
}

function normalizeRecommendedEvent(event: NormalizedEvent): SuggestedEventItem {
  // tags holds EventTag[] for activity venues and FoodTag[] for food venues (unified column).
  const rawTags = (event.tags as string[] | undefined ?? []).filter((tag, i, arr) => arr.indexOf(tag) === i);
  const tags = rawTags.length > 0
    ? rawTags
    : inferTagsFromText([event.title, event.description, event.venueName]
        .filter((v): v is string => v != null && v.length > 0).join(" "));
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    // google_places venues have a virtual startTime for availability matching only — never display it.
    startTime: event.source === "google_places" ? null : (event.startTime ?? null),
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    formattedAddress: event.formattedAddress ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    googlePlaceId: event.googlePlaceId ?? null,
    source: event.source,
    url: event.url,
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? null,
    openHours: event.openHours ?? null,
    tags,
  };
}

function suggestedEventToNormalizedEvent(event: SuggestedEventItem): NormalizedEvent {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    latitude: event.latitude ?? undefined,
    longitude: event.longitude ?? undefined,
    formattedAddress: event.formattedAddress ?? undefined,
    googlePlaceId: event.googlePlaceId ?? undefined,
    source: event.source,
    url: event.url ?? "",
    image: null,
    tags: event.tags as NormalizedEvent["tags"],
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? undefined,
    openHours: event.openHours ?? undefined,
  };
}

function customEventToNormalizedEvent(event: CustomEventCandidate): NormalizedEvent {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? event.location ?? null,
    venueCity: event.venueCity ?? null,
    venueCountry: event.venueCountry ?? null,
    source: event.source ?? "custom",
    url: event.url ?? "",
    image: null,
    tags: event.tags,
    status: null,
    budgetBucket: event.budgetBucket ?? null,
    genre: null,
    venueType: "activity",
  };
}

function normalizeMessageBackedEvent(
  event: NonNullable<ReturnType<typeof getChatEventCardsPayload>>["events"][number],
): SuggestedEventItem {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    // google_places venues have a virtual startTime for availability matching only — never display it.
    startTime: event.source === "google_places" ? null : (event.startTime ?? null),
    startLabel: event.source === "google_places" ? null : (event.startLocal ?? event.localDateLabel),
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    formattedAddress: event.formattedAddress ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    googlePlaceId: event.googlePlaceId ?? null,
    source: event.source,
    url: event.url ?? null,
    status: null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? null,
    openHours: ("openHours" in event && Array.isArray((event as { openHours?: unknown }).openHours)) ? (event as { openHours: import("../../../convex/event_types").OpenHoursPeriod[] }).openHours : null,
    tags: (() => {
      // Prefer the DB-sourced tags from the tool call result.
      if (event.tags && event.tags.length > 0) return event.tags;
      const inferred = inferTagsFromText([event.title, event.description, event.venueName]
        .filter((v): v is string => v != null && v.length > 0).join(" "));
      return inferred.length > 0 ? inferred : (event.genre ? [event.genre] : []);
    })(),
  };
}

function toSuggestionPollOption(event: SuggestedEventItem) {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    source: event.source,
    url: event.url ?? "",
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? undefined,
  };
}

function toShortlistEventSnapshot(event: SuggestedEventItem) {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    formattedAddress: event.formattedAddress ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    googlePlaceId: event.googlePlaceId ?? null,
    source: event.source,
    url: event.url ?? null,
    image: null,
    tags: [],
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? null,
    openHours: event.openHours ?? null,
  };
}

function shortlistRecordToSuggestedEvent(record: ShortlistedEventRecord): SuggestedEventItem {
  return {
    ...record.event,
    eventId: record.eventId,
    description: record.event.description ?? null,
    startTime: record.event.startTime ?? null,
    venueName: record.event.venueName ?? null,
    venueCity: record.event.venueCity ?? null,
    venueNeighborhood: record.event.venueNeighborhood ?? null,
    venueCountry: record.event.venueCountry ?? null,
    source: record.event.source,
    url: record.event.url ?? null,
    status: record.event.status ?? null,
    budgetBucket: record.event.budgetBucket ?? null,
    genre: record.event.genre ?? null,
    venueType: record.event.venueType ?? null,
    tags: record.event.tags ?? [],
  };
}

function shortlistRecordToNormalizedEvent(record: ShortlistedEventRecord): NormalizedEvent {
  const event = shortlistRecordToSuggestedEvent(record);
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    formattedAddress: event.formattedAddress ?? undefined,
    latitude: event.latitude ?? undefined,
    longitude: event.longitude ?? undefined,
    googlePlaceId: event.googlePlaceId ?? undefined,
    source: event.source,
    url: event.url ?? "",
    image: null,
    tags: event.tags as NormalizedEvent["tags"],
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? undefined,
    openHours: event.openHours ?? undefined,
  };
}

function normalizePollOptionEvent(event: EventPollOptionView): SuggestedEventItem {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description ?? null,
    startTime: event.startTime ?? null,
    venueName: event.venueName ?? null,
    venueCity: event.venueCity ?? null,
    venueNeighborhood: event.venueNeighborhood ?? null,
    venueCountry: event.venueCountry ?? null,
    source: event.source,
    url: event.url,
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? null,
    tags: Array.isArray(event.tags)
      ? (event.tags as string[]).filter((t): t is string => typeof t === "string")
      : undefined,
  };
}

function dedupeEvents(events: NormalizedEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
}

function getPollResolutionDisplayState(poll: EventPollView) {
  if (poll.resolution && poll.resolution !== "pending") {
    return poll.resolution;
  }

  if (poll.status !== "closed" || !poll.resultsVisible) {
    return poll.resolution ?? "pending";
  }

  if (poll.leadingEventIds.length === 1) {
    return "accepted" as const;
  }

  if (poll.leadingEventIds.length > 1) {
    return "no_consensus" as const;
  }

  return poll.resolution ?? "pending";
}

function getAcceptedEventIdDisplayValue(poll: EventPollView) {
  if (poll.acceptedEventId) {
    return poll.acceptedEventId;
  }

  return getPollResolutionDisplayState(poll) === "accepted"
    ? poll.leadingEventIds[0] ?? null
    : null;
}

function pollSummaryText(poll: EventPollView | null | undefined) {
  if (!poll) return null;

  const resolution = getPollResolutionDisplayState(poll);

  if (poll.status === "closed") {
    if (resolution === "accepted") {
      return `Agreement reached · ${poll.totalVotes ?? poll.totalEligibleVoters}/${poll.totalEligibleVoters} voted`;
    }

    if (resolution === "no_consensus") {
      return `No consensus · ${poll.totalVotes ?? poll.totalEligibleVoters}/${poll.totalEligibleVoters} voted`;
    }

    return `Poll closed · ${poll.totalVotes ?? poll.totalEligibleVoters}/${poll.totalEligibleVoters} voted`;
  }
  if (!poll.hasVoted) {
    return "Open poll · vote to reveal the results";
  }
  return `Open poll · ${poll.totalVotes ?? 0}/${poll.totalEligibleVoters} voted`;
}

const SuggestedEvents: React.FC<SuggestedEventsProps> = ({
  chatId,
  collapsed = false,
  focused = false,
  onToggle,
}) => {
  const recommendationPool = useRecommendationPool();
  const blockRecommendationDisplay = recommendationPool?.isFindingGroupEvents ?? false;
  const [loading, setLoading] = useState(false);
  const [pollLoadingEventId, setPollLoadingEventId] = useState<string | null>(null);
  const [creatingRecommendationPoll, setCreatingRecommendationPoll] = useState(false);
  const [creatingCustomPoll, setCreatingCustomPoll] = useState(false);
  const [closingPoll, setClosingPoll] = useState(false);
  const [clearingPoll, setClearingPoll] = useState(false);
  const [shortlistLoadingId, setShortlistLoadingId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hydrate the event pools from localStorage so the last recommended sets are visible
  // immediately when the user returns to the chat (survives page reloads and group switches).
  const [initialFoodEvents] = useState<SuggestedEventItem[]>(() => {
    try {
      const saved = localStorage.getItem(`reco_food_events_${chatId}`);
      if (saved) return (JSON.parse(saved) as SuggestedEventItem[]).filter(isSearchRecommendationEvent);
    } catch {}
    return [];
  });
  const [initialActivityEvents] = useState<SuggestedEventItem[]>(() => {
    try {
      const saved = localStorage.getItem(`reco_activity_events_${chatId}`);
      if (saved) return (JSON.parse(saved) as SuggestedEventItem[]).filter(isSearchRecommendationEvent);
    } catch {}
    return [];
  });

  // Separate food and activity pools — always both loaded, no clearing on venueType switch.
  const [regenFoodEvents, setRegenFoodEvents] = useState<SuggestedEventItem[]>(initialFoodEvents);
  const [regenActivityEvents, setRegenActivityEvents] = useState<SuggestedEventItem[]>(initialActivityEvents);
  const regenFoodEventsRef = useRef<SuggestedEventItem[]>(initialFoodEvents);
  const regenActivityEventsRef = useRef<SuggestedEventItem[]>(initialActivityEvents);

  const setRegenFoodEventsWithRef = (next: SuggestedEventItem[] | ((prev: SuggestedEventItem[]) => SuggestedEventItem[])) => {
    if (typeof next === "function") {
      setRegenFoodEvents((prev) => { const val = next(prev); regenFoodEventsRef.current = val; return val; });
    } else {
      regenFoodEventsRef.current = next;
      setRegenFoodEvents(next);
    }
  };
  const setRegenActivityEventsWithRef = (next: SuggestedEventItem[] | ((prev: SuggestedEventItem[]) => SuggestedEventItem[])) => {
    if (typeof next === "function") {
      setRegenActivityEvents((prev) => { const val = next(prev); regenActivityEventsRef.current = val; return val; });
    } else {
      regenActivityEventsRef.current = next;
      setRegenActivityEvents(next);
    }
  };

  const [fetchedFoodEvents, setFetchedFoodEvents] = useState<SuggestedEventItem[]>([]);
  const [fetchedActivityEvents, setFetchedActivityEvents] = useState<SuggestedEventItem[]>([]);
  const fetchedFoodEventsRef = useRef<SuggestedEventItem[]>([]);
  const fetchedActivityEventsRef = useRef<SuggestedEventItem[]>([]);
  const setFetchedFoodEventsWithRef = (events: SuggestedEventItem[]) => { fetchedFoodEventsRef.current = events; setFetchedFoodEvents(events); };
  const setFetchedActivityEventsWithRef = (events: SuggestedEventItem[]) => { fetchedActivityEventsRef.current = events; setFetchedActivityEvents(events); };
  const [feedbackLoadingId, setFeedbackLoadingId] = useState<string | null>(null);
  const [clarifyQuestion, setClarifyQuestion] = useState<string | null>(null);
  const [hasFetchedRecommendations, setHasFetchedRecommendations] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [clearedPollId, setClearedPollId] = useState<string | null>(null);
  const [selectedLocationAreaKey, setSelectedLocationAreaKey] = useState<string | null>(null);
  const [locationAreaLabels, setLocationAreaLabels] = useState<string[]>([]);
  const [emptyLocationSearch, setEmptyLocationSearch] = useState<string | null>(null);
  const findEvents = useAction(api.availability_action.findAvailableEvents);
  const createPoll = useMutation(api.event_polls_mutations.createPoll);
  const castVote = useAction(api.email_notifications.castVoteAndNotify);
  const closePoll = useMutation(api.event_polls_mutations.closePoll);
  const dismissPoll = useMutation(api.event_polls_mutations.dismissPoll);
  const shortlistEvent = useMutation(api.event_shortlists_mutations.shortlistEvent);
  const removeShortlist = useMutation(api.event_shortlists_mutations.removeShortlist);
  const submitFeedback = useMutation(api.feedback_mutations.submitFeedback);
  const { copyInviteLink } = useInviteLink(chatId);
  const userEventPreferences = useQuery(api.user_preferences_queries.getUserEventPreferences, {});
  const nonTicketStats = useQuery(api.non_ticket_events_mutations.getNonTicketPlacesStats, { chatId: chatId as Id<"chats"> });
  const venueCacheReady = useQuery(api.chats_queries.getVenueCacheReady, { chatId: chatId as Id<"chats"> });
  const messages =
    useQuery(api.messages_queries.getByChat, {
      chatId: chatId as Id<"chats">,
    }) as MessageType[] | undefined;
  const latestPollResult = useQuery(api.event_polls_queries.getLatestForChat, {
    chatId: chatId as Id<"chats">,
  });
  const customEvents =
    useQuery(api.custom_events_mutations.listForChat, {
      chatId: chatId as Id<"chats">,
    }) ?? [];
  const shortlistedRecords =
    (useQuery(api.event_shortlists_queries.listForChat, {
      chatId: chatId as Id<"chats">,
    }) as ShortlistedEventRecord[] | undefined) ?? [];
  const groupPreferenceProfile = useQuery(api.group_preferences_queries.getGroupPreferenceProfile, {
    chatId: chatId as Id<"chats">,
  });
  const lastNonTicketStatsRef = useRef<{ count: number; taggedCount: number } | null>(null);
  const lastVenueCacheReadyRef = useRef<boolean | null | undefined>(undefined);
  const lastPreferenceSignatureRef = useRef<string | null>(null);
  const lastFindEventsCallCountRef = useRef<number | null>(null);
  // Tracks the _creationTime of the last findGroupAvailableEvents message we triggered a
  // panel re-fetch for. Detects each new AI query regardless of count oscillation.
  const lastFetchedFindEventsMsgTimeRef = useRef<number>(-1);
  const fetchSequenceRef = useRef(0);
  const wasCollapsedRef = useRef<boolean>(collapsed);
  // Ensures the on-mount auto-fetch decision runs at most once per mount (issue #310).
  const didAutoFetchRef = useRef(false);
  // Track previous rejected-IDs size to detect external rejections (from chat cards)
  const prevRejectedSizeRef = useRef<number>(-1);
  // Persistent rank scores — keyed by eventId across both food and activity pools.
  // Restored from localStorage on mount so feedback ordering survives group switching.
  const rankScoresRef = useRef<Map<string, number>>(
    (() => {
      try {
        const saved = localStorage.getItem(`reco_scores_${chatId}`);
        if (saved) return new Map(Object.entries(JSON.parse(saved) as Record<string, number>));
      } catch {}
      const all = [...initialFoodEvents, ...initialActivityEvents];
      return new Map(all.map((e) => [e.eventId, 0]));
    })(),
  );
  // Ref to always-current handleFetch so effects defined before the useCallback can call it.
  const handleFetchRef = useRef<((opts?: {
    clearStoredInPlanningWindow?: boolean;
    preserveRegenContext?: boolean;
    isRegen?: boolean;
    locationArea?: string;
  }) => Promise<void>) | null>(null);
  // Ref to always-current handleFeedback, used to register a stable handler with the
  // recommendation context without causing re-registration on every render.
  const handleFeedbackRef = useRef<((event: SuggestedEventItem, feedbackType: "accept" | "reject" | "more-like-this") => Promise<void>) | null>(null);
  // Tracks event IDs that were rejected by handleFeedback in this render cycle.
  // The external-reject effect is meant for rejections from OTHER sources (e.g. chat
  // cards routed externally). When a rejection already went through handleFeedback the
  // DB write completing triggers feedbackList → the external-reject effect would fire a
  // second time. This Set prevents that double-application.
  const locallyHandledRejectIdsRef = useRef<Set<string>>(new Set());

  // Track rejected event IDs reactively (covers rejections from chat cards too)
  const feedbackList = useQuery(api.feedback_queries.listForChat, { chatId: chatId as Id<"chats"> }) ?? EMPTY_FEEDBACK_LIST;
  const feedbackListRef = useRef<typeof EMPTY_FEEDBACK_LIST>(EMPTY_FEEDBACK_LIST);
  feedbackListRef.current = feedbackList;
  const rejectedIds = useMemo(
    () => new Set(feedbackList.filter((f) => f.feedbackType === "reject").map((f) => f.eventId)),
    [feedbackList],
  );
  const acceptedIds = useMemo(
    () => new Set(feedbackList.filter((f) => f.feedbackType === "accept").map((f) => f.eventId)),
    [feedbackList],
  );
  const rejectedIdsSize = rejectedIds.size;
  const latestPoll = isEventPollView(latestPollResult) ? latestPollResult : null;
  const visiblePoll = latestPoll?._id === clearedPollId ? null : latestPoll;
  const persistedRecommendationEvents = useMemo(() => {
    if (!messages?.length) return [];

    const latestPayload = [...messages]
      .reverse()
      .map((message) => {
        if (message.role !== "assistant" || !message.latestToolCall) {
          return null;
        }

        return getChatEventCardsPayload(message.latestToolCall);
      })
      .find((payload) => payload !== null);

    return latestPayload ? latestPayload.events.map(normalizeMessageBackedEvent) : [];
  }, [messages]);

  const findEventsCallCount = useMemo(
    () =>
      messages?.filter(
        (m) =>
          m.role === "assistant" &&
          m.latestToolCall?.toolName === "findGroupAvailableEvents",
      ).length ?? 0,
    [messages],
  );


  // Ref mirror so handleFeedback can use persistedRecommendationEvents as a last-resort
  // fallback pool when fetchedRankedEventsRef is empty (e.g. feedback from a chat card
  // arrives before the panel's first fetch completes).
  const persistedRecommendationEventsRef = useRef<SuggestedEventItem[]>([]);
  persistedRecommendationEventsRef.current = persistedRecommendationEvents;

  // Derive the active venue-type context.
  // Capture venueTypeFilter into state the moment findGroupAvailableEvents reports it.
  // Once stored, this persists through displayEventCards overriding latestToolCall —
  // which is the root cause of activeVenueType reverting to the previous query's type.
  const [detectedQueryVenueType, setDetectedQueryVenueType] = useState<"food" | "activity" | null>(null);
  // Track the _creationTime of the message that last set detectedQueryVenueType.
  // Prevents an older message (e.g. a previous activity response that never called displayEventCards)
  // from reverting the venueType after a newer food message has already set it.
  const lastDetectedMsgCreationTimeRef = useRef<number>(-1);
  useEffect(() => {
    const latestFindEventsMsg = [...(messages ?? [])]
      .reverse()
      .find((m) => m.role === "assistant" && m.latestToolCall?.toolName === "findGroupAvailableEvents");
    if (!latestFindEventsMsg) return;
    const filterArg = latestFindEventsMsg.latestToolCall?.args?.venueTypeFilter;
    const msgTime = (latestFindEventsMsg as { _creationTime?: number })._creationTime ?? 0;
    if (filterArg === "food" || filterArg === "activity") {
      if (msgTime >= lastDetectedMsgCreationTimeRef.current) {
        console.log(`[venueType:detect] SET ${filterArg} | msgTime=${msgTime} lastRef=${lastDetectedMsgCreationTimeRef.current}`);
        lastDetectedMsgCreationTimeRef.current = msgTime;
        if (filterArg === "food") setDetectedQueryVenueType("food");
        else setDetectedQueryVenueType("activity");
        // Trigger a panel re-fetch for every new AI query so the pool stays fresh.
        // Skip the very first detection — venueCacheReady and findEventsCallCount handle that.
        if (msgTime > lastFetchedFindEventsMsgTimeRef.current && lastFetchedFindEventsMsgTimeRef.current !== -1) {
          console.log(`[fetch:detectTrigger] new query detected (msgTime=${msgTime}), triggering re-fetch`);
          void handleFetchRef.current?.({ preserveRegenContext: true, isRegen: true });
        }
        lastFetchedFindEventsMsgTimeRef.current = msgTime;
      } else {
        console.log(`[venueType:detect] SKIP stale revert to ${filterArg} | msgTime=${msgTime} < lastRef=${lastDetectedMsgCreationTimeRef.current}`);
      }
    } else {
      console.log(`[venueType:detect] SKIP no valid filterArg=${String(filterArg)} | msgTime=${msgTime}`);
    }
  }, [messages]);

  // Primary: last explicitly detected filterArg — stable across tool call overrides.
  // Fallback: infer from event venueTypes for initial load or queries without filterArg.
  const activeVenueType = useMemo<"food" | "activity" | null>(() => {
    if (detectedQueryVenueType !== null) return detectedQueryVenueType;

    const types = persistedRecommendationEvents.map((e) => e.venueType).filter(Boolean);
    if (types.length > 0) {
      if (types.every((t) => t === "food")) return "food";
      if (types.every((t) => t === "activity")) return "activity";
    }
    return null;
  }, [detectedQueryVenueType, persistedRecommendationEvents]);
  // Log when activeVenueType changes so we can trace unexpected flips.
  const prevActiveVenueTypeLogRef = useRef<"food" | "activity" | null | undefined>(undefined);
  if (prevActiveVenueTypeLogRef.current !== activeVenueType) {
    console.log(`[venueType:active] ${String(prevActiveVenueTypeLogRef.current)} → ${String(activeVenueType)} | detected=${String(detectedQueryVenueType)} persistedCount=${persistedRecommendationEvents.length}`);
    prevActiveVenueTypeLogRef.current = activeVenueType;
  }

  // No clearing effect needed — venueType switch is just a UI pool selector.
  // Both food and activity pools are always loaded; switching between them is instant.

  // Helper: pick the right pool for a given venueType.
  const getActivePool = (type: "food" | "activity" | null) => {
    if (type === "food") return regenFoodEvents.length > 0 ? regenFoodEvents : fetchedFoodEvents;
    if (type === "activity") return regenActivityEvents.length > 0 ? regenActivityEvents : fetchedActivityEvents;
    // mixed: interleave food and activity
    const fp = regenFoodEvents.length > 0 ? regenFoodEvents : fetchedFoodEvents;
    const ap = regenActivityEvents.length > 0 ? regenActivityEvents : fetchedActivityEvents;
    const interleaved: SuggestedEventItem[] = [];
    const maxLen = Math.max(fp.length, ap.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < fp.length) interleaved.push(fp[i]);
      if (i < ap.length) interleaved.push(ap[i]);
    }
    return interleaved;
  };

  // Priority order:
  // 1) post-feedback regeneration results for the active type
  // 2) backend-fetched ranked results for the active type
  // 3) persisted AI message events as placeholder while fetch loads
  const recommendationDisplayEvents = useMemo(
    () => {
      if (blockRecommendationDisplay || emptyLocationSearch) return [] as SuggestedEventItem[];
      const pool = getActivePool(activeVenueType);
      const raw = pool.length > 0
        ? pool
        : persistedRecommendationEvents;
      return raw.filter(isSearchRecommendationEvent).slice(0, EVENT_POLL_OPTION_COUNT);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockRecommendationDisplay, emptyLocationSearch, regenFoodEvents, regenActivityEvents, fetchedFoodEvents, fetchedActivityEvents, persistedRecommendationEvents, activeVenueType],
  );

  // Full ranked pool for the active type — pushed to context for chat cards.
  const fullRankedPool = useMemo(() => {
    if (blockRecommendationDisplay || emptyLocationSearch) return [] as SuggestedEventItem[];
    return getActivePool(activeVenueType).filter(isSearchRecommendationEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockRecommendationDisplay, emptyLocationSearch, regenFoodEvents, regenActivityEvents, fetchedFoodEvents, fetchedActivityEvents, activeVenueType]);

  const recommendationEvents = useMemo(
    () => getActivePool(activeVenueType).slice(0, EVENT_POLL_OPTION_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regenFoodEvents, regenActivityEvents, fetchedFoodEvents, fetchedActivityEvents, activeVenueType],
  );
  // Chat-scoped: collect every event ever surfaced by assistant tool calls in THIS chat.
  // Replaces the previous global getAllEvents/getAllYelpEvents queries, which leaked cross-group
  // events onto the panel on first load (issue #310).
  const allStoredEvents = useMemo<NormalizedEvent[]>(() => {
    if (!messages?.length) return [];
    const collected: NormalizedEvent[] = [];
    for (const message of messages) {
      if (message.role !== "assistant" || !message.latestToolCall) continue;
      const payload = getChatEventCardsPayload(message.latestToolCall);
      if (!payload) continue;
      for (const event of payload.events) {
        collected.push({
          eventId: event.eventId,
          title: event.title,
          description: event.description ?? null,
          startTime: event.startTime ?? null,
          venueName: event.venueName ?? null,
          venueCity: event.venueCity ?? null,
          venueNeighborhood: event.venueNeighborhood ?? null,
          venueCountry: event.venueCountry ?? null,
          formattedAddress: event.formattedAddress ?? undefined,
          latitude: event.latitude ?? undefined,
          longitude: event.longitude ?? undefined,
          googlePlaceId: event.googlePlaceId ?? undefined,
          source: event.source,
          url: event.url ?? "",
          image: null,
          status: null,
          budgetBucket: null,
          genre: event.genre ?? null,
          venueType: event.venueType ?? undefined,
          tags: event.tags.length > 0 ? event.tags as NormalizedEvent["tags"] : undefined,
        });
      }
    }
    return dedupeEvents(collected);
  }, [messages]);
  const rankedStoredEvents = useMemo(() => {
    const ranked = rankEventsForGroup(allStoredEvents, [], groupPreferenceProfile as GroupPreferenceProfileSummary | null ?? null);
    return ranked.sort((a, b) => {
      const aAccepted = acceptedIds.has(a.eventId) ? 1 : 0;
      const bAccepted = acceptedIds.has(b.eventId) ? 1 : 0;
      return bAccepted - aAccepted;
    });
  }, [allStoredEvents, groupPreferenceProfile, acceptedIds]);
  const shortlistedEvents = useMemo(
    () => shortlistedRecords.map(shortlistRecordToSuggestedEvent),
    [shortlistedRecords],
  );
  const shortlistedEventIds = useMemo(
    () => new Set(shortlistedRecords.map((record) => record.eventId)),
    [shortlistedRecords],
  );
  const customPollCandidateEvents = useMemo(() => {
    const candidates = [
      ...rankedStoredEvents,
      ...shortlistedRecords.map(shortlistRecordToNormalizedEvent),
      ...customEvents.map(customEventToNormalizedEvent),
      ...fullRankedPool.map(suggestedEventToNormalizedEvent),
    ];
    return dedupeEvents(candidates);
  }, [customEvents, fullRankedPool, rankedStoredEvents, shortlistedRecords]);
  // Map of eventId -> venueType for all currently displayable events.
  const eventVenueTypeMap = useMemo(() => {
    const map = new Map<string, "food" | "activity" | null>();
    for (const e of allStoredEvents) {
      if (!map.has(e.eventId)) map.set(e.eventId, e.venueType ?? null);
    }
    for (const e of [
      ...fetchedFoodEvents,
      ...fetchedActivityEvents,
      ...regenFoodEvents,
      ...regenActivityEvents,
    ]) {
      if (!map.has(e.eventId)) map.set(e.eventId, e.venueType ?? null);
    }
    return map;
  }, [
    allStoredEvents,
    regenFoodEvents,
    regenActivityEvents,
    fetchedFoodEvents,
    fetchedActivityEvents,
  ]);
  const showPollOptions = visiblePoll?.status === "open";
  const locationAreaOptions = useMemo(
    () => buildLocationAreaOptions(locationAreaLabels),
    [locationAreaLabels],
  );
  const selectedLocationArea = useMemo(
    () =>
      selectedLocationAreaKey
        ? locationAreaOptions.find((area) => area.key === selectedLocationAreaKey) ?? null
        : null,
    [locationAreaOptions, selectedLocationAreaKey],
  );
  const displayEvents = showPollOptions && visiblePoll
    ? visiblePoll.options.map((opt) => {
        const base = normalizePollOptionEvent(opt);
        if (!base.tags || base.tags.length === 0) {
          const poolEvent = [
            ...regenFoodEvents,
            ...regenActivityEvents,
            ...fetchedFoodEvents,
            ...fetchedActivityEvents,
          ].find((e) => e.eventId === base.eventId);
          if (poolEvent?.tags?.length) return { ...base, tags: poolEvent.tags };
        }
        return base;
      })
    : recommendationDisplayEvents;
  const acceptedPollOption = visiblePoll
    ? visiblePoll.options.find(
        (option) => option.eventId === getAcceptedEventIdDisplayValue(visiblePoll),
      )
    : null;
  const hiddenEvents = useMemo(
    () => allStoredEvents.filter((event) => rejectedIds.has(event.eventId)),
    [allStoredEvents, rejectedIds],
  );
  const showLocationAreaFilters = !showPollOptions && locationAreaOptions.length > 0;
  const locationFilterUnavailableMessage = useMemo(() => {
    if (showPollOptions || recommendationDisplayEvents.length === 0 || showLocationAreaFilters) {
      return null;
    }
    if (venueCacheReady === false) {
      return "Finding neighborhood filters...";
    }
    return "Neighborhood filtering is not available for this city yet.";
  }, [
    recommendationDisplayEvents.length,
    showLocationAreaFilters,
    showPollOptions,
    venueCacheReady,
  ]);
  const hasAnyChatRecommendations =
    hasFetchedRecommendations ||
    fetchedFoodEvents.length > 0 ||
    fetchedActivityEvents.length > 0 ||
    regenFoodEvents.length > 0 ||
    regenActivityEvents.length > 0 ||
    allStoredEvents.length > 0;
  const pollMatchesCurrentRecommendations = pollMatchesEventIds(
    visiblePoll,
    recommendationEvents.map((event) => event.eventId),
  );
  const canCreatePoll = visiblePoll?.status !== "open";
  const canStartRecommendationPoll = !emptyLocationSearch && canCreatePoll && recommendationEvents.length === EVENT_POLL_OPTION_COUNT;
  const canCreateCustomPoll = canCreatePoll && customPollCandidateEvents.length >= EVENT_POLL_OPTION_COUNT;

  const handleVote = async (eventId: string) => {
    if (!visiblePoll) return;
    setPollLoadingEventId(eventId);
    try {
      await castVote({
        pollId: visiblePoll._id as Id<"event_polls">,
        eventId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit vote";
      toast.error("Could not submit vote", { description: message });
    } finally {
      setPollLoadingEventId(null);
    }
  };

  const handleCreateRecommendationPoll = async () => {
    setCreatingRecommendationPoll(true);
    try {
      await createPoll({
        chatId: chatId as Id<"chats">,
        source: "recommendation",
        options: recommendationEvents.map((event) => toSuggestionPollOption(event)),
      });
      toast.success("Poll created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create poll";
      toast.error("Could not create poll", { description: message });
    } finally {
      setCreatingRecommendationPoll(false);
    }
  };

  const handleCreateCustomPoll = async (events: NormalizedEvent[]) => {
    setCreatingCustomPoll(true);
    try {
      await createPoll({
        chatId: chatId as Id<"chats">,
        source: "manual",
        options: events.map((event) => toSuggestionPollOption(event)),
      });
      setCreateDialogOpen(false);
      toast.success("Poll created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create poll";
      toast.error("Could not create poll", { description: message });
    } finally {
      setCreatingCustomPoll(false);
    }
  };

  const handleClosePoll = async () => {
    if (!visiblePoll || !visiblePoll.canClose) return;
    setClosingPoll(true);
    try {
      await closePoll({
        pollId: visiblePoll._id as Id<"event_polls">,
      });
      toast.success("Poll closed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to close poll";
      toast.error("Could not close poll", { description: message });
    } finally {
      setClosingPoll(false);
    }
  };

  const handleClearPoll = async () => {
    if (!visiblePoll || visiblePoll.status !== "closed") return;
    const pollId = visiblePoll._id;
    setClearedPollId(pollId);
    setClearingPoll(true);
    try {
      await dismissPoll({
        pollId: pollId as Id<"event_polls">,
      });
    } catch (err) {
      setClearedPollId((current) => (current === pollId ? null : current));
      const message = err instanceof Error ? err.message : "Failed to clear poll";
      toast.error("Could not clear poll", { description: message });
    } finally {
      setClearingPoll(false);
    }
  };

  const handleToggleShortlist = async (event: SuggestedEventItem) => {
    setShortlistLoadingId(event.eventId);
    try {
      if (shortlistedEventIds.has(event.eventId)) {
        await removeShortlist({
          chatId: chatId as Id<"chats">,
          eventId: event.eventId,
        });
      } else {
        await shortlistEvent({
          chatId: chatId as Id<"chats">,
          event: toShortlistEventSnapshot(event),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update shortlist";
      toast.error("Could not update shortlist", { description: message });
    } finally {
      setShortlistLoadingId(null);
    }
  };

  const handleFeedback = async (
    event: SuggestedEventItem,
    feedbackType: "accept" | "reject" | "more-like-this",
  ) => {
    setFeedbackLoadingId(event.eventId);
    setClarifyQuestion(null);

    // --- Immediate optimistic rank shift (before any await) ---
    // Use the type-specific pool directly — no filtering needed since pools are pre-split.
    const currentPool = (() => {
      if (activeVenueType === "food") {
        const base = regenFoodEventsRef.current.length > 0 ? regenFoodEventsRef.current : fetchedFoodEventsRef.current;
        return base.length > 0 ? base : persistedRecommendationEventsRef.current.filter(e => e.venueType === "food");
      }
      if (activeVenueType === "activity") {
        const base = regenActivityEventsRef.current.length > 0 ? regenActivityEventsRef.current : fetchedActivityEventsRef.current;
        return base.length > 0 ? base : persistedRecommendationEventsRef.current.filter(e => e.venueType !== "food");
      }
      // mixed
      const fp = regenFoodEventsRef.current.length > 0 ? regenFoodEventsRef.current : fetchedFoodEventsRef.current;
      const ap = regenActivityEventsRef.current.length > 0 ? regenActivityEventsRef.current : fetchedActivityEventsRef.current;
      return [...fp, ...ap];
    })();

    if (currentPool.length === 0) {
      console.warn(`[panel-feedback] ⚠️ pool is EMPTY — no fetched or persisted events. Feedback will be submitted but no reranking possible.`);
    } else if (!currentPool.find((e) => e.eventId === event.eventId)) {
      console.warn(`[panel-feedback] ⚠️ clicked event "${event.title}" NOT found in pool — rank shift will not affect display order`);
    }

    // Accept (poll winner) ends the recommendation session — no frontend reranking,
    // just persist to DB so the backend profile can learn from it.
    if (feedbackType !== "accept") {
      // Ensure every event in the pool has a score.
      currentPool.forEach((e) => {
        if (!rankScoresRef.current.has(e.eventId)) {
          rankScoresRef.current.set(e.eventId, 0);
        }
      });

      // Per-tag scoring — mirrors the backend: ±SCORE_SHIFT per matching tag.
      // Clicked event: ±8 × tagCount. Similar events: ±8 × matchingTagCount.
      const direction = feedbackType === "reject" ? -1 : 1;
      const poolEventForTags = currentPool.find((e) => e.eventId === event.eventId);
      const clickedTags = poolEventForTags?.tags ?? event.tags ?? [];

      const clickedScore = rankScoresRef.current.get(event.eventId) ?? 0;
      rankScoresRef.current.set(event.eventId, clickedScore + direction * SCORE_SHIFT * Math.max(1, clickedTags.length));

      for (const other of currentPool) {
        if (other.eventId === event.eventId) continue;
        const otherTags = other.tags ?? [];
        const matchingCount = otherTags.filter((t) => clickedTags.includes(t)).length;
        if (matchingCount === 0) continue;
        const otherScore = rankScoresRef.current.get(other.eventId) ?? 0;
        rankScoresRef.current.set(other.eventId, otherScore + direction * SCORE_SHIFT * matchingCount);
      }

      const sortedPool = [...currentPool].sort(
        (a, b) => (rankScoresRef.current.get(b.eventId) ?? 0) - (rankScoresRef.current.get(a.eventId) ?? 0),
      );
      console.log(`[pool:feedback] "${feedbackType}" on "${event.title}" → reranked ${sortedPool.length} | activeVenueType=${String(activeVenueType)}`);
      if (sortedPool.length > 0) {
        if (activeVenueType === "food") {
          setRegenFoodEventsWithRef(sortedPool);
        } else if (activeVenueType === "activity") {
          setRegenActivityEventsWithRef(sortedPool);
        } else {
          setRegenFoodEventsWithRef(sortedPool.filter(e => e.venueType === "food"));
          setRegenActivityEventsWithRef(sortedPool.filter(e => e.venueType !== "food"));
        }
      }
    }

    try {
      // Mark this eventId as locally handled before the DB write so the
      // external-reject effect can skip it when feedbackList updates reactively.
      if (feedbackType === "reject") {
        locallyHandledRejectIdsRef.current.add(event.eventId);
      }
      await submitFeedback({ eventId: event.eventId, chatId: chatId as Id<"chats">, feedbackType });
    } catch (err) {
      console.error("Failed to process feedback:", err);
      // Remove the guard entry if the write failed — the rejection wasn't persisted.
      locallyHandledRejectIdsRef.current.delete(event.eventId);
    } finally {
      setFeedbackLoadingId(null);
    }
  };

  // Keep the context handler ref always current (runs on every render, no re-renders triggered).
  handleFeedbackRef.current = handleFeedback;

  // Register a stable feedback handler with the recommendation context so ChatEventCards
  // can trigger panel feedback via the shared pool.
  useEffect(() => {
    if (!recommendationPool) return;
    recommendationPool._setFeedbackHandler(async (shared, feedbackType) => {
      if (!handleFeedbackRef.current) return;
      // Convert SharedRecommendedEvent → SuggestedEventItem for the panel's handler.
      const item: SuggestedEventItem = {
        eventId: shared.eventId,
        title: shared.title,
        description: shared.description ?? null,
        startTime: shared.startTime ?? null,
        startLabel: shared.startLabel ?? null,
        venueName: shared.venueName ?? null,
        venueCity: shared.venueCity ?? null,
        venueNeighborhood: shared.venueNeighborhood ?? null,
        venueCountry: shared.venueCountry ?? null,
        source: shared.source,
        url: shared.url ?? null,
        status: (shared.status ?? undefined) as SuggestedEventItem["status"],
        budgetBucket: (shared.budgetBucket ?? undefined) as SuggestedEventItem["budgetBucket"],
        genre: shared.genre ?? null,
        venueType: shared.venueType ?? null,
        openHours: shared.openHours ?? null,
        tags: shared.tags ?? [],
      };
      await handleFeedbackRef.current(item, feedbackType);
    });
  }, [recommendationPool]);

  const handleDownloadCalendar = (event: SuggestedEventItem) => {
    const payload = buildCalendarIcsPayload(event);
    if (!payload) {
      toast.error("Calendar file unavailable", {
        description: "This event is missing a valid start time.",
      });
      return;
    }

    downloadCalendarIcs(payload);
    toast.success("Calendar file ready", {
      description: "Open the downloaded .ics to add it to your calendar.",
    });
  };

  const handleFetch = useCallback(async (opts?: {
    clearStoredInPlanningWindow?: boolean;
    preserveRegenContext?: boolean;
    isRegen?: boolean;
    locationArea?: string;
  }) => {
    const fetchSequence = ++fetchSequenceRef.current;
    console.log(`[fetch:start] isRegen=${String(opts?.isRegen)} preserveRegenContext=${String(opts?.preserveRegenContext)}`);
    setError(null);
    setLoading(true);
    if (!opts?.preserveRegenContext) {
      setRegenFoodEventsWithRef([]);
      setRegenActivityEventsWithRef([]);
      setClarifyQuestion(null);
    }
    try {
      const res = await findEvents({
        chatId: chatId as Id<"chats">,
        locationArea: opts?.locationArea,
        clearStoredInPlanningWindow: opts?.clearStoredInPlanningWindow ?? false,
        isRegen: opts?.isRegen,
        ignoreMissingCalendars: import.meta.env.VITE_E2E === "1",
        // No venueTypeFilter — always fetch both types so both pools stay populated.
      });
      if (fetchSequence !== fetchSequenceRef.current) return;
      if (res.error) {
        setError(res.error);
      } else {
        const rankedFood = ((Array.isArray(res.rankedFoodEvents) ? res.rankedFoodEvents : []) as NormalizedEvent[])
          .filter(isSearchRecommendationEvent);
        const rankedActivity = ((Array.isArray(res.rankedActivityEvents) ? res.rankedActivityEvents : []) as NormalizedEvent[])
          .filter(isSearchRecommendationEvent);

        // Extract backend scores for both pools before normalizing.
        const backendFoodScores = new Map<string, number>(
          (rankedFood as Array<NormalizedEvent & { rankScore?: number }>).map(e => [e.eventId, e.rankScore ?? 0])
        );
        const backendActivityScores = new Map<string, number>(
          (rankedActivity as Array<NormalizedEvent & { rankScore?: number }>).map(e => [e.eventId, e.rankScore ?? 0])
        );

        const normalizedFood = rankedFood.map(normalizeRecommendedEvent);
        const normalizedActivity = rankedActivity.map(normalizeRecommendedEvent);
        const hasRecommendations = normalizedFood.length > 0 || normalizedActivity.length > 0;
        const searchLocation = typeof res.searchLocation === "string" ? res.searchLocation.trim() : "";
        const emptySearchLocation = opts?.locationArea?.trim() || searchLocation;
        console.log(`[fetch] food: ${normalizedFood.length}, activity: ${normalizedActivity.length}`);

        const nextLocationAreaLabels = Array.isArray(res.locationAreaOptions)
          ? (res.locationAreaOptions as unknown[]).filter((label): label is string => typeof label === "string")
          : [];
        if (hasRecommendations || !emptySearchLocation) {
          setEmptyLocationSearch(null);
          setLocationAreaLabels(nextLocationAreaLabels);
          setFetchedFoodEventsWithRef(normalizedFood);
          setFetchedActivityEventsWithRef(normalizedActivity);
        } else {
          setEmptyLocationSearch(emptySearchLocation);
        }
        console.log(`[fetch:result] food=${normalizedFood.length} activity=${normalizedActivity.length} preserveRegenContext=${String(opts?.preserveRegenContext)}`);
        setHasFetchedRecommendations(true);

        if (!hasRecommendations && emptySearchLocation) {
          setRegenFoodEventsWithRef([]);
          setRegenActivityEventsWithRef([]);
        } else if (!opts?.preserveRegenContext) {
          // Full reset: seed scores from backend.
          normalizedFood.forEach(e => rankScoresRef.current.set(e.eventId, backendFoodScores.get(e.eventId) ?? 0));
          normalizedActivity.forEach(e => rankScoresRef.current.set(e.eventId, backendActivityScores.get(e.eventId) ?? 0));
          setRegenFoodEventsWithRef([]);
          setRegenActivityEventsWithRef([]);
        } else {
          // Background re-fetch: reset ALL scores to new backend values, then replay
          // session feedback. This ensures backend score changes (distance from midpoint
          // updates, preference changes, etc.) take effect for existing events too.
          const allNormalized = [...normalizedFood, ...normalizedActivity];
          const allBackendScores = new Map([...backendFoodScores, ...backendActivityScores]);

          allNormalized.forEach(e => {
            rankScoresRef.current.set(e.eventId, allBackendScores.get(e.eventId) ?? 0);
          });

          const tagLookup = new Map<string, string[]>();
          for (const e of [...regenFoodEventsRef.current, ...regenActivityEventsRef.current,
                           ...fetchedFoodEventsRef.current, ...fetchedActivityEventsRef.current]) {
            if (e.tags?.length) tagLookup.set(e.eventId, e.tags as string[]);
          }
          for (const e of allNormalized) {
            if (e.tags?.length) tagLookup.set(e.eventId, e.tags as string[]);
          }

          for (const event of allNormalized) {
            const eventTags = (event.tags ?? []) as string[];
            if (eventTags.length === 0) continue;
            for (const fb of feedbackListRef.current) {
              if (fb.feedbackType === "accept") continue;
              const fbTags = tagLookup.get(fb.eventId) ?? [];
              if (fbTags.length === 0) continue;
              const matchingCount = eventTags.filter(t => fbTags.includes(t)).length;
              if (matchingCount === 0) continue;
              const fbDirection = fb.feedbackType === "reject" ? -1 : 1;
              rankScoresRef.current.set(event.eventId, (rankScoresRef.current.get(event.eventId) ?? 0) + fbDirection * SCORE_SHIFT * matchingCount);
            }
          }

          const sortByScore = (arr: SuggestedEventItem[]) =>
            [...arr].sort((a, b) => (rankScoresRef.current.get(b.eventId) ?? 0) - (rankScoresRef.current.get(a.eventId) ?? 0));
          setRegenFoodEventsWithRef(sortByScore(normalizedFood));
          setRegenActivityEventsWithRef(sortByScore(normalizedActivity));
          console.log(`[pool:regen] food=${normalizedFood.length} activity=${normalizedActivity.length}`);
        }
      }
    } catch (err) {
      if (fetchSequence !== fetchSequenceRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      if (fetchSequence === fetchSequenceRef.current) setLoading(false);
    }
  }, [chatId, findEvents]);

  const handleLocationAreaSelect = (area: LocationAreaOption | null) => {
    setSelectedLocationAreaKey(area?.key ?? null);
    setEmptyLocationSearch(null);
    void handleFetch({
      locationArea: area?.label,
      preserveRegenContext: false,
    });
  };

  const handleClearEmptyLocationSearch = () => {
    setEmptyLocationSearch(null);
    setSelectedLocationAreaKey(null);
  };

  // Keep ref current so effects defined before this useCallback can safely call it.
  handleFetchRef.current = handleFetch;

  useEffect(() => {
    // Auto-fetch on mount is gated on the chat having prior recommendation history.
    // Brand-new groups must not populate the panel until the user explicitly clicks
    // "Find Events" (issue #310). The decision runs at most once per mount, once the
    // messages query has resolved.
    if (messages === undefined) return;
    if (didAutoFetchRef.current) return;
    didAutoFetchRef.current = true;
    const hasLocalStorage = regenFoodEventsRef.current.length > 0 || regenActivityEventsRef.current.length > 0;
    if (allStoredEvents.length === 0 && !hasLocalStorage) {
      return;
    }
    void handleFetch({ preserveRegenContext: hasLocalStorage });
  }, [handleFetch, messages, allStoredEvents]);

  useEffect(() => {
    if (userEventPreferences === undefined) return;

    const nextSignature = JSON.stringify({
      preferredEventTypes: [...(userEventPreferences?.preferredEventTypes ?? [])].sort(),
      negativeEventTypes: [...(userEventPreferences?.negativeEventTypes ?? [])].sort(),
    });

    if (lastPreferenceSignatureRef.current === null) {
      lastPreferenceSignatureRef.current = nextSignature;
      return;
    }

    if (lastPreferenceSignatureRef.current !== nextSignature) {
      lastPreferenceSignatureRef.current = nextSignature;
      void handleFetch({ preserveRegenContext: true });
    }
  }, [handleFetch, userEventPreferences]);

  // Re-fetch and rerank whenever the AI calls findGroupAvailableEvents (a new event query).
  // Tied to tool call count so feedback reranking — which never adds new messages — cannot trigger this.
  useEffect(() => {
    console.log(`[fetch:countEffect] count=${findEventsCallCount} lastRef=${String(lastFindEventsCallCountRef.current)} detectedVenueType=${String(detectedQueryVenueType)}`);
    if (findEventsCallCount === 0) return;

    if (lastFindEventsCallCountRef.current === null) {
      lastFindEventsCallCountRef.current = findEventsCallCount;
      const poolEmpty = fetchedFoodEventsRef.current.length === 0 && fetchedActivityEventsRef.current.length === 0 &&
          regenFoodEventsRef.current.length === 0 && regenActivityEventsRef.current.length === 0;
      if (poolEmpty) {
        console.log(`[fetch:countEffect] initial-load pool empty → fetching`);
        void handleFetch({ preserveRegenContext: false, isRegen: true });
      }
      return;
    }

    if (findEventsCallCount > lastFindEventsCallCountRef.current) {
      console.log(`[fetch:countEffect] count increased ${lastFindEventsCallCountRef.current} → ${findEventsCallCount} → fetching`);
      lastFindEventsCallCountRef.current = findEventsCallCount;
      void handleFetch({ preserveRegenContext: true, isRegen: true });
    } else {
      console.log(`[fetch:countEffect] count=${findEventsCallCount} did not increase over lastRef=${lastFindEventsCallCountRef.current} → SUPPRESSED`);
    }
  }, [handleFetch, findEventsCallCount, detectedQueryVenueType]);

  // Reactively re-rank when the warm cache adds new places or confirms new tags.
  // Uses isRegen:true so the backend reads from DB only (no external API calls).
  useEffect(() => {
    if (!nonTicketStats) return;
    const { count, taggedCount } = nonTicketStats;
    if (lastNonTicketStatsRef.current === null) {
      lastNonTicketStatsRef.current = { count, taggedCount };
      return;
    }
    const prev = lastNonTicketStatsRef.current;
    if (count > prev.count || taggedCount > prev.taggedCount) {
      lastNonTicketStatsRef.current = { count, taggedCount };
      void handleFetch({ isRegen: true, preserveRegenContext: true });
    }
  }, [nonTicketStats, handleFetch]);

  // Fire a final comprehensive re-fetch when the warm cache fully completes.
  // This captures timed events (Ticketmaster/Yelp) which are stored in parallel with
  // Google Places — they finish after the nonTicketStats reactive updates have already fired.
  useEffect(() => {
    if (venueCacheReady === undefined) return;
    const prev = lastVenueCacheReadyRef.current;
    lastVenueCacheReadyRef.current = venueCacheReady;
    if (venueCacheReady === true && prev !== true) {
      // Only bootstrap when pool is empty. If data is already present, type-specific
      // effects (clearing, findEventsCallCount) are managing the pool — don't clobber them
      // with a stale-venueType fetch triggered mid-stream of another query.
      const poolEmpty = fetchedFoodEventsRef.current.length === 0 && fetchedActivityEventsRef.current.length === 0 &&
        regenFoodEventsRef.current.length === 0 && regenActivityEventsRef.current.length === 0;
      if (poolEmpty) {
        console.log(`[fetch:cacheReady] prev=${String(prev)} → fetching | activeVenueType=${String(activeVenueType)}`);
        void handleFetchRef.current?.({ isRegen: true, preserveRegenContext: true });
      } else {
        console.log(`[fetch:cacheReady] prev=${String(prev)} → pool populated, skipping`);
      }
    }
  }, [venueCacheReady]);

  useEffect(() => {
    const wasCollapsed = wasCollapsedRef.current;
    wasCollapsedRef.current = collapsed;
    if (wasCollapsed && !collapsed) {
      if (regenFoodEventsRef.current.length > 0 || regenActivityEventsRef.current.length > 0) return;
      void handleFetch({ preserveRegenContext: true });
    }
  }, [collapsed, handleFetch]);

  // When a rejection arrives from an external source (not routed through this panel's
  // handleFeedback), apply the same local score shift so the display stays consistent.
  useEffect(() => {
    if (prevRejectedSizeRef.current === -1) {
      prevRejectedSizeRef.current = rejectedIdsSize;
      return;
    }
    if (rejectedIdsSize > prevRejectedSizeRef.current && feedbackLoadingId === null) {
      prevRejectedSizeRef.current = rejectedIdsSize;
      const latestRejection = [...feedbackList]
        .filter((f) => f.feedbackType === "reject")
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      if (!latestRejection) return;

      // Skip if handleFeedback already processed this rejection in this cycle.
      if (locallyHandledRejectIdsRef.current.has(latestRejection.eventId)) {
        locallyHandledRejectIdsRef.current.delete(latestRejection.eventId);
        return;
      }

      const activeRegenRef = activeVenueType === "food" ? regenFoodEventsRef : activeVenueType === "activity" ? regenActivityEventsRef : regenFoodEventsRef;
      const activeFetchedRef = activeVenueType === "food" ? fetchedFoodEventsRef : activeVenueType === "activity" ? fetchedActivityEventsRef : fetchedFoodEventsRef;
      const pool = activeRegenRef.current.length > 0 ? activeRegenRef.current : activeFetchedRef.current;
      const rejectedItem = pool.find((e) => e.eventId === latestRejection.eventId);
      if (!rejectedItem) {
        console.warn(`[external-reject] event "${latestRejection.eventId}" not found in pool — skipping score update`);
        return;
      }

      // Ensure all pool items have a score.
      pool.forEach((e) => {
        if (!rankScoresRef.current.has(e.eventId)) {
          rankScoresRef.current.set(e.eventId, 0);
        }
      });

      // Per-tag scoring: -SCORE_SHIFT × tagCount for rejected event, -SCORE_SHIFT × matchingCount for similar.
      const clickedTags = rejectedItem.tags ?? [];
      const rejScore = rankScoresRef.current.get(rejectedItem.eventId) ?? 0;
      rankScoresRef.current.set(rejectedItem.eventId, rejScore - SCORE_SHIFT * Math.max(1, clickedTags.length));
      for (const other of pool) {
        if (other.eventId === rejectedItem.eventId) continue;
        const otherTags = other.tags ?? [];
        const matchingCount = otherTags.filter((t) => clickedTags.includes(t)).length;
        if (matchingCount === 0) continue;
        const otherScore = rankScoresRef.current.get(other.eventId) ?? 0;
        rankScoresRef.current.set(other.eventId, otherScore - SCORE_SHIFT * matchingCount);
      }

      const sorted = [...pool].sort(
        (a, b) => (rankScoresRef.current.get(b.eventId) ?? 0) - (rankScoresRef.current.get(a.eventId) ?? 0),
      );
      console.log(`[pool:externalReject] "${rejectedItem.title}" → reranked ${sorted.length} | activeVenueType=${String(activeVenueType)}`);
      if (activeVenueType === "food") setRegenFoodEventsWithRef(sorted);
      else if (activeVenueType === "activity") setRegenActivityEventsWithRef(sorted);
      else setRegenFoodEventsWithRef(sorted); // fallback for mixed
    } else {
      prevRejectedSizeRef.current = rejectedIdsSize;
    }
  }, [rejectedIdsSize, feedbackLoadingId, feedbackList, chatId, eventVenueTypeMap, activeVenueType]);

  // Push the current display events to the shared recommendation context so ChatEventCards
  // can show the same ranked pool without managing its own state.
  // Guard: only call _setDisplayEvents when event IDs or order actually change to prevent
  // an infinite render loop (non-memoized arrays would re-trigger on every render).
  const lastPushedIdsRef = useRef<string>("");
  useEffect(() => {
    if (!recommendationPool) return;
    // Don't push while pool is empty (fetch in-flight) — keep existing displayEvents
    // so chat cards don't fall back to payload.events during a venue-type transition.
    const key = fullRankedPool.map((e) => e.eventId).join(",");
    if (fullRankedPool.length === 0) {
      console.log(`[push] BLOCKED:empty | activeVenueType=${activeVenueType ?? "null"} detected=${String(detectedQueryVenueType)} regenFood=${regenFoodEvents.length} regenActivity=${regenActivityEvents.length} fetchedFood=${fetchedFoodEvents.length} fetchedActivity=${fetchedActivityEvents.length}`);
      return;
    }
    if (key === lastPushedIdsRef.current) {
      return;
    }
    // Guard: don't push events of the wrong venue type.
    const wrongTypeEvents = activeVenueType ? fullRankedPool.filter((e) => e.venueType !== activeVenueType) : [];
    if (wrongTypeEvents.length > 0) {
      console.log(`[push] BLOCKED:wrongType | expected=${activeVenueType ?? "null"} detected=${String(detectedQueryVenueType)} wrong=${wrongTypeEvents.length}/${fullRankedPool.length}`);
      return;
    }
    lastPushedIdsRef.current = key;
    const pushedTypes = [...new Set(fullRankedPool.map(e => e.venueType))].join(",");
    console.log(`[push] PUSHING ${fullRankedPool.length} events | types=[${pushedTypes}] | activeVenueType=${activeVenueType ?? "null"} detected=${String(detectedQueryVenueType)}`);
    const shared: SharedRecommendedEvent[] = fullRankedPool.map((e) => ({
      eventId: e.eventId,
      title: e.title,
      description: e.description,
      startTime: e.startTime,
      startLabel: e.startLabel ?? e.startTime ?? null,
      venueName: e.venueName,
      venueCity: e.venueCity,
      venueNeighborhood: e.venueNeighborhood,
      venueCountry: e.venueCountry,
      source: e.source,
      url: e.url,
      status: e.status ?? null,
      budgetBucket: e.budgetBucket ?? null,
      genre: e.genre,
      venueType: e.venueType,
      openHours: e.openHours,
      tags: e.tags,
      score: rankScoresRef.current.get(e.eventId) ?? 0,
    }));
    recommendationPool._setDisplayEvents(shared);
  }, [recommendationPool, fullRankedPool, activeVenueType]);

  // Persist the current ranked pool to localStorage so it can be restored on page reload.
  // Only save fetch or feedback-driven pools (not the bare persisted message events)
  // so that unranked original data doesn't overwrite a user-curated order.
  useEffect(() => {
    if (blockRecommendationDisplay) return;
    const foodToSave = regenFoodEvents.length > 0 ? regenFoodEvents : fetchedFoodEvents;
    const actToSave = regenActivityEvents.length > 0 ? regenActivityEvents : fetchedActivityEvents;
    try {
      if (foodToSave.length > 0) localStorage.setItem(`reco_food_events_${chatId}`, JSON.stringify(foodToSave));
      if (actToSave.length > 0) localStorage.setItem(`reco_activity_events_${chatId}`, JSON.stringify(actToSave));
      if (rankScoresRef.current.size > 0) {
        localStorage.setItem(`reco_scores_${chatId}`, JSON.stringify(Object.fromEntries(rankScoresRef.current)));
      }
    } catch {}
  }, [blockRecommendationDisplay, chatId, regenFoodEvents, regenActivityEvents, fetchedFoodEvents, fetchedActivityEvents]);

  const headerEl = (
    <div className="flex items-start justify-between gap-2">
      <RightPanelToggle
        collapsed={collapsed}
        focused={focused}
        onToggle={onToggle}
      >
        Suggested Events
      </RightPanelToggle>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {canStartRecommendationPoll && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs"
            disabled={creatingRecommendationPoll}
            onClick={() => void handleCreateRecommendationPoll()}
          >
            Start Poll
          </Button>
        )}
        {canCreatePoll && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs"
            disabled={!canCreateCustomPoll || creatingCustomPoll}
            onClick={() => setCreateDialogOpen(true)}
          >
            Custom Poll
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void handleFetch()}
          disabled={loading}
          aria-label="Find available events"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <>
        <div className="flex flex-col p-3 gap-1 shrink-0">
          {headerEl}
          <p className="text-[10px] text-muted-foreground">
            {pollSummaryText(visiblePoll) ??
              (emptyLocationSearch
                ? `No events found for ${emptyLocationSearch}`
                : displayEvents.length > 0
                ? `${displayEvents.length} recommendations ready`
                : hasAnyChatRecommendations
                  ? "No recommendations yet"
                  : "No events suggested yet")}
          </p>
        </div>
        <CreateEventPollDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          candidateEvents={customPollCandidateEvents}
          isCreating={creatingCustomPoll}
          onCreate={(events) => void handleCreateCustomPoll(events)}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col flex-1 shrink min-h-0 p-3 gap-2 overflow-auto">
        {headerEl}

        {visiblePoll && (
          <div className="rounded-md border border-border/70 bg-secondary/40 p-2.5 text-xs text-foreground">
            {visiblePoll.prompt && (
              <p className="mb-1 text-sm font-medium text-foreground">
                {visiblePoll.prompt}
              </p>
            )}
            <div>
              {pollSummaryText(visiblePoll)}
              {!visiblePoll.resultsVisible && (
                <span className="block text-muted-foreground">
                  Results stay hidden until you cast your vote.
                </span>
              )}
              {visiblePoll.status === "closed" &&
                getPollResolutionDisplayState(visiblePoll) === "no_consensus" &&
                visiblePoll.noConsensusMessage && (
                  <p className="mt-1 text-sm leading-5 text-foreground/85">
                    {visiblePoll.noConsensusMessage}
                  </p>
                )}
              {visiblePoll.status === "closed" &&
                getPollResolutionDisplayState(visiblePoll) === "accepted" &&
                acceptedPollOption && (
                  <>
                    <span className="block text-muted-foreground">
                      Accepted: {acceptedPollOption.title}
                    </span>
                    <div className="mt-2">
                      <EventRSVPPanel
                        eventId={acceptedPollOption.eventId}
                        pollId={visiblePoll._id}
                        chatId={chatId}
                        eventTitle={acceptedPollOption.title}
                        startTime={acceptedPollOption.startTime}
                        venueType={acceptedPollOption.venueType ?? undefined}
                      />
                    </div>
                  </>
                )}
              {canCreatePoll &&
                !pollMatchesCurrentRecommendations &&
                recommendationEvents.length === EVENT_POLL_OPTION_COUNT && (
                  <span className="block text-muted-foreground">
                    You can start a new poll from the current recommendations.
                  </span>
                )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {visiblePoll.canClose && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2 text-xs"
                  disabled={closingPoll}
                  onClick={() => void handleClosePoll()}
                >
                  {closingPoll ? "Closing..." : "Close Poll"}
                </Button>
              )}
              {visiblePoll.status === "closed" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2 text-xs"
                  disabled={clearingPoll}
                  onClick={() => void handleClearPoll()}
                >
                  {clearingPoll ? "Clearing..." : "Clear"}
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 py-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-xs text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void handleFetch()}>
              Retry
            </Button>
          </div>
        )}

        {emptyLocationSearch && displayEvents.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <p className="max-w-full break-words text-xs text-muted-foreground">
              No events found for "{emptyLocationSearch}". Check the city name or clear this location search.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearEmptyLocationSearch}
            >
              Clear search
            </Button>
          </div>
        )}

        {displayEvents.length === 0 && !loading && !emptyLocationSearch && (
          <div className="flex flex-col items-center gap-2 py-4">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              {hasAnyChatRecommendations
                ? "No recommendations yet. Find events that fit everyone\u2019s schedule."
                : "No events suggested yet. Click Find Events to get started."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleFetch()}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Find Events
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-2 py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Searching events...</p>
          </div>
        )}

        {clarifyQuestion && (
          <div className="rounded-md border border-status-warning/35 bg-status-warning/12 p-2.5 text-xs text-foreground">
            {clarifyQuestion}
          </div>
        )}

        {displayEvents.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {displayEvents.length} recent event{displayEvents.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {hiddenEvents.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHidden((v) => !v)}
                    className="h-6 px-2 text-xs text-muted-foreground"
                  >
                    {showHidden ? "Hide rejected" : `Show hidden (${hiddenEvents.length})`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleFetch({ locationArea: selectedLocationArea?.label })}
                  disabled={loading}
                  className="h-6 px-2 text-xs"
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
            {showLocationAreaFilters && (
              <div
                className="flex flex-wrap gap-1"
                aria-label="Filter suggested events by area"
              >
                <Button
                  type="button"
                  variant={selectedLocationAreaKey === null ? "secondary" : "outline"}
                  aria-pressed={selectedLocationAreaKey === null}
                  size="sm"
                  className="h-6 rounded-full px-2 text-[11px]"
                  onClick={() => handleLocationAreaSelect(null)}
                >
                  All
                </Button>
                {locationAreaOptions.map((area) => (
                  <Button
                    key={area.key}
                    type="button"
                    variant={
                      selectedLocationAreaKey === area.key ? "secondary" : "outline"
                    }
                    aria-pressed={selectedLocationAreaKey === area.key}
                    size="sm"
                    className="h-6 rounded-full px-2 text-[11px]"
                    onClick={() => handleLocationAreaSelect(area)}
                  >
                    {area.label}
                  </Button>
                ))}
              </div>
            )}
            {locationFilterUnavailableMessage && (
              <p className="text-[11px] text-muted-foreground">
                {locationFilterUnavailableMessage}
              </p>
            )}
            <div className="space-y-2">
              {displayEvents.map((event) => (
                <div
                  key={event.eventId}
                  data-testid="event-card"
                  id={
                    showPollOptions && visiblePoll
                      ? getEventPollOptionAnchorId(visiblePoll._id, event.eventId)
                      : undefined
                  }
                  className="block rounded-lg border p-3 overflow-hidden hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium leading-tight break-words">
                        {event.title}
                      </p>
                      {acceptedIds.has(event.eventId) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                          <ThumbsUp className="h-2.5 w-2.5" />
                          Liked
                        </span>
                      )}
                      {shortlistedEventIds.has(event.eventId) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          Shortlisted
                        </span>
                      )}
                    </div>
                    {!event.startTime ? (
                      event.openHours && event.openHours.length > 0 ? (
                        <p className="text-xs text-muted-foreground break-words flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span><span className="font-medium">Opening hours:</span> {formatOpenHours(event.openHours)}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground break-words flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Hours unavailable
                        </p>
                      )
                    ) : event.venueType !== "food" ? (
                      <p className="text-xs text-muted-foreground break-words flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(event.startTime)}
                      </p>
                    ) : null}
                    {(event.formattedAddress || event.venueName || event.venueNeighborhood || event.venueCity) && (
                      <p className="text-xs text-muted-foreground break-words flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.latitude != null && event.longitude != null ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {event.formattedAddress || [event.venueName, event.venueNeighborhood, event.venueCity].filter(Boolean).join(", ")}
                          </a>
                        ) : (
                          event.formattedAddress || [event.venueName, event.venueNeighborhood, event.venueCity].filter(Boolean).join(", ")
                        )}
                      </p>
                    )}
                    {formatBudget(event.budgetBucket) && (
                      <p className="text-xs text-muted-foreground break-words flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatBudget(event.budgetBucket)}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {formatEventSourceLabel(event.source)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => void copyInviteLink()}
                    >
                      <Link2 className="h-3 w-3" />
                      Invite
                    </Button>
                    {event.startTime && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        aria-label={`Add ${event.title} to calendar`}
                        onClick={() => handleDownloadCalendar(event)}
                      >
                        <CalendarPlus className="h-3 w-3" />
                        Calendar
                      </Button>
                    )}
                    {event.url && (
                      <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {formatEventSourceLinkLabel(event.source)}
                        </a>
                      </Button>
                    )}
                  </div>
                  {showPollOptions && visiblePoll ? (
                    <EventPollActions
                      poll={visiblePoll}
                      eventId={event.eventId}
                      onVote={(eventId) => void handleVote(eventId)}
                      loading={pollLoadingEventId === event.eventId}
                      compact
                    />
                  ) : (
                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        variant={shortlistedEventIds.has(event.eventId) ? "secondary" : "ghost"}
                        size="sm"
                        className="h-6 rounded-full px-2 text-xs"
                        disabled={shortlistLoadingId !== null}
                        aria-label={
                          shortlistedEventIds.has(event.eventId)
                            ? `Remove ${event.title} from shortlist`
                            : `Shortlist ${event.title}`
                        }
                        onClick={() => void handleToggleShortlist(event)}
                      >
                        <Star className={`h-3 w-3 ${shortlistedEventIds.has(event.eventId) ? "fill-current" : ""}`} />
                        {shortlistedEventIds.has(event.eventId) ? "Shortlisted" : "Shortlist"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={feedbackLoadingId !== null}
                        aria-label="Less like this"
                        onClick={() => void handleFeedback(event, "reject")}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={feedbackLoadingId !== null}
                        aria-label="More like this"
                        onClick={() => void handleFeedback(event, "more-like-this")}
                      >
                        <Repeat2 className="h-3 w-3" />
                      </Button>
                      {feedbackLoadingId === event.eventId && (
                        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground ml-1" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showHidden && hiddenEvents.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-1">
                  Hidden events
                </p>
                <div className="space-y-1">
                  {hiddenEvents.map((event) => (
                    <div
                      key={event.eventId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2.5 opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-tight break-words line-through text-muted-foreground">
                          {event.title}
                        </p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive mt-1">
                          <ThumbsDown className="h-2.5 w-2.5" />
                          Hidden
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs shrink-0"
                        disabled={feedbackLoadingId !== null}
                        onClick={() =>
                          void (async () => {
                            setFeedbackLoadingId(event.eventId);
                            try {
                              await submitFeedback({
                                eventId: event.eventId,
                                chatId: chatId as Id<"chats">,
                                feedbackType: "accept",
                              });
                              // Immediately inject the restored event back at the top of the display list
                              setHasFetchedRecommendations(true);
                              const setTargetRegenEvents =
                                event.venueType === "food"
                                  ? setRegenFoodEventsWithRef
                                  : setRegenActivityEventsWithRef;
                              setTargetRegenEvents((prev) => {
                                if (prev.some((e) => e.eventId === event.eventId)) return prev;
                                return [normalizeRecommendedEvent(event), ...prev];
                              });
                            } finally {
                              setFeedbackLoadingId(null);
                            }
                          })()
                        }
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!showPollOptions && shortlistedEvents.length > 0 && (
          <section className="space-y-2" aria-label="Shortlist">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">Shortlist</p>
              <p className="text-[11px] text-muted-foreground">
                {shortlistedEvents.length} saved
              </p>
            </div>
            <div className="space-y-1">
              {shortlistedEvents.map((event) => (
                <div
                  key={event.eventId}
                  className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight break-words">
                      {event.title}
                    </p>
                    {event.startTime && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTime(event.startTime)}
                      </p>
                    )}
                    {(event.venueName || event.venueNeighborhood || event.venueCity) && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[event.venueName, event.venueNeighborhood, event.venueCity].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={shortlistLoadingId !== null}
                      onClick={() => void handleToggleShortlist(event)}
                    >
                      Remove
                    </Button>
                    {event.url && (
                      <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
                        <a href={event.url} target="_blank" rel="noopener noreferrer">
                          Open
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <CreateEventPollDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        candidateEvents={customPollCandidateEvents}
        isCreating={creatingCustomPoll}
        onCreate={(events) => void handleCreateCustomPoll(events)}
      />
    </>
  );
};

export default SuggestedEvents;
