import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";

/**
 * Get the current user's email notification preferences.
 * Defaults to enabled (true) if no preference record exists.
 */
export const getMyNotificationPreferences = queryWithAuth({
  args: {},
  returns: v.object({ emailNotificationsEnabled: v.boolean() }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("userAppearancePreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .unique();
    return { emailNotificationsEnabled: row?.emailNotificationsEnabled ?? true };
  },
});

/**
 * Server-side: check whether a user has opted in to email notifications.
 * Returns true (enabled) when no preference record exists.
 */
export const isEmailEnabledForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("userAppearancePreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    return row?.emailNotificationsEnabled ?? true;
  },
});
