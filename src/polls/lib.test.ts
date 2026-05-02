import { describe, expect, it } from "vitest";
import {
  EVENT_POLL_OPTION_COUNT,
  getEventPollOptionHref,
  pollMatchesEventIds,
  toPollOptionInput,
  type EventPollView,
} from "./lib";
import type { NormalizedEvent } from "../../convex/event_types";

function createEvent(
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    eventId: "event-1",
    title: "Jazz Night",
    description: null,
    startTime: "2026-05-01T19:00:00.000Z",
    venueName: "Union Hall",
    venueCity: "Baltimore",
    venueCountry: "US",
    source: "ticketmaster",
    url: "https://example.com/jazz-night",
    image: null,
    tags: ["Concert"],
    status: "onsale",
    budgetBucket: "medium",
    genre: "Jazz",
    ...overrides,
  };
}

function createPoll(eventIds: string[]): EventPollView {
  return {
    _id: "poll-1",
    source: "recommendation",
    prompt: null,
    status: "open",
    hasVoted: false,
    canVote: true,
    canClose: true,
    resultsVisible: false,
    totalEligibleVoters: 3,
    totalVotes: null,
    currentUserVoteEventId: null,
    leadingEventIds: [],
    options: eventIds.map((eventId) => ({
      ...createEvent({ eventId, title: `Event ${eventId}` }),
      isSelected: false,
      tally: null,
    })),
  };
}

describe("poll helpers", () => {
  it("exports a fixed three-option poll size", () => {
    expect(EVENT_POLL_OPTION_COUNT).toBe(3);
  });

  it("normalizes poll option input fields", () => {
    expect(
      toPollOptionInput(
        createEvent({
          description: undefined,
          startTime: undefined,
          image: undefined,
          tags: undefined,
          status: undefined,
          budgetBucket: undefined,
          genre: undefined,
        }),
      ),
    ).toEqual({
      eventId: "event-1",
      title: "Jazz Night",
      description: null,
      startTime: null,
      venueName: "Union Hall",
      venueCity: "Baltimore",
      venueNeighborhood: null,
      venueCountry: "US",
      source: "ticketmaster",
      url: "https://example.com/jazz-night",
      image: null,
      tags: [],
      status: null,
      budgetBucket: null,
      genre: null,
    });
  });

  it("matches polls against event ids regardless of option order", () => {
    expect(
      pollMatchesEventIds(createPoll(["one", "two", "three"]), [
        "three",
        "one",
        "two",
      ]),
    ).toBe(true);
    expect(pollMatchesEventIds(createPoll(["one", "two"]), ["one"])).toBe(
      false,
    );
  });

  it("builds in-page links to a poll option anchor", () => {
    expect(getEventPollOptionHref("poll-9", "evt-4")).toBe(
      "#event-poll-option-poll-9-evt-4",
    );
  });
});
