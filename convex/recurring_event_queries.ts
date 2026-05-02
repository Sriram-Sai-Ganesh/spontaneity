import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { queryWithAuth } from "./lib";
import { getChatIfMember } from "./chats_guards";
import { generateInstances } from "./recurring_event_instances";

export const getRecurringEventConfigsForChat = queryWithAuth({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];
    const configs = await ctx.db
      .query("recurring_event_configs")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    const today = new Date().toISOString().slice(0, 10);

    return configs.map((config) => {
      let occurrencesRemaining: number | null = null;
      if (config.endCondition.type === "after_occurrences") {
        const total = config.endCondition.count;
        const past = generateInstances(config, config.startDate, total).filter(
          (i) => i.instanceDate < today,
        ).length;
        occurrencesRemaining = Math.max(0, total - past);
      }
      return { ...config, occurrencesRemaining };
    });
  },
});

export const getRecurringEventConfigById = queryWithAuth({
  args: { id: v.id("recurring_event_configs") },
  handler: async (ctx, { id }) => {
    const config = await ctx.db.get(id);
    if (!config) return null;
    if (!await getChatIfMember(ctx, config.chatId)) return null;
    return config;
  },
});

export const getAllRecurringEventConfigsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("recurring_event_configs").collect();
  },
});

export const getUpcomingRecurringInstancesInternal = internalQuery({
  args: {
    configId: v.id("recurring_event_configs"),
    fromDate: v.string(),
    maxCount: v.number(),
  },
  handler: async (ctx, { configId, fromDate, maxCount }) => {
    const config = await ctx.db.get(configId);
    if (!config) return [];
    return generateInstances(config, fromDate, maxCount);
  },
});

export const getReminderLogInternal = internalQuery({
  args: { configId: v.id("recurring_event_configs"), instanceDate: v.string() },
  handler: async (ctx, { configId, instanceDate }) => {
    return ctx.db
      .query("recurring_instance_reminder_log")
      .withIndex("by_config_and_date", (q) =>
        q.eq("configId", configId).eq("instanceDate", instanceDate),
      )
      .unique();
  },
});

export const getUpcomingRecurringInstances = queryWithAuth({
  args: {
    chatId: v.id("chats"),
    fromDate: v.optional(v.string()),
    maxPerConfig: v.optional(v.number()),
  },
  handler: async (ctx, { chatId, fromDate, maxPerConfig }) => {
    if (!await getChatIfMember(ctx, chatId)) return [];
    const configs = await ctx.db
      .query("recurring_event_configs")
      .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
      .collect();

    const today = fromDate ?? new Date().toISOString().slice(0, 10);
    const limit = maxPerConfig ?? 10;
    const allInstances = configs.flatMap((config) =>
      generateInstances(config, today, limit),
    );
    allInstances.sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));
    return allInstances;
  },
});
