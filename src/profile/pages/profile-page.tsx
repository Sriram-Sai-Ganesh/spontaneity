import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Bell, KeyRound, User, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuerySettings } from "@/settings/hooks/use-query-settings";
import { useMutationSettings } from "@/settings/hooks/use-mutation-settings";
import PreferencesSection from "@/preferences/components/preferences-section";
import { api } from "../../../convex/_generated/api";

const BUDGET_OPTIONS: { label: string; value: "low" | "medium" | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "Up to $30", value: "low" },
  { label: "Up to $75", value: "medium" },
];

const END_TIME_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "8 PM", value: 20 },
  { label: "9 PM", value: 21 },
  { label: "10 PM", value: 22 },
  { label: "11 PM", value: 23 },
];

const DISTANCE_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "< 5 miles", value: 5 },
  { label: "< 10 miles", value: 10 },
  { label: "< 20 miles", value: 20 },
  { label: "< 50 miles", value: 50 },
];

interface HardRestrictionsSectionProps {
  restrictions: { maxBudget?: "low" | "medium"; maxEventEndHour?: number; maxDistanceMiles?: number } | null | undefined;
  onSave: (args: { maxBudget?: "low" | "medium"; maxEventEndHour?: number; maxDistanceMiles?: number }) => Promise<null>;
}

const HardRestrictionsSection: React.FC<HardRestrictionsSectionProps> = ({ restrictions, onSave }) => {
  const [saving, setSaving] = useState(false);
  const currentBudget = restrictions?.maxBudget;
  const currentEndHour = restrictions?.maxEventEndHour;
  const currentDistance = restrictions?.maxDistanceMiles;

  const handleSave = async (update: { maxBudget?: "low" | "medium"; maxEventEndHour?: number; maxDistanceMiles?: number }) => {
    setSaving(true);
    try {
      await onSave({
        maxBudget: update.maxBudget ?? currentBudget,
        maxEventEndHour: update.maxEventEndHour ?? currentEndHour,
        maxDistanceMiles: update.maxDistanceMiles ?? currentDistance,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Hard limits</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Events that exceed any of your limits will never be suggested. In a group, the strictest member's limits apply.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Budget cap (per person)</p>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => void handleSave({ maxBudget: opt.value })}
                disabled={saving}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                  currentBudget === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Latest event end time</p>
          <div className="flex flex-wrap gap-2">
            {END_TIME_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => void handleSave({ maxEventEndHour: opt.value })}
                disabled={saving}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                  currentEndHour === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Max travel distance</p>
          <div className="flex flex-wrap gap-2">
            {DISTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => void handleSave({ maxDistanceMiles: opt.value })}
                disabled={saving}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                  currentDistance === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const ProfilePage: React.FC = () => {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users_queries.me, isAuthenticated ? {} : "skip");
  const updateProfile = useMutation(api.users_mutations.updateMyProfile);
  const { data: settings } = useQuerySettings();
  const { edit } = useMutationSettings();

  const notifPrefs = useQuery(api.notification_preferences_queries.getMyNotificationPreferences, isAuthenticated ? {} : "skip");
  const updateNotifPrefs = useMutation(api.notification_preferences_mutations.updateNotificationPreferences);
  const hardRestrictions = useQuery(api.user_hard_restrictions_queries.getUserHardRestrictions, isAuthenticated ? {} : "skip");
  const setHardRestrictions = useMutation(api.user_hard_restrictions_mutations.setUserHardRestrictions);

  const [nickname, setNickname] = useState(settings.displayName);
  const [city, setCity] = useState("");
  const [apiKey, setApiKey] = useState(settings.openRouterApiKey ?? "");
  const [showApiKey, setShowApiKey] = useState(false);

  const avatarLetter = user?.name?.[0]?.toUpperCase() ?? "U";
  const fullName = user?.name || "You";

  const nicknameChanged = nickname !== settings.displayName;
  const cityChanged = city !== (user?.city ?? "");
  const apiKeyChanged = apiKey !== (settings.openRouterApiKey ?? "");

  useEffect(() => {
    setCity(user?.city ?? "");
  }, [user?.city]);

  const handleSaveNickname = (e: React.FormEvent) => {
    e.preventDefault();
    edit({ displayName: nickname.trim() });
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    edit({ openRouterApiKey: apiKey.trim() });
  };

  const handleSaveCity = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({ city: city.trim() || null });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6 max-w-xl">
        {/* Account Info */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Account</h2>
          </div>
          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user?.image ?? undefined} alt={fullName} />
              <AvatarFallback className="text-lg">{avatarLetter}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{fullName}</span>
              {user?.email && (
                <span className="text-sm text-muted-foreground">{user.email}</span>
              )}
              <span className="text-xs text-muted-foreground mt-0.5">
                Signed in with Google
              </span>
            </div>
          </div>
        </section>

        {/* Nickname */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">City</h2>
          <form onSubmit={handleSaveCity} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="city" className="text-sm text-muted-foreground">
                Default fallback city when a group has no saved location
              </label>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Chicago, IL"
                className="rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Button type="submit" size="sm" disabled={!cityChanged}>
                Save city
              </Button>
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Display name</h2>
          <form onSubmit={handleSaveNickname} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nickname" className="text-sm text-muted-foreground">
                Nickname shown in chats
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your nickname"
                className="rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Button type="submit" size="sm" disabled={!nicknameChanged}>
                Save nickname
              </Button>
            </div>
          </form>
        </section>

        {/* Event Preferences */}
        <PreferencesSection />

        {/* Hard Restrictions */}
        <HardRestrictionsSection
          restrictions={hardRestrictions}
          onSave={setHardRestrictions}
        />

        {/* Email Notifications */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Email notifications</h2>
          </div>
          <div className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="emailNotifications" className="text-sm font-medium">Receive email notifications</label>
              <span className="text-xs text-muted-foreground">
                New recommendations, accepted plans, and event reminders.
              </span>
            </div>
            <input
              id="emailNotifications"
              type="checkbox"
              checked={notifPrefs?.emailNotificationsEnabled ?? true}
              onChange={(e) => void updateNotifPrefs({ emailNotificationsEnabled: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
          </div>
        </section>

        {/* OpenRouter API Key */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">OpenRouter API Key</h2>
          </div>
          <form onSubmit={handleSaveApiKey} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="apiKey" className="text-sm text-muted-foreground">
                Required when using @ai in chats
              </label>
              <div className="flex gap-2">
                <input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApiKey((v) => !v)}
                >
                  {showApiKey ? "Hide" : "Show"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stored locally in this browser only — never sent to our servers.
              </p>
            </div>
            <div>
              <Button type="submit" size="sm" disabled={!apiKeyChanged}>
                Save API key
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
