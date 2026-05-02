import { Computer, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipButton } from "@/components/tooltip-button";
import { useAppearance } from "@/hooks/use-appearance";
import { useTheme } from "@/hooks/use-theme";
import type { Theme } from "@/types/theme";

export function ThemeToggle() {
  const { resetAppearancePalette } = useAppearance();
  const { theme, setTheme } = useTheme();

  const handleThemeChange = (nextTheme: Theme) => {
    if (nextTheme !== theme) {
      resetAppearancePalette();
    }

    setTheme(nextTheme);
  };

  // Determine which theme is active
  const isLightTheme = theme === "light";
  const isDarkTheme = theme === "dark";
  const isSystemTheme = theme === "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipButton
          variant="ghost"
          size="icon"
          className="relative w-7 h-7 flex-shrink-0"
          tooltipContent="Toggle theme"
        >
          <Sun
            className={`h-4 w-4 transition-all duration-150 ease-in-out absolute
              ${isLightTheme ? "rotate-0 scale-100" : "rotate-90 scale-0"}`}
          />
          <Moon
            className={`h-4 w-4 transition-all duration-150 ease-in-out absolute
              ${isDarkTheme ? "rotate-0 scale-100" : "rotate-90 scale-0"}`}
          />
          <Computer
            className={`h-4 w-4 transition-all duration-150 ease-in-out absolute
              ${isSystemTheme ? "rotate-0 scale-100" : "rotate-90 scale-0"}`}
          />
          <span className="sr-only">Toggle theme</span>
        </TooltipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
