import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import AddChatDialog from "../add-chat-dialog";

const mockAddChat = vi.fn().mockResolvedValue("new-chat-id");

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockSetLocation],
}));

vi.mock("@/chats/hooks/use-mutation-chats", () => ({
  useMutationChats: () => ({ add: mockAddChat }),
}));

describe("AddChatDialog", () => {
  beforeEach(() => {
    mockAddChat.mockClear();
    mockSetLocation.mockClear();
  });

  it("renders dialog content when open", () => {
    render(<AddChatDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText("New Group")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Group name")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Group Location (optional)"),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when input is empty", () => {
    render(<AddChatDialog open={true} onOpenChange={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: "Create" });
    expect(submitButton).toBeDisabled();
  });

  it("submits the trimmed planning location with the new group", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<AddChatDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByPlaceholderText("Group name"), "  Weekend Plan  ");
    await user.type(
      screen.getByPlaceholderText("Group Location (optional)"),
      "  Washington, DC  ",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockAddChat).toHaveBeenCalledWith({
      title: "Weekend Plan",
      planningLocation: "Washington, DC",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSetLocation).toHaveBeenCalledWith("/groups/new-chat-id");
  });
});
