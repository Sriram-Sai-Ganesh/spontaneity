import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";
import { mapNonTicketEventToNormalized } from "./non_ticket_events_mutations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createNonTicketEvent(
  t: ReturnType<typeof createTestConvex>,
  args: {
    chatId: Awaited<ReturnType<typeof createTestChat>>;
    createdBy: string;
    title?: string;
    eventId?: string;
    startTime?: string;
    endTime?: string;
    tags?: string[];
  },
) {
  const eventId = args.eventId ?? crypto.randomUUID();
  await t.mutation(internal.custom_events_mutations.createCustomEvent, {
    eventId,
    title: args.title ?? "Test Event",
    chatId: args.chatId,
    createdBy: args.createdBy as never,
    tags: (args.tags ?? []) as never,
    startTime: args.startTime,
    endTime: args.endTime,
  });
  return eventId;
}

// ---------------------------------------------------------------------------
// createNonTicketEvent
// ---------------------------------------------------------------------------

describe("createCustomEvent", () => {
  test("inserts an event and returns the eventId and tags", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const eventId = crypto.randomUUID();
    const result = await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId,
        title: "Pizza Night",
        description: "Group pizza dinner",
        startTime: "2028-05-01T19:00:00Z",
        endTime: "2028-05-01T21:00:00Z",
        location: "John's Place",
        venueName: "John's Place",
        venueCity: "Baltimore",
        tags: [] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    expect(result.eventId).toBe(eventId);
    expect(result.tags).toContain("Custom");
  });

  test("always injects 'Custom' tag even when tags array is empty", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const result = await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId: crypto.randomUUID(),
        title: "Movie Night",
        tags: [] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    expect(result.tags).toContain("Custom");
  });

  test("does not duplicate 'Custom' tag when caller already includes it", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const result = await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId: crypto.randomUUID(),
        title: "Board Game Night",
        tags: ["Custom"] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    const customCount = result.tags.filter((t: string) => t === "Custom").length;
    expect(customCount).toBe(1);
  });

  test("preserves additional tags alongside 'Custom'", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const result = await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId: crypto.randomUUID(),
        title: "Cooking Class",
        tags: ["Cooking Class"] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    expect(result.tags).toContain("Custom");
    expect(result.tags).toContain("Cooking");
  });
});

// ---------------------------------------------------------------------------
// getNonTicketEventsForChat
// ---------------------------------------------------------------------------

describe("getCustomEventsForChat", () => {
  test("returns all events for a chat in descending order", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, { chatId, createdBy: userId, title: "Event A" });
    await createNonTicketEvent(t, { chatId, createdBy: userId, title: "Event B" });

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );

    expect(events).toHaveLength(2);
    // Both belong to the chat
    expect(events.every((e) => e.chatId === chatId)).toBe(true);
  });

  test("returns empty array when chat has no events", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Empty Chat");

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );

    expect(events).toHaveLength(0);
  });

  test("does not return events from a different chat", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatA = await createTestChat(t, identity, "Chat A");
    const chatB = await createTestChat(t, identity, "Chat B");

    await createNonTicketEvent(t, { chatId: chatA, createdBy: userId, title: "Event in A" });

    const eventsInB = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId: chatB },
    );

    expect(eventsInB).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getNonTicketEventsByUser
// ---------------------------------------------------------------------------

describe("getCustomEventsByUser", () => {
  test("returns only events created by the specified user", async () => {
    const t = createTestConvex();
    const { userId: userId1, identity: identity1 } = await createTestUser(t);
    const { userId: userId2 } = await createTestUser(t);
    const chatId = await createTestChat(t, identity1, "Shared Chat");

    await createNonTicketEvent(t, { chatId, createdBy: userId1, title: "User 1 Event" });
    await createNonTicketEvent(t, { chatId, createdBy: userId2, title: "User 2 Event" });

    const user1Events = await t.query(
      internal.custom_events_mutations.getCustomEventsByUser,
      { chatId, createdBy: userId1 as never },
    );

    expect(user1Events).toHaveLength(1);
    expect(user1Events[0].title).toBe("User 1 Event");
  });

  test("returns empty array when user has no events in the chat", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsByUser,
      { chatId, createdBy: userId as never },
    );

    expect(events).toHaveLength(0);
  });

  test("does not return events from a different chat for the same user", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatA = await createTestChat(t, identity, "Chat A");
    const chatB = await createTestChat(t, identity, "Chat B");

    await createNonTicketEvent(t, { chatId: chatA, createdBy: userId, title: "Event in A" });

    const eventsInB = await t.query(
      internal.custom_events_mutations.getCustomEventsByUser,
      { chatId: chatB, createdBy: userId as never },
    );

    expect(eventsInB).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteNonTicketEvent
// ---------------------------------------------------------------------------

describe("deleteCustomEvent", () => {
  test("creator can delete their own event", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");
    const eventId = await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Pizza Night",
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteCustomEvent,
      { eventId, requestingUserId: userId as never },
    );

    expect(result.deleted).toBe(true);
    expect(result.eventId).toBe(eventId);
    expect(result.title).toBe("Pizza Night");

    // Verify removed from DB
    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );
    expect(events).toHaveLength(0);
  });

  test("throws when trying to delete an event created by someone else", async () => {
    const t = createTestConvex();
    const { userId: userId1, identity: identity1 } = await createTestUser(t);
    const { userId: userId2 } = await createTestUser(t);
    const chatId = await createTestChat(t, identity1, "Test Chat");
    const eventId = await createNonTicketEvent(t, {
      chatId,
      createdBy: userId1,
      title: "User 1's Event",
    });

    await expect(
      t.mutation(internal.custom_events_mutations.deleteCustomEvent, {
        eventId,
        requestingUserId: userId2 as never,
      }),
    ).rejects.toThrow("You can only delete events you created.");
  });

  test("throws when event does not exist", async () => {
    const t = createTestConvex();
    const { userId } = await createTestUser(t);

    await expect(
      t.mutation(internal.custom_events_mutations.deleteCustomEvent, {
        eventId: "non-existent-id",
        requestingUserId: userId as never,
      }),
    ).rejects.toThrow("not found");
  });

  test("only deletes the targeted event, leaving others intact", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const eventIdA = await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Event A",
    });
    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Event B",
    });

    await t.mutation(internal.custom_events_mutations.deleteCustomEvent, {
      eventId: eventIdA,
      requestingUserId: userId as never,
    });

    const remaining = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Event B");
  });
});

// ---------------------------------------------------------------------------
// deleteExpiredNonTicketEvents
// ---------------------------------------------------------------------------

describe("deleteExpiredCustomEvents", () => {
  test("deletes events whose endTime is in the past", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Past Event",
      startTime: "2020-01-01T10:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteExpiredCustomEvents,
      {},
    );

    expect(result.deletedCount).toBe(1);

    const remaining = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );
    expect(remaining).toHaveLength(0);
  });

  test("falls back to startTime when endTime is absent", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Past Start-Only Event",
      startTime: "2020-06-15T08:00:00Z",
      // no endTime
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteExpiredCustomEvents,
      {},
    );

    expect(result.deletedCount).toBe(1);
  });

  test("preserves future events", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Future Event",
      startTime: "2030-01-01T10:00:00Z",
      endTime: "2030-01-01T12:00:00Z",
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteExpiredCustomEvents,
      {},
    );

    expect(result.deletedCount).toBe(0);

    const remaining = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );
    expect(remaining).toHaveLength(1);
  });

  test("preserves events with no time fields (cannot determine expiry)", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Timeless Event",
      // no startTime or endTime
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteExpiredCustomEvents,
      {},
    );

    expect(result.deletedCount).toBe(0);
  });

  
  test("deletes only expired events when mixed with future events", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Past Event",
      startTime: "2020-01-01T10:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
    });
    await createNonTicketEvent(t, {
      chatId,
      createdBy: userId,
      title: "Future Event",
      startTime: "2030-01-01T10:00:00Z",
      endTime: "2030-01-01T12:00:00Z",
    });

    const result = await t.mutation(
      internal.custom_events_mutations.deleteExpiredCustomEvents,
      {},
    );

    expect(result.deletedCount).toBe(1);

    const remaining = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Future Event");
  });
});

// ---------------------------------------------------------------------------
// mapNonTicketEventToNormalized
// ---------------------------------------------------------------------------

describe("mapNonTicketEventToNormalized", () => {
  test("maps minimal fields with defaults", () => {
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-1",
      title: "Game Night",
    });

    expect(result).toEqual({
      eventId: "evt-1",
      title: "Game Night",
      description: null,
      startTime: null,
      venueName: null,
      venueCity: null,
      venueNeighborhood: null,
      venueCountry: null,
      latitude: undefined,
      longitude: undefined,
      formattedAddress: undefined,
      googlePlaceId: undefined,
      source: "custom",
      url: "",
      image: null,
      tags: [],
      status: null,
      budgetBucket: null,
      genre: null,
      sourceLinks: undefined,
      venueType: undefined,
    });
  });

  test("preserves source and url when provided", () => {
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-2",
      title: "Meetup Hike",
      source: "meetup",
      url: "https://meetup.com/events/123",
    });

    expect(result.source).toBe("meetup");
    expect(result.url).toBe("https://meetup.com/events/123");
  });

  test("preserves sourceLinks when provided", () => {
    const links = [
      { source: "meetup", eventId: "m-123", url: "https://meetup.com/123" },
      { source: "eventbrite", eventId: "eb-456", url: "https://eventbrite.com/456" },
    ];
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-3",
      title: "Cross-Listed Event",
      sourceLinks: links,
    });

    expect(result.sourceLinks).toEqual(links);
  });

  test("maps all optional fields correctly", () => {
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-4",
      title: "Art Workshop",
      description: "Paint and sip",
      startTime: "2028-06-01T14:00:00Z",
      venueName: "Studio 42",
      venueCity: "Baltimore",
      venueCountry: "US",
      source: "custom",
      url: "https://example.com/art",
      image: "https://example.com/art.jpg",
      genre: "art",
      tags: ["Art", "Pottery"],
      budgetBucket: "medium",
      sourceLinks: [{ source: "custom", eventId: "evt-4", url: "https://example.com/art" }],
    });

    expect(result.description).toBe("Paint and sip");
    expect(result.startTime).toBe("2028-06-01T14:00:00Z");
    expect(result.venueName).toBe("Studio 42");
    expect(result.venueCity).toBe("Baltimore");
    expect(result.venueCountry).toBe("US");
    expect(result.image).toBe("https://example.com/art.jpg");
    expect(result.genre).toBe("art");
    expect(result.tags).toEqual(["Art", "Pottery"]);
    expect(result.budgetBucket).toBe("medium");
    expect(result.sourceLinks).toHaveLength(1);
  });

  test("normalizes legacy tags during mapping", () => {
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-5",
      title: "Nature Walk",
      tags: ["Nature", "Outdoor"],
    });

    expect(result.tags).toContain("Hiking");
    expect(result.tags).not.toContain("Nature");
    expect(result.tags).not.toContain("Outdoor");
  });

  test("defaults source to 'custom' when omitted", () => {
    const result = mapNonTicketEventToNormalized({
      eventId: "evt-6",
      title: "Potluck",
    });

    expect(result.source).toBe("custom");
  });
});

// ---------------------------------------------------------------------------
// createNonTicketEvent – source attribution fields
// ---------------------------------------------------------------------------

describe("createNonTicketEvent – source attribution", () => {
  test("persists source and url when provided", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const eventId = crypto.randomUUID();
    await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId,
        title: "Meetup Hike",
        source: "meetup",
        url: "https://meetup.com/events/123",
        tags: [] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("meetup");
    expect(events[0].url).toBe("https://meetup.com/events/123");
  });

  test("defaults source to 'custom' when omitted", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId: crypto.randomUUID(),
        title: "Casual Hangout",
        tags: [] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );

    expect(events[0].source).toBe("custom");
  });

  test("persists sourceLinks when provided", async () => {
    const t = createTestConvex();
    const { userId, identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Test Chat");

    const sourceLinks = [
      { source: "meetup", eventId: "m-1", url: "https://meetup.com/1" },
    ];
    await t.mutation(
      internal.custom_events_mutations.createCustomEvent,
      {
        eventId: crypto.randomUUID(),
        title: "Cross-Posted Event",
        source: "meetup",
        url: "https://meetup.com/1",
        sourceLinks,
        tags: [] as never,
        chatId,
        createdBy: userId as never,
      },
    );

    const events = await t.query(
      internal.custom_events_mutations.getCustomEventsForChat,
      { chatId },
    );

    expect(events[0].sourceLinks).toEqual(sourceLinks);
  });
});
