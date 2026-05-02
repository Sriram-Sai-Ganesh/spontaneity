import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { $settings } from "@/settings/store/settings";
import { useMutationSettings } from "../use-mutation-settings";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  $settings.set({ displayName: "" });
});

describe("useMutationSettings", () => {
  it("edit() updates the store", () => {
    const { result } = renderHook(() => useMutationSettings());

    act(() => {
      result.current.edit({ displayName: "Bob" });
    });

    expect($settings.get().displayName).toBe("Bob");
  });
});
