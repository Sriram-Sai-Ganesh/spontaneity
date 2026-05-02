import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";

/**
 * Get a user's display name (for server use, e.g. chat confirmation messages).
 */
export const getDisplayNameForUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return user?.name ?? null;
  },
});

export const getUserCityInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return user?.city?.trim() || null;
  },
});

/**
 * Fetch Google Calendar token data for a batch of user IDs.
 * Only callable from other server functions (actions/mutations).
 */
export const getGoogleTokensBatch = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    return Promise.all(
      userIds.map(async (userId) => {
        const user = await ctx.db.get(userId);
        return {
          userId,
          googleAccessToken: user?.googleAccessToken,
          googleRefreshToken: user?.googleRefreshToken,
          googleTokenExpiry: user?.googleTokenExpiry,
        };
      }),
    );
  },
});

/**
 * Persist a refreshed Google access token back to the user document.
 * Only callable from other server functions.
 */
export const storeRefreshedGoogleToken = internalMutation({
  args: {
    userId: v.id("users"),
    googleAccessToken: v.string(),
    googleTokenExpiry: v.number(),
  },
  handler: async (ctx, { userId, googleAccessToken, googleTokenExpiry }) => {
    await ctx.db.patch(userId, { googleAccessToken, googleTokenExpiry });
  },
});

export const me = queryWithAuth({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      image: v.optional(v.string()),
      city: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
      city: user.city,
    };
  },
});
