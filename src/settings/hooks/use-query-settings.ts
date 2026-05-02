import { useSelector } from "@legendapp/state/react";
import { $settings } from "@/settings/store/settings";

export function useQuerySettings() {
  const settings = useSelector($settings);

  return {
    data: settings,
    loading: false,
    error: false,
  };
}
