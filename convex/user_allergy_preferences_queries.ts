import { queryWithAuth } from "./lib";
import { v } from "convex/values";

export const getUserAllergyPreferences = queryWithAuth({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      allergies: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const preferences = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!preferences) {
      return null;
    }

    return {
      userId: preferences.userId,
      allergies: preferences.allergies ?? [],
    };
  },
});

export const getUserAllergyPreferencesForUserId = queryWithAuth({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      allergies: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const preferences = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!preferences) {
      return null;
    }

    return {
      userId: preferences.userId,
      allergies: preferences.allergies ?? [],
    };
  },
});
