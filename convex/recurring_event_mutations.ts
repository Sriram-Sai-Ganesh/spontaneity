import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutationWithAuth } from "./lib";
import { requireChatMember } from "./chats_guards";
import {
  recurringCadenceValidator,
  recurringEndConditionValidator,
} from "./recurring_events_schema";

export const createRecurringEventConfig = mutationWithAuth({
  args: {
    chatId: v.id("chats"),
    pollId: v.optional(v.id("event_polls")),
    eventId: v.string(),
    title: v.string(),
    cadence: recurringCadenceValidator,
    interval: v.number(),
    startDate: v.string(),
    endCondition: recurringEndConditionValidator,
    startTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireChatMember(ctx, args.chatId);

    if (args.interval < 1) throw new Error("Interval must be at least 1");

    const now = Date.now();
    return ctx.db.insert("recurring_event_configs", {
      ...args,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRecurringEventConfig = mutationWithAuth({
  args: {
    id: v.id("recurring_event_configs"),
    cadence: v.optional(recurringCadenceValidator),
    interval: v.optional(v.number()),
    endCondition: v.optional(recurringEndConditionValidator),
    startTime: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const config = await ctx.db.get(id);
    if (!config) throw new Error("Recurring event config not found");
    await requireChatMember(ctx, config.chatId);

    if (updates.interval !== undefined && updates.interval < 1) {
      throw new Error("Interval must be at least 1");
    }

    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const deleteRecurringEventConfig = mutationWithAuth({
  args: { id: v.id("recurring_event_configs") },
  handler: async (ctx, { id }) => {
    const config = await ctx.db.get(id);
    if (!config) throw new Error("Recurring event config not found");
    await requireChatMember(ctx, config.chatId);
    await ctx.db.delete(id);
  },
});

export const markRecurringReminderSentInternal = internalMutation({
  args: {
    configId: v.id("recurring_event_configs"),
    instanceDate: v.string(),
  },
  handler: async (ctx, { configId, instanceDate }) => {
    await ctx.db.insert("recurring_instance_reminder_log", {
      configId,
      instanceDate,
      sentAt: Date.now(),
    });
  },
});
