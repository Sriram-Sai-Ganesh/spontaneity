import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { decideFeedbackAction, type FeedbackType, type FeedbackDecision } from "./feedback_decision";
import { feedbackTypeValidator } from "./feedback_schema";

export { decideFeedbackAction } from "./feedback_decision";

/**
 * Resolve the constraint context for a chat from the DB, then run the
 * decision function to determine the next action after feedback is submitted.
 *
 * Returns a FeedbackDecision: noop, remember, regenerate, or clarify.
 */
export const resolveFeedbackDecision = internalAction({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    feedbackType: feedbackTypeValidator,
    /** Optional city/keyword from the originating event search. */
    city: v.optional(v.string()),
    keyword: v.optional(v.string()),
    /** Title of the event feedback was submitted on (used for more-like-this hint). */
    eventTitle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (
    ctx: ActionCtx,
    args: {
      chatId: Id<"chats">;
      userId: Id<"users">;
      feedbackType: FeedbackType;
      city?: string;
      keyword?: string;
      eventTitle?: string;
    },
  ): Promise<FeedbackDecision> => {
    const { chatId, userId, feedbackType, city, keyword, eventTitle } = args;

    const [members, chat, userCity] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, { chatId }),
      ctx.runQuery(internal.chats_queries.getChatInternal, { chatId }),
      ctx.runQuery(internal.users_queries.getUserCityInternal, { userId }),
    ]);
    const memberUserIds = members.map((m: { userId: Id<"users"> }) => m.userId);

    // Check if all members have Google Calendar connected
    const tokens = await ctx.runQuery(internal.users_queries.getGoogleTokensBatch, {
      userIds: memberUserIds,
    });
    const allMembersHaveCalendar = tokens.every(
      (t: { googleAccessToken?: string }) => Boolean(t.googleAccessToken),
    );

    // Check if any member has event preferences set
    const prefsResults = await Promise.all(
      memberUserIds.map((userId: Id<"users">) =>
        ctx.runQuery(internal.user_preferences_queries.getEventPreferencesForUserId, { userId }),
      ),
    );
    const hasGroupPreferences = prefsResults.some(
      (prefs: { preferredEventTypes: string[]; negativeEventTypes: string[] } | null) =>
        prefs !== null &&
        (prefs.preferredEventTypes.length > 0 || prefs.negativeEventTypes.length > 0),
    );

    const hasSavedLocation =
      Boolean(chat?.planningLocation?.trim()) || Boolean(userCity?.trim());
    const hasCityOrKeyword =
      Boolean(city?.trim()) || Boolean(keyword?.trim()) || hasSavedLocation;

    return decideFeedbackAction(feedbackType, {
      allMembersHaveCalendar,
      hasCityOrKeyword,
      hasGroupPreferences,
      eventTitle,
    });
  },
});
