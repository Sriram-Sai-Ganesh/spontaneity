import { renderHook } from "@testing-library/react";
import { $settings } from "@/settings/store/settings";
import { useQuerySettings } from "../use-query-settings";

beforeEach(() => {
  $settings.set({ displayName: "" });
});

describe("useQuerySettings", () => {
  it("returns default values", () => {
    const { result } = renderHook(() => useQuerySettings());

    expect(result.current.data.displayName).toBe("");
    expect(result.current.loading).toBe(false);
  });

  it("returns updated values", () => {
    $settings.set({ displayName: "Alice" });

    const { result } = renderHook(() => useQuerySettings());

    expect(result.current.data.displayName).toBe("Alice");
  });
});
