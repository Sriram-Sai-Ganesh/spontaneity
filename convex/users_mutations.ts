import { v } from "convex/values";
import { mutationWithAuth } from "./lib";

export const updateMyProfile = mutationWithAuth({
  args: {
    city: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { city }) => {
    const trimmedCity = city?.trim();

    await ctx.db.patch(ctx.userId, {
      city: trimmedCity || undefined,
    });

    return null;
  },
});
