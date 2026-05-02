import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EventPollActions from "../event-poll-actions";
import type { EventPollView } from "@/polls/lib";
import type { NormalizedEvent } from "../../../../convex/event_types";

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

function createPoll(overrides: Partial<EventPollView> = {}): EventPollView {
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
    options: [
      {
        ...createEvent(),
        isSelected: false,
        tally: null,
      },
    ],
    ...overrides,
  };
}

describe("EventPollActions", () => {
  it("renders a vote button and submits the selected option id", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(
      <EventPollActions
        poll={createPoll()}
        eventId="event-1"
        onVote={onVote}
        loading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Pick this for Jazz Night" }),
    ).toBeEnabled();
    expect(screen.getByText("Vote to reveal results")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Pick this for Jazz Night" }),
    );

    expect(onVote).toHaveBeenCalledWith("event-1");
  });

  it("shows tallies and leading state after results are visible", () => {
    render(
      <EventPollActions
        poll={createPoll({
          hasVoted: true,
          resultsVisible: true,
          leadingEventIds: ["event-1"],
          options: [
            {
              ...createEvent(),
              isSelected: true,
              tally: 2,
            },
          ],
        })}
        eventId="event-1"
        onVote={vi.fn()}
        loading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Your pick for Jazz Night" }),
    ).toBeEnabled();
    expect(screen.getByText("2 votes")).toBeInTheDocument();
    expect(screen.getByText("Leading")).toBeInTheDocument();
  });

  it("disables voting on closed polls", () => {
    render(
      <EventPollActions
        poll={createPoll({
          status: "closed",
          canVote: false,
          resultsVisible: true,
          options: [
            {
              ...createEvent(),
              isSelected: false,
              tally: 1,
            },
          ],
        })}
        eventId="event-1"
        onVote={vi.fn()}
        loading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Closed for Jazz Night" }),
    ).toBeDisabled();
    expect(screen.getByText("1 vote")).toBeInTheDocument();
  });
});
