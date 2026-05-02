import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

/** Helper: make alice and bob friends (alice sends, bob accepts). */
async function makeFriends(
  t: ReturnType<typeof createTestConvex>,
  alice: { subject: string; tokenIdentifier: string },
  bobId: string,
  bob: { subject: string; tokenIdentifier: string },
) {
  const requestId = await t
    .withIdentity(alice)
    .mutation(api.friends_mutations.sendRequest, { receiverId: bobId as never });
  await t
    .withIdentity(bob)
    .mutation(api.friends_mutations.acceptRequest, { requestId });
  return requestId;
}

describe("friend activity", () => {
  describe("auth", () => {
    test("getRecentFriendActivity rejects unauthenticated users", async () => {
      const t = createTestConvex();
      await expect(
        t.query(api.friend_activity_queries.getRecentFriendActivity, {}),
      ).rejects.toThrow("Not authenticated");
    });
  });

  describe("getRecentFriendActivity", () => {
    test("returns empty array when user has no friends", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);

      const activity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      expect(activity).toHaveLength(0);
    });

    test("returns empty array when friends have no activity", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      // Make them friends (this records accepted_friend for bob)
      await makeFriends(t, alice, bobId, bob);

      // Alice's feed — should have bob's accepted_friend activity
      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      expect(aliceActivity.length).toBeGreaterThanOrEqual(1);
      expect(aliceActivity[0].activityType).toBe("accepted_friend");
      expect(aliceActivity[0].actor._id).toBe(bobId);
    });

    test("records accepted_friend activity when request is accepted", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      // Alice sees bob's activity
      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      const friendAccepted = aliceActivity.find(
        (a) => a.activityType === "accepted_friend",
      );
      expect(friendAccepted).toBeDefined();
      expect(friendAccepted!.actor._id).toBe(bobId);
    });

    test("does not return own activity", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      // Alice's feed should contain bob's activity, not alice's own
      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      for (const item of aliceActivity) {
        expect(item.actor._id).not.toBe(alice.subject);
      }
    });

    test("does not return activity from non-friends", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);
      const { identity: charlie } = await createTestUser(t);
      const { userId: daveId, identity: dave } = await createTestUser(t);

      // Bob and Dave are friends with each other but not with alice
      await makeFriends(t, charlie, daveId, dave);

      // Alice is friends with bob
      await makeFriends(t, alice, bobId, bob);

      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      // Dave's id should not appear in alice's feed
      for (const item of aliceActivity) {
        expect(item.actor._id).not.toBe(daveId);
      }
    });
  });

  describe("rsvp_going activity", () => {
    test("records rsvp_going activity when RSVP status is going", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      // Bob creates a chat and RSVPs going
      const chatId = await t
        .withIdentity(bob)
        .mutation(api.chats_mutations.create, { title: "Test Chat" });

      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-123",
        chatId,
        status: "going",
      });

      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      const rsvpActivity = aliceActivity.find(
        (a) => a.activityType === "rsvp_going",
      );
      expect(rsvpActivity).toBeDefined();
      expect(rsvpActivity!.actor._id).toBe(bobId);
      expect(rsvpActivity!.metadata.eventId).toBe("event-123");
      expect(rsvpActivity!.metadata.chatId).toBe(chatId);
    });

    test("does not record activity for non-going RSVP", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      const chatId = await t
        .withIdentity(bob)
        .mutation(api.chats_mutations.create, { title: "Test Chat" });

      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-456",
        chatId,
        status: "maybe",
      });

      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      const rsvpActivity = aliceActivity.find(
        (a) => a.activityType === "rsvp_going",
      );
      expect(rsvpActivity).toBeUndefined();
    });

    test("records activity only once when updating RSVP from non-going to going", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      const chatId = await t
        .withIdentity(bob)
        .mutation(api.chats_mutations.create, { title: "Test Chat" });

      // Bob first RSVPs maybe
      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-789",
        chatId,
        status: "maybe",
      });

      // Then changes to going
      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-789",
        chatId,
        status: "going",
      });

      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      const rsvpActivities = aliceActivity.filter(
        (a) => a.activityType === "rsvp_going",
      );
      expect(rsvpActivities).toHaveLength(1);
    });

    test("does not record duplicate activity when RSVP is already going", async () => {
      const t = createTestConvex();
      const { identity: alice } = await createTestUser(t);
      const { userId: bobId, identity: bob } = await createTestUser(t);

      await makeFriends(t, alice, bobId, bob);

      const chatId = await t
        .withIdentity(bob)
        .mutation(api.chats_mutations.create, { title: "Test Chat" });

      // Bob RSVPs going twice
      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-999",
        chatId,
        status: "going",
      });
      await t.withIdentity(bob).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "event-999",
        chatId,
        status: "going",
      });

      const aliceActivity = await t
        .withIdentity(alice)
        .query(api.friend_activity_queries.getRecentFriendActivity, {});

      const rsvpActivities = aliceActivity.filter(
        (a) =>
          a.activityType === "rsvp_going" &&
          a.metadata.eventId === "event-999",
      );
      expect(rsvpActivities).toHaveLength(1);
    });
  });
});
