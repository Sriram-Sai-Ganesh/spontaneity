import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import AvailabilityHeatmap from "../availability-heatmap";

const mockUseHeatmapAvailability = vi.fn();

vi.mock("../../hooks/use-heatmap-availability", () => ({
  useHeatmapAvailability: (...args: unknown[]) => mockUseHeatmapAvailability(...args),
}));

beforeEach(() => {
  mockUseHeatmapAvailability.mockReset();
});

it("overlays accepted plans distinctly on the heatmap", async () => {
  const user = userEvent.setup();
  const acceptedStartTime = new Date(2026, 2, 7, 15, 30, 0, 0).toISOString();

  mockUseHeatmapAvailability.mockReturnValue({
    data: {
      memberCount: 1,
      dateRange: {
        start: new Date(2026, 2, 6, 0, 0, 0, 0).toISOString(),
        end: new Date(2026, 2, 8, 23, 59, 59, 0).toISOString(),
      },
      members: [
        {
          userId: "user-1",
          name: "Ram",
          busyBlocks: [
            {
              start: "2026-03-07T19:00:00.000Z",
              end: "2026-03-07T21:00:00.000Z",
            },
          ],
          connected: true,
        },
      ],
      acceptedPlans: [
        {
          pollId: "poll-1",
          chatId: "chat-456",
          chatTitle: "Game Night Crew",
          chatIcon: "🎲",
          eventId: "accepted-event",
          title: "Board Game Night",
          startTime: acceptedStartTime,
          endTime: new Date(2026, 2, 7, 17, 30, 0, 0).toISOString(),
          venueName: "No Land Beyond",
          venueCity: "Baltimore",
          source: "ticketmaster",
          url: "https://example.com/events/accepted-event",
          resolvedAt: Date.parse("2026-03-06T15:00:00.000Z"),
        },
      ],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });

  render(<AvailabilityHeatmap chatId="chat-123" />);

  expect(screen.getByText("My Availability")).toBeInTheDocument();
  expect(screen.getAllByText("🎲").length).toBeGreaterThan(0);

  const markedSlot = screen.getByTitle(/0\/1 available.*Board Game Night/i);
  await user.hover(markedSlot);
  expect(markedSlot).toHaveAttribute("title", expect.stringContaining("Board Game Night"));
  expect(markedSlot).toHaveAttribute("title", expect.stringContaining("Game Night Crew"));
  expect(markedSlot).toHaveAttribute("title", expect.stringContaining("No Land Beyond"));
  expect(markedSlot).toHaveAttribute("title", expect.stringContaining("Ticketmaster"));
});
