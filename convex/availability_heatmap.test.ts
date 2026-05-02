import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { EventTag } from "./event_types";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

const FIXED_NOW_ISO = "2026-03-06T12:00:00Z";

function setFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => handler(input, init),
  );
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return fetchMock;
}

async function connectGoogleCalendar(
  t: ReturnType<typeof createTestConvex>,
  userId: Id<"users">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, {
      googleAccessToken: "test-google-access-token",
      googleRefreshToken: "test-google-refresh-token",
      googleTokenExpiry: 4_102_444_800,
    });
  });
}

function buildPollOptions(overrides: Partial<Record<string, unknown>> = {}) {
  return [
    {
      eventId: "accepted-event",
      title: "Board Game Night",
      description: "A cozy game night for the group.",
      startTime: "2026-03-07T19:30:00.000Z",
      venueName: "No Land Beyond",
      venueCity: "Baltimore",
      venueCountry: "US",
      source: "ticketmaster",
      url: "https://example.com/events/accepted-event",
      image: null,
      tags: ["Board Games"] as EventTag[],
      status: "onsale" as const,
      budgetBucket: "medium" as const,
      genre: "Board Games",
      ...overrides,
    },
    {
      eventId: "alternate-event-1",
      title: "Late Dinner",
      description: null,
      startTime: "2026-03-08T01:00:00.000Z",
      venueName: "Clavel",
      venueCity: "Baltimore",
      venueCountry: "US",
      source: "ticketmaster",
      url: "https://example.com/events/alternate-event-1",
      image: null,
      tags: ["Night Life"] as EventTag[],
      status: "onsale" as const,
      budgetBucket: "medium" as const,
      genre: "Dining",
    },
    {
      eventId: "alternate-event-2",
      title: "Comedy Set",
      description: null,
      startTime: "2026-03-08T22:00:00.000Z",
      venueName: "Ottobar",
      venueCity: "Baltimore",
      venueCountry: "US",
      source: "ticketmaster",
      url: "https://example.com/events/alternate-event-2",
      image: null,
      tags: ["Comedy Night"] as EventTag[],
      status: "onsale" as const,
      budgetBucket: "medium" as const,
      genre: "Comedy",
    },
  ];
}

describe("availability heatmap accepted plans", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("aggregates accepted poll winners across the viewer's chats", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: { busy: [] },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Heatmap Chat");
    const secondChatId = await createTestChat(t, identity, "Dinner Crew");
    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      icon: "🎲",
    });
    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId: secondChatId,
      icon: "🍽️",
    });

    const pollId = await t
      .withIdentity(identity)
      .mutation(api.event_polls_mutations.createPoll, {
        chatId,
        source: "recommendation",
        options: buildPollOptions(),
      });

    await t.withIdentity(identity).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "accepted-event",
    });

    const secondPollId = await t
      .withIdentity(identity)
      .mutation(api.event_polls_mutations.createPoll, {
        chatId: secondChatId,
        source: "recommendation",
        options: buildPollOptions({
          eventId: "accepted-event-2",
          title: "Dinner Reservation",
          startTime: "2026-03-08T18:00:00.000Z",
          venueName: "Clavel",
          url: "https://example.com/events/accepted-event-2",
        }),
      });

    await t.withIdentity(identity).mutation(api.event_polls_mutations.castVote, {
      pollId: secondPollId,
      eventId: "accepted-event-2",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.getHeatmapAvailability,
      { chatId },
    );

    expect(result.memberCount).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.acceptedPlans).toHaveLength(2);
    expect(result.acceptedPlans[0]).toMatchObject({
      pollId,
      chatId,
      chatTitle: "Heatmap Chat",
      chatIcon: "🎲",
      eventId: "accepted-event",
      title: "Board Game Night",
      startTime: "2026-03-07T19:30:00.000Z",
      endTime: "2026-03-07T21:30:00.000Z",
      venueName: "No Land Beyond",
      venueCity: "Baltimore",
    });
    expect(result.acceptedPlans[1]).toMatchObject({
      pollId: secondPollId,
      chatId: secondChatId,
      chatTitle: "Dinner Crew",
      chatIcon: "🍽️",
      eventId: "accepted-event-2",
      title: "Dinner Reservation",
      startTime: "2026-03-08T18:00:00.000Z",
      endTime: "2026-03-08T20:00:00.000Z",
    });
    expect(result.members[0]?.busyBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: "2026-03-07T19:30:00.000Z",
          end: "2026-03-07T21:30:00.000Z",
        }),
        expect.objectContaining({
          start: "2026-03-08T18:00:00.000Z",
          end: "2026-03-08T20:00:00.000Z",
        }),
      ]),
    );
  });
});

describe("availability heatmap going RSVP events", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockEmptyCalendar() {
    setFetchMock((input) => {
      if (String(input) === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${String(input)}`);
    });
  }

  test("going RSVP events appear in goingRSVPEvents and merge into busy blocks", async () => {
    mockEmptyCalendar();
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "RSVP Chat");

    const pollId = await t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
      chatId,
      source: "manual",
      options: buildPollOptions(),
    });

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "accepted-event",
      pollId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(identity)
      .action(api.availability_action.getHeatmapAvailability, { chatId });

    expect(result.goingRSVPEvents).toHaveLength(1);
    expect(result.goingRSVPEvents[0]).toMatchObject({
      eventId: "accepted-event",
      title: "Board Game Night",
      startTime: "2026-03-07T19:30:00.000Z",
    });

    expect(result.members[0]?.busyBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: "2026-03-07T19:30:00.000Z",
          end: "2026-03-07T21:30:00.000Z",
        }),
      ]),
    );
  });

  test("past going RSVPs are excluded from goingRSVPEvents", async () => {
    mockEmptyCalendar();
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Past Event Chat");

    const pastOption = {
      ...buildPollOptions()[0],
      eventId: "past-event",
      startTime: "2026-03-01T19:00:00.000Z", // before FIXED_NOW_ISO (2026-03-06)
    };
    const pollId = await t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
      chatId,
      source: "manual",
      options: [
        pastOption,
        { ...pastOption, eventId: "past-event-2", title: "Past Event 2" },
        { ...pastOption, eventId: "past-event-3", title: "Past Event 3" },
      ],
    });

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "past-event",
      pollId,
      chatId,
      status: "going",
    });

    const result = await t
      .withIdentity(identity)
      .action(api.availability_action.getHeatmapAvailability, { chatId });

    expect(result.goingRSVPEvents).toHaveLength(0);
  });

  test("maybe RSVPs do not appear in goingRSVPEvents", async () => {
    mockEmptyCalendar();
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Maybe Chat");

    const pollId = await t.withIdentity(identity).mutation(api.event_polls_mutations.createPoll, {
      chatId,
      source: "manual",
      options: buildPollOptions(),
    });

    await t.withIdentity(identity).mutation(api.rsvp_mutations.submitRSVP, {
      eventId: "accepted-event",
      pollId,
      chatId,
      status: "maybe",
    });

    const result = await t
      .withIdentity(identity)
      .action(api.availability_action.getHeatmapAvailability, { chatId });

    expect(result.goingRSVPEvents).toHaveLength(0);
  });
});
