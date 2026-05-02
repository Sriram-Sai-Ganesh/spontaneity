import { v } from "convex/values";
import { defineTable } from "convex/server";
import { AI_ASSISTANT_CHAT_KIND, GROUP_CHAT_KIND } from "./chats_constants";
import { planningLocationField, planningLocationUpdateField, midpointFields, midpointUpdateFields } from "./location_types";

// ── Validator shapes ──────────────────────────────────────────────
// 4-level type hierarchy: In → Update → Internal → Out

export const chatKindValidator = v.union(
  v.literal(GROUP_CHAT_KIND),
  v.literal(AI_ASSISTANT_CHAT_KIND),
);

/** Fields a client sends when creating a chat. */
export const chatInFields = {
  title: v.string(),
  ...planningLocationField,
};

/** Fields a client may patch. */
export const chatUpdateFields = {
  title: v.optional(v.string()),
  ...planningLocationUpdateField,
  ...midpointUpdateFields,
};

/** All stored fields (In + server-injected). */
export const chatInternalFields = {
  ...chatInFields,
  userId: v.id("users"),
  icon: v.optional(v.string()),
  kind: v.optional(chatKindValidator),
  venueCacheReady: v.optional(v.boolean()),
  useDistanceRanking: v.optional(v.boolean()),
  ...midpointFields,
};

// Out = Doc<"chats"> (system fields _id, _creationTime added automatically)

/** Membership record for a user in a chat/group. */
export const chatMemberFields = {
  chatId: v.id("chats"),
  userId: v.id("users"),
  nickname: v.optional(v.string()),
  role: v.optional(v.union(v.literal("owner"), v.literal("member"))),
  lastReadAt: v.optional(v.number()),
};

/** Invite link/token for a chat/group. */
export const chatInviteFields = {
  chatId: v.id("chats"),
  token: v.string(),
  createdBy: v.id("users"),
  expiresAt: v.number(),
};

// ── Table definition ──────────────────────────────────────────────

export const chatTables = {
  chats: defineTable(chatInternalFields)
    .index("by_user_id", ["userId"])
    .index("by_user_kind", ["userId", "kind"]),
  group_members: defineTable(chatMemberFields)
    .index("by_chat_id", ["chatId"])
    .index("by_user_id", ["userId"])
    .index("by_chat_user", ["chatId", "userId"]),
  group_invites: defineTable(chatInviteFields)
    .index("by_token", ["token"])
    .index("by_chat_id", ["chatId"]),
};
