import { createPersistedObservable } from "@/store/persisted-observable";
import { settingsSchema, type SettingsType } from "@/settings/types/settings";

const defaultSettings: SettingsType = {
  displayName: "",
  openRouterApiKey: "",
};

export function decodeSettings(value: unknown): SettingsType {
  const result = settingsSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  return defaultSettings;
}

export const $settings = createPersistedObservable<SettingsType>(
  "settings",
  defaultSettings,
  decodeSettings,
);

export function updateSettings(updates: Partial<SettingsType>) {
  $settings.set({ ...$settings.get(), ...updates });
}

export function getSettings(): SettingsType {
  return $settings.get();
}
