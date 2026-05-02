import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import Header from "./header";
import { SidebarContext } from "./sidebar-context";

interface LayoutProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
  rightPanel?: React.ReactNode;
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({
  sidebar,
  content,
  rightPanel,
  className,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ sidebar: 0.24, right: 0.3 });
  const [dragState, setDragState] = useState<{
    handle: "sidebar" | "right";
    startX: number;
    startSidebar: number;
    startRight: number;
    containerWidth: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebarCollapsed = () =>
    setSidebarCollapsed((previous) => !previous);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  useEffect(() => {
    if (!dragState) return;

    const MIN_SIDEBAR = 0.14;
    const MAX_SIDEBAR = 0.42;
    const MIN_RIGHT = 0.26;
    const MAX_RIGHT = 0.42;
    const MIN_CENTER = 0.28;

    const handleMove = (event: MouseEvent) => {
      const dx = (event.clientX - dragState.startX) / dragState.containerWidth;

      let nextSidebar = dragState.startSidebar;
      let nextRight = dragState.startRight;

      if (dragState.handle === "sidebar") {
        nextSidebar = sidebarCollapsed ? 0 : dragState.startSidebar + dx;
        nextSidebar = clamp(nextSidebar, MIN_SIDEBAR, MAX_SIDEBAR);
      } else {
        // Dragging the right handle right should shrink the right pane and grow center
        nextRight = dragState.startRight - dx;
        nextRight = clamp(nextRight, MIN_RIGHT, MAX_RIGHT);
      }

      let center = 1 - nextSidebar - nextRight;
      if (center < MIN_CENTER) {
        if (dragState.handle === "sidebar") {
          nextSidebar = 1 - nextRight - MIN_CENTER;
          nextSidebar = clamp(nextSidebar, MIN_SIDEBAR, MAX_SIDEBAR);
        } else {
          nextRight = 1 - nextSidebar - MIN_CENTER;
          nextRight = clamp(nextRight, MIN_RIGHT, MAX_RIGHT);
        }
        center = 1 - nextSidebar - nextRight;
      }

      if (center <= 0.05) return;

      setPanelWidths({ sidebar: nextSidebar, right: nextRight });
    };

    const handleUp = () => setDragState(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, sidebarCollapsed]);

  const startDrag =
    (handle: "sidebar" | "right") => (event: React.MouseEvent) => {
      if (!gridRef.current) return;
      const containerWidth = gridRef.current.getBoundingClientRect().width;
      setDragState({
        handle,
        startX: event.clientX,
        startSidebar: panelWidths.sidebar,
        startRight: panelWidths.right,
        containerWidth: containerWidth || 1,
      });
      event.preventDefault();
    };

  const leftWidth = sidebarCollapsed ? 0 : panelWidths.sidebar;
  const rightWidth = panelWidths.right;
  const centerWidth = Math.max(0.12, 1 - leftWidth - rightWidth);
  const templateColumns = `minmax(0, ${leftWidth}fr) 8px minmax(0, ${centerWidth}fr) 8px minmax(0, ${rightWidth}fr)`;

  return (
    <SidebarContext.Provider
      value={{
        closeSidebar,
        isCollapsed: sidebarCollapsed,
        toggleCollapsed: toggleSidebarCollapsed,
      }}
    >
      <div
        className={cn(
          "flex min-h-screen w-full bg-app-shell antialiased scroll-smooth",
          className,
        )}
      >
        <div className="flex flex-col w-full">
          <Header
            onMenuClick={() => setSidebarOpen(true)}
            onToggleSidebarCollapse={toggleSidebarCollapsed}
            isSidebarCollapsed={sidebarCollapsed}
          />

          {/* Mobile sidebar via Sheet */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="bg-app-sidebar p-0"
              aria-describedby={undefined}
            >
              <VisuallyHidden.Root>
                <SheetTitle>Navigation</SheetTitle>
              </VisuallyHidden.Root>
              <div className="flex flex-col h-full pt-10">{sidebar}</div>
            </SheetContent>
          </Sheet>

          {/* Mobile: show content only, navigation via sheet */}
          <div className="flex flex-1 min-h-0 md:hidden">
            <main className="flex min-h-0 flex-col border-t bg-app-content">
              {content}
            </main>
          </div>

          {/* Desktop: resizable columns */}
          <div
            ref={gridRef}
            className="hidden md:grid flex-1 min-h-0 transition-[grid-template-columns] duration-150"
            style={{ gridTemplateColumns: templateColumns }}
          >
            {/* Desktop sidebar */}
            <aside
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-app-sidebar",
                sidebarCollapsed && "opacity-0 pointer-events-none",
              )}
            >
              {sidebar}
            </aside>

            <div
              role="separator"
              aria-orientation="vertical"
              className={cn(
                "h-full w-2 cursor-col-resize bg-transparent transition-colors",
                "hover:bg-border/60",
                sidebarCollapsed && "pointer-events-none opacity-0",
              )}
              onMouseDown={startDrag("sidebar")}
            />

            {/* Main content */}
            <main className="flex min-h-0 min-w-0 flex-col border-r bg-app-content">
              {content}
            </main>

            <div
              role="separator"
              aria-orientation="vertical"
              className="h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-border/60"
              onMouseDown={startDrag("right")}
            />

            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l bg-app-panel">
              {rightPanel ?? (
                <div
                  className="m-4 flex-1 rounded-lg border border-dashed border-app-border-strong/70 bg-app-panel-muted"
                  aria-hidden="true"
                  role="presentation"
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Layout;
