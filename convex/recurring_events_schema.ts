import { defineTable } from "convex/server";
import { v } from "convex/values";

export const recurringCadenceValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
);

export const recurringEndConditionValidator = v.union(
  v.object({ type: v.literal("never") }),
  v.object({ type: v.literal("on_date"), date: v.string() }),
  v.object({ type: v.literal("after_occurrences"), count: v.number() }),
);

export const recurringEventTables = {
  recurring_instance_reminder_log: defineTable({
    configId: v.id("recurring_event_configs"),
    instanceDate: v.string(),
    sentAt: v.number(),
  }).index("by_config_and_date", ["configId", "instanceDate"]),

  recurring_event_configs: defineTable({
    chatId: v.id("chats"),
    createdBy: v.id("users"),
    pollId: v.optional(v.id("event_polls")),
    eventId: v.string(),
    title: v.string(),
    cadence: recurringCadenceValidator,
    interval: v.number(),
    startDate: v.string(),
    endCondition: recurringEndConditionValidator,
    startTime: v.optional(v.string()), // HH:MM e.g. "19:00"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_chat_id", ["chatId"])
    .index("by_event_id", ["eventId"]),
};
