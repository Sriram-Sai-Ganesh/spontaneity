import { v } from "convex/values";
import { mutationWithAuth } from "./lib";

/** Canonical pair ordering so friendships are deduplicated. */
function orderedPair(
  a: string,
  b: string,
): { userIdA: string; userIdB: string } {
  return a < b ? { userIdA: a, userIdB: b } : { userIdA: b, userIdB: a };
}

/** Send a friend request to another user. */
export const sendRequest = mutationWithAuth({
  args: { receiverId: v.id("users") },
  returns: v.id("friend_requests"),
  handler: async (ctx, { receiverId }) => {
    if (ctx.userId === receiverId) {
      throw new Error("Cannot send a friend request to yourself");
    }

    // Prevent duplicate pending requests
    const existing = await ctx.db
      .query("friend_requests")
      .withIndex("by_sender_receiver", (q) =>
        q.eq("senderId", ctx.userId).eq("receiverId", receiverId),
      )
      .unique();
    if (existing) {
      if (existing.status === "pending") {
        throw new Error("Friend request already sent");
      }
      if (existing.status === "accepted") {
        throw new Error("Already friends");
      }
      // If previously rejected, allow re-sending by deleting the old record
      await ctx.db.delete(existing._id);
    }

    // Also check if the other user already sent a request to this user
    const reverse = await ctx.db
      .query("friend_requests")
      .withIndex("by_sender_receiver", (q) =>
        q.eq("senderId", receiverId).eq("receiverId", ctx.userId),
      )
      .unique();
    if (reverse?.status === "pending") {
      throw new Error(
        "This user already sent you a friend request — accept it instead",
      );
    }

    // Check if already friends via friendships table
    const { userIdA, userIdB } = orderedPair(ctx.userId, receiverId);
    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userIdA", userIdA as never).eq("userIdB", userIdB as never),
      )
      .unique();
    if (friendship) {
      throw new Error("Already friends");
    }

    return ctx.db.insert("friend_requests", {
      senderId: ctx.userId,
      receiverId,
      status: "pending",
    });
  },
});

/** Accept an incoming friend request. */
export const acceptRequest = mutationWithAuth({
  args: { requestId: v.id("friend_requests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Friend request not found");
    if (request.receiverId !== ctx.userId) throw new Error("Forbidden");
    if (request.status !== "pending") {
      throw new Error("Friend request is no longer pending");
    }

    await ctx.db.patch(requestId, { status: "accepted" });

    const { userIdA, userIdB } = orderedPair(request.senderId, ctx.userId);
    await ctx.db.insert("friendships", {
      userIdA: userIdA as never,
      userIdB: userIdB as never,
    });

    await ctx.db.insert("friend_activities", {
      userId: ctx.userId,
      activityType: "accepted_friend",
      metadata: {},
      createdAt: Date.now(),
    });

    return null;
  },
});

/** Reject an incoming friend request. */
export const rejectRequest = mutationWithAuth({
  args: { requestId: v.id("friend_requests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Friend request not found");
    if (request.receiverId !== ctx.userId) throw new Error("Forbidden");
    if (request.status !== "pending") {
      throw new Error("Friend request is no longer pending");
    }

    await ctx.db.patch(requestId, { status: "rejected" });
    return null;
  },
});

/** Cancel an outgoing friend request (sender only). */
export const cancelRequest = mutationWithAuth({
  args: { requestId: v.id("friend_requests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Friend request not found");
    if (request.senderId !== ctx.userId) throw new Error("Forbidden");
    if (request.status !== "pending") {
      throw new Error("Friend request is no longer pending");
    }

    await ctx.db.delete(requestId);
    return null;
  },
});

/** Remove an existing friendship. */
export const removeFriend = mutationWithAuth({
  args: { friendUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { friendUserId }) => {
    const { userIdA, userIdB } = orderedPair(ctx.userId, friendUserId);
    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userIdA", userIdA as never).eq("userIdB", userIdB as never),
      )
      .unique();
    if (!friendship) throw new Error("Friendship not found");

    await ctx.db.delete(friendship._id);
    return null;
  },
});
