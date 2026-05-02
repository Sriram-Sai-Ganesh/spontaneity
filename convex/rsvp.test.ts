import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { EventTag } from "./event_types";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

type Identity = { subject: string; tokenIdentifier: string };
type TestChatId = Awaited<ReturnType<typeof createTestChat>>;

function buildOption(eventId: string) {
  return {
    eventId,
    title: `Event ${eventId}`,
    description: null,
    startTime: "2026-06-01T19:00:00.000Z",
    venueName: "Test Venue",
    venueCity: "Baltimore",
    venueCountry: "USA",
    source: "ticketmaster",
    url: `https://example.com/${eventId}`,
    image: null,
    tags: [] as EventTag[],
    status: "onsale" as const,
    budgetBucket: "medium" as const,
    genre: "Concert",
  };
}

async function addMember(
  t: ReturnType<typeof createTestConvex>,
  ownerIdentity: Identity,
  memberIdentity: Identity,
  chatId: TestChatId,
) {
  const invite = await t
    .withIdentity(ownerIdentity)
    .mutation(api.chats_mutations.createInvite, { chatId });
  await t
    .withIdentity(memberIdentity)
    .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
}

async function createPoll(
  t: ReturnType<typeof createTestConvex>,
  identity: Identity,
  chatId: TestChatId,
) {
  return t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
    chatId,
    source: "manual",
    options: [buildOption("evt-1"), buildOption("evt-2"), buildOption("evt-3")],
  });
}

describe("RSVP system", () => {
  test("creates a new RSVP record", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);
    const pollId = await createPoll(t, identity, chatId);

    const rsvpId = await t
      .withIdentity(identity)
      .mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "evt-1",
        pollId,
        chatId,
        status: "going",
      });

    expect(rsvpId).toBeDefined();

    const myRSVP = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getUserRSVP, { eventId: "evt-1", chatId });

    expect(myRSVP?.status).toBe("going");
  });

  test("upserts RSVP — no duplicate on second call", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);
    const pollId = await createPoll(t, identity, chatId);

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "maybe",
    });

    const rsvps = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getRSVPsForEvent, { eventId: "evt-1", chatId });

    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].status).toBe("maybe");
  });

  test("attendance list shows all members' RSVPs", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    await addMember(t, owner, member, chatId);
    const pollId = await createPoll(t, owner, chatId);

    await t.withIdentity(owner).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });
    await t.withIdentity(member).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "not_going",
    });

    const rsvps = await t
      .withIdentity(owner)
      .query(api.rsvp_queries.getRSVPsForEvent, { eventId: "evt-1", chatId });

    expect(rsvps).toHaveLength(2);
    const statuses = rsvps.map((r) => r.status).sort();
    expect(statuses).toEqual(["going", "not_going"]);
  });

  test("getRSVPsForEvent rejects a non-member", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);

    await expect(
      t
        .withIdentity(outsider)
        .query(api.rsvp_queries.getRSVPsForEvent, { eventId: "evt-1", chatId }),
    ).rejects.toThrow();
  });

  test("getUserRSVP returns null when user has not RSVP'd", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getUserRSVP, { eventId: "evt-1", chatId });

    expect(result).toBeNull();
  });

  test("submitRSVP rejects an event not in the poll", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);
    const pollId = await createPoll(t, identity, chatId);

    await expect(
      t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "not-in-poll",
        pollId,
        chatId,
        status: "going",
      }),
    ).rejects.toThrow("Event is not an option in this poll");
  });

  test("getRSVPsForEventInternal returns all RSVPs including not_going for email filtering", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    await addMember(t, owner, member, chatId);
    const pollId = await createPoll(t, owner, chatId);

    await t.withIdentity(owner).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });
    await t.withIdentity(member).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "not_going",
    });

    const rsvps = await t.query(internal.rsvp_queries.getRSVPsForEventInternal, {
      eventId: "evt-1",
    });

    expect(rsvps).toHaveLength(2);

    const notGoingIds = rsvps
      .filter((r) => r.status === "not_going")
      .map((r) => r.userId);
    const eligibleRsvps = rsvps.filter((r) => !notGoingIds.includes(r.userId));

    expect(notGoingIds).toHaveLength(1);
    expect(eligibleRsvps).toHaveLength(1);
    expect(eligibleRsvps[0].status).toBe("going");
  });
});

describe("getGoingRSVPEventsForViewer", () => {
  test("returns poll-backed going RSVP events with metadata", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);
    const pollId = await createPoll(t, identity, chatId);

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      eventId: "evt-1",
      chatId,
      title: `Event evt-1`,
      startTime: "2026-06-01T19:00:00.000Z",
    });
    expect(result[0].endTime).toBeDefined();
    expect(result[0].goingUserIds).toEqual(expect.arrayContaining([expect.any(String)]));
  });

  test("excludes maybe and not_going RSVPs", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);
    const pollId = await createPoll(t, identity, chatId);

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "maybe",
    });
    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-2",
      pollId,
      chatId,
      status: "not_going",
    });

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result).toHaveLength(0);
  });

  test("only returns the viewer's own going RSVPs", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    const invite = await t.withIdentity(owner).mutation(api.chats_mutations.createInvite, { chatId });
    await t.withIdentity(member).mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
    const pollId = await createPoll(t, owner, chatId);

    await t.withIdentity(owner).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });
    await t.withIdentity(member).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-2",
      pollId,
      chatId,
      status: "going",
    });

    const ownerResult = await t
      .withIdentity(owner)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});
    const memberResult = await t
      .withIdentity(member)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(ownerResult).toHaveLength(1);
    expect(ownerResult[0].eventId).toBe("evt-1");
    expect(memberResult).toHaveLength(1);
    expect(memberResult[0].eventId).toBe("evt-2");
  });

  test("goingUserIds includes all users going to the same event", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: member } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);
    const invite = await t.withIdentity(owner).mutation(api.chats_mutations.createInvite, { chatId });
    await t.withIdentity(member).mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
    const pollId = await createPoll(t, owner, chatId);

    await t.withIdentity(owner).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });
    await t.withIdentity(member).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "evt-1",
      pollId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(owner)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result[0].goingUserIds).toHaveLength(2);
  });

  test("skips RSVPs for events with no startTime in the poll option", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const timelessOption = {
      eventId: "timeless-evt",
      title: "No Time Restaurant",
      description: null,
      startTime: null,
      venueName: "A Place",
      venueCity: "Baltimore",
      venueCountry: "USA",
      source: "google_places",
      url: "https://example.com/timeless",
      image: null,
      tags: [] as EventTag[],
      status: "onsale" as const,
      budgetBucket: "medium" as const,
      genre: "Food",
    };
    const pollId = await t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
      chatId,
      source: "manual",
      options: [
        timelessOption,
        { ...timelessOption, eventId: "timeless-evt-2", title: "No Time Restaurant 2" },
        { ...timelessOption, eventId: "timeless-evt-3", title: "No Time Restaurant 3" },
      ],
    });

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "timeless-evt",
      pollId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result).toHaveLength(0);
  });

  test("recurring event RSVP resolves config metadata", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const configId = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        eventId: "rec-evt-1",
        title: "Weekly Trivia Night",
        cadence: "weekly",
        interval: 1,
        startDate: "2026-05-01",
        endCondition: { type: "never" },
        startTime: "19:00",
      });

    const instanceEventId = `recurring:${configId}:2026-05-01`;

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: instanceEventId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      eventId: instanceEventId,
      chatId,
      title: "Weekly Trivia Night",
      source: "recurring",
      startTime: "2026-05-01T19:00:00",
    });
    expect(result[0].endTime).toBe("2026-05-01T21:00:00");
  });

  test("skips recurring RSVP if chat was deleted", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const configId = await t
      .withIdentity(identity)
      .mutation(api.recurring_event_mutations.createRecurringEventConfig, {
        chatId,
        eventId: "rec-evt-2",
        title: "Deleted Group Event",
        cadence: "weekly",
        interval: 1,
        startDate: "2026-05-01",
        endCondition: { type: "never" },
        startTime: "18:00",
      });

    const instanceEventId = `recurring:${configId}:2026-05-01`;
    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: instanceEventId,
      chatId,
      status: "going",
    });

    await t.withIdentity(identity).mutation(api.chats_mutations.remove, { chatId });

    const result = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getGoingRSVPEventsForViewer, {});

    expect(result).toHaveLength(0);
  });
});

describe("RSVP for recurring event instances (no poll)", () => {
  test("creates RSVP without a pollId", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const instanceEventId = "recurring:cfg1:2026-05-01";

    const rsvpId = await t
      .withIdentity(identity)
      .mutation(api.rsvp_mutations.submitRSVP, {
        eventId: instanceEventId,
        chatId,
        status: "going",
      });

    expect(rsvpId).toBeDefined();

    const myRSVP = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getUserRSVP, { eventId: instanceEventId, chatId });

    expect(myRSVP?.status).toBe("going");
    expect(myRSVP?.pollId).toBeUndefined();
  });

  test("upserts recurring instance RSVP — no duplicate on second call", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    const instanceEventId = "recurring:cfg1:2026-05-01";

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: instanceEventId,
      chatId,
      status: "going",
    });
    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: instanceEventId,
      chatId,
      status: "not_going",
    });

    const rsvps = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getRSVPsForEvent, { eventId: instanceEventId, chatId });

    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].status).toBe("not_going");
  });

  test("different instances of same config get separate RSVPs", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity);

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "recurring:cfg1:2026-05-01",
      chatId,
      status: "going",
    });
    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "recurring:cfg1:2026-05-08",
      chatId,
      status: "not_going",
    });

    const rsvp1 = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getUserRSVP, { eventId: "recurring:cfg1:2026-05-01", chatId });
    const rsvp2 = await t
      .withIdentity(identity)
      .query(api.rsvp_queries.getUserRSVP, { eventId: "recurring:cfg1:2026-05-08", chatId });

    expect(rsvp1?.status).toBe("going");
    expect(rsvp2?.status).toBe("not_going");
  });

  test("non-member cannot RSVP to a recurring instance", async () => {
    const t = createTestConvex();
    const { identity: owner } = await createTestUser(t);
    const { identity: outsider } = await createTestUser(t);
    const chatId = await createTestChat(t, owner);

    await expect(
      t.withIdentity(outsider).mutation(api.rsvp_mutations.submitRSVP, {
        eventId: "recurring:cfg1:2026-05-01",
        chatId,
        status: "going",
      }),
    ).rejects.toThrow();
  });
});
