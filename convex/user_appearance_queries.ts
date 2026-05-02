import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import {
  appearanceThemesValidator,
  themeModeValidator,
} from "./user_appearance_schema";

const DEFAULT_TYPOGRAPHY = {
  fontPreset: "roboto",
  fontSize: "medium",
} as const;

type FontPreset =
  | "roboto"
  | "manrope"
  | "space-grotesk"
  | "lora"
  | "ibm-plex-sans";

type FontSize = "small" | "medium" | "large";

const FONT_PRESETS = new Set<FontPreset>([
  "roboto",
  "manrope",
  "space-grotesk",
  "lora",
  "ibm-plex-sans",
]);

const FONT_SIZES = new Set<FontSize>(["small", "medium", "large"]);

type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
};

type ThemeTypography = {
  fontFamily?: string;
  fontPreset?: FontPreset;
  fontSize?: FontSize;
};

type ThemeSpecification = {
  colors: ThemeColors;
  typography?: ThemeTypography;
};

type PartialThemeSpecification = {
  colors?: Partial<ThemeColors>;
  typography?: ThemeTypography;
};

type AppearanceThemes = {
  light: ThemeSpecification;
  dark: ThemeSpecification;
  random?: ThemeSpecification;
};

const DEFAULT_THEMES: AppearanceThemes = {
  light: {
    colors: {
      primary: "#f0f0f0",
      secondary: "#d9d9d9",
      accent: "#5e5e5e",
    },
    typography: DEFAULT_TYPOGRAPHY,
  },
  dark: {
    colors: {
      primary: "#141414",
      secondary: "#232323",
      accent: "#b0b0b0",
    },
    typography: DEFAULT_TYPOGRAPHY,
  },
};

function isFontPreset(value: string): value is FontPreset {
  return FONT_PRESETS.has(value as FontPreset);
}

function isFontSize(value: string): value is FontSize {
  return FONT_SIZES.has(value as FontSize);
}

function normalizeTypography(
  typography?: ThemeTypography,
  legacyFontPreset?: string,
): ThemeTypography {
  const requestedFontPreset = typography?.fontPreset ?? legacyFontPreset;
  const requestedFontSize = typography?.fontSize;

  return {
    ...(typography?.fontFamily ? { fontFamily: typography.fontFamily } : {}),
    fontPreset:
      requestedFontPreset && isFontPreset(requestedFontPreset)
        ? requestedFontPreset
        : DEFAULT_TYPOGRAPHY.fontPreset,
    fontSize:
      requestedFontSize && isFontSize(requestedFontSize)
        ? requestedFontSize
        : DEFAULT_TYPOGRAPHY.fontSize,
  };
}

function normalizeThemeSpecification(
  specification: PartialThemeSpecification | undefined,
  fallback: ThemeSpecification,
  legacyFontPreset?: string,
) {
  return {
    colors: {
      primary: specification?.colors?.primary ?? fallback.colors.primary,
      secondary: specification?.colors?.secondary ?? fallback.colors.secondary,
      accent: specification?.colors?.accent ?? fallback.colors.accent,
    },
    typography: normalizeTypography(
      specification?.typography,
      legacyFontPreset,
    ),
  };
}

function normalizeThemes(
  themes: AppearanceThemes | undefined,
  fontPreset?: string,
) {
  return {
    light: normalizeThemeSpecification(
      themes?.light,
      DEFAULT_THEMES.light,
      fontPreset,
    ),
    dark: normalizeThemeSpecification(
      themes?.dark,
      DEFAULT_THEMES.dark,
      fontPreset,
    ),
    ...(themes?.random
      ? {
          random: normalizeThemeSpecification(
            themes.random,
            DEFAULT_THEMES.light,
            fontPreset,
          ),
        }
      : {}),
  };
}

function normalizeLegacyThemes(fontPreset?: string) {
  return {
    light: {
      ...DEFAULT_THEMES.light,
      typography: normalizeTypography(undefined, fontPreset),
    },
    dark: {
      ...DEFAULT_THEMES.dark,
      typography: normalizeTypography(undefined, fontPreset),
    },
  };
}

export const getUserAppearancePreferences = queryWithAuth({
  args: {},
  returns: v.union(
    v.object({
      mode: themeModeValidator,
      themes: appearanceThemesValidator,
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const preferences = await ctx.db
      .query("userAppearancePreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!preferences) {
      return null;
    }

    const mode = preferences.mode ?? preferences.colorScheme ?? "system";
    const themes = preferences.themes
      ? normalizeThemes(preferences.themes, preferences.fontPreset)
      : normalizeLegacyThemes(preferences.fontPreset);

    return {
      mode,
      themes,
    };
  },
});

export const getUserAppearancePreferencesForUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      mode: themeModeValidator,
      themes: appearanceThemesValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const preferences = await ctx.db
      .query("userAppearancePreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!preferences) {
      return null;
    }

    const mode = preferences.mode ?? preferences.colorScheme ?? "system";
    const themes = preferences.themes
      ? normalizeThemes(preferences.themes, preferences.fontPreset)
      : normalizeLegacyThemes(preferences.fontPreset);

    return {
      mode,
      themes,
    };
  },
});
