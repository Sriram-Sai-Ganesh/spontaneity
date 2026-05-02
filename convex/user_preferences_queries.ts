import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";

/**
 * Get event preferences for a user by ID. Used from the HTTP chat action.
 */
export const getEventPreferencesForUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!row) return null;
    return {
      preferredEventTypes: row.preferredEventTypes,
      negativeEventTypes: row.negativeEventTypes ?? [],
      cuisinePreferences: row.cuisinePreferences ?? [],
      dietaryRestrictions: row.dietaryRestrictions ?? [],
      allergies: row.allergies ?? [],
      personSpecificLikes: row.personSpecificLikes ?? {},
      personSpecificDislikes: row.personSpecificDislikes ?? {},
    };
  },
});

/**
 * Get the current user's event type preferences.
 */
export const getUserEventPreferences = queryWithAuth({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      preferredEventTypes: v.array(v.string()),
      negativeEventTypes: v.array(v.string()),
      rawLikes: v.optional(v.array(v.string())),
      rawDislikes: v.optional(v.array(v.string())),
      allergies: v.optional(v.array(v.string())),
      dietaryRestrictions: v.optional(v.array(v.string())),
      cuisinePreferences: v.optional(v.array(v.string())),
      personSpecificLikes: v.optional(v.record(v.string(), v.array(v.string()))),
      personSpecificDislikes: v.optional(v.record(v.string(), v.array(v.string()))),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const preferences = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!preferences) return null;
    return {
      userId: preferences.userId,
      preferredEventTypes: preferences.preferredEventTypes,
      negativeEventTypes: preferences.negativeEventTypes ?? [],
      rawLikes: preferences.rawLikes,
      rawDislikes: preferences.rawDislikes,
      allergies: preferences.allergies,
      dietaryRestrictions: preferences.dietaryRestrictions,
      cuisinePreferences: preferences.cuisinePreferences,
      personSpecificLikes: preferences.personSpecificLikes,
      personSpecificDislikes: preferences.personSpecificDislikes,
    };
  },
});