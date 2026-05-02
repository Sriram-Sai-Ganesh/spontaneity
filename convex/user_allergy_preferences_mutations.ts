import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutationWithAuth } from "./lib";
import type { Id } from "./_generated/dataModel";

/**
 * Internal: update a user's allergies and dietary restrictions by userId.
 * Used from actions that have userId but cannot pass auth to mutations.
 */
export const setUserAllergyPreferencesInternal = internalMutation({
  args: {
    userId: v.id("users"),
    allergies: v.array(v.string()),
  },
  handler: async (ctx, { userId, allergies }) => {
    const normalized = allergies
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        allergies: normalized,
      });
    } else {
      await ctx.db.insert("userEventPreferences", {
        userId,
        preferredEventTypes: [],
        allergies: normalized,
      });
    }
  },
});

/**
 * Set or update the current user's allergy and dietary restriction preferences.
 * This will overwrite any existing allergies.
 */
export const setUserAllergyPreferences = mutationWithAuth({
  args: {
    allergies: v.array(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    allergies: v.array(v.string()),
  }),
  handler: async (ctx, { allergies }) => {
    const normalized = allergies
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    const existing = await ctx.db
      .query("userEventPreferences")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { allergies: normalized });
      return { userId: ctx.userId, allergies: normalized };
    } else {
      await ctx.db.insert("userEventPreferences", {
        userId: ctx.userId,
        preferredEventTypes: [],
        allergies: normalized,
      });
      return { userId: ctx.userId, allergies: normalized };
    }
  },
});
