import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { internal } from "./_generated/api";
import { feedbackTypeValidator } from "./feedback_schema";
import type { FeedbackDecision } from "./feedback_decision";
import type { NormalizedEvent } from "./event_types";

/**
 * Resolve what to do after feedback is submitted, and re-run the event
 * search + ranking pipeline when the decision is "regenerate".
 *
 * Call this immediately after submitFeedback to power inline recommendation
 * refresh on reject / more-like-this.
 *
 * Returns:
 *   - { decision }                          for noop / clarify
 *   - { decision, rankedEvents, totalEvents } for regenerate
 *   - { decision, error }                   if the search fails
 */
export const triggerRegeneration = actionWithAuth({
  args: {
    chatId: v.id("chats"),
    feedbackType: feedbackTypeValidator,
    /** The event the feedback was submitted on (used to exclude it from results in exclude mode). */
    eventId: v.optional(v.string()),
    city: v.optional(v.string()),
    keyword: v.optional(v.string()),
    /** venueType of the event being fed back on. Used to restrict regen to the same category. */
    venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
    /** Title of the event (used as search hint in similar mode). */
    eventTitle: v.optional(v.string()),
    /** Total events shown in the last recommendation batch (for all-rejected detection). */
    totalEventsInLastSearch: v.optional(v.number()),
    /** When true (default), clarifying questions are injected as assistant messages into the chat stream. Set to false when the caller handles display itself. */
    injectClarifyMessage: v.optional(v.boolean()),
    /** When true, successful regen results are persisted as a new displayEventCards message in the chat so the chat interface updates reactively. */
    persistResultsToChat: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { chatId, feedbackType, eventId, city, keyword, venueType, eventTitle, injectClarifyMessage = true, persistResultsToChat = false } = args;

    // 1. Determine next action based on chat state + feedback type
    const decision = (await ctx.runAction(internal.feedback_action.resolveFeedbackDecision, {
      chatId,
      userId: ctx.userId,
      feedbackType,
      city,
      keyword,
      eventTitle,
    })) as FeedbackDecision;

    if (decision.action !== "regenerate") {
      if (decision.action === "clarify" && injectClarifyMessage) {
        await ctx.runMutation(internal.messages_internals.insertAssistantMessage, {
          chatId,
          userId: ctx.userId,
          content: decision.question,
        });
      }
      return { decision };
    }

    // 2. Re-run event search + ranking
    //    similar mode: use event title as the keyword hint
    //    exclude mode: keep the same search terms, filter rejected events after
    const searchKeyword =
      decision.mode === "similar" ? (decision.hint ?? keyword) : keyword;

    const result = (await ctx.runAction(
      internal.availability_action.findAvailableEventsForChatInternal,
      {
        chatId,
        userId: ctx.userId,
        city,
        keyword: searchKeyword,
        isRegen: true,
        venueTypeFilter: venueType,
      },
    )) as {
      rankedFoodEvents: NormalizedEvent[];
      rankedActivityEvents: NormalizedEvent[];
      rankedEvents: NormalizedEvent[];
      filteredEvents: NormalizedEvent[];
      totalEvents: number;
      error?: string;
    };

    if (result.error) {
      return { decision, error: result.error };
    }

    // Build a deduplicated pool seeded by the type-specific ranked list so the
    // backend's group-preference ranking is preserved for the correct category.
    const typeRanked =
      venueType === "food"
        ? result.rankedFoodEvents
        : venueType === "activity"
          ? result.rankedActivityEvents
          : result.rankedEvents;

    const seen = new Set<string>();
    const pool: NormalizedEvent[] = [];
    for (const e of [...typeRanked, ...(result.filteredEvents ?? [])]) {
      if (!seen.has(e.eventId)) {
        seen.add(e.eventId);
        pool.push(e);
      }
    }

    // Restrict regen pool to the same venueType as the event being fed back on.
    // This prevents activity events surfacing when the user is browsing food venues
    // and vice-versa. When venueType is unknown, keep the full pool.
    const workingPool =
      venueType === "food"
        ? pool.filter((e) => e.venueType === "food")
        : venueType === "activity"
          ? pool.filter((e) => e.venueType === "activity")
          : pool;

    let rankedEvents: NormalizedEvent[] = workingPool.slice(0, 3);

    // 3. For exclude mode: strip every event previously rejected in this chat
    if (decision.mode === "exclude") {
      const allFeedback = (await ctx.runQuery(internal.feedback_queries.listForChatInternal, {
        chatId,
      })) as Array<{ feedbackType: string; eventId: string }>;

      const rejectedIds = new Set(
        allFeedback.filter((f) => f.feedbackType === "reject").map((f) => f.eventId),
      );

      // Guard: also exclude the triggering event in case it hasn't been persisted yet
      if (eventId) rejectedIds.add(eventId);

      rankedEvents = workingPool.filter((e) => !rejectedIds.has(e.eventId)).slice(0, 3);
    }

    if (rankedEvents.length === 0) {
      const exhaustedQuestion =
        "We've run out of new suggestions. What kind of event would work better for your group? Feel free to describe the vibe, budget, or type.";
      if (injectClarifyMessage) {
        await ctx.runMutation(internal.messages_internals.insertAssistantMessage, {
          chatId,
          userId: ctx.userId,
          content: exhaustedQuestion,
        });
      }
      return {
        decision: { action: "clarify", question: exhaustedQuestion },
        rankedEvents: [],
        totalEvents: result.totalEvents,
      };
    }

    if (persistResultsToChat && ctx.userId) {
      const eventPayloads = rankedEvents.map((e) => ({
        eventId: e.eventId,
        title: e.title,
        source: e.source,
        url: e.url ?? null,
        startTime: e.startTime ?? null,
        venueName: e.venueName ?? null,
        venueCity: e.venueCity ?? null,
        venueCountry: e.venueCountry ?? null,
        description: e.description ?? null,
        genre: e.genre ?? null,
        venueType: e.venueType ?? null,
        status: e.status ?? null,
      }));
      await ctx.runMutation(internal.messages_internals.insertAssistantEventCardsMessage, {
        chatId,
        userId: ctx.userId,
        events: eventPayloads,
      });
    }

    return { decision, rankedEvents, totalEvents: result.totalEvents };
  },
});
