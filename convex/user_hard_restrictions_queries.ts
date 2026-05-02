import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";

/**
 * Get the current user's hard restrictions. Returns null if the user has not
 * completed the first-login restrictions survey.
 */
export const getUserHardRestrictions = queryWithAuth({
  args: {},
  returns: v.union(
    v.object({
      maxBudget: v.optional(v.union(v.literal("low"), v.literal("medium"))),
      maxEventEndHour: v.optional(v.number()),
      maxDistanceMiles: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("userHardRestrictions")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!row) return null;
    return {
      maxBudget: row.maxBudget,
      maxEventEndHour: row.maxEventEndHour,
      maxDistanceMiles: row.maxDistanceMiles,
    };
  },
});

/**
 * Internal: get hard restrictions for a user by ID. Used during recommendation
 * generation to apply per-member limits before ranking.
 */
export const getHardRestrictionsForUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("userHardRestrictions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!row) return null;
    return {
      maxBudget: row.maxBudget,
      maxEventEndHour: row.maxEventEndHour,
      maxDistanceMiles: row.maxDistanceMiles,
    };
  },
});
