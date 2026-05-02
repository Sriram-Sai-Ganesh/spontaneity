import { v } from "convex/values";
import { mutationWithAuth } from "./lib";
import { requireChatMember } from "./chats_guards";
import { feedbackTypeValidator } from "./feedback_schema";
import { internal } from "./_generated/api";

export const submitFeedback = mutationWithAuth({
  args: {
    eventId: v.string(),
    chatId: v.id("chats"),
    feedbackType: feedbackTypeValidator,
  },
  returns: v.id("feedback"),
  handler: async (ctx, { eventId, chatId, feedbackType }) => {
    await requireChatMember(ctx, chatId);
    const timestamp = Date.now();

    // One row per (user, event, chat). Multiple clicks of the same type increment
    // clickCount. Changing type resets clickCount to 1 but both contributions
    // accumulate in the group preference profile (additive, no undo).
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_chat_event", (q) => q.eq("chatId", chatId).eq("eventId", eventId))
      .filter((q) => q.eq(q.field("userId"), ctx.userId))
      .unique();

    let feedbackId;

    if (existing) {
      const newClickCount =
        existing.feedbackType === feedbackType
          ? (existing.clickCount ?? 1) + 1
          : 1;
      await ctx.db.patch(existing._id, { feedbackType, timestamp, clickCount: newClickCount });
      feedbackId = existing._id;
    } else {
      feedbackId = await ctx.db.insert("feedback", {
        eventId,
        userId: ctx.userId,
        chatId,
        feedbackType,
        timestamp,
        clickCount: 1,
      });
    }

    // Directly update the group preference profile from the event's current tags.
    // Fire-and-forget — profile update doesn't block the feedback response.
    await ctx.runMutation(internal.group_preferences_mutations.applyFeedbackToProfileInternal, {
      chatId,
      eventId,
      feedbackType,
    });

    return feedbackId;
  },
});
