import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import MessageList from "../message-list";
import { createTestMessage } from "@/test/helpers";
import type { ToolCallPart } from "@/messages/types/tool-call";

const mockMutation = vi.fn();
const mockAction = vi.fn();
const mockUseQuery = vi.fn(() => null);

vi.mock("convex/react", () => ({
  useMutation: () => mockMutation,
  useAction: () => mockAction,
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("@/components/prompt-kit/loader", () => ({
  Loader: () => <div data-testid="loader">Loading...</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("MessageList", () => {
  beforeEach(() => {
    mockMutation.mockReset();
    mockAction.mockReset();
    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue(null);
  });

  it("renders messages", () => {
    const messages = [
      createTestMessage({ _id: "m1", role: "user", content: "Hello" }),
      createTestMessage({
        _id: "m2",
        role: "assistant",
        content: "Hi there!",
      }),
    ];

    render(<MessageList messages={messages} />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows loader during streaming with no content", () => {
    render(
      <MessageList messages={[]} isStreaming={true} streamingContent="" />,
    );

    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("shows empty state when no messages", () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByText("How can I help you today?")).toBeInTheDocument();
    expect(
      screen.queryByText("Explain quantum computing in simple terms"),
    ).not.toBeInTheDocument();
  });

  it("renders chat event cards from the displayEventCards helper", () => {
    const toolCalls: ToolCallPart[] = [
      {
        toolCallId: "tool-1",
        toolName: "displayEventCards",
        state: "output-available",
        args: {},
        result: {
          summary_message:
            "These are the best current matches for the group's schedule.",
          events: [
            {
              eventId: "evt-1",
              title: "Late Night Jazz",
              description: "A good fit for the group.",
              startTime: "2026-03-08T03:00:00.000Z",
              startLocal: "Sat, Mar 7, 10:00 PM",
              localDateLabel: "Saturday, Mar 7, 2026",
              venueName: "Keystone Lounge",
              venueCity: "Baltimore",
              venueCountry: "US",
              url: "https://example.com/jazz",
              source: "ticketmaster",
              fitReasons: ["Matches the group's positive history with concert events."],
            },
          ],
        },
      },
    ];

    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-cards",
            role: "assistant",
            content: "Here are the best matches.",
          }),
        ]}
        toolCalls={toolCalls}
        chatId="chat-123"
      />,
    );

    expect(
      screen.getByText(
        "These are the best current matches for the group's schedule.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Late Night Jazz")).toBeInTheDocument();
    expect(screen.getByText("Keystone Lounge, Baltimore")).toBeInTheDocument();
    expect(screen.getByText("Ticketmaster")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Less like this for Late Night Jazz"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view on ticketmaster/i }),
    ).toHaveAttribute("href", "https://example.com/jazz");
    expect(
      screen.getByRole("button", { name: "Add Late Night Jazz to calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
    expect(screen.queryByText("displayEventCards")).not.toBeInTheDocument();
  });

  it("starts a recommendation poll from chat event cards", async () => {
    const user = userEvent.setup();
    const toolCalls: ToolCallPart[] = [
      {
        toolCallId: "tool-start-poll",
        toolName: "displayEventCards",
        state: "output-available",
        args: {},
        result: {
          summary_message: "Here are the options.",
          events: ["Jazz Night", "Comedy Night", "Gallery Walk"].map((title, index) => ({
            eventId: `evt-${index + 1}`,
            title,
            description: null,
            startTime: `2026-03-0${index + 1}T03:00:00.000Z`,
            venueName: `Venue ${index + 1}`,
            venueCity: "Baltimore",
            venueCountry: "US",
            url: `https://example.com/${index + 1}`,
            source: "ticketmaster",
            fitReasons: [],
            status: "onsale",
            budgetBucket: "medium",
          })),
        },
      },
    ];

    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-poll-cta",
            role: "assistant",
            content: "Here are the best matches.",
          }),
        ]}
        toolCalls={toolCalls}
        chatId="chat-123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start poll" }));

    expect(mockMutation).toHaveBeenCalledWith({
      chatId: "chat-123",
      source: "recommendation",
      options: [
        expect.objectContaining({ eventId: "evt-1", title: "Jazz Night" }),
        expect.objectContaining({ eventId: "evt-2", title: "Comedy Night" }),
        expect.objectContaining({ eventId: "evt-3", title: "Gallery Walk" }),
      ],
    });
  });

  it("falls back to rendering cards from findGroupAvailableEvents output", () => {
    const toolCalls: ToolCallPart[] = [
      {
        toolCallId: "tool-2",
        toolName: "findGroupAvailableEvents",
        state: "output-available",
        args: {},
        result: {
          constraintStatus: "ok",
          summary_message: "These options fit the group's shared window.",
          events: [
            {
              eventId: "evt-2",
              title: "Comedy Night",
              startLocal: "Sun, Mar 8, 7:00 PM",
              venueName: "City Stage",
              venueCity: "Baltimore",
              url: "https://example.com/comedy",
              source: "ticketmaster",
            },
          ],
        },
      },
    ];

    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-fallback",
            role: "assistant",
            content: "I found a few matches.",
          }),
        ]}
        toolCalls={toolCalls}
      />,
    );

    expect(
      screen.getByText("These options fit the group's shared window."),
    ).toBeInTheDocument();
    expect(screen.getByText("Comedy Night")).toBeInTheDocument();
    expect(screen.queryByText("findGroupAvailableEvents")).not.toBeInTheDocument();
  });

  it("hydrates persisted event cards from the owning assistant message", () => {
    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-persisted-cards",
            role: "assistant",
            content: "Reloaded recommendation.",
            latestToolCall: {
              toolCallId: "tool-persisted-cards",
              toolName: "displayEventCards",
              state: "output-available",
              args: {},
              result: {
                summary_message: "Hydrated cards from the message query.",
                events: [
                  {
                    eventId: "evt-hydrated-1",
                    title: "Hydrated Jazz Night",
                    startTime: "2026-03-08T03:00:00.000Z",
                    startLocal: "Sat, Mar 7, 10:00 PM",
                    venueName: "Blue Room",
                    venueCity: "Baltimore",
                    url: "https://example.com/hydrated-jazz",
                    source: "ticketmaster",
                  },
                ],
              },
            },
          }),
        ]}
        chatId="chat-123"
      />,
    );

    expect(
      screen.getByText("Hydrated cards from the message query."),
    ).toBeInTheDocument();
    expect(screen.getByText("Hydrated Jazz Night")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Add Hydrated Jazz Night to calendar",
      }),
    ).toBeInTheDocument();
  });

  it("renders createEventPoll output as live poll cards instead of raw tool JSON", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-live-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "open",
      hasVoted: false,
      canVote: true,
      canClose: true,
      resultsVisible: false,
      totalEligibleVoters: 2,
      totalVotes: null,
      currentUserVoteEventId: null,
      leadingEventIds: [],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    const toolCalls: ToolCallPart[] = [
      {
        toolCallId: "tool-poll-live",
        toolName: "createEventPoll",
        state: "output-available",
        args: {},
        result: {
          pollId: "poll-live-1",
          prompt: "Which event should we attend this weekend?",
          summary_message: "Which event should we attend this weekend?",
          events: [
            {
              eventId: "poll-option-1",
              title: "Ravens Game",
              description: "Attend a Baltimore Ravens football game.",
              source: "manual",
            },
            {
              eventId: "poll-option-2",
              title: "Concert",
              description: "Go to a live music concert.",
              source: "manual",
            },
            {
              eventId: "poll-option-3",
              title: "JHU Game",
              description: "Watch a Johns Hopkins University sports game.",
              source: "manual",
            },
          ],
        },
      },
    ];

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-live-poll",
            role: "assistant",
            content: "Here's the poll.",
          }),
        ]}
        toolCalls={toolCalls}
      />,
    );

    expect(
      screen.getByText("Which event should we attend this weekend?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ravens Game")).toBeInTheDocument();
    expect(
      screen.getByText("Attend a Baltimore Ravens football game."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open poll · vote to reveal the results"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close Poll" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Pick this for Ravens Game"),
    ).toBeInTheDocument();
    expect(screen.queryByText("createEventPoll")).not.toBeInTheDocument();
  });

  it("hydrates persisted generic tool output from the owning assistant message", () => {
    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-persisted-tool",
            role: "assistant",
            content: "Calendar event ready.",
            latestToolCall: {
              toolCallId: "tool-persisted-generic",
              toolName: "createCalendarEvent",
              state: "output-available",
              args: {
                title: "Dinner",
              },
              result: {
                filename: "dinner.ics",
                ics: "BEGIN:VCALENDAR",
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("createCalendarEvent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download \.ics/i })).toBeInTheDocument();
  });

  it("renders accepted event notifications with a link back to the winning poll option", () => {
    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-accepted-notification",
            role: "assistant",
            content: "Agreement reached on Baltimore Symphony Orchestra.",
            latestToolCall: {
              toolCallId: "tool-accepted-notification",
              toolName: "acceptedEventNotification",
              state: "output-available",
              args: {
                pollId: "poll-1",
              },
              result: {
                pollId: "poll-1",
                eventId: "evt-1",
                title: "Baltimore Symphony Orchestra",
                startTime: "2026-04-12T19:00:00.000Z",
                venueName: "Meyerhoff Symphony Hall",
                venueCity: "Baltimore",
                source: "ticketmaster",
                url: "https://example.com/orchestra",
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Baltimore Symphony Orchestra")).toBeInTheDocument();
    expect(
      screen.getByText("Meyerhoff Symphony Hall, Baltimore"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ticketmaster")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View accepted event" }),
    ).toHaveAttribute("href", "#event-poll-option-poll-1-evt-1");
    expect(
      screen.getByRole("link", { name: "Open source listing" }),
    ).toHaveAttribute("href", "https://example.com/orchestra");
    expect(screen.queryByText("acceptedEventNotification")).not.toBeInTheDocument();
  });

  it("hydrates persisted poll cards from the owning assistant message", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-persisted-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "open",
      hasVoted: false,
      canVote: true,
      canClose: true,
      resultsVisible: false,
      totalEligibleVoters: 2,
      totalVotes: null,
      currentUserVoteEventId: null,
      leadingEventIds: [],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-persisted-poll",
            role: "assistant",
            content: "Here's the poll.",
            latestToolCall: {
              toolCallId: "tool-persisted-poll",
              toolName: "createEventPoll",
              state: "output-available",
              args: {},
              result: {
                pollId: "poll-persisted-1",
                prompt: "Which event should we attend this weekend?",
                summary_message: "Which event should we attend this weekend?",
                events: [
                  {
                    eventId: "poll-option-1",
                    title: "Ravens Game",
                    description: "Attend a Baltimore Ravens football game.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-2",
                    title: "Concert",
                    description: "Go to a live music concert.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-3",
                    title: "JHU Game",
                    description: "Watch a Johns Hopkins University sports game.",
                    source: "manual",
                  },
                ],
              },
            },
          }),
        ]}
      />,
    );

    expect(
      screen.getByText("Which event should we attend this weekend?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ravens Game")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Pick this for Ravens Game"),
    ).toBeInTheDocument();
    expect(screen.queryByText("createEventPoll")).not.toBeInTheDocument();
  });

  it("shows agreement reached state for resolved shared chat poll cards", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-accepted-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "closed",
      resolution: "accepted",
      acceptedEventId: "poll-option-1",
      noConsensusMessage: null,
      hasVoted: false,
      canVote: false,
      canClose: false,
      resultsVisible: true,
      totalEligibleVoters: 2,
      totalVotes: 2,
      currentUserVoteEventId: null,
      leadingEventIds: ["poll-option-1"],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 2,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 0,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 0,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-accepted-poll",
            role: "assistant",
            content: "The poll is resolved.",
            latestToolCall: {
              toolCallId: "tool-accepted-poll",
              toolName: "createEventPoll",
              state: "output-available",
              args: {},
              result: {
                pollId: "poll-accepted-1",
                prompt: "Which event should we attend this weekend?",
                summary_message: "Which event should we attend this weekend?",
                events: [
                  {
                    eventId: "poll-option-1",
                    title: "Ravens Game",
                    description: "Attend a Baltimore Ravens football game.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-2",
                    title: "Concert",
                    description: "Go to a live music concert.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-3",
                    title: "JHU Game",
                    description: "Watch a Johns Hopkins University sports game.",
                    source: "manual",
                  },
                ],
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Agreement reached · 2/2 voted")).toBeInTheDocument();
    expect(screen.getAllByText("Agreement reached").length).toBeGreaterThan(0);
    expect(
      document.getElementById(
        "event-poll-option-poll-accepted-1-poll-option-1",
      ),
    ).not.toBeNull();
    expect(
      screen.queryByLabelText("Pick this for Ravens Game"),
    ).not.toBeInTheDocument();
  });

  it("infers agreement reached for closed shared chat polls when legacy rows omit resolution", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-legacy-accepted-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "closed",
      hasVoted: true,
      canVote: false,
      canClose: false,
      resultsVisible: true,
      totalEligibleVoters: 2,
      totalVotes: 2,
      currentUserVoteEventId: "poll-option-1",
      leadingEventIds: ["poll-option-1"],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: true,
          tally: 2,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 0,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 0,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-legacy-accepted-poll",
            role: "assistant",
            content: "The poll is resolved.",
            latestToolCall: {
              toolCallId: "tool-legacy-accepted-poll",
              toolName: "createEventPoll",
              state: "output-available",
              args: {},
              result: {
                pollId: "poll-legacy-accepted-1",
                prompt: "Which event should we attend this weekend?",
                summary_message: "Which event should we attend this weekend?",
                events: [
                  {
                    eventId: "poll-option-1",
                    title: "Ravens Game",
                    description: "Attend a Baltimore Ravens football game.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-2",
                    title: "Concert",
                    description: "Go to a live music concert.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-3",
                    title: "JHU Game",
                    description: "Watch a Johns Hopkins University sports game.",
                    source: "manual",
                  },
                ],
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Agreement reached · 2/2 voted")).toBeInTheDocument();
    expect(screen.getAllByText("Agreement reached").length).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText("Pick this for Ravens Game"),
    ).not.toBeInTheDocument();
  });

  it("shows the persisted no-consensus message on resolved shared chat poll cards", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-no-consensus-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "closed",
      resolution: "no_consensus",
      acceptedEventId: null,
      noConsensusMessage:
        "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
      hasVoted: false,
      canVote: false,
      canClose: false,
      resultsVisible: true,
      totalEligibleVoters: 2,
      totalVotes: 2,
      currentUserVoteEventId: null,
      leadingEventIds: ["poll-option-1", "poll-option-2"],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 1,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 1,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: 0,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-no-consensus-poll",
            role: "assistant",
            content: "The poll is resolved.",
            latestToolCall: {
              toolCallId: "tool-no-consensus-poll",
              toolName: "createEventPoll",
              state: "output-available",
              args: {},
              result: {
                pollId: "poll-no-consensus-1",
                prompt: "Which event should we attend this weekend?",
                summary_message: "Which event should we attend this weekend?",
                events: [
                  {
                    eventId: "poll-option-1",
                    title: "Ravens Game",
                    description: "Attend a Baltimore Ravens football game.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-2",
                    title: "Concert",
                    description: "Go to a live music concert.",
                    source: "manual",
                  },
                  {
                    eventId: "poll-option-3",
                    title: "JHU Game",
                    description: "Watch a Johns Hopkins University sports game.",
                    source: "manual",
                  },
                ],
              },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("No consensus · 2/2 voted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The group did not reach a consensus, so feel free to adjust the options and start another poll.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Tied lead")).toHaveLength(2);
    expect(
      screen.queryByLabelText("Pick this for Ravens Game"),
    ).not.toBeInTheDocument();
  });

  it("does not duplicate hydrated tool UI during live-to-persisted handoff", () => {
    const persistedToolCall: ToolCallPart = {
      toolCallId: "tool-handoff",
      toolName: "displayEventCards",
      state: "output-available",
      args: {},
      result: {
        summary_message: "Single hydrated summary.",
        events: [
          {
            eventId: "evt-handoff-1",
            title: "Single Hydrated Event",
            startLocal: "Sat, Mar 7, 10:00 PM",
            venueName: "Union Hall",
            venueCity: "Baltimore",
            url: "https://example.com/union-hall",
            source: "ticketmaster",
          },
        ],
      },
    };

    render(
      <MessageList
        messages={[
          createTestMessage({
            _id: "m-assistant-handoff",
            role: "assistant",
            content: "Persisted tool result.",
            latestToolCall: persistedToolCall,
          }),
        ]}
        toolCalls={[persistedToolCall]}
      />,
    );

    expect(screen.getAllByText("Single hydrated summary.")).toHaveLength(1);
    expect(screen.getAllByText("Single Hydrated Event")).toHaveLength(1);
  });

  it("does not duplicate a persisted createEventPoll card during live-to-persisted handoff", () => {
    mockUseQuery.mockReturnValueOnce({
      _id: "poll-deduped-1",
      source: "manual",
      prompt: "Which event should we attend this weekend?",
      status: "open",
      hasVoted: false,
      canVote: true,
      canClose: true,
      resultsVisible: false,
      totalEligibleVoters: 2,
      totalVotes: null,
      currentUserVoteEventId: null,
      leadingEventIds: [],
      options: [
        {
          eventId: "poll-option-1",
          title: "Ravens Game",
          description: "Attend a Baltimore Ravens football game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-2",
          title: "Concert",
          description: "Go to a live music concert.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
        {
          eventId: "poll-option-3",
          title: "JHU Game",
          description: "Watch a Johns Hopkins University sports game.",
          startTime: null,
          venueName: null,
          venueCity: null,
          venueCountry: null,
          source: "manual",
          url: "",
          image: null,
          tags: [],
          status: null,
          budgetBucket: null,
          genre: null,
          isSelected: false,
          tally: null,
        },
      ],
    });
    mockUseQuery.mockReturnValueOnce(null);

    const persistedToolCall: ToolCallPart = {
      toolCallId: "tool-poll-handoff",
      toolName: "createEventPoll",
      state: "output-available",
      args: {},
      result: {
        pollId: "poll-deduped-1",
        prompt: "Which event should we attend this weekend?",
        summary_message: "Which event should we attend this weekend?",
        events: [
          {
            eventId: "poll-option-1",
            title: "Ravens Game",
            description: "Attend a Baltimore Ravens football game.",
            source: "manual",
          },
          {
            eventId: "poll-option-2",
            title: "Concert",
            description: "Go to a live music concert.",
            source: "manual",
          },
          {
            eventId: "poll-option-3",
            title: "JHU Game",
            description: "Watch a Johns Hopkins University sports game.",
            source: "manual",
          },
        ],
      },
    };

    render(
      <MessageList
        chatId="chat-1"
        messages={[
          createTestMessage({
            _id: "m-assistant-poll-handoff",
            role: "assistant",
            content: "Persisted poll tool result.",
            latestToolCall: persistedToolCall,
          }),
        ]}
        toolCalls={[persistedToolCall]}
      />,
    );

    expect(screen.getAllByText("Ravens Game")).toHaveLength(1);
    expect(
      screen.getAllByText("Which event should we attend this weekend?"),
    ).toHaveLength(1);
  });
});
