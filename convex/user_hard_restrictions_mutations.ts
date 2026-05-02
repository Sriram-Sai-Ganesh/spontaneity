import { v } from "convex/values";
import { mutationWithAuth } from "./lib";

/**
 * Set or update the current user's hard restrictions (budget cap, max event
 * end time, max travel distance). Called during first-login onboarding survey
 * and from the settings page when users update their limits.
 */
export const setUserHardRestrictions = mutationWithAuth({
  args: {
    maxBudget: v.optional(v.union(v.literal("low"), v.literal("medium"))),
    maxEventEndHour: v.optional(v.number()),
    maxDistanceMiles: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { maxBudget, maxEventEndHour, maxDistanceMiles }) => {
    const existing = await ctx.db
      .query("userHardRestrictions")
      .withIndex("userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { maxBudget, maxEventEndHour, maxDistanceMiles });
    } else {
      await ctx.db.insert("userHardRestrictions", {
        userId: ctx.userId,
        ...(maxBudget !== undefined && { maxBudget }),
        ...(maxEventEndHour !== undefined && { maxEventEndHour }),
        ...(maxDistanceMiles !== undefined && { maxDistanceMiles }),
      });
    }
    return null;
  },
});
