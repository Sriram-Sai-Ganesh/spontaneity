import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import SuggestedEvents from "../suggested-events";
import { EVENT_POLL_OPTION_COUNT } from "@/polls/lib";
import type { NormalizedEvent } from "../../../../convex/event_types";
import type { EventPollView } from "@/polls/lib";

const mockUseAction = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQuery = vi.fn();
const mockFindEvents = vi.fn();
const mockCreatePoll = vi.fn();
const mockCastVote = vi.fn();
const mockClosePoll = vi.fn();
const mockDismissPoll = vi.fn();
const mockShortlistEvent = vi.fn();
const mockRemoveShortlist = vi.fn();
const mockCreateInvite = vi.fn();

vi.mock("convex/react", () => ({
  useAction: (...args: unknown[]) => mockUseAction(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const functionName = Symbol.for("functionName");

function getFunctionName(ref: unknown) {
  return (ref as { [key: symbol]: string })[functionName];
}

function createEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: "event-1",
    title: "Test Event",
    description: "A good fit for the group",
    startTime: "2026-05-01T19:00:00.000Z",
    venueName: "Union Hall",
    venueCity: "Baltimore",
    venueCountry: "US",
    source: "ticketmaster",
    url: "https://example.com/events/test-event",
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
    source: "manual",
    prompt: "Which option should the group choose?",
    status: "open",
    hasVoted: false,
    canVote: false,
    canClose: false,
    resultsVisible: false,
    totalEligibleVoters: 3,
    totalVotes: null,
    currentUserVoteEventId: null,
    leadingEventIds: [],
    options: [
      { ...createEvent({ eventId: "poll-1", title: "Poll One" }), isSelected: false, tally: null },
      { ...createEvent({ eventId: "poll-2", title: "Poll Two" }), isSelected: false, tally: null },
      { ...createEvent({ eventId: "poll-3", title: "Poll Three" }), isSelected: false, tally: null },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockUseAction.mockReset();
  mockUseMutation.mockReset();
  mockUseQuery.mockReset();
  mockFindEvents.mockReset();
  mockCreatePoll.mockReset();
  mockCastVote.mockReset();
  mockClosePoll.mockReset();
  mockDismissPoll.mockReset();
  mockShortlistEvent.mockReset();
  mockRemoveShortlist.mockReset();
  mockCreateInvite.mockReset();

  mockUseAction.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "availability_action:findAvailableEvents") return mockFindEvents;
    if (getFunctionName(ref) === "feedback_regen_action:triggerRegeneration") return vi.fn();
    if (getFunctionName(ref) === "email_notifications:castVoteAndNotify") return mockCastVote;
    return vi.fn();
  });

  mockUseMutation.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "event_polls_mutations:createPoll") return mockCreatePoll;
    if (getFunctionName(ref) === "event_polls_mutations:closePoll") return mockClosePoll;
    if (getFunctionName(ref) === "event_polls_mutations:dismissPoll") return mockDismissPoll;
    if (getFunctionName(ref) === "event_shortlists_mutations:shortlistEvent") return mockShortlistEvent;
    if (getFunctionName(ref) === "event_shortlists_mutations:removeShortlist") return mockRemoveShortlist;
    if (getFunctionName(ref) === "chats_mutations:createInvite") return mockCreateInvite;
    return vi.fn();
  });

  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    if (getFunctionName(ref) === "chats_queries:getVenueCacheReady") return true;
    if (getFunctionName(ref) === "event_shortlists_queries:listForChat") return [];
    return undefined;
  });
});

it("shows the brand-new group empty state before recommendations are fetched", () => {
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(screen.getByText("No events suggested yet. Click Find Events to get started.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Find Events/i })).toBeInTheDocument();
  expect(mockFindEvents).not.toHaveBeenCalled();
});

it("creates a recommendation poll from the latest ranked top three events", async () => {
  const user = userEvent.setup();
  const rankedEvents = [
    createEvent({ eventId: "ranked-1", title: "Ranked One" }),
    createEvent({ eventId: "ranked-2", title: "Ranked Two" }),
    createEvent({ eventId: "ranked-3", title: "Ranked Three" }),
    createEvent({ eventId: "ranked-4", title: "Ranked Four" }),
  ];

  mockFindEvents.mockResolvedValue({ rankedActivityEvents: rankedEvents, rankedFoodEvents: [], filteredEvents: [] });
  mockCreatePoll.mockResolvedValue(null);
  // After issue #310, a brand-new group (no prior recommendation history) does not
  // auto-fetch on mount. Seed messages as [] so the component renders the empty
  // placeholder, then simulate the user clicking Find Events.
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));
  await waitFor(() =>
    expect(mockFindEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-123",
        clearStoredInPlanningWindow: false,
      }),
    ),
  );
  await screen.findByText("Ranked One");

  await user.click(screen.getByRole("button", { name: "Start Poll" }));

  await waitFor(() =>
    expect(mockCreatePoll).toHaveBeenCalledWith({
      chatId: "chat-123",
      source: "recommendation",
      options: rankedEvents.slice(0, EVENT_POLL_OPTION_COUNT).map((event) => ({
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
      })),
    }),
  );
});

it("shows the active poll summary and hides creation controls while a poll is open", async () => {
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [createEvent({ eventId: "ranked-1", title: "Ranked One" })],
    rankedFoodEvents: [],
    filteredEvents: [],
  });
  mockDismissPoll.mockResolvedValue(null);
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return createPoll();
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(await screen.findByText("Which option should the group choose?")).toBeInTheDocument();
  expect(screen.getByText("Open poll · vote to reveal the results")).toBeInTheDocument();
  expect(screen.getByText("Results stay hidden until you cast your vote.")).toBeInTheDocument();
  expect(screen.getByText("Poll One")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start Poll" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Custom Poll" })).not.toBeInTheDocument();
});

it("submits a vote for the selected poll option", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockCastVote.mockResolvedValue(null);
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return createPoll({ canVote: true });
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: "Pick this for Poll One" }));

  await waitFor(() =>
    expect(mockCastVote).toHaveBeenCalledWith({
      pollId: "poll-1",
      eventId: "poll-1",
    }),
  );
});

it("closes an open poll when the user can close it", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockClosePoll.mockResolvedValue(null);
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return createPoll({ canClose: true });
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: "Close Poll" }));

  await waitFor(() =>
    expect(mockClosePoll).toHaveBeenCalledWith({
      pollId: "poll-1",
    }),
  );
});

it("shows agreement reached for accepted resolved polls in the panel", async () => {
  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") {
      return createPoll({
        status: "closed",
        resolution: "accepted",
        acceptedEventId: "poll-1",
        resultsVisible: true,
        totalEligibleVoters: 2,
        totalVotes: 2,
        currentUserVoteEventId: "poll-1",
        leadingEventIds: ["poll-1"],
        options: [
          { ...createEvent({ eventId: "poll-1", title: "Poll One" }), isSelected: true, tally: 2 },
          { ...createEvent({ eventId: "poll-2", title: "Poll Two" }), isSelected: false, tally: 0 },
          { ...createEvent({ eventId: "poll-3", title: "Poll Three" }), isSelected: false, tally: 0 },
        ],
      });
    }
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(await screen.findByText("Agreement reached · 2/2 voted")).toBeInTheDocument();
  expect(screen.getByText("Accepted: Poll One")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  expect(screen.queryByText("Poll Two")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Close Poll" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pick this for Poll One" })).not.toBeInTheDocument();
});

it("shows newly fetched recommendations after an accepted poll is closed", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [
      createEvent({ eventId: "ranked-1", title: "Fresh One" }),
      createEvent({ eventId: "ranked-2", title: "Fresh Two" }),
      createEvent({ eventId: "ranked-3", title: "Fresh Three" }),
    ],
    rankedFoodEvents: [],
    filteredEvents: [],
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") {
      return createPoll({
        status: "closed",
        resolution: "accepted",
        acceptedEventId: "poll-1",
        resultsVisible: true,
        totalEligibleVoters: 2,
        totalVotes: 2,
        leadingEventIds: ["poll-1"],
        options: [
          { ...createEvent({ eventId: "poll-1", title: "Poll One" }), isSelected: true, tally: 2 },
          { ...createEvent({ eventId: "poll-2", title: "Poll Two" }), isSelected: false, tally: 0 },
          { ...createEvent({ eventId: "poll-3", title: "Poll Three" }), isSelected: false, tally: 0 },
        ],
      });
    }
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(await screen.findByText("Agreement reached · 2/2 voted")).toBeInTheDocument();
  expect(screen.getByText("Accepted: Poll One")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Find Events/i }));

  expect(await screen.findByText("Fresh One")).toBeInTheDocument();
  expect(screen.getByText("Fresh Two")).toBeInTheDocument();
  expect(screen.getByText("Fresh Three")).toBeInTheDocument();
  expect(screen.queryByText("Poll Two")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start Poll" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Custom Poll" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Clear" }));

  await waitFor(() =>
    expect(mockDismissPoll).toHaveBeenCalledWith({
      pollId: "poll-1",
    }),
  );
  expect(screen.queryByText("Agreement reached · 2/2 voted")).not.toBeInTheDocument();
  expect(screen.queryByText("Accepted: Poll One")).not.toBeInTheDocument();
  expect(screen.getByText("Fresh One")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start Poll" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Custom Poll" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Custom Poll" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: /Fresh One/i })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: /Fresh Two/i })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: /Fresh Three/i })).toBeInTheDocument();
});

it("downloads an ics file from a suggested event card", async () => {
  const user = userEvent.setup();
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const createObjectURLSpy = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:test");
  const revokeObjectURLSpy = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => {});

  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [createEvent({ eventId: "ranked-1", title: "Ranked One" })],
    rankedFoodEvents: [],
    filteredEvents: [],
  });
  // After issue #310, no auto-fetch for brand-new groups; user must click Find Events.
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));

  await user.click(
    await screen.findByRole("button", {
      name: "Add Ranked One to calendar",
    }),
  );

  expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test");

  clickSpy.mockRestore();
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
});

it("keeps invite and calendar actions on persisted recommendations", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  mockCreateInvite.mockResolvedValue({
    token: "persisted-invite-token",
    expiresAt: Date.now() + 60_000,
  });

  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") {
      return [
        {
          _id: "msg-persisted",
          _creationTime: 0,
          chatId: "chat-123",
          userId: "user-1",
          role: "assistant",
          content: "Persisted recommendations",
          latestToolCall: {
            toolCallId: "tc-persisted",
            toolName: "displayEventCards",
            state: "output-available",
            args: {},
            result: {
              events: [
                createEvent({
                  eventId: "persisted-1",
                  title: "Persisted Ranked One",
                }),
              ],
            },
          },
        },
      ];
    }
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(await screen.findByText("Persisted Ranked One")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Add Persisted Ranked One to calendar",
    }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Invite" }));

  await waitFor(() =>
    expect(mockCreateInvite).toHaveBeenCalledWith({
      chatId: "chat-123",
      expiresInHours: 72,
    }),
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("/invite/persisted-invite-token"),
  );
});

it("clears a no-consensus resolved poll from the panel", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return undefined;
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") {
      return createPoll({
        status: "closed",
        resolution: "no_consensus",
        acceptedEventId: null,
        noConsensusMessage:
          "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
        resultsVisible: true,
        totalEligibleVoters: 2,
        totalVotes: 2,
        currentUserVoteEventId: null,
        leadingEventIds: ["poll-1", "poll-2"],
        options: [
          { ...createEvent({ eventId: "poll-1", title: "Poll One" }), isSelected: false, tally: 1 },
          { ...createEvent({ eventId: "poll-2", title: "Poll Two" }), isSelected: false, tally: 1 },
          { ...createEvent({ eventId: "poll-3", title: "Poll Three" }), isSelected: false, tally: 0 },
        ],
      });
    }
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "events_queries:getAllEvents") return [];
    if (getFunctionName(ref) === "yelp_events_queries:getAllYelpEvents") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  expect(await screen.findByText("No consensus · 2/2 voted")).toBeInTheDocument();
  expect(
    screen.getByText(
      "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Poll One")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pick this for Poll One" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear" }));

  expect(screen.queryByText("No consensus · 2/2 voted")).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
    ),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(mockDismissPoll).toHaveBeenCalledWith({
      pollId: "poll-1",
    }),
  );
});

it("creates a custom poll from three selected stored events", async () => {
  const user = userEvent.setup();
  const museumNight = createEvent({ eventId: "manual-1", title: "Museum Night", startTime: "2026-05-01T19:00:00.000Z" });
  const rooftopConcert = createEvent({ eventId: "manual-2", title: "Rooftop Concert", startTime: "2026-05-02T19:00:00.000Z" });
  const boardGameCafe = createEvent({ eventId: "manual-3", title: "Board Game Cafe", startTime: "2026-05-03T19:00:00.000Z" });
  const lateBrunch = createEvent({ eventId: "manual-4", title: "Late Brunch", startTime: "2026-05-04T19:00:00.000Z" });

  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockCreatePoll.mockResolvedValue(null);
  // After issue #310, allStoredEvents is derived from this chat's assistant tool-call payloads
  // rather than global getAllEvents/getAllYelpEvents queries. Seed a prior assistant message
  // whose tool call surfaced these four candidates.
  const priorAssistantMessage = {
    _id: "msg-prior",
    _creationTime: 0,
    chatId: "chat-123",
    userId: "user-1",
    role: "assistant",
    content: "Here are some options for your group.",
    latestToolCall: {
      toolCallId: "tc-prior",
      toolName: "displayEventCards",
      state: "output-available",
      args: {},
      result: {
        events: [boardGameCafe, museumNight, lateBrunch, rooftopConcert],
      },
    },
  };
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [priorAssistantMessage];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(screen.getByRole("button", { name: "Custom Poll" }));

  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /Museum Night/i }));
  await user.click(within(dialog).getByRole("button", { name: /Rooftop Concert/i }));
  await user.click(within(dialog).getByRole("button", { name: /Board Game Cafe/i }));
  await user.click(within(dialog).getByRole("button", { name: "Create Poll" }));

  await waitFor(() =>
    expect(mockCreatePoll).toHaveBeenCalledWith({
      chatId: "chat-123",
      source: "manual",
      // Order follows rankedStoredEvents input order (boardGameCafe, museumNight, rooftopConcert)
      options: [boardGameCafe, museumNight, rooftopConcert].map((event) => ({
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
        status: null,
        budgetBucket: null,
        genre: event.genre ?? null,
      })),
    }),
  );
});

it("includes user-created custom events in the custom poll dialog", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({ rankedFoodEvents: [], rankedActivityEvents: [], filteredEvents: [] });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "custom_events_mutations:listForChat") {
      return [
        {
          eventId: "custom-1",
          title: "Apartment Dinner",
          description: "Dinner at home",
          startTime: "2026-05-01T19:00:00.000Z",
          location: "Rutva's apartment",
          tags: ["Custom"],
          source: "custom",
          url: "",
        },
        {
          eventId: "custom-2",
          title: "Study Hangout",
          description: "Group study session",
          startTime: "2026-05-02T19:00:00.000Z",
          location: "Library",
          tags: ["Custom"],
          source: "custom",
          url: "",
        },
        {
          eventId: "custom-3",
          title: "Park Picnic",
          description: "Bring snacks",
          startTime: "2026-05-03T19:00:00.000Z",
          location: "Campus lawn",
          tags: ["Custom"],
          source: "custom",
          url: "",
        },
      ];
    }
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(screen.getByRole("button", { name: "Custom Poll" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: /Apartment Dinner/i })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: /Study Hangout/i })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: /Park Picnic/i })).toBeInTheDocument();
});

it("does not show manual or custom events in the suggested search results", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [
      createEvent({ eventId: "ranked-1", title: "Ticketed Concert", source: "ticketmaster" }),
      createEvent({ eventId: "manual-1", title: "Lakers game", source: "manual" }),
      createEvent({ eventId: "custom-1", title: "Knicks game", source: "custom" }),
    ],
    rankedFoodEvents: [],
    filteredEvents: [],
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));

  expect(await screen.findByText("Ticketed Concert")).toBeInTheDocument();
  expect(screen.queryByText("Lakers game")).not.toBeInTheDocument();
  expect(screen.queryByText("Knicks game")).not.toBeInTheDocument();
});

it("shortlists a suggested recommendation", async () => {
  const user = userEvent.setup();
  mockShortlistEvent.mockResolvedValue("shortlist-1");
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [
      createEvent({ eventId: "ranked-1", title: "Ticketed Concert", source: "ticketmaster" }),
    ],
    rankedFoodEvents: [],
    filteredEvents: [],
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "event_shortlists_queries:listForChat") return [];
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));
  await user.click(await screen.findByRole("button", { name: "Shortlist Ticketed Concert" }));

  expect(mockShortlistEvent).toHaveBeenCalledWith({
    chatId: "chat-123",
    event: expect.objectContaining({
      eventId: "ranked-1",
      title: "Ticketed Concert",
      source: "ticketmaster",
    }),
  });
});

it("shows saved shortlist candidates and removes them", async () => {
  const user = userEvent.setup();
  mockRemoveShortlist.mockResolvedValue(null);
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "event_shortlists_queries:listForChat") {
      return [
        {
          _id: "shortlist-1",
          eventId: "ranked-1",
          event: createEvent({ eventId: "ranked-1", title: "Saved Concert" }),
        },
      ];
    }
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  const shortlist = screen.getByRole("region", { name: "Shortlist" });
  expect(within(shortlist).getByText("Saved Concert")).toBeInTheDocument();

  await user.click(within(shortlist).getByRole("button", { name: "Remove" }));

  expect(mockRemoveShortlist).toHaveBeenCalledWith({
    chatId: "chat-123",
    eventId: "ranked-1",
  });
});

it("shows area search controls and re-runs search for the selected area", async () => {
  const user = userEvent.setup();
  mockFindEvents
    .mockResolvedValueOnce({
      rankedActivityEvents: [
        createEvent({
          eventId: "ranked-1",
          title: "Bowl Night",
          venueCity: "New York",
          venueNeighborhood: "Brooklyn",
        }),
        createEvent({
          eventId: "ranked-2",
          title: "Gallery Walk",
          venueCity: "New York",
          venueNeighborhood: "Manhattan",
        }),
        createEvent({
          eventId: "ranked-3",
          title: "Park Concert",
          venueCity: "New York",
          venueNeighborhood: "Queens",
        }),
      ],
      rankedFoodEvents: [],
      filteredEvents: [],
      locationAreaOptions: ["Brooklyn", "Manhattan", "Queens"],
    })
    .mockResolvedValueOnce({
      rankedActivityEvents: [
        createEvent({
          eventId: "ranked-4",
          title: "Brooklyn Show",
          venueCity: "New York",
          venueNeighborhood: "Brooklyn",
        }),
      ],
      rankedFoodEvents: [],
      filteredEvents: [],
      locationAreaOptions: ["Brooklyn", "Manhattan", "Queens"],
    });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));
  await screen.findByText("Bowl Night");

  expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Brooklyn" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manhattan" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Queens" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New York" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Brooklyn" }));

  await waitFor(() =>
    expect(mockFindEvents).toHaveBeenLastCalledWith({
      chatId: "chat-123",
      locationArea: "Brooklyn",
      clearStoredInPlanningWindow: false,
      ignoreMissingCalendars: false,
      isRegen: undefined,
    }),
  );
  expect(screen.getByText("Brooklyn Show")).toBeInTheDocument();
  expect(screen.queryByText("Bowl Night")).not.toBeInTheDocument();
  expect(screen.queryByText("Gallery Walk")).not.toBeInTheDocument();
  expect(screen.queryByText("Park Concert")).not.toBeInTheDocument();
  expect(screen.getByText("1 recent event")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Brooklyn", pressed: true })).toBeInTheDocument();
});

it("shows a clear empty state for an unmatched location search", async () => {
  const user = userEvent.setup();
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [],
    rankedFoodEvents: [],
    filteredEvents: [],
    locationAreaOptions: [],
    searchLocation: "xyz",
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "chats_queries:getVenueCacheReady") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));

  expect(await screen.findByText(/No events found for "xyz"/)).toBeInTheDocument();
  expect(screen.getByText(/clear this location search/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  expect(screen.queryByText("No recommendations yet. Find events that fit everyone\u2019s schedule.")).not.toBeInTheDocument();
});

it("restores previous recommendations when an empty area search is cleared", async () => {
  const user = userEvent.setup();
  mockFindEvents
    .mockResolvedValueOnce({
      rankedActivityEvents: [
        createEvent({
          eventId: "ranked-1",
          title: "Bowl Night",
          venueCity: "New York",
          venueNeighborhood: "Manhattan",
        }),
        createEvent({
          eventId: "ranked-2",
          title: "Gallery Walk",
          venueCity: "New York",
          venueNeighborhood: "Brooklyn",
        }),
      ],
      rankedFoodEvents: [],
      filteredEvents: [],
      locationAreaOptions: ["Manhattan", "Brooklyn"],
      searchLocation: "New York",
    })
    .mockResolvedValueOnce({
      rankedActivityEvents: [],
      rankedFoodEvents: [],
      filteredEvents: [],
      locationAreaOptions: ["Manhattan", "Brooklyn"],
      searchLocation: "New York",
    });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "chats_queries:getVenueCacheReady") return undefined;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await user.click(await screen.findByRole("button", { name: /Find Events/i }));
  await screen.findByText("Bowl Night");

  await user.click(screen.getByRole("button", { name: "Brooklyn" }));
  expect(await screen.findByText(/No events found for "Brooklyn"/)).toBeInTheDocument();
  expect(screen.queryByText("Bowl Night")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear search" }));

  expect(screen.getByText("Bowl Night")).toBeInTheDocument();
  expect(screen.getByText("Gallery Walk")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "All", pressed: true })).toBeInTheDocument();
});

it("shows area controls even when current recommendations share one neighborhood", async () => {
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [
      createEvent({
        eventId: "ranked-1",
        title: "Perfect Crime",
        venueName: "The Theater Center",
        venueCity: "New York",
        venueNeighborhood: "Manhattan",
      }),
      createEvent({
        eventId: "ranked-2",
        title: "Harry Potter and the Cursed Child",
        venueName: "Lyric Theatre - NY",
        venueCity: "New York",
        venueNeighborhood: "Manhattan",
      }),
      createEvent({
        eventId: "ranked-3",
        title: "CATS: The Jellicle Ball",
        venueName: "Broadhurst Theatre",
        venueCity: "New York",
        venueNeighborhood: "Manhattan",
      }),
    ],
    rankedFoodEvents: [],
    filteredEvents: [],
    locationAreaOptions: ["Manhattan", "Brooklyn", "Queens"],
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "chats_queries:getVenueCacheReady") return true;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await screen.findByText("Perfect Crime");

  expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manhattan" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Brooklyn" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Queens" })).toBeInTheDocument();
  expect(screen.queryByText("Neighborhood filters are not available for these results.")).not.toBeInTheDocument();
});

it("shows an unsupported-city message when Google Places has no neighborhoods yet", async () => {
  mockFindEvents.mockResolvedValue({
    rankedActivityEvents: [
      createEvent({
        eventId: "ranked-1",
        title: "Perfect Crime",
        venueName: "The Theater Center",
        venueCity: "New York",
        venueNeighborhood: null,
      }),
      createEvent({
        eventId: "ranked-2",
        title: "Harry Potter and the Cursed Child",
        venueName: "Lyric Theatre - NY",
        venueCity: "New York",
        venueNeighborhood: null,
      }),
      createEvent({
        eventId: "ranked-3",
        title: "CATS: The Jellicle Ball",
        venueName: "Broadhurst Theatre",
        venueCity: "New York",
        venueNeighborhood: null,
      }),
    ],
    rankedFoodEvents: [],
    filteredEvents: [],
    locationAreaOptions: [],
  });
  mockUseQuery.mockImplementation((ref: unknown) => {
    if (getFunctionName(ref) === "messages_queries:getByChat") return [];
    if (getFunctionName(ref) === "feedback_queries:listForChat") return [];
    if (getFunctionName(ref) === "event_polls_queries:getLatestForChat") return undefined;
    if (getFunctionName(ref) === "user_preferences_queries:getUserEventPreferences") return undefined;
    if (getFunctionName(ref) === "chats_queries:getVenueCacheReady") return true;
    return undefined;
  });

  render(<SuggestedEvents chatId="chat-123" />);

  await screen.findByText("Perfect Crime");

  expect(screen.queryByLabelText("Filter suggested events by area")).not.toBeInTheDocument();
  expect(screen.getByText("Neighborhood filtering is not available for this city yet.")).toBeInTheDocument();
});
