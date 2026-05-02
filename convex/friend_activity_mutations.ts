import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  friendActivityTypeValidator,
  friendActivityMetadataValidator,
} from "./friend_activity_schema";

/** Record a friend activity entry. Called internally from other mutations. */
export const record = internalMutation({
  args: {
    userId: v.id("users"),
    activityType: friendActivityTypeValidator,
    metadata: friendActivityMetadataValidator,
  },
  returns: v.id("friend_activities"),
  handler: async (ctx, { userId, activityType, metadata }) => {
    return ctx.db.insert("friend_activities", {
      userId,
      activityType,
      metadata,
      createdAt: Date.now(),
    });
  },
});
