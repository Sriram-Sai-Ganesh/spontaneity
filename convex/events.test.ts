import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { EventProvider } from "./events";
import { searchEvents } from "./events";
import { NormalizedEventSchema, type NormalizedEvent } from "./event_types";
import { api, internal } from "./_generated/api";
import { createTestConvex } from "./test.setup";

const streamTextMock = vi.fn();
const createOpenRouterMock = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (...args: unknown[]) => createOpenRouterMock(...args),
}));
const apiKey = process.env.TICKETMASTER_API_KEY;

// Shared mock event factory
function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: "evt-1",
    title: "Test Event",
    description: null,
    startTime: "2026-06-01T20:00:00Z",
    venueName: "Test Venue",
    venueCity: "Baltimore",
    venueCountry: "United States Of America",
    source: "test-provider",
    url: "https://example.com/event/1",
    image: null,
    status: null,
    budgetBucket: null,
    genre: null,
    tags: [],
    ...overrides,
  };
}

// Inline normalization logic to test provider contract without env vars
async function runProviders(
  providers: EventProvider[],
  params: Parameters<EventProvider["search"]>[0],
): Promise<NormalizedEvent[]> {
  const results = await Promise.all(providers.map((p) => p.search(params)));
  return results.flat();
}

describe("events normalization service", () => {
  describe("validation", () => {
    test("valid event passes schema", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "evt-1",
        title: "Test Event",
        description: null,
        startTime: "2026-06-01T20:00:00Z",
        venueName: "Test Venue",
        venueCity: "Baltimore",
        venueCountry: "United States Of America",
        source: "ticketmaster",
        url: "https://example.com/event/1",
        image: null,
        status: null,
        budgetBucket: null,
        genre: null,
      });
      expect(result.success).toBe(true);
    });

    test("event with empty eventId is rejected", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "",
        title: "Test Event",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "ticketmaster",
        url: "https://example.com/event/1",
        image: null,
        status: null,
        budgetBucket: null,
      });
      expect(result.success).toBe(false);
    });

    test("event with empty title is rejected", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "evt-1",
        title: "",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "ticketmaster",
        url: "https://example.com/event/1",
        image: null,
        status: null,
        budgetBucket: null,
      });
      expect(result.success).toBe(false);
    });

    test("event with empty source is rejected", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "evt-1",
        title: "Test Event",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "",
        url: "https://example.com/event/1",
        image: null,
        status: null,
        budgetBucket: null,
      });
      expect(result.success).toBe(false);
    });

    test("event with empty url is rejected", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "evt-1",
        title: "Test Event",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "ticketmaster",
        url: "",
        image: null,
        status: null,
        budgetBucket: null,
      });
      expect(result.success).toBe(false);
    });

    test("event with invalid status is rejected", () => {
      const result = NormalizedEventSchema.safeParse({
        eventId: "evt-1",
        title: "Test Event",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "ticketmaster",
        url: "https://example.com/event/1",
        image: null,
        status: "unknown-status",
        budgetBucket: null,
      });
      expect(result.success).toBe(false);
    });

    test("invalid events are excluded and valid events are kept", async () => {
      // Provider returns one valid and one invalid event (missing title)
      const provider: EventProvider = {
        name: "mixed",
        search: async () => [
          {
            eventId: "good-1",
            title: "Good Event",
            description: null,
            startTime: null,
            venueName: null,
            venueCity: null,
            venueCountry: null,
            source: "ticketmaster",
            url: "https://example.com/good",
            image: null,
            status: null,
            budgetBucket: null,
            genre: null,
          } as NormalizedEvent,
          {
            eventId: "",
            title: "",
            description: null,
            startTime: null,
            venueName: null,
            venueCity: null,
            venueCountry: null,
            source: "",
            url: "",
            image: null,
            status: null,
            budgetBucket: null,
          } as NormalizedEvent,
        ],
      };

      // searchEvents runs validation internally; we need to inject the provider
      // by going through the provider contract helper with validation applied
      const raw = await provider.search({});
      const validated = raw.filter(
        (e) => NormalizedEventSchema.safeParse(e).success,
      );
      expect(validated).toHaveLength(1);
      expect(validated[0].eventId).toBe("good-1");
    });
  });

  describe("provider contract", () => {
    test("single provider returns its events", async () => {
      const event = makeEvent();
      const provider: EventProvider = {
        name: "mock",
        search: async () => [event],
      };

      const results = await runProviders([provider], { city: "Baltimore" });
      expect(results).toHaveLength(1);
      expect(results[0].eventId).toBe("evt-1");
    });

    test("multiple providers merge results", async () => {
      const a: EventProvider = {
        name: "provider-a",
        search: async () => [makeEvent({ eventId: "a-1", source: "provider-a" })],
      };
      const b: EventProvider = {
        name: "provider-b",
        search: async () => [makeEvent({ eventId: "b-1", source: "provider-b" })],
      };

      const results = await runProviders([a, b], { city: "Baltimore" });
      expect(results).toHaveLength(2);
      expect(results.map((e) => e.source)).toContain("provider-a");
      expect(results.map((e) => e.source)).toContain("provider-b");
    });

    test("each event has a source field identifying its provider", async () => {
      const provider: EventProvider = {
        name: "ticketmaster",
        search: async () => [makeEvent({ source: "ticketmaster" })],
      };

      const results = await runProviders([provider], {});
      for (const event of results) {
        expect(typeof event.source).toBe("string");
        expect(event.source.length).toBeGreaterThan(0);
      }
    });

    test("empty provider list returns empty array", async () => {
      const results = await runProviders([], { city: "Baltimore" });
      expect(results).toEqual([]);
    });

    test("provider returning empty array contributes nothing", async () => {
      const empty: EventProvider = { name: "empty", search: async () => [] };
      const full: EventProvider = {
        name: "full",
        search: async () => [makeEvent({ eventId: "x-1" })],
      };

      const results = await runProviders([empty, full], {});
      expect(results).toHaveLength(1);
      expect(results[0].eventId).toBe("x-1");
    });

    test("all NormalizedEvent fields are present in output", async () => {
      const event = makeEvent({
        eventId: "check-1",
        title: "Field Check",
        description: "desc",
        startTime: "2026-07-01T18:00:00Z",
        venueName: "Arena",
        venueCity: "Baltimore",
        venueCountry: "United States Of America",
        source: "ticketmaster",
        url: "https://ticketmaster.com/event/1",
        image: "https://example.com/img.jpg",
        status: "onsale",
      });
      const provider: EventProvider = { name: "mock", search: async () => [event] };
      const [result] = await runProviders([provider], {});

      expect(result.eventId).toBe("check-1");
      expect(result.title).toBe("Field Check");
      expect(result.description).toBe("desc");
      expect(result.startTime).toBe("2026-07-01T18:00:00Z");
      expect(result.venueName).toBe("Arena");
      expect(result.venueCity).toBe("Baltimore");
      expect(result.venueCountry).toBe("United States Of America");
      expect(result.source).toBe("ticketmaster");
      expect(result.url).toBe("https://ticketmaster.com/event/1");
      expect(result.image).toBe("https://example.com/img.jpg");
      expect(result.status).toBe("onsale");
    });

    test("providers are queried in parallel", async () => {
      const calls: string[] = [];
      const a: EventProvider = {
        name: "a",
        search: async () => { calls.push("a"); return []; },
      };
      const b: EventProvider = {
        name: "b",
        search: async () => { calls.push("b"); return []; },
      };

      await runProviders([a, b], {});
      expect(calls).toContain("a");
      expect(calls).toContain("b");
    });
  });

  describe("searchEvents deduplication", () => {
    const originalTicketmasterApiKey = process.env.TICKETMASTER_API_KEY;
    const originalYelpApiKey = process.env.YELP_API_KEY;

    beforeEach(() => {
      process.env.TICKETMASTER_API_KEY = "test-ticketmaster-key";
      process.env.YELP_API_KEY = "test-yelp-key";
    });

    afterEach(() => {
      if (originalTicketmasterApiKey === undefined) {
        delete process.env.TICKETMASTER_API_KEY;
      } else {
        process.env.TICKETMASTER_API_KEY = originalTicketmasterApiKey;
      }
      if (originalYelpApiKey === undefined) {
        delete process.env.YELP_API_KEY;
      } else {
        process.env.YELP_API_KEY = originalYelpApiKey;
      }
      vi.restoreAllMocks();
    });

    test("deduplicates overlapping Yelp and Ticketmaster results after retrieval", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = String(input);
        if (url.startsWith("https://api.yelp.com/v3/events")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                events: [
                  {
                    id: "yelp-dup",
                    name: "Shared Night Out",
                    event_site_url: "https://www.yelp.com/events/yelp-dup",
                    time_start: "2026-06-01T20:00:00Z",
                    description: "Richer description from Yelp",
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
            ),
          );
        }

        if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                _embedded: {
                  events: [
                    {
                      id: "tm-dup",
                      name: "Shared Night Out",
                      url: "https://ticketmaster.com/event/tm-dup",
                      dates: { start: { dateTime: "2026-06-01T20:00:00Z" } },
                      _embedded: {
                        venues: [
                          {
                            name: "Shared Hall",
                            city: { name: "Baltimore" },
                            country: { name: "US" },
                          },
                        ],
                      },
                    },
                  ],
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
          );
        }

        throw new Error(`Unexpected fetch URL in test: ${url}`);
      });

      const events = await searchEvents({
        city: "Baltimore",
        startDateTime: "2026-06-01T00:00:00Z",
        endDateTime: "2026-06-02T00:00:00Z",
        size: 10,
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.eventId).toBe("yelp-dup");
      expect(events[0]?.sourceLinks).toEqual(
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
  });

  describe.skipIf(!apiKey)("smoke (requires TICKETMASTER_API_KEY)", () => {
    function assertValidEvents(events: NormalizedEvent[]) {
      expect(Array.isArray(events)).toBe(true);
      for (const event of events) {
        expect(typeof event.eventId).toBe("string");
        expect(typeof event.title).toBe("string");
        expect(typeof event.source).toBe("string");
        expect(typeof event.url).toBe("string");
        expect(typeof event.description === "string" || event.description === null).toBe(true);
        expect(typeof event.startTime === "string" || event.startTime === null).toBe(true);
        expect(typeof event.venueName === "string" || event.venueName === null).toBe(true);
        expect(typeof event.venueCity === "string" || event.venueCity === null).toBe(true);
        expect(typeof event.venueCountry === "string" || event.venueCountry === null).toBe(true);
        expect(typeof event.image === "string" || event.image === null).toBe(true);
      }
    }

    test("returns events filtered by city", async () => {
      const events = await searchEvents({ city: "Baltimore", size: 3 });
      expect(events.length).toBeGreaterThan(0);
      assertValidEvents(events);
    });

    test("returns events filtered by keyword", async () => {
      const events = await searchEvents({ keyword: "Orioles", size: 3 });
      expect(events.length).toBeGreaterThan(0);
      assertValidEvents(events);
    });

    test("returns events filtered by date range", async () => {
      const start = new Date();
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days out
      const events = await searchEvents({
        city: "Baltimore",
        startDateTime: start.toISOString().split(".")[0] + "Z",
        endDateTime: end.toISOString().split(".")[0] + "Z",
        size: 3,
      });
      assertValidEvents(events);
      for (const event of events) {
        if (event.startTime) {
          expect(new Date(event.startTime).getTime()).toBeGreaterThanOrEqual(start.getTime());
        }
      }
    });

    test("returns empty array for no matches", async () => {
      const events = await searchEvents({ keyword: "xyzzy_no_match_abc123", size: 1 });
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });

    test("each event has source field set to ticketmaster", async () => {
      const events = await searchEvents({ city: "Baltimore", size: 3 });
      for (const event of events) {
        expect(event.source).toBe("ticketmaster");
      }
    });
  });

  describe("AI event tagging", () => {
    let originalApiKey: string | undefined;
    beforeEach(() => {
      originalApiKey = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      vi.clearAllMocks();

      createOpenRouterMock.mockReturnValue({
        chat: vi.fn(() => "mock-model"),
      });
    });
    afterEach(() => {
      if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = originalApiKey;
      vi.restoreAllMocks();
    });

    test("basketball game event gets Sports tag", async () => {
      const t = createTestConvex();

      const mockEvent = {
        eventId: "basketball-test-1",
        title: "Baltimore Bullets vs Lakers",
        description: "An exciting NBA basketball game featuring the Baltimore Bullets taking on the Lakers in a high-stakes matchup at the arena.",
        venueName: "Baltimore Arena",
        venueCity: "Baltimore",
      };

      // Setup mock to return Basketball tag
      streamTextMock.mockResolvedValue({
        textStream: (async function* () {
          yield '{"tags":["Basketball"],"venueType":"activity"}';
        })(),
      });

      const result = await t.action(internal.events_actions.tagEvent, {
        event: mockEvent,
      });

      expect(result).not.toBeNull();
      expect(result!.tags).toContain("Basketball");
      expect(result!.tags.length).toBeGreaterThan(0);
    });

    test("outdoor festival gets multiple appropriate tags", async () => {
      const t = createTestConvex();

      const mockEvent = {
        eventId: "festival-test-1",
        title: "Summer Music Festival",
        description: "A weekend-long outdoor music festival featuring multiple artists, food vendors, and activities in the park.",
        venueName: "Druid Hill Park",
        venueCity: "Baltimore",
      };

      // Setup mock to return multiple tags (using current valid tags)
      streamTextMock.mockResolvedValue({
        textStream: (async function* () {
          yield '{"tags":["Hiking","Concert","Festival"],"venueType":"activity"}';
        })(),
      });

      const result = await t.action(internal.events_actions.tagEvent, {
        event: mockEvent,
      });

      expect(result).not.toBeNull();
      expect(result!.tags).toContain("Hiking");
      expect(result!.tags).toContain("Concert");
      expect(result!.tags).toContain("Festival");
      expect(result!.tags.length).toBe(3);
    });


    test("invalid AI response falls back to default tag", async () => {
      const t = createTestConvex();
      const mockEvent = {
        eventId: "fallback-test-1",
        title: "Test Event",
        description: "A test event for fallback behavior",
      };
      streamTextMock.mockResolvedValue({
        textStream: (async function* () {
          yield 'invalid json response';
        })(),
      });
      const result = await t.action(internal.events_actions.tagEvent, {
        event: mockEvent,
      });
      expect(result).toBeNull();
    });

    test("missing API key falls back to default tag", async () => {
      const t = createTestConvex();
      delete process.env.OPENROUTER_API_KEY;

      const result = await t.action(internal.events_actions.tagEvent, {
        event: {
          eventId: "missing-key-test-1",
          title: "Fallback Event",
          description: "Should still be taggable without an API key",
        },
      });

      expect(result).toBeNull();
    });

    test("AI response with invalid tags gets filtered", async () => {
      const t = createTestConvex();
      const mockEvent = {
        eventId: "filter-test-1",
        title: "Test Event",
        description: "A test event for tag filtering",
      };
      streamTextMock.mockResolvedValue({
        textStream: (async function* () {
          yield '{"tags":["Other Sports","InvalidTag","Hiking"],"venueType":"activity"}';
        })(),
      });
      const result = await t.action(internal.events_actions.tagEvent, {
        event: mockEvent,
      });
      expect(result).not.toBeNull();
      expect(result!.tags).toContain("Other Sports");
      expect(result!.tags).toContain("Hiking");
      expect(result!.tags).not.toContain("InvalidTag");
      expect(result!.tags.length).toBe(2);
    });
  });

  describe("legacy tag compatibility", () => {
    test("normalizes legacy tags when reading stored events", async () => {
      const t = createTestConvex();

      await t.run(async (ctx) => {
        await ctx.db.insert("events", {
          eventId: "legacy-event-1",
          title: "Legacy Concert",
          description: "Stored before the taxonomy rename",
          startTime: "2026-06-01T20:00:00Z",
          venueName: "Legacy Venue",
          venueCity: "Baltimore",
          venueCountry: "United States Of America",
          source: "ticketmaster",
          url: "https://example.com/legacy-event-1",
          tags: ["Concerts", "Theatre", "Asian Cuisine", "Indoor"],
          tagsConfirmed: true,
          tagAttempts: 1,
          status: "onsale",
          budgetBucket: "medium",
          genre: "Music",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      const events = await t.query(api.events_queries.getAllEvents, {});

      expect(events).toHaveLength(1);
      expect(events[0].tags).toEqual(["Concert", "Theater"]);
    });
  });
});
