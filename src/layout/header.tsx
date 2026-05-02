import { useState } from "react";
import { useQuery } from "convex/react";
import { useLocation } from "wouter";
import {
  Bell,
  CalendarCheck,
  Compass,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
} from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resetAllMessages } from "@/messages/store/messages";
import ThemeSettingsDialog from "@/theme/theme-settings-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import FriendRequestsPanel from "@/friends/components/friend-requests-panel";
import { api } from "../../convex/_generated/api";

interface HeaderProps {
  onMenuClick?: () => void;
  onToggleSidebarCollapse?: () => void;
  isSidebarCollapsed?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  onToggleSidebarCollapse,
  isSidebarCollapsed = false,
}) => {
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const { signOut } = useAuthActions();
  const [location, navigate] = useLocation();
  const isExploreActive = location === "/explore";
  const user = useQuery(api.users_queries.me);
  const incomingRequests = useQuery(api.friends_queries.getIncomingRequests);
  const pendingCount = incomingRequests?.length ?? 0;

  const avatarLetter = user?.name?.[0]?.toUpperCase() ?? "U";
  const fullName = user?.name || "You";

  return (
    <>
      <header
        className={cn(
          "flex items-center justify-between gap-2 w-full border-b bg-app-shell px-3 py-2",
        )}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex h-8 w-8"
            onClick={() => onToggleSidebarCollapse?.()}
            aria-label={isSidebarCollapsed ? "Expand group list" : "Collapse group list"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
          <CalendarCheck aria-hidden="true" />
          <span className="font-semibold text-sm">Spontaneity</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isExploreActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate("/explore")}
            aria-label="Explore activities"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden sm:inline">Explore</span>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                aria-label="Friend requests and friends"
              >
                <Bell className="h-5 w-5" />
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <FriendRequestsPanel />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 p-0"
                aria-label="Open settings"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image ?? undefined} alt={fullName} />
                  <AvatarFallback>{avatarLetter}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image ?? undefined} alt={fullName} />
                  <AvatarFallback>{avatarLetter}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold leading-tight">
                    {fullName}
                  </span>
                  {user?.email && (
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <UserCircle className="mr-2 h-4 w-4" /> View profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setThemeDialogOpen(true)}>
                <Palette className="mr-2 h-4 w-4" /> Theme
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async (event) => {
                  event.preventDefault();
                  resetAllMessages();
                  await signOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <ThemeSettingsDialog
        open={themeDialogOpen}
        onOpenChange={setThemeDialogOpen}
      />
    </>
  );
};

export default Header;
