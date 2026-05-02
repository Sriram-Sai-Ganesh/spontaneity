import { v } from "convex/values";

export const themeModeValidator = v.union(
  v.literal("light"),
  v.literal("dark"),
  v.literal("random"),
  v.literal("system"),
);

export const fontPresetValidator = v.union(
  v.literal("roboto"),
  v.literal("manrope"),
  v.literal("space-grotesk"),
  v.literal("lora"),
  v.literal("ibm-plex-sans"),
);

export const fontSizeValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("large"),
);

export const themeColorsValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  accent: v.string(),
});

export const themeTypographyValidator = v.object({
  fontFamily: v.optional(v.string()),
  fontPreset: v.optional(fontPresetValidator),
  fontSize: v.optional(fontSizeValidator),
});

export const themeSpecificationValidator = v.object({
  colors: themeColorsValidator,
  typography: v.optional(themeTypographyValidator),
});

export const appearanceThemesValidator = v.object({
  light: themeSpecificationValidator,
  dark: themeSpecificationValidator,
  random: v.optional(themeSpecificationValidator),
});
