import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mutationWithAuth } from "./lib";
import {
  appearanceThemesValidator,
  themeModeValidator,
} from "./user_appearance_schema";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
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
const DEFAULT_TYPOGRAPHY = {
  fontPreset: "roboto",
  fontSize: "medium",
} as const;

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

function sanitizeColor(value: string, fallback: string) {
  return HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function sanitizeTypography(
  typography: ThemeSpecification["typography"],
  fallback: NonNullable<ThemeSpecification["typography"]>,
) {
  const fontPreset =
    typography?.fontPreset && FONT_PRESETS.has(typography.fontPreset)
      ? typography.fontPreset
      : fallback.fontPreset;
  const fontSize =
    typography?.fontSize && FONT_SIZES.has(typography.fontSize)
      ? typography.fontSize
      : fallback.fontSize;

  return {
    ...(typography?.fontFamily
      ? { fontFamily: typography.fontFamily }
      : fallback.fontFamily
        ? { fontFamily: fallback.fontFamily }
        : {}),
    ...(fontPreset ? { fontPreset } : {}),
    ...(fontSize ? { fontSize } : {}),
  };
}

function sanitizeThemeSpecification(
  specification: ThemeSpecification,
  fallback: ThemeSpecification,
): ThemeSpecification {
  return {
    colors: {
      primary: sanitizeColor(
        specification.colors.primary,
        fallback.colors.primary,
      ),
      secondary: sanitizeColor(
        specification.colors.secondary,
        fallback.colors.secondary,
      ),
      accent: sanitizeColor(
        specification.colors.accent,
        fallback.colors.accent,
      ),
    },
    typography: sanitizeTypography(
      specification.typography,
      fallback.typography ?? DEFAULT_TYPOGRAPHY,
    ),
  };
}

function sanitizeThemes(themes: AppearanceThemes): AppearanceThemes {
  return {
    light: sanitizeThemeSpecification(themes.light, DEFAULT_THEMES.light),
    dark: sanitizeThemeSpecification(themes.dark, DEFAULT_THEMES.dark),
    ...(themes.random
      ? {
          random: sanitizeThemeSpecification(
            themes.random,
            DEFAULT_THEMES.light,
          ),
        }
      : {}),
  };
}

async function upsertAppearancePreferences(
  ctx: { db: DatabaseWriter },
  {
    userId,
    mode,
    themes,
  }: {
    userId: Id<"users">;
    mode: "light" | "dark" | "random" | "system";
    themes: AppearanceThemes;
  },
) {
  const now = Date.now();
  const normalizedThemes = sanitizeThemes(themes);
  const existing = await ctx.db
    .query("userAppearancePreferences")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      mode,
      themes: normalizedThemes,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("userAppearancePreferences", {
      userId,
      mode,
      themes: normalizedThemes,
      updatedAt: now,
    });
  }

  return {
    userId,
    mode,
    themes: normalizedThemes,
  };
}

export const setUserAppearancePreferences = mutationWithAuth({
  args: {
    mode: themeModeValidator,
    themes: appearanceThemesValidator,
  },
  returns: v.object({
    userId: v.id("users"),
    mode: themeModeValidator,
    themes: appearanceThemesValidator,
  }),
  handler: async (ctx, { mode, themes }) => {
    return upsertAppearancePreferences(ctx, {
      userId: ctx.userId,
      mode,
      themes,
    });
  },
});

export const setUserAppearancePreferencesInternal = internalMutation({
  args: {
    userId: v.id("users"),
    mode: themeModeValidator,
    themes: appearanceThemesValidator,
  },
  returns: v.object({
    userId: v.id("users"),
    mode: themeModeValidator,
    themes: appearanceThemesValidator,
  }),
  handler: async (ctx, { userId, mode, themes }) => {
    return upsertAppearancePreferences(ctx, { userId, mode, themes });
  },
});
