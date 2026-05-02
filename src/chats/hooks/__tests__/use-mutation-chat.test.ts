import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";

const mockUseMutation = vi.fn();
vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useMutationChat } from "../use-mutation-chat";

let mockUpdate: ReturnType<typeof vi.fn>;
let mockRemove: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUpdate = vi.fn().mockResolvedValue(null);
  mockRemove = vi.fn().mockResolvedValue(null);

  // useMutation is called twice: once for update, once for remove
  mockUseMutation.mockReset();
  mockUseMutation
    .mockReturnValueOnce(mockUpdate)
    .mockReturnValueOnce(mockRemove);
});

describe("useMutationChat", () => {
  it("edit() calls update mutation", async () => {
    const { result } = renderHook(() => useMutationChat("c1"));

    let success = false;
    await act(async () => {
      success = await result.current.edit({ title: "New Title" });
    });

    expect(success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      chatId: "c1",
      title: "New Title",
    });
  });

  it("delete() calls remove mutation", async () => {
    const { result } = renderHook(() => useMutationChat("c1"));

    let success = false;
    await act(async () => {
      success = await result.current.delete();
    });

    expect(success).toBe(true);
    expect(mockRemove).toHaveBeenCalledWith({ chatId: "c1" });
  });

  it("edit() returns false on error", async () => {
    mockUseMutation.mockReset();
    mockUpdate = vi.fn().mockRejectedValue(new Error("Forbidden"));
    mockUseMutation
      .mockReturnValueOnce(mockUpdate)
      .mockReturnValueOnce(mockRemove);

    const { result } = renderHook(() => useMutationChat("c1"));

    let success = false;
    await act(async () => {
      success = await result.current.edit({ title: "Bad" });
    });

    expect(success).toBe(false);
  });
});
