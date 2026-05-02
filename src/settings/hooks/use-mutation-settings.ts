import { toast } from "sonner";
import type { UpdateSettingsType } from "@/settings/types/settings";
import { updateSettings } from "@/settings/store/settings";

export function useMutationSettings() {
  const edit = (updates: UpdateSettingsType) => {
    try {
      updateSettings(updates);
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Error saving settings", {
        description: (error as Error).message || "Please try again later",
      });
    }
  };

  return { edit };
}
