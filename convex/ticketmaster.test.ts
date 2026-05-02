import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { searchEvents, searchNormalizedEvents, mapToNormalizedEvent } from "./ticketmaster";

const apiKey = process.env.TICKETMASTER_API_KEY;

describe("ticketmaster", () => {
  describe("mapToNormalizedEvent", () => {
    const raw = {
      id: "abc123",
      name: "Test Concert",
      url: "https://ticketmaster.com/event/abc123",
      description: "A great show",
      dates: {
        start: { dateTime: "2026-06-15T20:00:00Z", localDate: "2026-06-15", localTime: "20:00:00" },
      },
      _embedded: {
        venues: [{
          name: "CFG Bank Arena",
          city: { name: "Baltimore" },
          country: { name: "United States Of America" },
          location: { latitude: "39.2904", longitude: "-76.6122" },
        }],
      },
      images: [
        { url: "https://example.com/small.jpg", ratio: "16_9", width: 640, height: 360 },
        { url: "https://example.com/large.jpg", ratio: "16_9", width: 1920, height: 1080 },
        { url: "https://example.com/square.jpg", ratio: "3_2", width: 305, height: 203 },
      ],
    };

    test("maps all required fields", () => {
      const event = mapToNormalizedEvent(raw);
      expect(event.eventId).toBe("abc123");
      expect(event.title).toBe("Test Concert");
      expect(event.description).toBe("A great show");
      expect(event.startTime).toBe("2026-06-15T20:00:00Z");
      expect(event.venueName).toBe("CFG Bank Arena");
      expect(event.venueCity).toBe("Baltimore");
      expect(event.venueCountry).toBe("United States Of America");
      expect(event.source).toBe("ticketmaster");
      expect(event.url).toBe("https://ticketmaster.com/event/abc123");
      expect(event.image).toBe("https://example.com/large.jpg");
      expect(event.budgetBucket).toBeNull();
      expect(event.latitude).toBe(39.2904);
      expect(event.longitude).toBe(-76.6122);
    });

    test("prefers dateTime over localDate+localTime for startTime", () => {
      const event = mapToNormalizedEvent(raw);
      expect(event.startTime).toBe("2026-06-15T20:00:00Z");
    });

    test("falls back to localDate+localTime when no dateTime", () => {
      const noDateTime = {
        ...raw,
        dates: { start: { localDate: "2026-06-15", localTime: "20:00:00" } },
      };
      expect(mapToNormalizedEvent(noDateTime).startTime).toBe("2026-06-15T20:00:00");
    });

    test("falls back to info then pleaseNote for description", () => {
      const withInfo = { ...raw, description: undefined, info: "Info text" };
      expect(mapToNormalizedEvent(withInfo).description).toBe("Info text");

      const withNote = { ...raw, description: undefined, info: undefined, pleaseNote: "Note text" };
      expect(mapToNormalizedEvent(withNote).description).toBe("Note text");
    });

    test("picks widest 16_9 image", () => {
      const event = mapToNormalizedEvent(raw);
      expect(event.image).toBe("https://example.com/large.jpg");
    });

    test("maps known status codes", () => {
      for (const code of ["onsale", "offsale", "cancelled", "postponed", "rescheduled"] as const) {
        const event = mapToNormalizedEvent({ ...raw, dates: { ...raw.dates, status: { code } } });
        expect(event.status).toBe(code);
      }
    });

    test("sets status to null for unknown or missing status", () => {
      const noStatus = mapToNormalizedEvent(raw);
      expect(noStatus.status).toBeNull();

      const unknown = mapToNormalizedEvent({ ...raw, dates: { ...raw.dates, status: { code: "unknown" } } });
      expect(unknown.status).toBeNull();
    });

    test("handles missing optional fields safely", () => {
      const minimal = { id: "x", name: "Minimal", url: "https://ticketmaster.com" };
      const event = mapToNormalizedEvent(minimal);
      expect(event.eventId).toBe("x");
      expect(event.description).toBeNull();
      expect(event.startTime).toBeNull();
      expect(event.venueName).toBeNull();
      expect(event.venueCity).toBeNull();
      expect(event.venueCountry).toBeNull();
      expect(event.image).toBeNull();
      expect(event.budgetBucket).toBeNull();
      expect(event.latitude).toBeUndefined();
      expect(event.longitude).toBeUndefined();
    });

    test("maps Ticketmaster price ranges into budget buckets", () => {
      expect(
        mapToNormalizedEvent({
          ...raw,
          priceRanges: [{ min: 25 }],
        }).budgetBucket,
      ).toBe("low");

      expect(
        mapToNormalizedEvent({
          ...raw,
          priceRanges: [{ min: 55 }],
        }).budgetBucket,
      ).toBe("medium");

      expect(
        mapToNormalizedEvent({
          ...raw,
          priceRanges: [{ min: 120 }],
        }).budgetBucket,
      ).toBe("high");
    });

    test("uses the lowest available Ticketmaster price range", () => {
      expect(
        mapToNormalizedEvent({
          ...raw,
          priceRanges: [{ min: 120 }, { min: 20 }, { min: 65 }],
        }).budgetBucket,
      ).toBe("low");
    });
  });

  describe.skipIf(!apiKey)("smoke (requires TICKETMASTER_API_KEY)", () => {
    test("returns events for a valid city", async () => {
      const events = await searchEvents(apiKey!, { city: "Baltimore", size: 3 });

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(typeof event.id).toBe("string");
        expect(typeof event.name).toBe("string");
        expect(typeof event.url).toBe("string");
        expect(event.source).toBe("ticketmaster");
        expect(typeof event.date === "string" || event.date === null).toBe(true);
        expect(typeof event.time === "string" || event.time === null).toBe(true);
      }
    });

    test("returns empty array when no events match", async () => {
      const events = await searchEvents(apiKey!, {
        keyword: "xyzzy_no_match_abc123",
        size: 1,
      });
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });

    test("throws on invalid API key", async () => {
      await expect(
        searchEvents("bad-key", { city: "Baltimore", size: 1 }),
      ).rejects.toThrow("Invalid Ticketmaster API key");
    });

    test("searchNormalizedEvents returns valid NormalizedEvent shape", async () => {
      const events = await searchNormalizedEvents(apiKey!, { city: "Baltimore", size: 3 });

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(typeof event.eventId).toBe("string");
        expect(typeof event.title).toBe("string");
        expect(typeof event.url).toBe("string");
        expect(event.source).toBe("ticketmaster");
        expect(typeof event.description === "string" || event.description === null).toBe(true);
        expect(typeof event.startTime === "string" || event.startTime === null).toBe(true);
        expect(typeof event.venueName === "string" || event.venueName === null).toBe(true);
        expect(typeof event.venueCity === "string" || event.venueCity === null).toBe(true);
        expect(typeof event.venueCountry === "string" || event.venueCountry === null).toBe(true);
        expect(typeof event.image === "string" || event.image === null).toBe(true);
        expect(
          event.budgetBucket === "low"
            || event.budgetBucket === "medium"
            || event.budgetBucket === "high"
            || event.budgetBucket === null,
        ).toBe(true);
      }
    });
  });

  describe("contract (mocked HTTP)", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => { originalFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = originalFetch; });

    function mockFetch(body: unknown, status = 200) {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    test("returns NormalizedEvents for a valid response", async () => {
      mockFetch({
        _embedded: {
          events: [{
            id: "evt-1",
            name: "Test Concert",
            url: "https://ticketmaster.com/event/1",
            dates: { start: { dateTime: "2026-06-01T20:00:00Z" } },
            _embedded: {
              venues: [{ name: "Arena", city: { name: "Baltimore" }, country: { name: "United States Of America" } }],
            },
          }],
        },
      });

      const events = await searchNormalizedEvents("test-key", { city: "Baltimore" });
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("evt-1");
      expect(events[0].title).toBe("Test Concert");
      expect(events[0].source).toBe("ticketmaster");
      expect(events[0].venueCity).toBe("Baltimore");
    });

    test("returns empty array when response has no _embedded", async () => {
      mockFetch({});
      const events = await searchNormalizedEvents("test-key", {});
      expect(events).toEqual([]);
    });

    test("throws on HTTP 401 (invalid API key)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
      await expect(searchNormalizedEvents("bad-key", {})).rejects.toThrow("Invalid Ticketmaster API key");
    });

    test("throws on HTTP 429 (rate limit)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
      await expect(searchNormalizedEvents("test-key", {})).rejects.toThrow("rate limit");
    });

    test("throws on other HTTP errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 }));
      await expect(searchNormalizedEvents("test-key", {})).rejects.toThrow("HTTP 400");
    });

    test("sends apikey, city, and size as query parameters", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
      );
      globalThis.fetch = fetchMock as typeof globalThis.fetch;

      await searchNormalizedEvents("my-key", { city: "Baltimore", size: 5 });

      const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
      expect(calledUrl.searchParams.get("apikey")).toBe("my-key");
      expect(calledUrl.searchParams.get("city")).toBe("Baltimore");
      expect(calledUrl.searchParams.get("size")).toBe("5");
    });
  });
});
