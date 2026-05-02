import { z } from "zod";

export const themeModeSchema = z.union([
  z.literal("dark"),
  z.literal("light"),
  z.literal("random"),
  z.literal("system"),
]);

export const resolvedThemeSchema = z.union([
  z.literal("dark"),
  z.literal("light"),
]);

export const fontPresetSchema = z.union([
  z.literal("roboto"),
  z.literal("manrope"),
  z.literal("space-grotesk"),
  z.literal("lora"),
  z.literal("ibm-plex-sans"),
]);

export const fontSizeSchema = z.union([
  z.literal("small"),
  z.literal("medium"),
  z.literal("large"),
]);

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeColorsSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema,
});

export const themeTypographySchema = z.object({
  fontFamily: z.string().min(1).optional(),
  fontPreset: fontPresetSchema.optional(),
  fontSize: fontSizeSchema.optional(),
});

export const themeSpecificationSchema = z.object({
  colors: themeColorsSchema,
  typography: themeTypographySchema.optional(),
});

export const appearanceSchema = z.object({
  light: themeSpecificationSchema,
  dark: themeSpecificationSchema,
  random: themeSpecificationSchema.optional(),
});

export const userAppearancePreferencesSchema = z.object({
  mode: themeModeSchema,
  themes: appearanceSchema,
});

export type Theme = z.infer<typeof themeModeSchema>;
export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;
export type FontPreset = z.infer<typeof fontPresetSchema>;
export type FontSize = z.infer<typeof fontSizeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemeTypography = z.infer<typeof themeTypographySchema>;
export type ThemeSpecification = z.infer<typeof themeSpecificationSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type UserAppearancePreferences = z.infer<
  typeof userAppearancePreferencesSchema
>;
