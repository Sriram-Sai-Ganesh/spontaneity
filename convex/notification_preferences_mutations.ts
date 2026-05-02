import { v } from "convex/values";
import { mutationWithAuth } from "./lib";

/**
 * Enable or disable email notifications for the current user.
 * Upserts the preference record so callers don't need to check existence.
 */
export const updateNotificationPreferences = mutationWithAuth({
  args: { emailNotificationsEnabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { emailNotificationsEnabled }) => {
    const existing = await ctx.db
      .query("userAppearancePreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { emailNotificationsEnabled });
    } else {
      await ctx.db.insert("userAppearancePreferences", {
        userId: ctx.userId,
        emailNotificationsEnabled,
      });
    }
    return null;
  },
});
