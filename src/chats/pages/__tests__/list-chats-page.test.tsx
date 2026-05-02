import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import ListChatsPage from "../list-chats-page";

vi.mock("@/chats/components/chat-list", () => ({
  default: () => <div>Chat list</div>,
}));

vi.mock("@/chats/components/add-chat-dialog", () => ({
  default: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? <div>New group dialog</div> : null,
}));

describe("ListChatsPage", () => {
  it("opens the new group dialog from the sidebar action", async () => {
    const user = userEvent.setup();

    render(<ListChatsPage />);

    await user.click(screen.getByRole("button", { name: "New Group" }));

    expect(screen.getByText("New group dialog")).toBeInTheDocument();
  });
});
