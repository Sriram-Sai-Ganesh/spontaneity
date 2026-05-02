import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";
import {
  groupPreferenceProfileValidator,
  groupRecommendationSnapshotValidator,
} from "./group_preferences_schema";

export const getGroupPreferenceProfileForChatId = internalQuery({
  args: { chatId: v.id("chats") },
  returns: v.union(groupPreferenceProfileValidator, v.null()),
  handler: async (ctx, { chatId }) => {
    const row = await ctx.db
      .query("groupPreferenceProfiles")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .unique();

    if (!row) return null;

    return {
      chatId: row.chatId,
      categorySignals: row.categorySignals,
      budgetPreference: row.budgetPreference,
      distancePreference: row.distancePreference,
      feedbackCount: row.feedbackCount,
      lastUpdatedAt: row.lastUpdatedAt,
    };
  },
});

/** Public query — returns the group preference profile for a chat the caller is a member of. */
export const getGroupPreferenceProfile = queryWithAuth({
  args: { chatId: v.id("chats") },
  returns: v.union(groupPreferenceProfileValidator, v.null()),
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return null;
    const row = await ctx.db
      .query("groupPreferenceProfiles")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .unique();

    if (!row) return null;

    return {
      chatId: row.chatId,
      categorySignals: row.categorySignals,
      budgetPreference: row.budgetPreference,
      distancePreference: row.distancePreference,
      feedbackCount: row.feedbackCount,
      lastUpdatedAt: row.lastUpdatedAt,
    };
  },
});

export const getGroupRecommendationSnapshotForChatEvent = internalQuery({
  args: {
    chatId: v.id("chats"),
    eventId: v.string(),
  },
  returns: v.union(groupRecommendationSnapshotValidator, v.null()),
  handler: async (ctx, { chatId, eventId }) => {
    const rows = await ctx.db
      .query("groupRecommendationSnapshots")
      .withIndex("by_chat_event_recommended_at", (q) =>
        q.eq("chatId", chatId).eq("eventId", eventId),
      )
      .collect();

    const row = rows[rows.length - 1];

    if (!row) return null;

    return {
      chatId: row.chatId,
      eventId: row.eventId,
      title: row.title,
      description: row.description,
      startTime: row.startTime,
      venueName: row.venueName,
      venueCity: row.venueCity,
      source: row.source,
      budgetBucket: row.budgetBucket,
      lastRecommendedAt: row.lastRecommendedAt,
    };
  },
});
