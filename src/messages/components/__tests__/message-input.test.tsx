import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import MessageInput from "../message-input";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

describe("MessageInput", () => {
  it("send button is disabled when input is empty", () => {
    render(<MessageInput value="" onValueChange={vi.fn()} onSend={vi.fn()} />);

    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeDisabled();
  });

  it("calls onSend on submit button click", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <MessageInput value="Hello" onValueChange={vi.fn()} onSend={onSend} />,
    );

    const sendButton = screen.getByRole("button", { name: "Send message" });
    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("shows stop button when streaming", () => {
    render(
      <MessageInput
        value=""
        onValueChange={vi.fn()}
        onSend={vi.fn()}
        isLoading={true}
        onAbort={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Stop generating" }),
    ).toBeInTheDocument();
  });

  it("calls onAbort on stop click", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();

    render(
      <MessageInput
        value=""
        onValueChange={vi.fn()}
        onSend={vi.fn()}
        isLoading={true}
        onAbort={onAbort}
      />,
    );

    const stopButton = screen.getByRole("button", { name: "Stop generating" });
    await user.click(stopButton);

    expect(onAbort).toHaveBeenCalled();
  });

  it("shows direct assistant copy for assistant chats", () => {
    render(
      <MessageInput
        value=""
        onValueChange={vi.fn()}
        onSend={vi.fn()}
        assistantChat={true}
      />,
    );

    expect(
      screen.getByPlaceholderText("Message Spontaneity AI..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Messages here go directly to Spontaneity AI."),
    ).toBeInTheDocument();
  });
});
