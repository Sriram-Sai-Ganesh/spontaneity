import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { mutationWithAuth } from "./lib";
import { requireChatMember } from "./chats_guards";
import { shortlistedEventSnapshotValidator } from "./event_shortlists_schema";

const SHORTLIST_REMINDER_LEAD_MS = 72 * 60 * 60 * 1000;

function parseStartTimeMs(startTime: string | null | undefined): number | undefined {
  if (!startTime) return undefined;
  const startTimeMs = new Date(startTime).getTime();
  return Number.isFinite(startTimeMs) ? startTimeMs : undefined;
}

export const shortlistEvent = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    event: shortlistedEventSnapshotValidator,
  },
  returns: v.id("event_shortlists"),
  handler: async (ctx, { chatId, event }) => {
    await requireChatMember(ctx, chatId);

    const now = Date.now();
    const startTimeMs = parseStartTimeMs(event.startTime);
    const existing = await ctx.db
      .query("event_shortlists")
      .withIndex("by_chat_event", (q) =>
        q.eq("chatId", chatId).eq("eventId", event.eventId),
      )
      .unique();

    if (existing) return existing._id;

    const shortlistId = await ctx.db.insert("event_shortlists", {
      chatId,
      eventId: event.eventId,
      createdBy: ctx.userId,
      event,
      createdAt: now,
      updatedAt: now,
      ...(startTimeMs !== undefined ? { startTimeMs } : {}),
    });

    if (startTimeMs !== undefined && startTimeMs > now) {
      await ctx.scheduler.runAt(
        Math.max(now, startTimeMs - SHORTLIST_REMINDER_LEAD_MS),
        internal.email_notifications.sendShortlistReminderEmails,
        { shortlistId },
      );
    }

    return shortlistId;
  },
});

export const removeShortlist = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    eventId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { chatId, eventId }) => {
    await requireChatMember(ctx, chatId);
    const existing = await ctx.db
      .query("event_shortlists")
      .withIndex("by_chat_event", (q) => q.eq("chatId", chatId).eq("eventId", eventId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const markReminderSentInternal = internalMutation({
  args: { shortlistId: v.id("event_shortlists") },
  returns: v.null(),
  handler: async (ctx, { shortlistId }) => {
    await ctx.db.patch(shortlistId, { reminderSentAt: Date.now() });
    return null;
  },
});
