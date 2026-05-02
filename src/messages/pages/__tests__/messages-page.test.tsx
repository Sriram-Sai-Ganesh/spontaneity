import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import MessagesPage from "../messages-page";

const mockUseQuery = vi.fn();
const mockUseQueryMessages = vi.fn();
const mockUsePassivePreferenceExtraction = vi.fn(() => ({
  signalsToShow: [],
  handleAccept: vi.fn(),
  handleReject: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/groups/missing-chat", vi.fn()],
}));

vi.mock("@/chats/hooks/use-query-chat", () => ({
  useQueryChat: () => ({ data: undefined, loading: false, error: false }),
}));

vi.mock("@/messages/hooks/use-query-messages", () => ({
  useQueryMessages: (...args: unknown[]) => mockUseQueryMessages(...args),
}));

vi.mock("@/messages/hooks/use-chat", () => ({
  useChat: () => ({
    sendMessage: vi.fn(),
    isStreaming: false,
    streamingContent: "",
    abort: vi.fn(),
    toolCalls: [],
  }),
}));

vi.mock("@/chats/hooks/use-invite-link", () => ({
  useInviteLink: () => ({ copyInviteLink: vi.fn() }),
}));

vi.mock("@/messages/hooks/use-passive-preference-extraction", () => ({
  usePassivePreferenceExtraction: (...args: unknown[]) =>
    mockUsePassivePreferenceExtraction(...args),
}));

describe("MessagesPage", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQueryMessages.mockReset();
    mockUsePassivePreferenceExtraction.mockClear();
    mockUseQuery.mockReturnValue(undefined);
    mockUseQueryMessages.mockReturnValue({ data: [], loading: false, error: false });
  });

  it("does not start chat-scoped queries when the chat does not exist", () => {
    render(<MessagesPage chatId="missing-chat" />);

    expect(screen.getByText("Group not found.")).toBeInTheDocument();
    expect(mockUseQueryMessages).toHaveBeenCalledWith("missing-chat", false);
    expect(
      mockUseQuery.mock.calls.some(([, args]) => args === "skip"),
    ).toBe(true);
    expect(mockUsePassivePreferenceExtraction).toHaveBeenCalledWith(
      "missing-chat",
      [],
      "local-user",
      false,
    );
  });
});
