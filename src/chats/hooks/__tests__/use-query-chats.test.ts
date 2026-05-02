import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createTestChat } from "@/test/helpers";

const mockUseQuery = vi.fn();
const mockEnsureAiAssistant = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => mockEnsureAiAssistant,
}));

import { useQueryChats } from "../use-query-chats";

beforeEach(() => {
  mockUseQuery.mockReset();
  mockEnsureAiAssistant.mockReset();
  mockEnsureAiAssistant.mockResolvedValue("ai-chat-id");
});

describe("useQueryChats", () => {
  it("returns empty array and loading=true when query is undefined", () => {
    mockUseQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useQueryChats());

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("returns chats when query resolves", () => {
    const chat1 = createTestChat({ _id: "c1", title: "First", kind: "ai" });
    const chat2 = createTestChat({ _id: "c2", title: "Second" });
    mockUseQuery.mockReturnValue([chat1, chat2]);

    const { result } = renderHook(() => useQueryChats());

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].title).toBe("First");
    expect(result.current.data[1].title).toBe("Second");
    expect(result.current.loading).toBe(false);
  });

  it("ensures the AI assistant chat when it is missing", async () => {
    mockUseQuery.mockReturnValue([createTestChat({ _id: "c1" })]);

    const { result } = renderHook(() => useQueryChats());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(mockEnsureAiAssistant).toHaveBeenCalled());
  });
});
