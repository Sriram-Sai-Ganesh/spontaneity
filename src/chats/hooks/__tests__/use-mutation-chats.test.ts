import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";

const mockUseMutation = vi.fn();
vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useMutationChats } from "../use-mutation-chats";

beforeEach(() => {
  mockUseMutation.mockReset();
});

describe("useMutationChats", () => {
  it("add() calls create mutation and returns chat ID", async () => {
    const mockCreate = vi.fn().mockResolvedValue("new-chat-id");
    mockUseMutation.mockReturnValue(mockCreate);

    const { result } = renderHook(() => useMutationChats());

    let chatId: string | null = null;
    await act(async () => {
      chatId = await result.current.add({ title: "New Group" });
    });

    expect(chatId).toBe("new-chat-id");
    expect(mockCreate).toHaveBeenCalledWith({ title: "New Group" });
  });

  it("add() returns null and shows toast on error", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("Failed"));
    mockUseMutation.mockReturnValue(mockCreate);

    const { result } = renderHook(() => useMutationChats());

    let chatId: string | null = null;
    await act(async () => {
      chatId = await result.current.add({ title: "Bad Chat" });
    });

    expect(chatId).toBeNull();
  });
});