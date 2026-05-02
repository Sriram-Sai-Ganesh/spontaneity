import { v } from "convex/values";
import { defineTable } from "convex/server";

// ── Validator shapes ──────────────────────────────────────────────

export const friendRequestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("rejected"),
);

/** A friend request from one user to another. */
export const friendRequestFields = {
  senderId: v.id("users"),
  receiverId: v.id("users"),
  status: friendRequestStatusValidator,
};

/** A confirmed friendship between two users (bidirectional — one record per pair). */
export const friendshipFields = {
  userIdA: v.id("users"), // always the lexicographically smaller id
  userIdB: v.id("users"),
};

// ── Table definitions ──────────────────────────────────────────────

export const friendTables = {
  friend_requests: defineTable(friendRequestFields)
    .index("by_sender", ["senderId"])
    .index("by_receiver", ["receiverId"])
    .index("by_sender_receiver", ["senderId", "receiverId"]),
  friendships: defineTable(friendshipFields)
    .index("by_user_a", ["userIdA"])
    .index("by_user_b", ["userIdB"])
    .index("by_pair", ["userIdA", "userIdB"]),
};
