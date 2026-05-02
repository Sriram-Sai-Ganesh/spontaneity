import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

describe("friends", () => {
  describe("auth", () => {
    test("sendRequest rejects unauthenticated users", async () => {
      const t = createTestConvex();
      const { userId } = await createTestUser(t);
      await expect(
        t.mutation(api.friends_mutations.sendRequest, {
          receiverId: userId,
        }),
      ).rejects.toThrow("Not authenticated");
    });

    test("getFriends rejects unauthenticated users", async () => {
      const t = createTestConvex();
      await expect(
        t.query(api.friends_queries.getFriends, {}),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("sendRequest", () => {
    test("sends a pending friend request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      expect(requestId).toBeDefined();

      const outgoing = await t
        .withIdentity(alice)
        .query(api.friends_queries.getOutgoingRequests, {});
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0]._id).toBe(requestId);
      expect(outgoing[0].status).toBe("pending");
    });

    test("cannot send a request to yourself", async () => {
      const t = createTestConvex();
      const { userId, identity } = await createTestUser(t);

      await expect(
        t
          .withIdentity(identity)
          .mutation(api.friends_mutations.sendRequest, { receiverId: userId }),
      ).rejects.toThrow("Cannot send a friend request to yourself");
    });

    test("cannot send a duplicate pending request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await expect(
        t
          .withIdentity(alice)
          .mutation(api.friends_mutations.sendRequest, { receiverId: bobId }),
      ).rejects.toThrow("Friend request already sent");
    });

    test("cannot send a request when already friends", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      await expect(
        t
          .withIdentity(alice)
          .mutation(api.friends_mutations.sendRequest, { receiverId: bobId }),
      ).rejects.toThrow("Already friends");
    });

    test("cannot send a request when the other user already sent one", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const aliceId = alice.subject;
      const { identity: bob } = await createTestUser(t);
      const { userId: bobId } = await (async () => {
        // resolve bob's userId from identity
        const bobUser = await t.run(async (ctx) => {
          return ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("_id"), bob.subject))
            .unique();
        });
        return { userId: bobUser!._id };
      })();

      // Bob sends to Alice first
      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.sendRequest, {
          receiverId: alice.subject as never,
        });

      // Alice tries to send to Bob — should be rejected
      await expect(
        t.withIdentity(alice).mutation(api.friends_mutations.sendRequest, {
          receiverId: bobId,
        }),
      ).rejects.toThrow("already sent you a friend request");
    });

    test("can re-send a request after a rejection", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.rejectRequest, { requestId });

      // Alice re-sends — should succeed
      const newRequestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      expect(newRequestId).toBeDefined();
      expect(newRequestId).not.toBe(requestId);
    });
  });

  describe("acceptRequest", () => {
    test("accepting a request creates a friendship", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      // Both users should see each other as friends
      const aliceFriends = await t
        .withIdentity(alice)
        .query(api.friends_queries.getFriends, {});
      expect(aliceFriends).toHaveLength(1);
      expect(aliceFriends[0].friend._id).toBe(bobId);

      const bobFriends = await t
        .withIdentity(bob)
        .query(api.friends_queries.getFriends, {});
      expect(bobFriends).toHaveLength(1);
      expect(bobFriends[0].friend._id).toBe(alice.subject);
    });

    test("only the receiver can accept a request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);
      const { identity: charlie } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await expect(
        t
          .withIdentity(charlie)
          .mutation(api.friends_mutations.acceptRequest, { requestId }),
      ).rejects.toThrow("Forbidden");
    });

    test("cannot accept an already-accepted request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      await expect(
        t
          .withIdentity(bob)
          .mutation(api.friends_mutations.acceptRequest, { requestId }),
      ).rejects.toThrow("no longer pending");
    });
  });

  describe("rejectRequest", () => {
    test("rejecting a request marks it rejected and removes it from incoming", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.rejectRequest, { requestId });

      const incoming = await t
        .withIdentity(bob)
        .query(api.friends_queries.getIncomingRequests, {});
      expect(incoming).toHaveLength(0);

      const friends = await t
        .withIdentity(bob)
        .query(api.friends_queries.getFriends, {});
      expect(friends).toHaveLength(0);
    });

    test("only the receiver can reject a request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      // Alice (sender) tries to reject — should fail
      await expect(
        t
          .withIdentity(alice)
          .mutation(api.friends_mutations.rejectRequest, { requestId }),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("cancelRequest", () => {
    test("sender can cancel a pending request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.cancelRequest, { requestId });

      const outgoing = await t
        .withIdentity(alice)
        .query(api.friends_queries.getOutgoingRequests, {});
      expect(outgoing).toHaveLength(0);
    });

    test("only the sender can cancel their request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      // Bob (receiver) tries to cancel — should fail
      await expect(
        t
          .withIdentity(bob)
          .mutation(api.friends_mutations.cancelRequest, { requestId }),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("removeFriend", () => {
    test("removing a friend deletes the friendship for both users", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });
      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      // Alice removes Bob
      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.removeFriend, {
          friendUserId: bobId,
        });

      const aliceFriends = await t
        .withIdentity(alice)
        .query(api.friends_queries.getFriends, {});
      expect(aliceFriends).toHaveLength(0);

      const bobFriends = await t
        .withIdentity(bob)
        .query(api.friends_queries.getFriends, {});
      expect(bobFriends).toHaveLength(0);
    });

    test("cannot remove someone who is not a friend", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      await expect(
        t
          .withIdentity(alice)
          .mutation(api.friends_mutations.removeFriend, {
            friendUserId: bobId,
          }),
      ).rejects.toThrow("Friendship not found");
    });
  });

  describe("getRelationshipStatus", () => {
    test("returns 'none' for strangers", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      const status = await t
        .withIdentity(alice)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: bobId,
        });
      expect(status).toBe("none");
    });

    test("returns 'request_sent' after sending a request", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId } = await createTestUser(t);

      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      const status = await t
        .withIdentity(alice)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: bobId,
        });
      expect(status).toBe("request_sent");
    });

    test("returns 'request_received' from the receiver's perspective", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });

      const status = await t
        .withIdentity(bob)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: alice.subject as never,
        });
      expect(status).toBe("request_received");
    });

    test("returns 'friends' after accepting", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });
      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      const aliceStatus = await t
        .withIdentity(alice)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: bobId,
        });
      expect(aliceStatus).toBe("friends");

      const bobStatus = await t
        .withIdentity(bob)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: alice.subject as never,
        });
      expect(bobStatus).toBe("friends");
    });

    test("returns 'none' after removing a friend", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });
      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });
      await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.removeFriend, { friendUserId: bobId });

      const status = await t
        .withIdentity(alice)
        .query(api.friends_queries.getRelationshipStatus, {
          otherUserId: bobId,
        });
      expect(status).toBe("none");
    });
  });

  describe("getFriends with profiles", () => {
    test("friend profile includes name, image, email", async () => {
      const t = createTestConvex();

      const aliceId = await t.run(async (ctx) => {
        return ctx.db.insert("users", {
          name: "Alice",
          email: "alice@example.com",
          image: "https://example.com/alice.png",
        });
      });
      const bobId = await t.run(async (ctx) => {
        return ctx.db.insert("users", {
          name: "Bob",
          email: "bob@example.com",
        });
      });

      const alice = {
        subject: aliceId,
        tokenIdentifier: `https://test.convex.dev|${aliceId}`,
      };
      const bob = {
        subject: bobId,
        tokenIdentifier: `https://test.convex.dev|${bobId}`,
      };

      const requestId = await t
        .withIdentity(alice)
        .mutation(api.friends_mutations.sendRequest, { receiverId: bobId });
      await t
        .withIdentity(bob)
        .mutation(api.friends_mutations.acceptRequest, { requestId });

      const aliceFriends = await t
        .withIdentity(alice)
        .query(api.friends_queries.getFriends, {});
      expect(aliceFriends).toHaveLength(1);
      expect(aliceFriends[0].friend).toMatchObject({
        _id: bobId,
        name: "Bob",
        email: "bob@example.com",
      });
    });
  });
});
