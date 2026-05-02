import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Switch, Route, useLocation } from "wouter";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import Layout from "@/layout";
import { useAppearance } from "@/hooks/use-appearance";
import { useTheme } from "@/hooks/use-theme";
import { applyAppearance } from "@/theme/appearance";
import ListChatsPage from "@/chats/pages/list-chats-page";
import MessagesPage from "@/messages/pages/messages-page";
import HomeEmptyState from "@/components/home-empty-state";
import ProfilePage from "@/profile/pages/profile-page";
import { Button } from "@/components/ui/button";
// import { BotMessageSquareIcon } from "lucide-react";
import { CalendarCheck } from "lucide-react";
import JoinGroupPage from "@/groups/pages/join-group-page";
import AvailabilityHeatmap from "@/availability/components/availability-heatmap";
import SuggestedEvents from "@/availability/components/suggested-events";
import { RecommendationProvider } from "@/availability/context/recommendation-context";
import GroupPulse from "@/groups/components/group-pulse";
import { RecurringEventsPanel } from "@/availability/components/recurring-events-panel";
import FreeformPreferencesDialog from "@/preferences/pages/freeform-preferences-dialog";
import ExplorePage from "@/explore/pages/explore-page";
import FriendActivityFeed from "@/friends/components/friend-activity-feed";
import UserHistoryFeed from "@/profile/components/user-history-feed";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type RightPanelSection = "calendar" | "pulse" | "events" | "recurring";

const RIGHT_PANEL_SECTION_ORDER: RightPanelSection[] = [
  "calendar",
  "pulse",
  "events",
  "recurring",
];
const RIGHT_PANEL_DEFAULT_RATIOS: Record<RightPanelSection, number> = {
  calendar: 0.35,
  pulse: 0.2,
  events: 0.35,
  recurring: 0.1,
};
const RIGHT_PANEL_DEFAULT_ROWS: Record<RightPanelSection, string> = {
  calendar: "minmax(0, 1.4fr)",
  pulse: "minmax(0, 0.8fr)",
  events: "minmax(0, 1.4fr)",
  recurring: "minmax(0, 0.4fr)",
};
const RIGHT_PANEL_COLLAPSE_HEIGHTS: Record<RightPanelSection, number> = {
  calendar: 196,
  pulse: 148,
  events: 182,
  recurring: 148,
};
const RIGHT_PANEL_MIN_HEIGHTS: Record<RightPanelSection, number> = {
  calendar: 72,
  pulse: 72,
  events: 72,
  recurring: 72,
};
const RIGHT_PANEL_RESIZER_HEIGHT = 10;
const RIGHT_PANEL_RESIZER_COUNT = RIGHT_PANEL_SECTION_ORDER.length - 1;

function normalizeSectionRatios(
  ratios: Record<RightPanelSection, number>,
): Record<RightPanelSection, number> {
  const total = RIGHT_PANEL_SECTION_ORDER.reduce(
    (sum, section) => sum + Math.max(ratios[section], 0),
    0,
  );

  if (total <= 0) {
    return { ...RIGHT_PANEL_DEFAULT_RATIOS };
  }

  return Object.fromEntries(
    RIGHT_PANEL_SECTION_ORDER.map((section) => [
      section,
      Math.max(ratios[section], 0) / total,
    ]),
  ) as Record<RightPanelSection, number>;
}

function joinRightPanelRows(
  rows: Record<RightPanelSection, string>,
  resizerHeight: number,
) {
  return RIGHT_PANEL_SECTION_ORDER.map((section, index) => {
    const row = rows[section];
    return index < RIGHT_PANEL_RESIZER_COUNT
      ? `${row} ${resizerHeight}px`
      : row;
  }).join(" ");
}

export function RightPanelContent({ chatId }: { chatId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [focusedSection, setFocusedSection] =
    useState<RightPanelSection | null>(null);
  const [sectionRatios, setSectionRatios] = useState<
    Record<RightPanelSection, number>
  >(() => normalizeSectionRatios(RIGHT_PANEL_DEFAULT_RATIOS));
  const [dragState, setDragState] = useState<{
    handleIndex: 0 | 1 | 2;
    startY: number;
    startRatios: Record<RightPanelSection, number>;
  } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateHeight = () => {
      setContainerHeight(element.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const resizerHeight = focusedSection ? 0 : RIGHT_PANEL_RESIZER_HEIGHT;
  const availableHeight = Math.max(
    0,
    containerHeight - resizerHeight * RIGHT_PANEL_RESIZER_COUNT,
  );

  const sectionHeights = useMemo(() => {
    if (availableHeight <= 0) return null;

    if (focusedSection) {
      const collapsedHeight = RIGHT_PANEL_SECTION_ORDER.reduce(
        (height, section) =>
          section === focusedSection
            ? height
            : height + RIGHT_PANEL_MIN_HEIGHTS[section],
        0,
      );
      return Object.fromEntries(
        RIGHT_PANEL_SECTION_ORDER.map((section) => [
          section,
          section === focusedSection
            ? Math.max(
                RIGHT_PANEL_MIN_HEIGHTS[section],
                availableHeight - collapsedHeight,
              )
            : RIGHT_PANEL_MIN_HEIGHTS[section],
        ]),
      ) as Record<RightPanelSection, number>;
    }

    let consumed = 0;
    return RIGHT_PANEL_SECTION_ORDER.reduce(
      (heights, section, index) => {
        const nextHeight =
          index === RIGHT_PANEL_SECTION_ORDER.length - 1
            ? Math.max(0, availableHeight - consumed)
            : Math.max(0, sectionRatios[section] * availableHeight);

        consumed += nextHeight;
        heights[section] = nextHeight;
        return heights;
      },
      {} as Record<RightPanelSection, number>,
    );
  }, [availableHeight, focusedSection, sectionRatios]);

  const collapsedSections = useMemo(
    () => {
      if (focusedSection) {
        return Object.fromEntries(
          RIGHT_PANEL_SECTION_ORDER.map((section) => [
            section,
            section !== focusedSection,
          ]),
        );
      }

      return sectionHeights
        ? Object.fromEntries(
            RIGHT_PANEL_SECTION_ORDER.map((section) => [
              section,
              sectionHeights[section] < RIGHT_PANEL_COLLAPSE_HEIGHTS[section],
            ]),
          )
        : Object.fromEntries(
            RIGHT_PANEL_SECTION_ORDER.map((section) => [section, false]),
          );
    },
    [focusedSection, sectionHeights],
  ) as Record<RightPanelSection, boolean>;

  const toggleSectionFocus = useCallback((section: RightPanelSection) => {
    setFocusedSection((current) => (current === section ? null : section));
  }, []);
  const resizeDisabled = focusedSection !== null;
  const resizeHandleClassName = `group flex touch-none items-center justify-center bg-transparent transition-colors ${
    resizeDisabled
      ? "pointer-events-none opacity-0"
      : "cursor-row-resize hover:bg-border/45 active:bg-border/60"
  }`;

  const startResize = useCallback(
    (handleIndex: 0 | 1 | 2) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragState({
        handleIndex,
        startY: event.clientY,
        startRatios: sectionRatios,
      });
    },
    [sectionRatios],
  );

  useEffect(() => {
    if (!dragState || availableHeight <= 0) return;

    const firstSection = RIGHT_PANEL_SECTION_ORDER[dragState.handleIndex];
    const secondSection = RIGHT_PANEL_SECTION_ORDER[dragState.handleIndex + 1];
    const firstStartHeight =
      dragState.startRatios[firstSection] * availableHeight;
    const secondStartHeight =
      dragState.startRatios[secondSection] * availableHeight;
    const pairHeight = firstStartHeight + secondStartHeight;

    const handleMove = (event: PointerEvent) => {
      const deltaY = event.clientY - dragState.startY;
      const firstMin = RIGHT_PANEL_MIN_HEIGHTS[firstSection];
      const secondMin = RIGHT_PANEL_MIN_HEIGHTS[secondSection];
      const nextFirstHeight = Math.min(
        pairHeight - secondMin,
        Math.max(firstMin, firstStartHeight + deltaY),
      );
      const nextSecondHeight = pairHeight - nextFirstHeight;

      setSectionRatios(
        normalizeSectionRatios({
          ...dragState.startRatios,
          [firstSection]: nextFirstHeight / availableHeight,
          [secondSection]: nextSecondHeight / availableHeight,
        }),
      );
    };

    const handleUp = () => setDragState(null);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [availableHeight, dragState]);

  const gridTemplateRows = sectionHeights
    ? joinRightPanelRows(
        Object.fromEntries(
          RIGHT_PANEL_SECTION_ORDER.map((section) => [
            section,
            `${sectionHeights[section]}px`,
          ]),
        ) as Record<RightPanelSection, string>,
        resizerHeight,
      )
    : focusedSection
      ? joinRightPanelRows(
          Object.fromEntries(
            RIGHT_PANEL_SECTION_ORDER.map((section) => [
              section,
              section === focusedSection
                ? "minmax(0, 1fr)"
                : `${RIGHT_PANEL_MIN_HEIGHTS[section]}px`,
            ]),
          ) as Record<RightPanelSection, string>,
          resizerHeight,
        )
      : joinRightPanelRows(RIGHT_PANEL_DEFAULT_ROWS, resizerHeight);

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-0 overflow-hidden"
      style={{ gridTemplateRows }}
    >
      <div className="min-h-0 overflow-hidden border-b">
        <AvailabilityHeatmap
          chatId={chatId}
          collapsed={collapsedSections.calendar}
          focused={focusedSection === "calendar"}
          onToggle={() => toggleSectionFocus("calendar")}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize calendar and pulse panels"
        className={resizeHandleClassName}
        onPointerDown={resizeDisabled ? undefined : startResize(0)}
      >
        <div className="h-1 w-10 rounded-full bg-border/85 transition-colors group-hover:bg-foreground/25" />
      </div>
      <div className="min-h-0 overflow-hidden border-b">
        <GroupPulse
          chatId={chatId}
          collapsed={collapsedSections.pulse}
          focused={focusedSection === "pulse"}
          onToggle={() => toggleSectionFocus("pulse")}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize pulse and suggested events panels"
        className={resizeHandleClassName}
        onPointerDown={resizeDisabled ? undefined : startResize(1)}
      >
        <div className="h-1 w-10 rounded-full bg-border/85 transition-colors group-hover:bg-foreground/25" />
      </div>
      <div className="min-h-0 overflow-hidden">
        <SuggestedEvents
          chatId={chatId}
          collapsed={collapsedSections.events}
          focused={focusedSection === "events"}
          onToggle={() => toggleSectionFocus("events")}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize suggested events and recurring events panels"
        className={resizeHandleClassName}
        onPointerDown={resizeDisabled ? undefined : startResize(2)}
      >
        <div className="h-1 w-10 rounded-full bg-border/85 transition-colors group-hover:bg-foreground/25" />
      </div>
      <div className="min-h-0 overflow-hidden border-t">
        <RecurringEventsPanel
          chatId={chatId}
          collapsed={collapsedSections.recurring}
          focused={focusedSection === "recurring"}
          onToggle={() => toggleSectionFocus("recurring")}
        />
      </div>
    </div>
  );
}

function App() {
  const { theme, setTheme } = useTheme();
  const { appearance, setAppearance } = useAppearance();
  const [location] = useLocation();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const saveAppearancePreferences = useMutation(
    api.user_appearance_mutations.setUserAppearancePreferences,
  );
  const preferences = useQuery(
    api.user_preferences_queries.getUserEventPreferences,
    isAuthenticated ? {} : "skip",
  );
  const user = useQuery(api.users_queries.me, isAuthenticated ? {} : "skip");
  const savedAppearancePreferences = useQuery(
    api.user_appearance_queries.getUserAppearancePreferences,
    isAuthenticated ? {} : "skip",
  );
  const isExplorePage = location === "/explore";
  const isProfilePage = location === "/profile";
  const groupIdMatch = location.match(/^\/groups\/([^/]+)$/);
  const activeGroupId = groupIdMatch ? groupIdMatch[1] : undefined;
  const activeGroup = useQuery(
    api.chats_queries.getOne,
    isAuthenticated && activeGroupId
      ? {
          chatId: activeGroupId as Id<"chats">,
        }
      : "skip",
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const appearanceSyncStateRef = useRef<{
    userId: string | null;
    hydrated: boolean;
    lastUploadedSignature: string | null;
  }>({
    userId: null,
    hydrated: false,
    lastUploadedSignature: null,
  });
  const localAppearancePreferences = useMemo(
    () => ({
      mode: theme,
      themes: appearance,
    }),
    [appearance, theme],
  );
  const localAppearanceSignature = JSON.stringify(localAppearancePreferences);
  const savedAppearanceSignature = savedAppearancePreferences
    ? JSON.stringify(savedAppearancePreferences)
    : null;

  useEffect(() => {
    if (preferences === null) {
      setOnboardingOpen(true);
    }
  }, [preferences]);

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      applyAppearance(theme, appearance, root);
    };

    applyTheme();

    if (theme !== "system") return;

    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [appearance, theme]);

  const e2eSignInAttempted = useRef(false);
  useEffect(() => {
    if (
      import.meta.env.VITE_E2E &&
      !isLoading &&
      !isAuthenticated &&
      !e2eSignInAttempted.current
    ) {
      e2eSignInAttempted.current = true;
      void signIn("anonymous");
    }
  }, [isLoading, isAuthenticated, signIn]);

  useEffect(() => {
    if (!isAuthenticated) {
      appearanceSyncStateRef.current = {
        userId: null,
        hydrated: false,
        lastUploadedSignature: null,
      };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user || savedAppearancePreferences === undefined) {
      return;
    }

    if (appearanceSyncStateRef.current.userId !== user._id) {
      appearanceSyncStateRef.current = {
        userId: user._id,
        hydrated: false,
        lastUploadedSignature: null,
      };
    }

    if (!appearanceSyncStateRef.current.hydrated) {
      appearanceSyncStateRef.current.hydrated = true;

      if (savedAppearancePreferences) {
        appearanceSyncStateRef.current.lastUploadedSignature =
          savedAppearanceSignature;

        if (savedAppearancePreferences.mode !== theme) {
          setTheme(savedAppearancePreferences.mode);
        }

        if (
          JSON.stringify(savedAppearancePreferences.themes) !==
          JSON.stringify(appearance)
        ) {
          setAppearance(savedAppearancePreferences.themes);
        }
      } else {
        appearanceSyncStateRef.current.lastUploadedSignature =
          localAppearanceSignature;
        void saveAppearancePreferences(localAppearancePreferences);
      }

      return;
    }

    if (
      appearanceSyncStateRef.current.lastUploadedSignature ===
      localAppearanceSignature
    ) {
      return;
    }

    appearanceSyncStateRef.current.lastUploadedSignature =
      localAppearanceSignature;
    void saveAppearancePreferences(localAppearancePreferences);
  }, [
    appearance,
    isAuthenticated,
    localAppearancePreferences,
    localAppearanceSignature,
    saveAppearancePreferences,
    savedAppearancePreferences,
    savedAppearanceSignature,
    setTheme,
    theme,
    user,
    setAppearance,
  ]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-8 w-8" />
          <span className="text-2xl font-semibold">Spontaneity</span>
        </div>
        <p className="text-muted-foreground text-sm">Sign in to get started</p>
        <Button onClick={() => void signIn("google")}>
          Sign in with Google
        </Button>
      </div>
    );
  }
  return (
    <RecommendationProvider key={activeGroupId ?? "no-chat"}>
      <Layout
        sidebar={<ListChatsPage activeChatId={activeGroupId} />}
        content={
          <Switch>
            <Route path="/explore">
              <ExplorePage />
            </Route>
            <Route path="/profile">
              <ProfilePage />
            </Route>
            <Route path="/groups/:id">
              {(params) => <MessagesPage key={params.id} chatId={params.id} />}
            </Route>
            <Route path="/invite/:token">
              {(params) => <JoinGroupPage token={params.token} />}
            </Route>
            <Route>
              <HomeEmptyState />
            </Route>
          </Switch>
        }
        rightPanel={
          activeGroupId && activeGroup ? (
            <RightPanelContent key={activeGroupId} chatId={activeGroupId} />
          ) : isExplorePage ? (
            <FriendActivityFeed />
          ) : isProfilePage ? (
            <UserHistoryFeed />
          ) : undefined
        }
        className="h-screen"
      />
      <FreeformPreferencesDialog
        open={onboardingOpen}
        onComplete={() => setOnboardingOpen(false)}
      />
    </RecommendationProvider>
  );
}

export default App;
