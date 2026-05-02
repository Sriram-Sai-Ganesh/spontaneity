import { observable, type Observable } from "@legendapp/state";
import { toast } from "sonner";

/**
 * Creates an observable that persists to localStorage.
 * Reads from localStorage on init, validates with decode, and writes back on changes.
 */
export function createPersistedObservable<T>(
  name: string,
  initial: T,
  decode: (value: unknown) => T,
): Observable<T> {
  let initialValue = initial;
  try {
    const stored = localStorage.getItem(name);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      initialValue = decode(parsed);
    }
  } catch {
    // Fallback to initial value for malformed localStorage entries.
  }

  const obs = observable<T>(initialValue);

  obs.onChange(({ value }) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      toast.error("Unable to save data", {
        description:
          "Storage is full or unavailable. Your changes may not persist.",
      });
    }
  });

  return obs;
}
