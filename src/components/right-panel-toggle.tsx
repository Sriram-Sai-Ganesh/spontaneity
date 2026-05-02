import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface RightPanelToggleProps {
  children: ReactNode;
  collapsed: boolean;
  focused?: boolean;
  onToggle?: () => void;
}

export function RightPanelToggle({
  children,
  collapsed,
  focused = false,
  onToggle,
}: RightPanelToggleProps) {
  return (
    <button
      type="button"
      className={cn(
        "group/header -ml-2 flex items-center gap-1 rounded-full px-2 py-1",
        "text-sm font-semibold transition-all duration-150",
        "hover:bg-muted hover:text-foreground hover:shadow-sm",
        "active:scale-[0.98] active:bg-muted/80",
      )}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full bg-background/70",
          "transition-transform duration-200 ease-out",
          "group-hover/header:translate-x-0.5 group-hover/header:scale-105",
          "group-active/header:scale-95",
        )}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 ease-out",
            focused && "rotate-180",
            !focused && collapsed && "-rotate-90",
          )}
        />
      </span>
      {children}
    </button>
  );
}
