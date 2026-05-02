import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** Sliding window rate limiter stored in the rateLimits table.
 *  Returns { ok: true } when the request is allowed,
 *  or { ok: false, retryAfterMs: number } when it should be rejected.
 */
export const checkRateLimit = internalMutation({
  args: {
    key: v.string(),
    limitPerWindow: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { key, limitPerWindow, windowMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!existing || now - existing.windowStart >= windowMs) {
      // No record or window has expired — start a fresh window
      if (existing) {
        await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      }
      return { ok: true };
    }

    if (existing.count >= limitPerWindow) {
      const retryAfterMs = windowMs - (now - existing.windowStart);
      return { ok: false, retryAfterMs };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { ok: true };
  },
});
