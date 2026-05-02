import { z } from "zod";

export const settingsSchema = z.object({
  displayName: z.string(),
  openRouterApiKey: z.string().optional(),
});

export const updateSettingsSchema = settingsSchema.partial();

export type SettingsType = z.infer<typeof settingsSchema>;
export type UpdateSettingsType = z.infer<typeof updateSettingsSchema>;
