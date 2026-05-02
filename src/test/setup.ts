import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Provide a full localStorage implementation because jsdom's proxy-based
// localStorage doesn't support all Storage methods reliably.
const store: Record<string, string> = {};
const localStorageStub: Storage = {
  getItem(key: string) {
    return key in store ? store[key] : null;
  },
  setItem(key: string, value: string) {
    store[key] = String(value);
  },
  removeItem(key: string) {
    delete store[key];
  },
  clear() {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  },
  key(index: number) {
    return Object.keys(store)[index] ?? null;
  },
  get length() {
    return Object.keys(store).length;
  },
};
vi.stubGlobal("localStorage", localStorageStub);

// Radix UI uses ResizeObserver which jsdom doesn't provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

let uuidCounter = 0;

vi.stubGlobal(
  "crypto",
  new Proxy(globalThis.crypto ?? {}, {
    get(target, prop) {
      if (prop === "randomUUID") {
        return () => `test-uuid-${++uuidCounter}`;
      }
      return Reflect.get(target, prop);
    },
  }),
);

afterEach(() => {
  cleanup();
  localStorageStub.clear();
  uuidCounter = 0;
});
