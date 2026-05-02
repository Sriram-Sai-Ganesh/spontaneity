import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SettingsType } from "@/settings/types/settings";

interface SettingsFormProps {
  initialValues: SettingsType;
  onSubmit: (values: SettingsType) => void;
  emailNotificationsEnabled: boolean;
  onEmailNotificationsChange: (enabled: boolean) => void;
}

const SettingsForm: React.FC<SettingsFormProps> = ({
  initialValues,
  onSubmit,
  emailNotificationsEnabled,
  onEmailNotificationsChange,
}) => {
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [apiKey, setApiKey] = useState(initialValues.openRouterApiKey ?? "");

  const hasChanges =
    displayName !== initialValues.displayName ||
    apiKey !== (initialValues.openRouterApiKey ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      displayName: displayName.trim(),
      openRouterApiKey: apiKey.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="displayName" className="text-sm font-medium">
          Nickname
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your nickname"
          className="rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="openRouterApiKey" className="text-sm font-medium">
          OpenRouter API Key
        </label>
        <input
          id="openRouterApiKey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-..."
          className="rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Stored locally for this browser; required only when calling @ai.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <label htmlFor="emailNotifications" className="text-sm font-medium">
            Email notifications
          </label>
          <p className="text-xs text-muted-foreground">
            Receive emails for new recommendations, accepted plans, and reminders.
          </p>
        </div>
        <input
          id="emailNotifications"
          type="checkbox"
          checked={emailNotificationsEnabled}
          onChange={(e) => onEmailNotificationsChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </div>

      <Button type="submit" disabled={!hasChanges}>
        Save
      </Button>
    </form>
  );
};

export default SettingsForm;
