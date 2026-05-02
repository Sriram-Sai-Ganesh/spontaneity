import type { NormalizedEvent } from "../../convex/event_types";

export const EVENT_POLL_OPTION_COUNT = 3;

export type EventPollOptionView = NormalizedEvent & {
  isSelected: boolean;
  tally: number | null;
};

export type EventPollView = {
  _id: string;
  source: "recommendation" | "manual";
  prompt: string | null;
  status: "open" | "closed";
  resolution?: "pending" | "accepted" | "no_consensus";
  acceptedEventId?: string | null;
  noConsensusMessage?: string | null;
  hasVoted: boolean;
  canVote: boolean;
  canClose: boolean;
  resultsVisible: boolean;
  totalEligibleVoters: number;
  totalVotes: number | null;
  currentUserVoteEventId: string | null;
  leadingEventIds: string[];
  options: EventPollOptionView[];
};

export function isEventPollView(value: unknown): value is EventPollView {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { options?: unknown[] }).options) &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

export function toPollOptionInput(event: NormalizedEvent) {
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
    image: event.image ?? null,
    tags: event.tags ?? [],
    status: event.status ?? null,
    budgetBucket: event.budgetBucket ?? null,
    genre: event.genre ?? null,
    venueType: event.venueType ?? undefined,
  };
}

export function pollMatchesEventIds(
  poll: EventPollView | null | undefined,
  eventIds: string[],
) {
  if (!poll || poll.options.length !== eventIds.length) {
    return false;
  }

  const pollEventIds = new Set(poll.options.map((option) => option.eventId));
  return eventIds.every((eventId) => pollEventIds.has(eventId));
}

export function getEventPollOptionAnchorId(pollId: string, eventId: string) {
  return `event-poll-option-${pollId}-${eventId}`;
}

export function getEventPollOptionHref(pollId: string, eventId: string) {
  return `#${getEventPollOptionAnchorId(pollId, eventId)}`;
}
