import { v } from "convex/values";
import { queryWithAuth } from "./lib";
import {
  friendActivityTypeValidator,
  friendActivityMetadataValidator,
} from "./friend_activity_schema";

const RECENT_ACTIVITY_LIMIT = 50;
const PER_FRIEND_LIMIT = 20;

const activityOut = v.object({
  _id: v.id("friend_activities"),
  _creationTime: v.number(),
  userId: v.id("users"),
  activityType: friendActivityTypeValidator,
  metadata: friendActivityMetadataValidator,
  createdAt: v.number(),
  actor: v.object({
    _id: v.id("users"),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  }),
});

/**
 * Returns recent activity from accepted friends only, sorted newest-first.
 * Privacy: only activity from users who are accepted friends is returned.
 */
export const getRecentFriendActivity = queryWithAuth({
  args: {},
  returns: v.array(activityOut),
  handler: async (ctx) => {
    // Collect all accepted friend IDs
    const [asA, asB] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_user_a", (q) => q.eq("userIdA", ctx.userId))
        .collect(),
      ctx.db
        .query("friendships")
        .withIndex("by_user_b", (q) => q.eq("userIdB", ctx.userId))
        .collect(),
    ]);

    const friendIds = [
      ...asA.map((f) => f.userIdB),
      ...asB.map((f) => f.userIdA),
    ];

    if (friendIds.length === 0) return [];

    // Fetch recent activity per friend, then merge and sort
    const perFriendActivities = await Promise.all(
      friendIds.map((friendId) =>
        ctx.db
          .query("friend_activities")
          .withIndex("by_user_created_at", (q) => q.eq("userId", friendId))
          .order("desc")
          .take(PER_FRIEND_LIMIT),
      ),
    );

    const allActivities = perFriendActivities.flat();
    allActivities.sort((a, b) => b.createdAt - a.createdAt);
    const recent = allActivities.slice(0, RECENT_ACTIVITY_LIMIT);

    // Resolve actor profiles
    const withActors = await Promise.all(
      recent.map(async (activity) => {
        const user = await ctx.db.get(activity.userId);
        if (!user) return null;
        return {
          _id: activity._id,
          _creationTime: activity._creationTime,
          userId: activity.userId,
          activityType: activity.activityType,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
          actor: {
            _id: user._id,
            name: user.name,
            image: user.image,
          },
        };
      }),
    );

    return withActors.filter((a): a is NonNullable<typeof a> => Boolean(a));
  },
});
