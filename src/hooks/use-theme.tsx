import { $appearance } from "@/store/appearance";
import { $theme, setTheme } from "@/store/theme";
import { resolveThemeMode } from "@/theme/appearance";
import { useSelector } from "@legendapp/state/react";
import { useEffect, useState } from "react";

export const useTheme = () => {
  const appearance = useSelector($appearance);
  const theme = useSelector($theme);
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveThemeMode(theme, appearance),
  );

  useEffect(() => {
    const applyResolvedTheme = () => {
      setResolvedTheme(resolveThemeMode(theme, appearance));
    };

    applyResolvedTheme();

    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    mediaQuery.addEventListener("change", applyResolvedTheme);
    return () => mediaQuery.removeEventListener("change", applyResolvedTheme);
  }, [appearance, theme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
};
