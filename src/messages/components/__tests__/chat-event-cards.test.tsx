import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import ChatEventCards, {
  type ChatEventCardData,
  type ChatEventCardsPayload,
} from "../chat-event-cards";
import {
  RecommendationProvider,
  useRecommendationPool,
  type SharedRecommendedEvent,
} from "@/availability/context/recommendation-context";

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: () => [],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/chats/hooks/use-invite-link", () => ({
  useInviteLink: () => ({ copyInviteLink: vi.fn() }),
}));

vi.mock("../event-rsvp-panel", () => ({
  EventRSVPPanel: () => null,
}));

vi.mock("@/polls/components/event-poll-actions", () => ({
  default: () => null,
}));

function createCardEvent(
  eventId: string,
  title: string,
): ChatEventCardData {
  return {
    eventId,
    title,
    description: null,
    genre: null,
    startTime: null,
    startLocal: null,
    localDateLabel: null,
    venueName: title,
    venueCity: "Seattle",
    venueNeighborhood: null,
    venueCountry: "US",
    formattedAddress: null,
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    url: "https://example.com",
    source: "google_places",
    fitReasons: [],
    status: null,
    budgetBucket: null,
    venueType: "food",
    openHours: null,
    tags: [],
  };
}

function PoolSeeder({ events }: { events: SharedRecommendedEvent[] }) {
  const pool = useRecommendationPool();
  useEffect(() => {
    pool?._setDisplayEvents(events);
  }, [events, pool]);
  return null;
}

describe("ChatEventCards", () => {
  it("preserves recommendation pool order instead of sorting by score", async () => {
    const payload: ChatEventCardsPayload = {
      summaryMessage: null,
      events: [],
      toolName: "displayEventCards",
      rankingConfidence: null,
    };
    const displayEvents: SharedRecommendedEvent[] = [
      { ...createCardEvent("closest", "Cafe Flora"), score: 1 },
      { ...createCardEvent("farther", "The Pink Door"), score: 100 },
      { ...createCardEvent("middle", "Cinque Terre Ristorante"), score: 50 },
    ];

    render(
      <RecommendationProvider>
        <PoolSeeder events={displayEvents} />
        <ChatEventCards payload={payload} chatId="chat-123" />
      </RecommendationProvider>,
    );

    const cards = await screen.findAllByTestId("event-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("Cafe Flora")).toBeInTheDocument();
    expect(within(cards[1]).getByText("The Pink Door")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Cinque Terre Ristorante")).toBeInTheDocument();
  });

  it("falls back to the current payload when the shared pool is stale", async () => {
    const payload: ChatEventCardsPayload = {
      summaryMessage: null,
      events: [
        createCardEvent("closest", "Marigold Bakeshop"),
        createCardEvent("middle", "Melanie Restaurant"),
        createCardEvent("farther", "The Little Door"),
      ],
      toolName: "findGroupAvailableEvents",
      rankingConfidence: null,
    };
    const stalePool: SharedRecommendedEvent[] = [
      { ...createCardEvent("old-1", "Maccheroni Republic"), score: 100 },
      { ...createCardEvent("old-2", "Bestia"), score: 90 },
      { ...createCardEvent("old-3", "Chi Spacca"), score: 80 },
    ];

    render(
      <RecommendationProvider>
        <PoolSeeder events={stalePool} />
        <ChatEventCards payload={payload} chatId="chat-123" />
      </RecommendationProvider>,
    );

    const cards = await screen.findAllByTestId("event-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("Marigold Bakeshop")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Melanie Restaurant")).toBeInTheDocument();
    expect(within(cards[2]).getByText("The Little Door")).toBeInTheDocument();
  });
});
