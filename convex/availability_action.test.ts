import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { NormalizedEvent } from "./event_types";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

const TEST_API_KEY = "test-ticketmaster-key";
const FIXED_NOW_ISO = "2026-03-06T12:00:00Z";



function ticketmasterEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-default",
    name: "Default Event",
    url: "https://ticketmaster.com/event/default",
    dates: {
      start: {
        dateTime: "2026-03-07T19:00:00Z",
      },
    },
    _embedded: {
      venues: [
        {
          name: "Test Venue",
          city: { name: "Baltimore" },
          country: { name: "United States Of America" },
        },
      ],
    },
    ...overrides,
  };
}

function acceptedPollOptions(overrides: Partial<Record<string, unknown>> = {}) {
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
      tags: ["Board Games" as const],
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
      tags: ["Night Life" as const],
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
      tags: ["Comedy Night" as const],
      status: "onsale" as const,
      budgetBucket: "medium" as const,
      genre: "Comedy",
    },
  ];
}

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
      googleTokenExpiry: 4_102_444_800, // 2100-01-01T00:00:00Z
    });
  });
}

describe("availability_action.findAvailableEvents", () => {
  let originalApiKey: string | undefined;
  let originalYelpApiKey: string | undefined;
  let originalGooglePlacesApiKey: string | undefined;
  let originalOpenRouterApiKey: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalApiKey = process.env.TICKETMASTER_API_KEY;
    originalYelpApiKey = process.env.YELP_API_KEY;
    originalGooglePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
    originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    // Most tests only mock Ticketmaster; avoid accidental fetches if keys are set locally.
    delete process.env.YELP_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    // Keep availability tests deterministic by preventing optional AI-tagging network calls.
    delete process.env.OPENROUTER_API_KEY;
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.TICKETMASTER_API_KEY;
    else process.env.TICKETMASTER_API_KEY = originalApiKey;
    if (originalYelpApiKey === undefined) delete process.env.YELP_API_KEY;
    else process.env.YELP_API_KEY = originalYelpApiKey;
    if (originalGooglePlacesApiKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalGooglePlacesApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("rejects unauthenticated users", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Auth Chat");

    await expect(
      t.action(api.availability_action.findAvailableEvents, { chatId }),
    ).rejects.toThrow("Not authenticated");
  });

  test("normalizes the chat planning location when city is omitted", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        expect(new URL(url).searchParams.get("city")).toBe("Washington, D.C.");
        return new Response(
          JSON.stringify({ _embedded: { events: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // Geocoding call for reference location resolution
      if (url.startsWith("https://geocoding-api.open-meteo.com/")) {
        return new Response(
          JSON.stringify({ results: [{ latitude: 38.9, longitude: -77.0 }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Planning Location Chat");
    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      planningLocation: "Washington DC",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("falls back to the user's saved city when no planning location is saved", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        expect(new URL(url).searchParams.get("city")).toBe("Chicago, IL");
        return new Response(
          JSON.stringify({ _embedded: { events: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // Geocoding call for reference location resolution
      if (url.startsWith("https://geocoding-api.open-meteo.com/")) {
        return new Response(
          JSON.stringify({ results: [{ latitude: 41.9, longitude: -87.6 }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "User City Fallback Chat");
    await t.withIdentity(identity).mutation(api.users_mutations.updateMyProfile, {
      city: "Chicago, IL",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("returns a location error when no planning location or user city is saved", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Fallback City Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId },
    );

    expect(result.error).toContain("No event-search location is saved");
    expect(result.totalEvents).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns real events and filters by shared availability windows", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: "2026-03-09T13:00:00Z",
                    end: "2026-03-09T18:00:00Z",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-sat-fit",
                  name: "Saturday Event That Fits",
                  url: "https://ticketmaster.com/event/evt-sat-fit",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                }),
                ticketmasterEvent({
                  id: "evt-mon-no-fit",
                  name: "Monday Event That Does Not Fit",
                  url: "https://ticketmaster.com/event/evt-mon-no-fit",
                  dates: { start: { dateTime: "2026-03-09T14:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Availability Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.memberCount).toBe(1);
    expect(result.totalEvents).toBe(2);
    expect(result.allEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-sat-fit",
      "evt-mon-no-fit",
    ]);
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual(["evt-sat-fit"]);
    expect(result.sharedWindows.length).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://www.googleapis.com/calendar/v3/freeBusy",
    );

    const calledUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(calledUrl.searchParams.get("apikey")).toBe(TEST_API_KEY);
    expect(calledUrl.searchParams.get("city")).toBe("Baltimore");
    expect(calledUrl.searchParams.get("size")).toBe("50");
    expect(calledUrl.searchParams.get("startDateTime")).toBe(FIXED_NOW_ISO);
    expect(calledUrl.searchParams.get("endDateTime")).toBe("2026-03-14T00:00:00Z");
  });

  test("treats accepted events from other groups as busy time when finding events", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
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

      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-cross-group-conflict",
                  name: "Conflicting Concert",
                  url: "https://ticketmaster.com/event/evt-cross-group-conflict",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                }),
                ticketmasterEvent({
                  id: "evt-open-late",
                  name: "Late Movie",
                  url: "https://ticketmaster.com/event/evt-open-late",
                  dates: { start: { dateTime: "2026-03-07T22:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Scheduling Chat");
    const secondChatId = await createTestChat(t, identity, "Game Night Crew");

    const pollId = await t
      .withIdentity(identity)
      .mutation(api.event_polls_mutations.createPoll, {
        chatId: secondChatId,
        source: "recommendation",
        options: acceptedPollOptions(),
      });

    await t.withIdentity(identity).mutation(api.event_polls_mutations.castVote, {
      pollId,
      eventId: "accepted-event",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.allEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-cross-group-conflict",
      "evt-open-late",
    ]);
    expect(
      result.availabilityFilteredEvents.map((event: NormalizedEvent) => event.eventId),
    ).toEqual(["evt-open-late"]);
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-open-late",
    ]);
  });

  test("merges Yelp and Ticketmaster into one pool for ranking (Yelp can outrank TM)", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.YELP_API_KEY = "test-yelp-key";

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
      if (url.startsWith("https://api.yelp.com/v3/events")) {
        return new Response(
          JSON.stringify({
            events: [
              {
                id: "yelp-sports-match",
                name: "City FC vs Visitors Match",
                event_site_url: "https://www.yelp.com/events/yelp-sports-match",
                time_start: "2026-03-07T19:00:00Z",
                time_end: null,
                category: "sports",
                is_free: true,
                is_canceled: false,
                description: "Local soccer match",
                location: {
                  display_address: ["Riverside Field"],
                  city: "Baltimore",
                  country: "US",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-poetry",
                  name: "Evening Poetry Circle",
                  url: "https://ticketmaster.com/event/evt-poetry",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Mixed Sources Ranking Chat");

    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["sports"],
      negativeEventTypes: [],
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore, MD",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    const sources = result.allEvents.map((e: NormalizedEvent) => e.source);
    expect(sources).toEqual(expect.arrayContaining(["ticketmaster", "yelp"]));
    expect(result.filteredEvents.map((e: NormalizedEvent) => e.eventId)).toEqual(
      expect.arrayContaining(["yelp-sports-match", "evt-poetry"]),
    );
    // Explicit preference for sports: Yelp title matches "vs" / sports; poetry does not.
    expect(result.rankedEvents[0]?.eventId).toBe("yelp-sports-match");
    expect(result.rankedEvents[0]?.source).toBe("yelp");
  });

  test("stores Ticketmaster and Yelp events in the shared events table", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.YELP_API_KEY = "test-yelp-key";

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
      if (url.startsWith("https://api.yelp.com/v3/events")) {
        return new Response(
          JSON.stringify({
            events: [
              {
                id: "yelp-storage",
                name: "Neighborhood Food Fair",
                event_site_url: "https://www.yelp.com/events/yelp-storage",
                time_start: "2026-03-07T19:00:00Z",
                time_end: null,
                category: "food-and-drink",
                is_free: true,
                is_canceled: false,
                description: "Food fair in the park",
                location: {
                  display_address: ["Riverside Park"],
                  city: "Baltimore",
                  country: "US",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "tm-storage",
                  name: "Arena Concert",
                  url: "https://ticketmaster.com/event/tm-storage",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Shared Events Storage Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.allEvents.map((event: NormalizedEvent) => event.source)).toEqual(
      expect.arrayContaining(["ticketmaster", "yelp"]),
    );

    const storedEvents = await t.query(api.events_queries.getAllEvents, {});

    expect(storedEvents.map((event) => event.source)).toEqual(
      expect.arrayContaining(["ticketmaster", "yelp"]),
    );
  });

  test("deduplicates overlapping Ticketmaster and Yelp events before ranking", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.YELP_API_KEY = "test-yelp-key";

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
      if (url.startsWith("https://api.yelp.com/v3/events")) {
        return new Response(
          JSON.stringify({
            events: [
              {
                id: "yelp-dup",
                name: "Shared Night Out",
                event_site_url: "https://www.yelp.com/events/yelp-dup",
                time_start: "2026-03-07T19:00:00Z",
                time_end: null,
                category: "music",
                is_free: true,
                is_canceled: false,
                description: "Rich provider metadata for the shared event",
                image_url: "https://images.example.com/shared-night-out.jpg",
                location: {
                  display_address: ["Shared Hall"],
                  city: "Baltimore",
                  country: "US",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "tm-dup",
                  name: "Shared Night Out",
                  url: "https://ticketmaster.com/event/tm-dup",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                  _embedded: {
                    venues: [
                      {
                        name: "Shared Hall",
                        city: { name: "Baltimore" },
                        country: { name: "US" },
                      },
                    ],
                  },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Dedup Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(1);
    expect(result.allEvents).toHaveLength(1);
    expect(result.allEvents[0]?.eventId).toBe("yelp-dup");
    expect(result.allEvents[0]?.source).toBe("yelp");
    expect(result.allEvents[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        {
          source: "ticketmaster",
          eventId: "tm-dup",
          url: "https://ticketmaster.com/event/tm-dup",
        },
        {
          source: "yelp",
          eventId: "yelp-dup",
          url: "https://www.yelp.com/events/yelp-dup",
        },
      ]),
    );

    const storedEvents = await t.query(api.events_queries.getAllEvents, {});
    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0]?.source).toBe("yelp");
    expect(storedEvents[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        {
          source: "ticketmaster",
          eventId: "tm-dup",
          url: "https://ticketmaster.com/event/tm-dup",
        },
        {
          source: "yelp",
          eventId: "yelp-dup",
          url: "https://www.yelp.com/events/yelp-dup",
        },
      ]),
    );
  });

  test("does not include custom events in search recommendations", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Area Custom Events Chat");

    await t.mutation(internal.custom_events_mutations.createCustomEvent, {
      chatId,
      createdBy: userId,
      eventId: "custom-manhattan",
      title: "Manhattan Custom Dinner",
      startTime: "2026-03-07T19:00:00Z",
      venueName: "Apartment",
      venueCity: "New York",
      venueNeighborhood: "Manhattan",
      venueCountry: "US",
      tags: ["Custom"],
    });
    await t.mutation(internal.custom_events_mutations.createCustomEvent, {
      chatId,
      createdBy: userId,
      eventId: "custom-financial-district",
      title: "Financial District Custom Dinner",
      startTime: "2026-03-07T20:00:00Z",
      venueName: "Office",
      venueCity: "New York",
      venueNeighborhood: "Financial District",
      venueCountry: "US",
      tags: ["Custom"],
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "New York", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(result.allEvents.map((e: NormalizedEvent) => e.eventId)).not.toEqual(
      expect.arrayContaining(["custom-manhattan", "custom-financial-district"]),
    );
    expect(result.rankedActivityEvents.map((e: NormalizedEvent) => e.eventId)).not.toEqual(
      expect.arrayContaining(["custom-manhattan", "custom-financial-district"]),
    );
  });

  test("returns empty events when Ticketmaster HTTP errors (provider isolated)", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
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
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response("Bad Request", { status: 400 });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Error Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Chicago, IL" },
    );
    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(0);
    expect(result.allEvents).toEqual([]);
    expect(result.filteredEvents).toEqual([]);
  });

  test("returns empty events when API key is missing", async () => {
    delete process.env.TICKETMASTER_API_KEY;
    const fetchMock = setFetchMock((input) => {
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
      // Geocoding call for reference location resolution
      if (url.startsWith("https://geocoding-api.open-meteo.com/")) {
        return new Response(
          JSON.stringify({ results: [{ latitude: 41.9, longitude: -87.6 }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "No Key Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Chicago, IL" },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(0);
    expect(result.allEvents).toEqual([]);
    expect(result.filteredEvents).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns actionable error when a member has no accessible Google Calendar", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Missing Calendar Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId },
    );

    expect(result.error).toContain("Google Calendar is not connected or accessible");
    expect(result.sharedWindows).toEqual([]);
    expect(result.totalEvents).toBe(0);
    expect(result.allEvents).toEqual([]);
    expect(result.filteredEvents).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("internal shared-availability action returns windows for authorized member", async () => {
    const fetchMock = setFetchMock((input) => {
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
    const chatId = await createTestChat(t, identity, "Shared Availability Chat");

    const result = await t.action(
      internal.availability_action.getSharedAvailabilityForChatInternal,
      {
        chatId,
        userId,
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.memberCount).toBe(1);
    expect(result.sharedWindows.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://www.googleapis.com/calendar/v3/freeBusy",
    );
  });

  test("internal available-events action returns only events within shared availability", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: "2026-03-09T13:00:00Z",
                    end: "2026-03-09T18:00:00Z",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-sat-fit",
                  name: "Saturday Event That Fits",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                }),
                ticketmasterEvent({
                  id: "evt-mon-no-fit",
                  name: "Monday Event That Does Not Fit",
                  dates: { start: { dateTime: "2026-03-09T14:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Internal Available Events Chat");

    const result = await t.action(
      internal.availability_action.findAvailableEventsForChatInternal,
      {
        chatId,
        userId,
        city: "Baltimore",
        keyword: "music",
        daysAhead: 7,
        durationMinutes: 120,
        size: 20,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(2);
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual(["evt-sat-fit"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calledUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(calledUrl.searchParams.get("keyword")).toBe("music");
    expect(calledUrl.searchParams.get("city")).toBe("Baltimore");
  });

  test("orders ranked events using explicit preferences and learned group profile", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    const fetchMock = setFetchMock((input) => {
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
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-sports",
                  name: "Basketball Game Tonight",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                  priceRanges: [{ min: 18, max: 40 }],
                }),
                ticketmasterEvent({
                  id: "evt-concert",
                  name: "Live Concert Night",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                  priceRanges: [{ min: 80, max: 120 }],
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Learned Profile Ranking Chat");

    await t.mutation(
      internal.group_preferences_mutations.upsertGroupPreferenceProfileInternal,
      {
        chatId,
        categorySignals: [
          {
            category: "basketball",
            acceptCount: 3,
            rejectCount: 0,
            moreLikeThisCount: 1,
          },
        ],
        budgetPreference: "low",
        distancePreference: "unknown",
        feedbackCount: 6,
        lastUpdatedAt: 1_718_000_000_000,
      },
    );
    await t.mutation(internal.user_preferences_mutations.setUserEventPreferencesInternal, {
      userId,
      preferredEventTypes: ["basketball"],
      negativeEventTypes: ["concert"],
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.rankedEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-sports",
      "evt-concert",
    ]);
    expect(result.learnedProfileSummary).toEqual(
      expect.arrayContaining([
        "The group has responded most positively to basketball events.",
        "The group shows a learned lower-budget preference.",
      ]),
    );
    expect(result.rankedEvents[0].fitReasons).toEqual([
      "Matches the group's positive history with basketball events.",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("filters events that exceed a member's budget cap", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-low-budget",
                  name: "Low Budget Event",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                  priceRanges: [{ min: 15, max: 25 }],
                }),
                ticketmasterEvent({
                  id: "evt-high-budget",
                  name: "High Budget Event",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                  priceRanges: [{ min: 100, max: 200 }],
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Budget Cap Chat");

    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxBudget: "low" },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(2);
    expect(
      result.availabilityFilteredEvents.map((event: NormalizedEvent) => event.eventId),
    ).toEqual(expect.arrayContaining(["evt-low-budget", "evt-high-budget"]));
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-low-budget",
    ]);
  });

  test("filters events that end after a member's max end time", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                // Starts 18:00, ends 20:00 with 2h duration → passes maxEndHour=21
                ticketmasterEvent({
                  id: "evt-early",
                  name: "Early Event",
                  dates: { start: { dateTime: "2026-03-07T18:00:00Z" } },
                }),
                // Starts 20:00, ends 22:00 with 2h duration → exceeds maxEndHour=21
                ticketmasterEvent({
                  id: "evt-late",
                  name: "Late Event",
                  dates: { start: { dateTime: "2026-03-07T20:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "End Time Chat");

    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxEventEndHour: 21 },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(result.totalEvents).toBe(2);
    expect(
      result.availabilityFilteredEvents.map((event: NormalizedEvent) => event.eventId),
    ).toEqual(expect.arrayContaining(["evt-early", "evt-late"]));
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual([
      "evt-early",
    ]);
  });

  test("keeps late-evening events when calendar is fully free", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-late-evening",
                  name: "Late Evening Show",
                  dates: { start: { dateTime: "2026-03-08T00:30:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Late Evening Availability Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(
      result.availabilityFilteredEvents.map((event: NormalizedEvent) => event.eventId),
    ).toEqual(expect.arrayContaining(["evt-late-evening"]));
    expect(result.filteredEvents.map((event: NormalizedEvent) => event.eventId)).toEqual(
      expect.arrayContaining(["evt-late-evening"]),
    );
  });

  test("evergreen Google Places events survive busy-block filtering in the full pipeline", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;

    const fetchMock = setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  { start: "2026-03-07T18:00:00Z", end: "2026-03-07T23:00:00Z" },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-blocked",
                  name: "Evening Concert",
                  url: "https://ticketmaster.com/event/evt-blocked",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                }),
              ],
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
    const chatId = await createTestChat(t, identity, "Evergreen Pipeline Chat");

    // Pre-seed the Google Places venue — queries read from DB (skipGooglePlaces=true).
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_ChIJevergreen1",
      source: "google_places",
      title: "Harbor Cafe",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.2861,
      longitude: -76.6134,
      formattedAddress: "100 Inner Harbor, Baltimore, MD 21202",
      googlePlaceId: "ChIJevergreen1",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const allSources = result.allEvents.map((e: NormalizedEvent) => e.source);
    expect(allSources).toEqual(expect.arrayContaining(["ticketmaster", "google_places"]));

    const gpEvent = result.allEvents.find(
      (e: NormalizedEvent) => e.source === "google_places",
    );
    expect(gpEvent).toBeDefined();
    if (!gpEvent) throw new Error("unreachable");
    // Evergreen venues get a virtual start time assigned from shared availability windows.
    expect(gpEvent.startTime).not.toBeNull();
    expect(gpEvent.latitude).toBe(39.2861);
    expect(gpEvent.longitude).toBe(-76.6134);
    expect(gpEvent.formattedAddress).toBe("100 Inner Harbor, Baltimore, MD 21202");
    expect(gpEvent.googlePlaceId).toBe("ChIJevergreen1");

    expect(
      result.filteredEvents.some((e: NormalizedEvent) => e.source === "google_places"),
    ).toBe(true);

    // freeBusy + ticketmaster (Google Places reads from DB, no API call)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("warmEventCacheForChat persists available Google Places enrichment fields to non_ticket_events", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";

    setFetchMock((input, init) => {
      const url = String(input);
      if (url === "https://places.googleapis.com/v1/places:searchText") {
        const body = JSON.parse(String(init?.body));
        expect(init?.headers).toMatchObject({
          "X-Goog-FieldMask": expect.stringContaining("places.regularOpeningHours"),
        });
        return new Response(
          JSON.stringify({
            places: [
              {
                id: "ChIJfoxbox",
                displayName: { text: "Fox in a Box" },
                formattedAddress: "28 W Flagler St, Miami, FL 33130",
                googleMapsUri: "https://maps.google.com/?cid=16714083307946231891",
                location: { latitude: 25.7742, longitude: -80.1936 },
                regularOpeningHours: {
                  periods: [
                    {
                      open: { day: 5, hour: 10, minute: 0 },
                      close: { day: 5, hour: 22, minute: 30 },
                    },
                  ],
                },
                addressComponents: [
                  { longText: "Downtown Miami", types: ["neighborhood"] },
                  { longText: "Miami", types: ["locality"] },
                  { longText: "United States", types: ["country"] },
                ],
                primaryType: "escape_room_center",
                types: ["escape_room_center"],
              },
            ],
            debugQuery: body.textQuery,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Warm Cache Persistence Chat");

    await t.action(internal.availability_action.warmEventCacheForChat, {
      chatId,
      city: "Miami",
      userId,
    });

    const storedPlace = await t.run(async (ctx) =>
      ctx.db
        .query("non_ticket_events")
        .withIndex("by_chat_and_place_id", (q) =>
          q.eq("chatId", chatId).eq("placeId", "gp_ChIJfoxbox"),
        )
        .unique(),
    );

    expect(storedPlace).toBeTruthy();
    expect(storedPlace?.title).toBe("Fox in a Box");
    expect(storedPlace?.latitude).toBe(25.7742);
    expect(storedPlace?.longitude).toBe(-80.1936);
    expect(storedPlace?.formattedAddress).toBe("28 W Flagler St, Miami, FL 33130");
    expect(storedPlace?.googlePlaceId).toBe("ChIJfoxbox");
    expect(storedPlace?.venueNeighborhood).toBe("Downtown Miami");
    expect(storedPlace?.venueCity).toBe("Miami");
    expect(storedPlace?.openHours).toEqual([
      { dayOfWeek: 5, openTime: "10:00", closeTime: "22:30" },
    ]);
  });

  test("Google Places provider error is isolated from the rest of the pipeline", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";

    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-survives",
                  name: "Surviving Event",
                  url: "https://ticketmaster.com/event/evt-survives",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                }),
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://places.googleapis.com/")) {
        return new Response("Internal Server Error", { status: 500 });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "GP Error Isolation Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(result.allEvents.map((e: NormalizedEvent) => e.eventId)).toEqual(["evt-survives"]);
  });

  test("enriches Ticketmaster venues with Google Places neighborhoods", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";

    setFetchMock((input, init) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        return new Response(
          JSON.stringify({
            _embedded: {
              events: [
                ticketmasterEvent({
                  id: "evt-lyric",
                  name: "Broadway Night",
                  url: "https://ticketmaster.com/event/evt-lyric",
                  dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
                  _embedded: {
                    venues: [
                      {
                        name: "Lyric Theatre - NY",
                        city: { name: "New York" },
                        country: { name: "United States Of America" },
                        location: { latitude: "40.756", longitude: "-73.986" },
                      },
                    ],
                  },
                }),
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://places.googleapis.com/")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          textQuery: "Lyric Theatre - NY in New York",
          maxResultCount: 1,
        });
        return new Response(
          JSON.stringify({
            places: [
              {
                id: "place-lyric",
                addressComponents: [
                  { longText: "Manhattan", types: ["sublocality_level_1"] },
                  { longText: "New York", types: ["locality"] },
                  { longText: "United States", types: ["country"] },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Neighborhood Enrichment Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "New York", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const event = result.allEvents.find((e: NormalizedEvent) => e.eventId === "evt-lyric");
    expect(event?.venueNeighborhood).toBe("Manhattan");
    expect(result.rankedActivityEvents[0]?.venueNeighborhood).toBe("Manhattan");
    expect(result.locationAreaOptions).toEqual(["Manhattan"]);
  });

  test("filters recommendations by locationArea while keeping the base city search", async () => {
    process.env.TICKETMASTER_API_KEY = TEST_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";
    setFetchMock((input, init) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
        const requestedCity = new URL(url).searchParams.get("city");
        expect(["New York", "Brooklyn"]).toContain(requestedCity);
        return new Response(
          JSON.stringify({
            _embedded: {
              events: requestedCity === "Brooklyn"
                ? [
                    ticketmasterEvent({
                      id: "evt-brooklyn",
                      name: "Brooklyn Bowl Night",
                      _embedded: {
                        venues: [
                          {
                            name: "Brooklyn Bowl",
                            city: { name: "Brooklyn" },
                            country: { name: "United States Of America" },
                          },
                        ],
                      },
                    }),
                  ]
                : [
                    ticketmasterEvent({
                      id: "evt-lyric",
                      name: "Lyric Show",
                      _embedded: {
                        venues: [
                          {
                            name: "Lyric Theatre - NY",
                            city: { name: "New York" },
                            country: { name: "United States Of America" },
                          },
                        ],
                      },
                    }),
                  ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "https://places.googleapis.com/v1/places:searchText") {
        const body = JSON.parse(String(init?.body));
        if (body.textQuery === "Lyric Theatre - NY in New York") {
          return new Response(
            JSON.stringify({
              places: [
                {
                  id: "place-lyric",
                  addressComponents: [
                    { longText: "Theater District", types: ["neighborhood"] },
                    { longText: "Manhattan", types: ["sublocality_level_1"] },
                    { longText: "New York", types: ["locality"] },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (body.textQuery === "Brooklyn Bowl in Brooklyn") {
          return new Response(
            JSON.stringify({
              places: [
                {
                  id: "place-brooklyn-bowl",
                  addressComponents: [
                    { longText: "Williamsburg", types: ["neighborhood"] },
                    { longText: "Brooklyn", types: ["sublocality_level_1"] },
                    { longText: "New York", types: ["locality"] },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Location Area Chat");

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "New York",
        locationArea: "Brooklyn",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.allEvents.map((e: NormalizedEvent) => e.eventId)).toEqual(["evt-brooklyn"]);
    expect(result.allEvents[0]?.venueCity).toBe("Brooklyn");
    expect(result.rankedActivityEvents.map((e: NormalizedEvent) => e.eventId)).toEqual(["evt-brooklyn"]);
    expect(result.locationAreaOptions).toEqual(["Manhattan", "Brooklyn"]);
  });

  test("filters Google Places events that exceed the distance restriction", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Distance Filter Chat");

    // Pre-seed both venues — queries read from DB (skipGooglePlaces=true).
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_ChIJnearby",
      source: "google_places",
      title: "Harbor Grill",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.2861,
      longitude: -76.6134,
      googlePlaceId: "ChIJnearby",
    });
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_ChIJfaraway",
      source: "google_places",
      title: "Far North Steakhouse",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.65,
      longitude: -76.62,
      googlePlaceId: "ChIJfaraway",
    });

    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      useDistanceRanking: true,
    });
    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 10 },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const allIds = result.allEvents.map((e: NormalizedEvent) => e.eventId);
    expect(allIds).toEqual(expect.arrayContaining(["gp_ChIJnearby", "gp_ChIJfaraway"]));

    const filteredIds = result.filteredEvents.map((e: NormalizedEvent) => e.eventId);
    expect(filteredIds).toContain("gp_ChIJnearby");
    expect(filteredIds).not.toContain("gp_ChIJfaraway");
  });

  test("enforces distance hard restriction even without useDistanceRanking enabled", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "No Distance Ranking Chat");

    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_ChIJclose",
      source: "google_places",
      title: "Inner Harbor Cafe",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.2861,
      longitude: -76.6134,
      googlePlaceId: "ChIJclose",
    });
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_ChIJdistant",
      source: "google_places",
      title: "Far Away Diner",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.65,
      longitude: -76.62,
      googlePlaceId: "ChIJdistant",
    });

    // Do NOT enable useDistanceRanking — this is the bug regression test
    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 10 },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const filteredIds = result.filteredEvents.map((e: NormalizedEvent) => e.eventId);
    expect(filteredIds).toContain("gp_ChIJclose");
    expect(filteredIds).not.toContain("gp_ChIJdistant");
  });

  test("uses chat midpoint instead of city center for distance filtering", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Midpoint Chat");

    // Fells Point, Baltimore — south-east of city center
    const fellsPointLat = 39.2824;
    const fellsPointLon = -76.5916;

    // Venue near Fells Point (~1 mile)
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_near_fells",
      source: "google_places",
      title: "Thames Street Oyster House",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.2830,
      longitude: -76.5930,
      googlePlaceId: "ChIJnearFells",
    });

    // Venue far from Fells Point (~6 miles north) but near city center
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_far_from_fells",
      source: "google_places",
      title: "Towson Diner",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.395,
      longitude: -76.602,
      googlePlaceId: "ChIJfarFromFells",
    });

    // Set midpoint to Fells Point and a tight distance restriction
    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      useDistanceRanking: true,
      midpointLatitude: fellsPointLat,
      midpointLongitude: fellsPointLon,
      midpointLabel: "Fells Point",
    });
    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 5 },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const filteredIds = result.filteredEvents.map((e: NormalizedEvent) => e.eventId);
    expect(filteredIds).toContain("gp_near_fells");
    expect(filteredIds).not.toContain("gp_far_from_fells");
  });

  test("ignores saved midpoint for distance filtering when nearby preference is disabled", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Disabled Midpoint Chat");

    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_near_fells",
      source: "google_places",
      title: "Thames Street Oyster House",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.2830,
      longitude: -76.5930,
      googlePlaceId: "ChIJnearFells",
    });

    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_far_from_fells",
      source: "google_places",
      title: "Towson Diner",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.395,
      longitude: -76.602,
      googlePlaceId: "ChIJfarFromFells",
    });

    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      useDistanceRanking: false,
      midpointLatitude: 39.2824,
      midpointLongitude: -76.5916,
      midpointLabel: "Fells Point",
    });
    await t.withIdentity(identity).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 5 },
    );

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const filteredIds = result.filteredEvents.map((e: NormalizedEvent) => e.eventId);
    expect(filteredIds).toContain("gp_near_fells");
    expect(filteredIds).toContain("gp_far_from_fells");
  });

  test("applies final midpoint distance ranking to All recommendations when nearby is enabled", async () => {
    delete process.env.TICKETMASTER_API_KEY;
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Midpoint Ranking Chat");

    const fellsPointLat = 39.2824;
    const fellsPointLon = -76.5916;

    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_close_neutral",
      source: "google_places",
      title: "Neighborhood Dinner",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.283,
      longitude: -76.593,
      googlePlaceId: "ChIJcloseNeutral",
    });
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_far_keyword",
      source: "google_places",
      title: "Jazz Dinner Experience",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.395,
      longitude: -76.602,
      googlePlaceId: "ChIJfarKeyword",
    });

    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      useDistanceRanking: true,
      midpointLatitude: fellsPointLat,
      midpointLongitude: fellsPointLon,
      midpointLabel: "Fells Point",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", keyword: "jazz", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    expect(result.rankedFoodEvents.map((e: NormalizedEvent) => e.eventId)).toEqual([
      "gp_close_neutral",
      "gp_far_keyword",
    ]);
    expect(result.rankedEvents[0]?.eventId).toBe("gp_close_neutral");
  });

  test("keeps selected neighborhood ranking independent from midpoint distance", async () => {
    delete process.env.TICKETMASTER_API_KEY;
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Neighborhood Ranking Chat");

    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_close_hampden",
      source: "google_places",
      title: "Nearby Dinner",
      venueCity: "Baltimore",
      venueNeighborhood: "Hampden",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.283,
      longitude: -76.593,
      googlePlaceId: "ChIJcloseHampden",
    });
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_far_hampden",
      source: "google_places",
      title: "Jazz Dinner Experience",
      venueCity: "Baltimore",
      venueNeighborhood: "Hampden",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.395,
      longitude: -76.602,
      googlePlaceId: "ChIJfarHampden",
    });

    await t.withIdentity(identity).mutation(api.chats_mutations.update, {
      chatId,
      useDistanceRanking: true,
      midpointLatitude: 39.2824,
      midpointLongitude: -76.5916,
      midpointLabel: "Fells Point",
    });

    const result = await t.withIdentity(identity).action(
      api.availability_action.findAvailableEvents,
      {
        chatId,
        city: "Baltimore",
        locationArea: "Hampden",
        keyword: "jazz",
        daysAhead: 7,
        durationMinutes: 120,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.rankedFoodEvents.map((e: NormalizedEvent) => e.eventId)).toEqual([
      "gp_far_hampden",
      "gp_close_hampden",
    ]);
  });

  test("strictest member distance restriction applies in a group", async () => {
    setFetchMock((input) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    const t = createTestConvex();
    const { identity: identity1, userId: userId1 } = await createTestUser(t);
    await connectGoogleCalendar(t, userId1);
    const chatId = await createTestChat(t, identity1, "Multi-Member Chat");

    const { identity: identity2, userId: userId2 } = await createTestUser(t);
    await connectGoogleCalendar(t, userId2);
    await t.run(async (ctx) => {
      await ctx.db.insert("group_members", {
        chatId,
        userId: userId2,
        role: "member",
      });
    });

    // Venue at ~8 miles from Baltimore center
    await t.mutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
      chatId,
      placeId: "gp_8miles",
      source: "google_places",
      title: "Moderate Distance Spot",
      venueCity: "Baltimore",
      venueCountry: "US",
      venueType: "food",
      latitude: 39.44,
      longitude: -76.62,
      googlePlaceId: "ChIJ8miles",
    });

    // Member 1: lenient (20 miles)
    await t.withIdentity(identity1).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 20 },
    );
    // Member 2: strict (5 miles)
    await t.withIdentity(identity2).mutation(
      api.user_hard_restrictions_mutations.setUserHardRestrictions,
      { maxDistanceMiles: 5 },
    );

    const result = await t.withIdentity(identity1).action(
      api.availability_action.findAvailableEvents,
      { chatId, city: "Baltimore", daysAhead: 7, durationMinutes: 120 },
    );

    expect(result.error).toBeUndefined();
    const filteredIds = result.filteredEvents.map((e: NormalizedEvent) => e.eventId);
    expect(filteredIds).not.toContain("gp_8miles");
  });
});
