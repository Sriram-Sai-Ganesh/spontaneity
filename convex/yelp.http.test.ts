import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { searchNormalizedEvents } from "./yelp";

const apiKey = process.env.YELP_API_KEY;

describe("yelp HTTP adapter", () => {
  describe("contract (mocked HTTP)", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

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
        events: [
          {
            id: "evt-yelp-1",
            name: "Baltimore Food Festival",
            event_site_url: "https://www.yelp.com/events/baltimore-food",
            time_start: "2026-06-01T12:00:00-04:00",
            category: "food-and-drink",
            is_free: true,
            is_canceled: false,
            location: {
              city: "Baltimore",
              country: "US",
              display_address: ["123 Main St", "Baltimore, MD 21201"],
            },
          },
        ],
        total: 1,
      });

      const events = await searchNormalizedEvents("test-key", { city: "Baltimore" });
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("evt-yelp-1");
      expect(events[0].title).toBe("Baltimore Food Festival");
      expect(events[0].source).toBe("yelp");
      expect(events[0].venueCity).toBe("Baltimore");
      expect(events[0].budgetBucket).toBe("low");
    });

    test("returns empty array when response has no events", async () => {
      mockFetch({ events: [], total: 0 });
      const events = await searchNormalizedEvents("test-key", {});
      expect(events).toEqual([]);
    });

    test("returns empty array when events key is missing", async () => {
      mockFetch({ total: 0 });
      const events = await searchNormalizedEvents("test-key", {});
      expect(events).toEqual([]);
    });

    test("throws on HTTP 401 (invalid API key)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      );
      await expect(
        searchNormalizedEvents("bad-key", {}),
      ).rejects.toThrow("Invalid Yelp API key");
    });

    test("surfaces Yelp JSON error body (e.g. NOT_IN_DEVELOPER_BETA)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "NOT_IN_DEVELOPER_BETA",
              description: "Join developer beta on Manage App page.",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );
      await expect(searchNormalizedEvents("test-key", {})).rejects.toThrow(
        "NOT_IN_DEVELOPER_BETA",
      );
    });

    test("throws on HTTP 429 (rate limit)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Too Many Requests", { status: 429 }),
      );
      await expect(
        searchNormalizedEvents("test-key", {}),
      ).rejects.toThrow("rate limit");
    });

    test("throws on other HTTP errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Internal Server Error", { status: 500 }),
      );
      await expect(
        searchNormalizedEvents("test-key", {}),
      ).rejects.toThrow("HTTP 500");
    });

    test("sends Authorization header and location as query parameters", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      globalThis.fetch = fetchMock as typeof globalThis.fetch;

      await searchNormalizedEvents("my-yelp-key", { city: "Baltimore", size: 10 });

      const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
      expect(calledUrl.searchParams.get("location")).toBe("Baltimore");
      expect(calledUrl.searchParams.get("limit")).toBe("20");

      const calledOptions = fetchMock.mock.calls[0][1] as RequestInit;
      expect(calledOptions.headers).toEqual({
        Authorization: "Bearer my-yelp-key",
      });
    });

    test("converts start_date to Unix timestamp (no end_date param)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      globalThis.fetch = fetchMock as typeof globalThis.fetch;

      await searchNormalizedEvents("test-key", {
        startDateTime: "2026-06-01T00:00:00Z",
        endDateTime: "2026-06-30T23:59:59Z",
      });

      const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
      const startDate = Number(calledUrl.searchParams.get("start_date"));

      expect(startDate).toBe(Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000));
      expect(calledUrl.searchParams.get("end_date")).toBeNull();
    });

    test("filters by event start time, not Yelp end_date semantics", async () => {
      mockFetch({
        events: [
          {
            id: "in-window",
            name: "Friday Show",
            event_site_url: "https://www.yelp.com/e/1",
            time_start: "2026-06-15T20:00:00Z",
            time_end: "2026-06-30T23:00:00Z",
            is_canceled: false,
          },
          {
            id: "out-window",
            name: "Later Show",
            event_site_url: "https://www.yelp.com/e/2",
            time_start: "2026-07-15T20:00:00Z",
            time_end: "2026-07-15T22:00:00Z",
            is_canceled: false,
          },
        ],
        total: 2,
      });

      const events = await searchNormalizedEvents("test-key", {
        startDateTime: "2026-06-01T00:00:00Z",
        endDateTime: "2026-06-30T23:59:59Z",
        size: 20,
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe("in-window");
    });

    test("caps limit at 50 (Yelp maximum)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      globalThis.fetch = fetchMock as typeof globalThis.fetch;

      await searchNormalizedEvents("test-key", { size: 100 });

      const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
      expect(calledUrl.searchParams.get("limit")).toBe("50");
    });
  });

  describe.skipIf(!apiKey)("smoke (requires YELP_API_KEY)", () => {
    test("returns events for a valid location", async () => {
      const events = await searchNormalizedEvents(apiKey!, {
        city: "Baltimore",
        size: 3,
      });

      expect(Array.isArray(events)).toBe(true);

      for (const event of events) {
        expect(typeof event.eventId).toBe("string");
        expect(typeof event.title).toBe("string");
        expect(typeof event.url).toBe("string");
        expect(event.source).toBe("yelp");
        expect(
          typeof event.description === "string" || event.description === null,
        ).toBe(true);
        expect(
          typeof event.startTime === "string" || event.startTime === null,
        ).toBe(true);
        expect(
          typeof event.venueName === "string" || event.venueName === null,
        ).toBe(true);
        expect(
          typeof event.venueCity === "string" || event.venueCity === null,
        ).toBe(true);
        expect(
          typeof event.image === "string" || event.image === null,
        ).toBe(true);
        expect(
          event.budgetBucket === "low" ||
            event.budgetBucket === "medium" ||
            event.budgetBucket === "high" ||
            event.budgetBucket === null,
        ).toBe(true);
      }
    });

    test("returns empty array when no events match", async () => {
      const events = await searchNormalizedEvents(apiKey!, {
        city: "xyzzy_no_match_location_abc123",
        size: 1,
      });
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(0);
    });
  });
});
