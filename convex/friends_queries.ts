import { v } from "convex/values";
import { queryWithAuth } from "./lib";
import { friendRequestStatusValidator } from "./friends_schema";

const userProfileOut = v.object({
  _id: v.id("users"),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
});

const friendRequestOut = v.object({
  _id: v.id("friend_requests"),
  _creationTime: v.number(),
  senderId: v.id("users"),
  receiverId: v.id("users"),
  status: friendRequestStatusValidator,
  sender: userProfileOut,
  receiver: userProfileOut,
});

/** All accepted friends of the current user, with profile info. */
export const getFriends = queryWithAuth({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("friendships"),
      _creationTime: v.number(),
      friend: userProfileOut,
    }),
  ),
  handler: async (ctx) => {
    const [asA, asB] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_user_a", (q) => q.eq("userIdA", ctx.userId))
        .collect(),
      ctx.db
        .query("friendships")
        .withIndex("by_user_b", (q) => q.eq("userIdB", ctx.userId))
        .collect(),
    ]);

    const all = [...asA, ...asB];

    const withProfiles = await Promise.all(
      all.map(async (friendship) => {
        const friendId =
          friendship.userIdA === ctx.userId
            ? friendship.userIdB
            : friendship.userIdA;
        const user = await ctx.db.get(friendId);
        if (!user) return null;
        return {
          _id: friendship._id,
          _creationTime: friendship._creationTime,
          friend: {
            _id: user._id,
            name: user.name,
            image: user.image,
            email: user.email,
          },
        };
      }),
    );

    return withProfiles.filter((f): f is NonNullable<typeof f> => Boolean(f));
  },
});

/** Pending friend requests received by the current user. */
export const getIncomingRequests = queryWithAuth({
  args: {},
  returns: v.array(friendRequestOut),
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("friend_requests")
      .withIndex("by_receiver", (q) => q.eq("receiverId", ctx.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const withProfiles = await Promise.all(
      requests.map(async (req) => {
        const [sender, receiver] = await Promise.all([
          ctx.db.get(req.senderId),
          ctx.db.get(req.receiverId),
        ]);
        if (!sender || !receiver) return null;
        return {
          ...req,
          sender: {
            _id: sender._id,
            name: sender.name,
            image: sender.image,
            email: sender.email,
          },
          receiver: {
            _id: receiver._id,
            name: receiver.name,
            image: receiver.image,
            email: receiver.email,
          },
        };
      }),
    );

    return withProfiles.filter((r): r is NonNullable<typeof r> => Boolean(r));
  },
});

/** Pending friend requests sent by the current user. */
export const getOutgoingRequests = queryWithAuth({
  args: {},
  returns: v.array(friendRequestOut),
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("friend_requests")
      .withIndex("by_sender", (q) => q.eq("senderId", ctx.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const withProfiles = await Promise.all(
      requests.map(async (req) => {
        const [sender, receiver] = await Promise.all([
          ctx.db.get(req.senderId),
          ctx.db.get(req.receiverId),
        ]);
        if (!sender || !receiver) return null;
        return {
          ...req,
          sender: {
            _id: sender._id,
            name: sender.name,
            image: sender.image,
            email: sender.email,
          },
          receiver: {
            _id: receiver._id,
            name: receiver.name,
            image: receiver.image,
            email: receiver.email,
          },
        };
      }),
    );

    return withProfiles.filter((r): r is NonNullable<typeof r> => Boolean(r));
  },
});

/** Check the friendship/request status between the current user and another user. */
export const getRelationshipStatus = queryWithAuth({
  args: { otherUserId: v.id("users") },
  returns: v.union(
    v.literal("none"),
    v.literal("friends"),
    v.literal("request_sent"),
    v.literal("request_received"),
  ),
  handler: async (ctx, { otherUserId }) => {
    // Check friendship
    const [userIdA, userIdB] =
      ctx.userId < otherUserId
        ? [ctx.userId, otherUserId]
        : [otherUserId, ctx.userId];

    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("userIdA", userIdA).eq("userIdB", userIdB),
      )
      .unique();
    if (friendship) return "friends";

    // Check outgoing request
    const outgoing = await ctx.db
      .query("friend_requests")
      .withIndex("by_sender_receiver", (q) =>
        q.eq("senderId", ctx.userId).eq("receiverId", otherUserId),
      )
      .unique();
    if (outgoing?.status === "pending") return "request_sent";

    // Check incoming request
    const incoming = await ctx.db
      .query("friend_requests")
      .withIndex("by_sender_receiver", (q) =>
        q.eq("senderId", otherUserId).eq("receiverId", ctx.userId),
      )
      .unique();
    if (incoming?.status === "pending") return "request_received";

    return "none";
  },
});
