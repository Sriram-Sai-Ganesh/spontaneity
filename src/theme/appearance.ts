import {
  appearanceSchema,
  fontSizeSchema,
  fontPresetSchema,
  themeModeSchema,
  themeSpecificationSchema,
  userAppearancePreferencesSchema,
  type Appearance,
  type FontPreset,
  type FontSize,
  type ResolvedTheme,
  type Theme,
  type ThemeColors,
  type ThemeTypography,
  type ThemeSpecification,
  type UserAppearancePreferences,
} from "@/types/theme";
import {
  getRelativeLuminance,
  getReadableNeutralForeground,
  mixHexColors,
  withAlpha,
} from "@/theme/huemint";

export const FONT_PRESET_OPTIONS = [
  {
    id: "roboto",
    label: "Roboto",
    family: '"Roboto", "Helvetica Neue", "Arial", sans-serif',
  },
  {
    id: "manrope",
    label: "Manrope",
    family: '"Manrope", "Helvetica Neue", "Arial", sans-serif',
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: '"Space Grotesk", "Helvetica Neue", "Arial", sans-serif',
  },
  {
    id: "lora",
    label: "Lora",
    family: '"Lora", "Georgia", serif',
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    family: '"IBM Plex Sans", "Helvetica Neue", "Arial", sans-serif',
  },
] as const satisfies ReadonlyArray<{
  id: FontPreset;
  label: string;
  family: string;
}>;

export const FONT_SIZE_OPTIONS = [
  { id: "small", label: "Small", rootSize: "15px" },
  { id: "medium", label: "Default", rootSize: "16px" },
  { id: "large", label: "Large", rootSize: "18px" },
] as const satisfies ReadonlyArray<{
  id: FontSize;
  label: string;
  rootSize: string;
}>;

const FONT_PRESET_MAP = Object.fromEntries(
  FONT_PRESET_OPTIONS.map((preset) => [preset.id, preset]),
) as Record<FontPreset, (typeof FONT_PRESET_OPTIONS)[number]>;

const FONT_SIZE_MAP = Object.fromEntries(
  FONT_SIZE_OPTIONS.map((option) => [option.id, option]),
) as Record<FontSize, (typeof FONT_SIZE_OPTIONS)[number]>;

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontPreset: "roboto",
  fontSize: "medium",
};

export const DEFAULT_LIGHT_COLORS: ThemeColors = {
  primary: "#f0f0f0",
  secondary: "#d9d9d9",
  accent: "#5e5e5e",
};

export const DEFAULT_DARK_COLORS: ThemeColors = {
  primary: "#141414",
  secondary: "#232323",
  accent: "#b0b0b0",
};

export function createThemeSpecification(
  colors: ThemeColors,
  typography: ThemeTypography = DEFAULT_TYPOGRAPHY,
): ThemeSpecification {
  return {
    colors,
    typography,
  };
}

export const DEFAULT_LIGHT_THEME: ThemeSpecification = createThemeSpecification(
  DEFAULT_LIGHT_COLORS,
);

export const DEFAULT_DARK_THEME: ThemeSpecification = createThemeSpecification(
  DEFAULT_DARK_COLORS,
);

export const DEFAULT_APPEARANCE: Appearance = {
  light: DEFAULT_LIGHT_THEME,
  dark: DEFAULT_DARK_THEME,
};

export const DEFAULT_THEME_MODE: Theme = "system";

export const DEFAULT_USER_APPEARANCE_PREFERENCES: UserAppearancePreferences = {
  mode: DEFAULT_THEME_MODE,
  themes: DEFAULT_APPEARANCE,
};

function getSystemResolvedTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

export function decodeAppearance(value: unknown): Appearance {
  const result = appearanceSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return DEFAULT_APPEARANCE;
}

export function decodeThemeSpecification(value: unknown, fallback: ThemeSpecification) {
  const result = themeSpecificationSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return fallback;
}

export function decodeThemeMode(value: unknown): Theme {
  const result = themeModeSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return DEFAULT_THEME_MODE;
}

export function decodeUserAppearancePreferences(
  value: unknown,
): UserAppearancePreferences {
  const result = userAppearancePreferencesSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return DEFAULT_USER_APPEARANCE_PREFERENCES;
}

export function replaceAppearanceColorsWithDefaults(
  appearance: Appearance,
): Appearance {
  return {
    light: {
      ...appearance.light,
      colors: {
        ...DEFAULT_LIGHT_THEME.colors,
      },
    },
    dark: {
      ...appearance.dark,
      colors: {
        ...DEFAULT_DARK_THEME.colors,
      },
    },
    ...(appearance.random ? { random: appearance.random } : {}),
  };
}

export function resolveThemeTypography(
  typography?: ThemeTypography,
): Required<Pick<ThemeTypography, "fontPreset" | "fontSize" | "fontFamily">> {
  const fontPresetResult = fontPresetSchema.safeParse(typography?.fontPreset);
  const fontSizeResult = fontSizeSchema.safeParse(typography?.fontSize);
  const fontPreset = fontPresetResult.success
    ? fontPresetResult.data
    : DEFAULT_TYPOGRAPHY.fontPreset!;
  const fontSize = fontSizeResult.success
    ? fontSizeResult.data
    : DEFAULT_TYPOGRAPHY.fontSize!;

  return {
    fontPreset,
    fontSize,
    fontFamily: typography?.fontFamily?.trim() || FONT_PRESET_MAP[fontPreset].family,
  };
}

export function getAppearanceTypography(appearance: Appearance): ThemeTypography {
  return (
    appearance.random?.typography ??
    appearance.light.typography ??
    appearance.dark.typography ??
    DEFAULT_TYPOGRAPHY
  );
}

export function setAppearanceTypography(
  appearance: Appearance,
  typography: ThemeTypography,
): Appearance {
  const resolvedTypography = resolveThemeTypography(typography);
  return {
    light: {
      ...appearance.light,
      typography: resolvedTypography,
    },
    dark: {
      ...appearance.dark,
      typography: resolvedTypography,
    },
    ...(appearance.random
      ? {
          random: {
            ...appearance.random,
            typography: resolvedTypography,
          },
        }
      : {}),
  };
}

export function getThemeSpecificationForMode(
  theme: Theme,
  appearance: Appearance,
): ThemeSpecification {
  if (theme === "random") {
    return appearance.random ?? DEFAULT_LIGHT_THEME;
  }

  const resolvedTheme = theme === "system" ? getSystemResolvedTheme() : theme;
  return appearance[resolvedTheme];
}

function resolveRandomThemeTone(appearance: Appearance): ResolvedTheme {
  const randomSpecification = appearance.random;
  if (!randomSpecification) {
    return "light";
  }

  return getRelativeLuminance(randomSpecification.colors.primary) > 0.5
    ? "light"
    : "dark";
}

export function resolveThemeMode(
  theme: Theme,
  appearance: Appearance = DEFAULT_APPEARANCE,
): ResolvedTheme {
  if (theme === "system") {
    return getSystemResolvedTheme();
  }

  if (theme === "random") {
    return resolveRandomThemeTone(appearance);
  }

  return theme;
}

function buildHeatmapScale(
  resolvedTheme: ResolvedTheme,
  shell: string,
  accent: string,
) {
  const stops =
    resolvedTheme === "dark"
      ? [0.12, 0.2, 0.3, 0.42, 0.55, 0.68, 0.82]
      : [0.18, 0.28, 0.42, 0.56, 0.7, 0.82, 0.92];

  return Object.fromEntries(
    stops.map((stop, index) => [
      `--heatmap-${index}`,
      mixHexColors(shell, accent, stop),
    ]),
  );
}

export function buildThemeVariables(
  specification: ThemeSpecification,
  resolvedTheme: ResolvedTheme,
) {
  const { primary, secondary, accent } = specification.colors;
  const typography = resolveThemeTypography(specification.typography);
  const isDark = resolvedTheme === "dark";

  const shellBackground = isDark
    ? primary
    : mixHexColors(primary, secondary, 0.26);
  const sidebarBackground = mixHexColors(
    secondary,
    primary,
    isDark ? 0.22 : 0.06,
  );
  const contentBackground = isDark
    ? mixHexColors(primary, secondary, 0.14)
    : primary;
  const panelBackground = isDark
    ? mixHexColors(secondary, primary, 0.14)
    : mixHexColors(primary, secondary, 0.22);
  const panelMutedBackground = mixHexColors(
    primary,
    secondary,
    isDark ? 0.34 : 0.18,
  );
  const panelAccentBackground = mixHexColors(
    accent,
    isDark ? secondary : "#ffffff",
    isDark ? 0.72 : 0.82,
  );
  const elevatedSurface = mixHexColors(
    panelBackground,
    "#ffffff",
    isDark ? 0.04 : 0.26,
  );
  const borderColor = mixHexColors(
    panelBackground,
    isDark ? "#ffffff" : "#111111",
    isDark ? 0.2 : 0.22,
  );
  const strongText = getReadableNeutralForeground(shellBackground);
  const baseText = getReadableNeutralForeground(contentBackground);
  const cardText = getReadableNeutralForeground(elevatedSurface);
  const sidebarText = getReadableNeutralForeground(sidebarBackground);
  const mutedText = mixHexColors(baseText, contentBackground, isDark ? 0.42 : 0.58);
  const subtleText = mixHexColors(baseText, contentBackground, isDark ? 0.28 : 0.42);
  const accentForeground = getReadableNeutralForeground(accent);
  const accentSurfaceForeground = getReadableNeutralForeground(
    panelAccentBackground,
  );
  const destructive = isDark ? "#8a8a8a" : "#555555";

  return {
    "--theme-primary": primary,
    "--theme-secondary": secondary,
    "--theme-accent": accent,
    "--app-shell-background": shellBackground,
    "--app-sidebar-background": sidebarBackground,
    "--app-content-background": contentBackground,
    "--app-panel-background": panelBackground,
    "--app-panel-muted-background": panelMutedBackground,
    "--app-panel-accent-background": panelAccentBackground,
    "--app-border-strong": borderColor,
    "--app-text-strong": strongText,
    "--app-text-base": baseText,
    "--app-text-muted": mutedText,
    "--app-font-family": typography.fontFamily,
    "--app-font-size-root": FONT_SIZE_MAP[typography.fontSize].rootSize,
    "--background": contentBackground,
    "--foreground": baseText,
    "--card": elevatedSurface,
    "--card-foreground": cardText,
    "--popover": elevatedSurface,
    "--popover-foreground": cardText,
    "--primary": accent,
    "--primary-foreground": accentForeground,
    "--secondary": panelMutedBackground,
    "--secondary-foreground": getReadableNeutralForeground(panelMutedBackground),
    "--muted": panelMutedBackground,
    "--muted-foreground": mutedText,
    "--accent": panelAccentBackground,
    "--accent-foreground": accentSurfaceForeground,
    "--destructive": destructive,
    "--border": withAlpha(borderColor, isDark ? 0.72 : 0.68),
    "--input": elevatedSurface,
    "--ring": withAlpha(accent, 0.48),
    "--chart-1": accent,
    "--chart-2": mixHexColors(accent, secondary, 0.32),
    "--chart-3": mixHexColors(accent, primary, 0.58),
    "--chart-4": mixHexColors(secondary, accent, 0.46),
    "--chart-5": mixHexColors(primary, accent, 0.74),
    "--sidebar": sidebarBackground,
    "--sidebar-foreground": sidebarText,
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": accentForeground,
    "--sidebar-accent": panelAccentBackground,
    "--sidebar-accent-foreground": accentSurfaceForeground,
    "--sidebar-border": withAlpha(borderColor, isDark ? 0.78 : 0.72),
    "--sidebar-ring": withAlpha(accent, 0.54),
    "--tooltip-background": strongText,
    "--tooltip-foreground": isDark ? "#111111" : "#fafafa",
    "--status-info": accent,
    "--status-success": mixHexColors(accent, secondary, isDark ? 0.2 : 0.38),
    "--status-warning": mixHexColors(accent, primary, isDark ? 0.34 : 0.56),
    "--status-danger": destructive,
    "--text-subtle": subtleText,
    ...buildHeatmapScale(resolvedTheme, shellBackground, accent),
  };
}

export function applyAppearance(
  theme: Theme,
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
) {
  const specification = getThemeSpecificationForMode(theme, appearance);
  const resolvedTheme = resolveThemeMode(theme, appearance);
  const nextVariables = buildThemeVariables(specification, resolvedTheme);

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  for (const [name, value] of Object.entries(nextVariables)) {
    root.style.setProperty(name, value);
  }

  root.style.fontSize = nextVariables["--app-font-size-root"];

  return resolvedTheme;
}
