import { useState } from "react";
import { toast } from "sonner";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CalendarPlus,
  Clock3,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquarePlus,
  RefreshCw,
  Repeat2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventRSVPPanel } from "./event-rsvp-panel";
import EventPollActions from "@/polls/components/event-poll-actions";
import {
  getEventPollOptionAnchorId,
  isEventPollView,
  pollMatchesEventIds,
  type EventPollView,
} from "@/polls/lib";
import {
  formatEventSourceLabel,
  formatEventSourceLinkLabel,
} from "@/lib/event-source-presentation";
import {
  buildCalendarIcsPayload,
  downloadCalendarIcs,
} from "@/lib/calendar-ics";
import { useInviteLink } from "@/chats/hooks/use-invite-link";
import type { ToolCallPart } from "@/messages/types/tool-call";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRecommendationPool } from "@/availability/context/recommendation-context";

export type OpenHoursPeriod = {
  dayOfWeek: number; // 0 = Sunday
  openTime: string;  // "HH:MM" 24-hour
  closeTime: string; // "HH:MM" 24-hour
};

export type ChatEventCardData = {
  eventId: string;
  title: string;
  description: string | null;
  genre: string | null;
  startTime: string | null;
  startLocal: string | null;
  localDateLabel: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueNeighborhood: string | null;
  venueCountry: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  url: string | null;
  source: string;
  fitReasons: string[];
  status: string | null;
  budgetBucket: "low" | "medium" | "high" | null;
  venueType: "food" | "activity" | null;
  openHours: OpenHoursPeriod[] | null;
  tags: string[];
};

export type RankingConfidenceData = {
  score: number;
  verdict: "high" | "medium" | "low";
  memberSupportRatio: number;
  scoreGapNormalized: number;
  negativeFree: boolean;
  topCategory: string | null;
};

export type ChatEventCardsPayload = {
  summaryMessage: string | null;
  events: ChatEventCardData[];
  toolName: string;
  rankingConfidence: RankingConfidenceData | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asOptionalString(item))
    .filter((item): item is string => item !== null);
}

function parseOpenHours(value: unknown): OpenHoursPeriod[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const periods: OpenHoursPeriod[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item.dayOfWeek === "number" &&
      typeof item.openTime === "string" &&
      typeof item.closeTime === "string"
    ) {
      periods.push({ dayOfWeek: item.dayOfWeek, openTime: item.openTime, closeTime: item.closeTime });
    }
  }
  return periods.length > 0 ? periods : null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * Condense openHours into a compact display string.
 * Groups consecutive days with the same hours, e.g. "Mon–Fri 11am–10pm · Sat–Sun 10am–11pm"
 */
export function formatOpenHours(periods: OpenHoursPeriod[]): string {
  if (periods.length === 0) return "";
  // Ensure sorted by day
  const sorted = [...periods].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const groups: { label: string; time: string }[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i]!;
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j]!.openTime === start.openTime &&
      sorted[j]!.closeTime === start.closeTime &&
      sorted[j]!.dayOfWeek === sorted[j - 1]!.dayOfWeek + 1
    ) j++;
    const end = sorted[j - 1]!;
    const dayLabel =
      start.dayOfWeek === end.dayOfWeek
        ? DAY_NAMES[start.dayOfWeek] ?? ""
        : `${DAY_NAMES[start.dayOfWeek] ?? ""}–${DAY_NAMES[end.dayOfWeek] ?? ""}`;
    groups.push({ label: dayLabel, time: `${fmt12(start.openTime)}–${fmt12(start.closeTime)}` });
    i = j;
  }
  return groups.map((g) => `${g.label} ${g.time}`).join(" · ");
}

function normalizeEventCard(value: unknown): ChatEventCardData | null {
  if (!isRecord(value)) return null;

  const eventId = asOptionalString(value.eventId);
  const title = asOptionalString(value.title);
  const source = asOptionalString(value.source);

  if (!eventId || !title || !source) {
    return null;
  }

  return {
    eventId,
    title,
    description: asOptionalString(value.description),
    genre: asOptionalString(value.genre),
    // google_places venues have a virtual startTime for availability matching only — never display it.
    startTime: source === "google_places" ? null : asOptionalString(value.startTime),
    startLocal: source === "google_places" ? null : asOptionalString(value.startLocal),
    localDateLabel: source === "google_places" ? null : asOptionalString(value.localDateLabel),
    venueName: asOptionalString(value.venueName),
    venueCity: asOptionalString(value.venueCity),
    venueNeighborhood: asOptionalString(value.venueNeighborhood),
    venueCountry: asOptionalString(value.venueCountry),
    formattedAddress: asOptionalString(value.formattedAddress),
    latitude: asOptionalNumber(value.latitude),
    longitude: asOptionalNumber(value.longitude),
    googlePlaceId: asOptionalString(value.googlePlaceId),
    url: asOptionalString(value.url),
    source,
    fitReasons: asStringArray(value.fitReasons),
    status: asOptionalString(value.status),
    budgetBucket:
      value.budgetBucket === "low" || value.budgetBucket === "medium" || value.budgetBucket === "high"
        ? value.budgetBucket
        : null,
    venueType: value.venueType === "food" || value.venueType === "activity" ? value.venueType : null,
    openHours: parseOpenHours(value.openHours),
    tags: asStringArray(value.tags),
  };
}

function formatStartTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type RegenEvent = {
  eventId: string;
  title: string;
  source: string;
  url?: string | null;
  startTime?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  venueNeighborhood?: string | null;
  status?: string | null;
  genre?: string | null;
  venueType?: "food" | "activity" | null;
  openHours?: OpenHoursPeriod[] | null;
};

function regenEventToCardData(e: RegenEvent): ChatEventCardData {
  return {
    eventId: e.eventId,
    title: e.title,
    description: null,
    genre: e.genre ?? null,
    startTime: e.startTime ?? null,
    startLocal: e.startTime ? formatStartTime(e.startTime) : null,
    localDateLabel: null,
    venueName: e.venueName ?? null,
    venueCity: e.venueCity ?? null,
    venueNeighborhood: e.venueNeighborhood ?? null,
    venueCountry: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    url: e.url ?? null,
    source: e.source,
    fitReasons: [],
    status: e.status ?? null,
    budgetBucket: null,
    venueType: e.venueType ?? null,
    openHours: e.openHours ?? null,
    tags: [],
  };
}

function venueLabel(event: ChatEventCardData): string | null {
  if (event.formattedAddress) return event.formattedAddress;
  const venue = [event.venueName, event.venueCity].filter(Boolean).join(", ");
  return venue.length > 0 ? venue : null;
}

function mapsUrl(event: ChatEventCardData): string | null {
  if (event.latitude != null && event.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  return null;
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

function pollSummaryText(poll: EventPollView) {
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

function closedPollChipLabel(poll: EventPollView, eventId: string) {
  const resolution = getPollResolutionDisplayState(poll);
  const acceptedEventId = getAcceptedEventIdDisplayValue(poll);

  if (resolution === "accepted" && acceptedEventId === eventId) {
    return "Agreement reached";
  }

  if (eventId === poll.currentUserVoteEventId) {
    return "Your pick";
  }

  return "Closed";
}

function normalizePollStatus(
  status: string | null,
): "onsale" | "offsale" | "cancelled" | "postponed" | "rescheduled" | null {
  return status === "onsale" ||
    status === "offsale" ||
    status === "cancelled" ||
    status === "postponed" ||
    status === "rescheduled"
    ? status
    : null;
}

function toPollOption(event: ChatEventCardData) {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    startTime: event.startTime,
    venueName: event.venueName,
    venueCity: event.venueCity,
    venueNeighborhood: event.venueNeighborhood,
    venueCountry: event.venueCountry,
    source: event.source,
    url: event.url ?? "",
    status: normalizePollStatus(event.status),
    budgetBucket: event.budgetBucket,
    genre: event.genre,
    venueType: event.venueType ?? undefined,
  };
}

function normalizeRankingConfidence(value: unknown): RankingConfidenceData | null {
  if (!isRecord(value)) return null;
  const score = typeof value.score === "number" ? value.score : null;
  const verdictRaw = asOptionalString(value.verdict);
  const verdict =
    verdictRaw === "high" || verdictRaw === "medium" || verdictRaw === "low"
      ? verdictRaw
      : null;
  if (score === null || verdict === null) return null;
  return {
    score,
    verdict,
    memberSupportRatio:
      typeof value.memberSupportRatio === "number" ? value.memberSupportRatio : 0,
    scoreGapNormalized:
      typeof value.scoreGapNormalized === "number" ? value.scoreGapNormalized : 0,
    negativeFree: value.negativeFree === true,
    topCategory: asOptionalString(value.topCategory),
  };
}

export function getChatEventCardsPayload(
  toolCall: ToolCallPart,
): ChatEventCardsPayload | null {
  if (toolCall.state !== "output-available" || !toolCall.result) {
    return null;
  }

  if (
    toolCall.toolName !== "displayEventCards" &&
    toolCall.toolName !== "findGroupAvailableEvents" &&
    toolCall.toolName !== "createEventPoll"
  ) {
    return null;
  }

  const result = toolCall.result;
  if (!isRecord(result)) return null;

  if (
    toolCall.toolName === "findGroupAvailableEvents" &&
    asOptionalString(result.constraintStatus) !== "ok"
  ) {
    return null;
  }

  const rawEvents = Array.isArray(result.events) ? result.events : [];
  const events = rawEvents
    .map((event) => normalizeEventCard(event))
    .filter((event): event is ChatEventCardData => event !== null);

  if (events.length === 0) {
    return null;
  }

  return {
    summaryMessage:
      asOptionalString(result.summary_message) ??
      asOptionalString(result.summaryMessage) ??
      asOptionalString(result.prompt),
    events,
    toolName: toolCall.toolName,
    rankingConfidence: normalizeRankingConfidence(result.rankingConfidence),
  };
}

interface ChatEventCardsProps {
  payload: ChatEventCardsPayload;
  chatId: string;
  className?: string;
}

const ChatEventCards: React.FC<ChatEventCardsProps> = ({
  payload,
  chatId,
  className,
}) => {
  const [feedbackLoadingId, setFeedbackLoadingId] = useState<string | null>(null);
  const [pollLoadingEventId, setPollLoadingEventId] = useState<string | null>(null);
  const [closePollPending, setClosePollPending] = useState(false);
  const [createPollPending, setCreatePollPending] = useState(false);
  const [regenEvents, setRegenEvents] = useState<ChatEventCardData[]>([]);
  const [clarifyQuestion, setClarifyQuestion] = useState<string | null>(null);
  const recommendationPool = useRecommendationPool();
  // All hooks must be called before any conditional return (Rules of Hooks).
  const submitFeedbackMutation = useMutation(api.feedback_mutations.submitFeedback);
  const triggerRegeneration = useAction(api.feedback_regen_action.triggerRegeneration);
  const createPoll = useMutation(api.event_polls_mutations.createChatPoll);
  const castVote = useMutation(api.event_polls_mutations.castVote);
  const closePoll = useMutation(api.event_polls_mutations.closePoll);
  const { copyInviteLink } = useInviteLink(chatId);
  const latestPollResult = useQuery(api.event_polls_queries.getLatestForChat, {
    chatId: chatId as Id<"chats">,
  });
  const latestPoll = isEventPollView(latestPollResult)
    ? latestPollResult
    : null;

  const feedbackList = useQuery(api.feedback_queries.listForChat, { chatId: chatId as Id<"chats"> }) ?? [];

  // When a new findGroupAvailableEvents call is in-flight, suppress rendering so we
  // never show stale cards from the prior venueType while the new list is loading.
  if (recommendationPool?.isFindingGroupEvents) {
    return null;
  }
  const acceptedIds = new Set(feedbackList.filter((f) => f.feedbackType === "accept").map((f) => f.eventId));
  const isPollPayload = payload.toolName === "createEventPoll";
  const matchingPoll =
    isPollPayload &&
    pollMatchesEventIds(
      latestPoll,
      payload.events.map((event) => event.eventId),
    )
      ? latestPoll
      : null;
  const payloadEventIds = payload.events.map((event) => event.eventId);
  const recommendationPoolEvents = recommendationPool?.displayEvents ?? [];
  const recommendationPoolMatchesPayload =
    payloadEventIds.length === 0 ||
    (
      recommendationPoolEvents.length >= payloadEventIds.length &&
      payloadEventIds.every(
        (eventId, index) => recommendationPoolEvents[index]?.eventId === eventId,
      )
    );
  const hasRecommendationPoolEvents =
    recommendationPoolEvents.length > 0 && recommendationPoolMatchesPayload;
  const displayedEvents = [
    ...(hasRecommendationPoolEvents
      ? recommendationPoolEvents.map((e) => ({
          eventId: e.eventId,
          title: e.title,
          description: e.description ?? null,
          genre: e.genre ?? null,
          startTime: e.startTime ?? null,
          startLocal: e.startLabel ?? null,
          localDateLabel: null,
          venueName: e.venueName ?? null,
          venueCity: e.venueCity ?? null,
          venueNeighborhood: e.venueNeighborhood ?? null,
          venueCountry: e.venueCountry ?? null,
          formattedAddress: null,
          latitude: null,
          longitude: null,
          googlePlaceId: null,
          url: e.url ?? null,
          source: e.source,
          fitReasons: [] as string[],
          status: e.status ?? null,
          budgetBucket: null,
          venueType: e.venueType ?? null,
          openHours: (e.openHours ?? null) as OpenHoursPeriod[] | null,
          tags: e.tags ?? [],
        } satisfies ChatEventCardData))
      : regenEvents.length > 0 ? regenEvents : payload.events),
  ]
    .sort((a, b) => {
      if (hasRecommendationPoolEvents) return 0;
      const aAccepted = acceptedIds.has(a.eventId) ? 1 : 0;
      const bAccepted = acceptedIds.has(b.eventId) ? 1 : 0;
      return bAccepted - aAccepted;
    })
    .slice(0, 3);
  const canCreateRecommendationPoll =
    !isPollPayload && !matchingPoll && displayedEvents.length === 3;

  const handleFeedback = async (
    event: ChatEventCardData,
    feedbackType: "accept" | "reject" | "more-like-this",
  ) => {
    setFeedbackLoadingId(event.eventId);
    try {
      if (recommendationPool) {
        // Delegate entirely to the suggested panel's handler so both sides stay in sync.
        // The panel's handleFeedback calls submitFeedback + triggerRegeneration internally.
        await recommendationPool.handleFeedback(
          {
            eventId: event.eventId,
            title: event.title,
            description: event.description,
            startTime: event.startTime,
            startLabel: event.startLocal ?? event.localDateLabel,
            venueName: event.venueName,
            venueCity: event.venueCity,
            venueNeighborhood: event.venueNeighborhood,
            venueCountry: event.venueCountry,
            source: event.source,
            url: event.url,
            genre: event.genre,
            venueType: event.venueType,
            openHours: event.openHours,
            tags: event.tags.length > 0 ? event.tags : (event.genre ? [event.genre] : []),
            status: event.status,
          },
          feedbackType,
        );
      } else {
        // Fallback when panel is not mounted: run own submitFeedback + regen flow.
        await submitFeedbackMutation({
          eventId: event.eventId,
          chatId: chatId as Id<"chats">,
          feedbackType,
        });
        const result = await triggerRegeneration({
          chatId: chatId as Id<"chats">,
          feedbackType,
          eventId: event.eventId,
          venueType: event.venueType ?? undefined,
          eventTitle: event.genre ?? event.title,
          injectClarifyMessage: false,
        }) as { decision: { action: string; question?: string }; rankedEvents?: RegenEvent[] };
        if (result.decision.action === "regenerate" && (result.rankedEvents?.length ?? 0) > 0) {
          setRegenEvents((result.rankedEvents as RegenEvent[]).map(regenEventToCardData));
          setClarifyQuestion(null);
        } else if (result.decision.action === "clarify" && result.decision.question) {
          setClarifyQuestion(result.decision.question);
        }
      }
    } catch (err) {
      console.error("Failed to process feedback:", err);
      toast.error("Failed to process feedback");
    } finally {
      setFeedbackLoadingId(null);
    }
  };

  const handleVote = async (eventId: string) => {
    if (!matchingPoll) {
      return;
    }

    setPollLoadingEventId(eventId);
    try {
      await castVote({
        pollId: matchingPoll._id as Id<"event_polls">,
        eventId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit vote";
      toast.error("Could not submit vote", { description: message });
    } finally {
      setPollLoadingEventId(null);
    }
  };

  const handleClosePoll = async () => {
    if (!matchingPoll?.canClose) {
      return;
    }

    setClosePollPending(true);
    try {
      await closePoll({
        pollId: matchingPoll._id as Id<"event_polls">,
      });
      toast.success("Poll closed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to close poll";
      toast.error("Could not close poll", { description: message });
    } finally {
      setClosePollPending(false);
    }
  };

  const handleCreatePoll = async () => {
    if (!canCreateRecommendationPoll) return;

    setCreatePollPending(true);
    try {
      await createPoll({
        chatId: chatId as Id<"chats">,
        source: "recommendation",
        options: displayedEvents.map(toPollOption),
      });
      toast.success("Poll started");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start poll";
      toast.error("Could not start poll", { description: message });
    } finally {
      setCreatePollPending(false);
    }
  };

  const handleDownloadCalendar = (event: ChatEventCardData) => {
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

  const confidence = payload.rankingConfidence;
  const confidenceClass = confidence
    ? confidence.verdict === "high"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : confidence.verdict === "medium"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400"
    : "";

  return (
    <div className={cn("px-4 py-3", className)}>
      <div className="space-y-3">
        {(payload.summaryMessage || confidence) && (
          <div className="rounded-2xl border border-border/70 bg-secondary/60 p-4 text-sm leading-6 text-foreground shadow-sm">
            {payload.summaryMessage}
            {confidence && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    confidenceClass,
                  )}
                  title={`Member support: ${(confidence.memberSupportRatio * 100).toFixed(0)}% · Score gap: ${(confidence.scoreGapNormalized * 100).toFixed(0)}% · ${confidence.negativeFree ? "No dislikes" : "Has a dislike"}${confidence.topCategory ? ` · Top: ${confidence.topCategory}` : ""}`}
                >
                  Ranking confidence: {confidence.verdict} ({(confidence.score * 100).toFixed(0)}%)
                </span>
              </div>
            )}
          </div>
        )}

        {matchingPoll && (
          <div className="rounded-2xl border border-border/70 bg-background/80 p-3 text-xs text-foreground/85 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                {pollSummaryText(matchingPoll)}
                {!matchingPoll.resultsVisible && (
                  <span className="block text-muted-foreground">
                    Results stay hidden until you vote.
                  </span>
                )}
                {matchingPoll.status === "closed" &&
                  getPollResolutionDisplayState(matchingPoll) === "no_consensus" &&
                  matchingPoll.noConsensusMessage && (
                    <p className="mt-2 text-sm leading-5 text-foreground/85">
                      {matchingPoll.noConsensusMessage}
                    </p>
                  )}
              </div>
              {matchingPoll.canClose && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2 text-xs"
                  disabled={closePollPending}
                  onClick={() => void handleClosePoll()}
                >
                  {closePollPending ? "Closing..." : "Close Poll"}
                </Button>
              )}
            </div>
          </div>
        )}

        {canCreateRecommendationPoll && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/50 p-3 text-sm shadow-sm">
            <p className="text-sm text-foreground/85">
              Done giving feedback? Start a poll with these options.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-full"
              disabled={createPollPending}
              onClick={() => void handleCreatePoll()}
            >
              {createPollPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-3.5 w-3.5" />
              )}
              Start poll
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {displayedEvents.map((event) => {
            const openHoursLabel =
              !event.startTime && event.openHours && event.openHours.length > 0
                ? formatOpenHours(event.openHours)
                : null;
            const openHoursUnavailableLabel =
              !event.startTime && (!event.openHours || event.openHours.length === 0)
                ? "Hours unavailable"
                : null;
            const whenLabel =
              event.startTime && event.venueType !== "food"
                ? formatStartTime(event.startTime)
                : null;
            const locationLabel = venueLabel(event);
            const locationUrl = mapsUrl(event);
            const isLoading = feedbackLoadingId === event.eventId;
            const matchingPollOption =
              matchingPoll?.options.find(
                (option) => option.eventId === event.eventId,
              ) ?? null;

            return (
              <article
                key={event.eventId}
                data-testid="event-card"
                id={
                  matchingPoll
                    ? getEventPollOptionAnchorId(matchingPoll._id, event.eventId)
                    : undefined
                }
                className="rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold leading-5 text-foreground">
                          {event.title}
                        </h3>
                        {acceptedIds.has(event.eventId) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                            <ThumbsUp className="h-2.5 w-2.5" />
                            Liked
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                      {whenLabel && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          <span>{whenLabel}</span>
                        </p>
                      )}
                      {openHoursLabel && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          <span><span className="font-medium">Opening hours:</span> {openHoursLabel}</span>
                        </p>
                      )}
                      {openHoursUnavailableLabel && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          <span>{openHoursUnavailableLabel}</span>
                        </p>
                      )}
                      {locationLabel && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {locationUrl ? (
                            <a
                              href={locationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {locationLabel}
                            </a>
                          ) : (
                            <span>{locationLabel}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {event.fitReasons.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {event.fitReasons.map((reason) => (
                          <span
                            key={`${event.eventId}-${reason}`}
                            className="rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-foreground/85"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {formatEventSourceLabel(event.source)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {matchingPoll && matchingPoll.status === "open" ? (
                      <EventPollActions
                        poll={matchingPoll}
                        eventId={event.eventId}
                        onVote={(nextEventId) => void handleVote(nextEventId)}
                        loading={pollLoadingEventId === event.eventId}
                      />
                    ) : matchingPoll ? (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            getPollResolutionDisplayState(matchingPoll) ===
                              "accepted" &&
                              getAcceptedEventIdDisplayValue(matchingPoll) ===
                                event.eventId
                              ? "bg-primary text-primary-foreground"
                              : "border border-border/70 bg-background text-muted-foreground",
                          )}
                        >
                          {closedPollChipLabel(matchingPoll, event.eventId)}
                        </span>

                        {matchingPoll.resultsVisible && (
                          <span className="text-xs text-muted-foreground">
                            {matchingPollOption?.tally ?? 0} vote
                            {(matchingPollOption?.tally ?? 0) === 1
                              ? ""
                              : "s"}
                          </span>
                        )}

                        {getPollResolutionDisplayState(matchingPoll) ===
                          "no_consensus" &&
                          matchingPoll.leadingEventIds.includes(event.eventId) && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
                              Tied lead
                            </span>
                          )}
                      </div>
                    ) : !isPollPayload ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 rounded-full"
                          aria-label={`Less like this for ${event.title}`}
                          disabled={feedbackLoadingId !== null}
                          onClick={() => void handleFeedback(event, "reject")}
                        >
                          {isLoading ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ThumbsDown className="h-3.5 w-3.5" />
                          )}
                          Less
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 rounded-full"
                          aria-label={`More like ${event.title}`}
                          disabled={feedbackLoadingId !== null}
                          onClick={() => void handleFeedback(event, "more-like-this")}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                          More
                        </Button>
                      </>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {chatId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        onClick={() => void copyInviteLink()}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Invite
                      </Button>
                    )}
                    {event.startTime && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        aria-label={`Add ${event.title} to calendar`}
                        onClick={() => handleDownloadCalendar(event)}
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Calendar
                      </Button>
                    )}

                    {event.url && (
                      <Button asChild size="sm" className="h-8 gap-1.5 rounded-full">
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {formatEventSourceLinkLabel(event.source)}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {matchingPoll &&
                  getPollResolutionDisplayState(matchingPoll) === "accepted" &&
                  getAcceptedEventIdDisplayValue(matchingPoll) === event.eventId && (
                    <EventRSVPPanel
                      eventId={event.eventId}
                      pollId={matchingPoll._id}
                      chatId={chatId}
                      eventTitle={event.title}
                      startTime={event.startTime}
                      venueType={event.venueType}
                    />
                  )}
              </article>
            );
          })}
        </div>

        {clarifyQuestion && (
          <div className="rounded-2xl border border-border/70 bg-secondary/60 p-4 text-sm leading-6 text-foreground/80 shadow-sm">
            {clarifyQuestion}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatEventCards;
