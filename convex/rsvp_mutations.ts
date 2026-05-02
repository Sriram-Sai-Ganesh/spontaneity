import { v } from "convex/values";
import { mutationWithAuth } from "./lib";
import { requireChatMember } from "./chats_guards";
import { rsvpStatusValidator } from "./rsvp_schema";

export const submitRSVP = mutationWithAuth({
  args: {
    eventId: v.string(),
    pollId: v.optional(v.id("event_polls")),
    chatId: v.id("chats"),
    status: rsvpStatusValidator,
  },
  handler: async (ctx, { eventId, pollId, chatId, status }) => {
    await requireChatMember(ctx, chatId);

    if (pollId !== undefined) {
      const poll = await ctx.db.get(pollId);
      if (!poll) throw new Error("Poll not found");
      if (poll.chatId !== chatId) throw new Error("Poll does not belong to this chat");
      if (!poll.optionEventIds?.includes(eventId)) throw new Error("Event is not an option in this poll");
    }

    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", ctx.userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        chatId,
        updatedAt: Date.now(),
        ...(pollId !== undefined ? { pollId } : {}),
      });
      if (status === "going" && existing.status !== "going") {
        await ctx.db.insert("friend_activities", {
          userId: ctx.userId,
          activityType: "rsvp_going",
          metadata: { eventId, chatId },
          createdAt: Date.now(),
        });
      }
      return existing._id;
    }

    if (status === "going") {
      await ctx.db.insert("friend_activities", {
        userId: ctx.userId,
        activityType: "rsvp_going",
        metadata: { eventId, chatId },
        createdAt: Date.now(),
      });
    }

    return ctx.db.insert("rsvps", {
      eventId,
      userId: ctx.userId,
      pollId,
      chatId,
      status,
      updatedAt: Date.now(),
    });
  },
});
