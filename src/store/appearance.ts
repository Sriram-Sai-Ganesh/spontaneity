import { createPersistedObservable } from "@/store/persisted-observable";
import {
  DEFAULT_APPEARANCE,
  decodeAppearance,
  decodeThemeSpecification,
  replaceAppearanceColorsWithDefaults,
} from "@/theme/appearance";
import type { Appearance, ResolvedTheme, ThemeSpecification } from "@/types/theme";

export const $appearance = createPersistedObservable<Appearance>(
  "appearance",
  DEFAULT_APPEARANCE,
  decodeAppearance,
);

export function setAppearance(nextAppearance: Appearance) {
  $appearance.set(nextAppearance);
}

export function setThemeSpecification(
  resolvedTheme: ResolvedTheme,
  specification: ThemeSpecification,
) {
  $appearance.set({
    ...$appearance.get(),
    [resolvedTheme]: decodeThemeSpecification(
      specification,
      DEFAULT_APPEARANCE[resolvedTheme],
    ),
  });
}

export function resetAppearancePalette() {
  $appearance.set(replaceAppearanceColorsWithDefaults($appearance.get()));
}
