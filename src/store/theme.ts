import { createPersistedObservable } from "@/store/persisted-observable";
import type { Theme } from "@/types/theme";

export function decodeTheme(value: unknown): Theme {
  if (
    value === "dark" ||
    value === "light" ||
    value === "random" ||
    value === "system"
  ) {
    return value;
  }
  return "system";
}

export const $theme = createPersistedObservable<Theme>(
  "theme",
  "system",
  decodeTheme,
);

export function setTheme(newTheme: Theme) {
  $theme.set(newTheme);
}
