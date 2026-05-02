import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { chatTables } from "./chats_schema";
import { messageTables } from "./messages_schema";
import { feedbackTables } from "./feedback_schema";
import { groupPreferenceTables } from "./group_preferences_schema";
import { eventTables } from "./events_schema";
import { recommendationMetricsTables } from "./recommendation_metrics_schema";
import { eventPollTables } from "./event_polls_schema";
import { nonTicketEventTables } from "./non_ticket_events_schema";
import { customEventTables } from "./non_ticket_events_schema";
import { passivePreferenceTables } from "./passive_preference_schema";
import { friendTables } from "./friends_schema";
import { rsvpTables } from "./rsvp_schema";
import { friendActivityTables } from "./friend_activity_schema";
import { recurringEventTables } from "./recurring_events_schema";
import { eventShortlistTables } from "./event_shortlists_schema";
import {
  appearanceThemesValidator,
  themeModeValidator,
} from "./user_appearance_schema";

export default defineSchema({
  ...authTables,
  // Extend the default users table with Google Calendar OAuth token fields.
  // All fields from authTables.users are replicated here so the indexes are preserved.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Google Calendar OAuth tokens stored on Google sign-in
    googleAccessToken: v.optional(v.string()),
    googleRefreshToken: v.optional(v.string()),
    googleTokenExpiry: v.optional(v.number()), // Unix timestamp in seconds
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  // User event type preferences
  userEventPreferences: defineTable({
    userId: v.id("users"),
    preferredEventTypes: v.array(v.string()), // AI-classified tags, e.g., ["Concert", "Hiking"]
    negativeEventTypes: v.optional(v.array(v.string())), // AI-classified negative tags
    rawLikes: v.optional(v.array(v.string())), // raw user-entered text, e.g., ["concerts", "hiking"]
    rawDislikes: v.optional(v.array(v.string())), // raw user-entered dislikes text
    allergies: v.optional(v.array(v.string())), // raw allergy/food restriction text
    dietaryRestrictions: v.optional(v.array(v.string())), // raw dietary restriction text (e.g. vegan, keto)
    cuisinePreferences: v.optional(v.array(v.string())), // raw cuisine preference text (e.g. Italian, Japanese)
    // Person-specific preferences: keys are other user IDs, values are lists of activity/event tags
    personSpecificLikes: v.optional(v.record(v.string(), v.array(v.string()))),
    personSpecificDislikes: v.optional(v.record(v.string(), v.array(v.string()))),
  })
    .index("userId", ["userId"]),
  // User hard restrictions — collected at first login to filter initial recommendations
  userHardRestrictions: defineTable({
    userId: v.id("users"),
    maxBudget: v.optional(v.union(v.literal("low"), v.literal("medium"))), // "low" = ≤$30, "medium" = ≤$75; absent = no cap
    maxEventEndHour: v.optional(v.number()), // 24-hour local time, e.g. 22 = no events ending after 10 PM; absent = no limit
    maxDistanceMiles: v.optional(v.number()), // e.g. 10 = within 10 miles; absent = no limit
  })
    .index("userId", ["userId"]),

  emailLogs: defineTable({
    userId: v.id("users"),
    recipientEmail: v.string(),
    notificationType: v.union(
      v.literal("new_recommendations"),
      v.literal("plan_accepted"),
      v.literal("event_reminder"),
      v.literal("shortlist_reminder"),
    ),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    errorMessage: v.optional(v.string()),
    resendId: v.optional(v.string()),
  }).index("userId", ["userId"]),
  userAppearancePreferences: defineTable({
    userId: v.id("users"),
    mode: v.optional(themeModeValidator),
    themes: v.optional(appearanceThemesValidator),
    colorScheme: v.optional(themeModeValidator),
    fontPreset: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    emailNotificationsEnabled: v.optional(v.boolean()),
  })
    .index("userId", ["userId"]),
  ...eventTables,
  ...nonTicketEventTables,
  ...customEventTables,
  ...chatTables,
  ...messageTables,
  ...feedbackTables,
  ...eventPollTables,
  ...groupPreferenceTables,
  ...passivePreferenceTables,
  ...recommendationMetricsTables,
  ...friendTables,
  ...friendActivityTables,
  ...rsvpTables,
  ...recurringEventTables,
  ...eventShortlistTables,
  rateLimits: defineTable({
    key: v.string(),       // e.g. userId or "ticketmaster"
    windowStart: v.number(), // ms timestamp of window start
    count: v.number(),       // requests in this window
  }).index("by_key", ["key"]),
});
