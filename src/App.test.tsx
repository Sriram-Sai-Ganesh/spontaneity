import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RightPanelContent } from "./App";

interface MockPanelProps {
  collapsed?: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

vi.mock("@/availability/components/availability-heatmap", () => ({
  default: ({
    collapsed = false,
    focused = false,
    onToggle,
  }: MockPanelProps) => (
    <section
      data-testid="calendar-panel"
      data-collapsed={collapsed ? "true" : "false"}
      data-focused={focused ? "true" : "false"}
    >
      <button type="button" aria-expanded={!collapsed} onClick={onToggle}>
        My Availability
      </button>
    </section>
  ),
}));

vi.mock("@/groups/components/group-pulse", () => ({
  default: ({
    collapsed = false,
    focused = false,
    onToggle,
  }: MockPanelProps) => (
    <section
      data-testid="pulse-panel"
      data-collapsed={collapsed ? "true" : "false"}
      data-focused={focused ? "true" : "false"}
    >
      <button type="button" aria-expanded={!collapsed} onClick={onToggle}>
        Group Pulse
      </button>
    </section>
  ),
}));

vi.mock("@/availability/components/suggested-events", () => ({
  default: ({
    collapsed = false,
    focused = false,
    onToggle,
  }: MockPanelProps) => (
    <section
      data-testid="events-panel"
      data-collapsed={collapsed ? "true" : "false"}
      data-focused={focused ? "true" : "false"}
    >
      <button type="button" aria-expanded={!collapsed} onClick={onToggle}>
        Suggested Events
      </button>
    </section>
  ),
}));

vi.mock("@/availability/components/recurring-events-panel", () => ({
  RecurringEventsPanel: ({
    collapsed = false,
    focused = false,
    onToggle,
  }: MockPanelProps) => (
    <section
      data-testid="recurring-panel"
      data-collapsed={collapsed ? "true" : "false"}
      data-focused={focused ? "true" : "false"}
    >
      <button type="button" aria-expanded={!collapsed} onClick={onToggle}>
        Recurring Events
      </button>
    </section>
  ),
}));

function expectPanelState(
  collapsed: {
    calendar: boolean;
    pulse: boolean;
    events: boolean;
    recurring: boolean;
  },
  focused: "calendar" | "pulse" | "events" | "recurring" | null,
) {
  expect(screen.getByTestId("calendar-panel")).toHaveAttribute(
    "data-collapsed",
    String(collapsed.calendar),
  );
  expect(screen.getByTestId("calendar-panel")).toHaveAttribute(
    "data-focused",
    String(focused === "calendar"),
  );
  expect(screen.getByTestId("pulse-panel")).toHaveAttribute(
    "data-collapsed",
    String(collapsed.pulse),
  );
  expect(screen.getByTestId("pulse-panel")).toHaveAttribute(
    "data-focused",
    String(focused === "pulse"),
  );
  expect(screen.getByTestId("events-panel")).toHaveAttribute(
    "data-collapsed",
    String(collapsed.events),
  );
  expect(screen.getByTestId("events-panel")).toHaveAttribute(
    "data-focused",
    String(focused === "events"),
  );
  expect(screen.getByTestId("recurring-panel")).toHaveAttribute(
    "data-collapsed",
    String(collapsed.recurring),
  );
  expect(screen.getByTestId("recurring-panel")).toHaveAttribute(
    "data-focused",
    String(focused === "recurring"),
  );
}

describe("RightPanelContent", () => {
  it("uses panel arrows to focus, restore, and switch right sidebar panels", async () => {
    const user = userEvent.setup();
    render(<RightPanelContent chatId="chat-123" />);

    expectPanelState(
      { calendar: false, pulse: false, events: false, recurring: false },
      null,
    );

    await user.click(screen.getByRole("button", { name: "Suggested Events" }));
    expectPanelState(
      { calendar: true, pulse: true, events: false, recurring: true },
      "events",
    );

    await user.click(screen.getByRole("button", { name: "Group Pulse" }));
    expectPanelState(
      { calendar: true, pulse: false, events: true, recurring: true },
      "pulse",
    );

    await user.click(screen.getByRole("button", { name: "Group Pulse" }));
    expectPanelState(
      { calendar: false, pulse: false, events: false, recurring: false },
      null,
    );
  });
});
