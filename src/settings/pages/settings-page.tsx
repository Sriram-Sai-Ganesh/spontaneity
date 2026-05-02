import { useQuery, useMutation } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuerySettings } from "@/settings/hooks/use-query-settings";
import { useMutationSettings } from "@/settings/hooks/use-mutation-settings";
import SettingsForm from "@/settings/components/settings-form";
import type { SettingsType } from "@/settings/types/settings";
import { api } from "../../../convex/_generated/api";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { data: settings } = useQuerySettings();
  const { edit } = useMutationSettings();

  const notifPrefs = useQuery(api.notification_preferences_queries.getMyNotificationPreferences);
  const updateNotifPrefs = useMutation(api.notification_preferences_mutations.updateNotificationPreferences);

  const handleSubmit = (values: SettingsType) => {
    edit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <SettingsForm
          initialValues={settings}
          onSubmit={handleSubmit}
          emailNotificationsEnabled={notifPrefs?.emailNotificationsEnabled ?? true}
          onEmailNotificationsChange={(enabled) =>
            void updateNotifPrefs({ emailNotificationsEnabled: enabled })
          }
        />
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
