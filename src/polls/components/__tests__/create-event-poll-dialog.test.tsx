import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CreateEventPollDialog from "../create-event-poll-dialog";
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

describe("CreateEventPollDialog", () => {
  it("creates a poll from exactly three selected events in sorted order", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const candidates = [
      createEvent({
        eventId: "late",
        title: "Late Show",
        startTime: "2026-05-04T20:00:00.000Z",
      }),
      createEvent({
        eventId: "early",
        title: "Early Show",
        startTime: "2026-05-01T20:00:00.000Z",
      }),
      createEvent({
        eventId: "middle",
        title: "Middle Show",
        startTime: "2026-05-02T20:00:00.000Z",
      }),
      createEvent({
        eventId: "last",
        title: "No Time Event",
        startTime: null,
      }),
    ];

    render(
      <CreateEventPollDialog
        open={true}
        onOpenChange={vi.fn()}
        candidateEvents={candidates}
        isCreating={false}
        onCreate={onCreate}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const createButton = within(dialog).getByRole("button", {
      name: "Create Poll",
    });

    expect(createButton).toBeDisabled();

    await user.click(
      within(dialog).getByRole("button", { name: /Early Show/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Middle Show/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Late Show/i }),
    );

    expect(createButton).toBeEnabled();

    await user.click(createButton);

    // Order follows candidateEvents input order (late, early, middle), not start time
    expect(onCreate).toHaveBeenCalledWith([
      candidates[0],
      candidates[1],
      candidates[2],
    ]);
  });

  it("resets selected events after the dialog closes and reopens", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CreateEventPollDialog
        open={true}
        onOpenChange={vi.fn()}
        candidateEvents={[
          createEvent({ eventId: "one", title: "Event One" }),
          createEvent({ eventId: "two", title: "Event Two" }),
          createEvent({ eventId: "three", title: "Event Three" }),
        ]}
        isCreating={false}
        onCreate={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /Event One/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Event Two/i }),
    );

    expect(within(dialog).getByText("2 of 3 selected")).toBeInTheDocument();

    rerender(
      <CreateEventPollDialog
        open={false}
        onOpenChange={vi.fn()}
        candidateEvents={[
          createEvent({ eventId: "one", title: "Event One" }),
          createEvent({ eventId: "two", title: "Event Two" }),
          createEvent({ eventId: "three", title: "Event Three" }),
        ]}
        isCreating={false}
        onCreate={vi.fn()}
      />,
    );

    rerender(
      <CreateEventPollDialog
        open={true}
        onOpenChange={vi.fn()}
        candidateEvents={[
          createEvent({ eventId: "one", title: "Event One" }),
          createEvent({ eventId: "two", title: "Event Two" }),
          createEvent({ eventId: "three", title: "Event Three" }),
        ]}
        isCreating={false}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Poll" })).toBeDisabled();
  });
});
