import { createContext, useContext } from "react";

type SidebarContextValue = {
  closeSidebar: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
};

export const SidebarContext = createContext<SidebarContextValue>({
  closeSidebar: () => {},
  isCollapsed: false,
  toggleCollapsed: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}
