import { vi } from "vitest";
import { createPersistedObservable } from "../persisted-observable";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("createPersistedObservable", () => {
  it("initialises with the default value when localStorage is empty", () => {
    const obs = createPersistedObservable<string>("key-empty", "default", (v) =>
      String(v),
    );
    expect(obs.get()).toBe("default");
  });

  it("hydrates from localStorage on creation", () => {
    localStorage.setItem("key-hydrate", JSON.stringify("stored-value"));

    const obs = createPersistedObservable<string>(
      "key-hydrate",
      "default",
      (v) => String(v),
    );
    expect(obs.get()).toBe("stored-value");
  });

  it("falls back to default when localStorage contains invalid JSON", () => {
    localStorage.setItem("key-bad-json", "not-json{{{");

    const obs = createPersistedObservable<string>(
      "key-bad-json",
      "default",
      (v) => String(v),
    );
    expect(obs.get()).toBe("default");
  });

  it("falls back to default when decode throws", () => {
    localStorage.setItem("key-bad-decode", JSON.stringify("bad"));

    const decode = () => {
      throw new Error("decode failed");
    };
    const obs = createPersistedObservable<string>(
      "key-bad-decode",
      "default",
      decode,
    );
    expect(obs.get()).toBe("default");
  });

  it("persists changes back to localStorage", () => {
    const obs = createPersistedObservable<string>("key-persist", "init", (v) =>
      String(v),
    );

    obs.set("updated");

    const stored = JSON.parse(localStorage.getItem("key-persist")!);
    expect(stored).toBe("updated");
  });

  it("uses the decode function during hydration", () => {
    localStorage.setItem("key-decode", JSON.stringify({ value: 42 }));

    const decode = (v: unknown) => {
      if (typeof v === "object" && v !== null && "value" in v) {
        return (v as { value: number }).value;
      }
      return 0;
    };

    const obs = createPersistedObservable<number>("key-decode", 0, decode);
    expect(obs.get()).toBe(42);
  });

  it("shows toast when localStorage.setItem fails", async () => {
    const { toast } = await import("sonner");

    const obs = createPersistedObservable<string>("key-fail", "init", (v) =>
      String(v),
    );

    // Make setItem throw (simulate quota exceeded)
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    obs.set("will-fail");

    expect(toast.error).toHaveBeenCalledWith(
      "Unable to save data",
      expect.objectContaining({ description: expect.any(String) }),
    );

    localStorage.setItem = original;
  });
});
