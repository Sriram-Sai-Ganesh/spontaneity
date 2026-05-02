import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import EditChatDialog from "../edit-chat-dialog";

const mockEditChat = vi.fn().mockResolvedValue(true);

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: () => [],
}));

vi.mock("@/chats/hooks/use-mutation-chat", () => ({
  useMutationChat: () => ({ edit: mockEditChat, delete: vi.fn() }),
}));

const baseChat = {
  _id: "chat-1",
  _creationTime: 1,
  title: "Weekend Plan",
  planningLocation: "Baltimore, MD",
} as const;

describe("EditChatDialog", () => {
  beforeEach(() => {
    mockEditChat.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefills the saved group location", () => {
    render(
      <EditChatDialog
        chat={baseChat}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByDisplayValue("Baltimore, MD"),
    ).toBeInTheDocument();
  });

  it("saves an updated trimmed group location", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <EditChatDialog
        chat={baseChat}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const locationInput = screen.getByLabelText("Group Location");
    await user.clear(locationInput);
    await user.type(locationInput, "  Washington, DC  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockEditChat).toHaveBeenCalledWith({
      title: "Weekend Plan",
      icon: null,
      planningLocation: "Washington, DC",
      useDistanceRanking: false,
      midpointLatitude: null,
      midpointLongitude: null,
      midpointLabel: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears the saved group location when the field is emptied", async () => {
    const user = userEvent.setup();

    render(
      <EditChatDialog
        chat={baseChat}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Group Location"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockEditChat).toHaveBeenCalledWith({
      title: "Weekend Plan",
      icon: null,
      planningLocation: null,
      useDistanceRanking: false,
      midpointLatitude: null,
      midpointLongitude: null,
      midpointLabel: null,
    });
  });

  it("validates a midpoint and shows a Google Maps verification link", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => [{ lat: "40.6782", lon: "-73.9442" }],
      }),
    );

    render(
      <EditChatDialog
        chat={baseChat}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Group Midpoint"), "Brooklyn");
    await user.click(screen.getByRole("button", { name: "Check midpoint" }));

    const mapsLink = await screen.findByRole("link", { name: "Open in Google Maps" });
    expect(mapsLink).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=40.6782,-73.9442",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockEditChat).toHaveBeenCalledWith({
        title: "Weekend Plan",
        icon: null,
        planningLocation: "Baltimore, MD",
        useDistanceRanking: false,
        midpointLatitude: 40.6782,
        midpointLongitude: -73.9442,
        midpointLabel: "Brooklyn",
      });
    });
  });

  it("blocks saving a midpoint that cannot be geocoded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => [],
      }),
    );

    render(
      <EditChatDialog
        chat={baseChat}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Group Midpoint"), "Not a real place");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("We could not find that midpoint. Try a more specific place or neighborhood."),
    ).toBeInTheDocument();
    expect(mockEditChat).not.toHaveBeenCalled();
  });
});
