import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import Message from "../message";
import { createTestMessage } from "@/test/helpers";

const mockEdit = vi.fn();
const mockDelete = vi.fn();

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/messages/hooks/use-mutation-message", () => ({
  useMutationMessage: () => ({
    edit: mockEdit,
    delete: mockDelete,
  }),
}));

describe("Message", () => {
  beforeEach(() => {
    mockEdit.mockReset();
    mockDelete.mockReset();
  });

  it("saves trimmed edits for the current user's persisted message", async () => {
    const user = userEvent.setup();
    mockEdit.mockResolvedValue(true);

    render(
      <Message
        message={createTestMessage({ content: "Original message" })}
        isCurrentUser={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit message" }));

    const textarea = screen.getByRole("textbox", { name: "Edit message" });
    await user.clear(textarea);
    await user.type(textarea, "  Updated message  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith({ content: "Updated message" }),
    );
    expect(screen.getByText("Updated message")).toBeInTheDocument();
  });

  it("confirms before deleting the current user's persisted message", async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue(true);

    render(
      <Message
        message={createTestMessage({ content: "Delete me" })}
        isCurrentUser={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete message" }));
    expect(screen.getByText("Delete this message?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  });
});
