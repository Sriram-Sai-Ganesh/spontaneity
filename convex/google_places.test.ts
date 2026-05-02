import { afterEach, describe, expect, test, vi } from "vitest";
import {
  extractCuisineGenre,
  lookupVenueNeighborhood,
  mapPriceLevelToBudget,
  mapToNormalizedEvent,
  searchNormalizedEvents,
} from "./google_places";

describe("google_places mapToNormalizedEvent", () => {
  const place = {
    id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    displayName: { text: "Sydney Opera House" },
    formattedAddress: "Bennelong Point, Sydney NSW 2000, Australia",
    addressComponents: [
      { longText: "Bennelong", types: ["neighborhood"] },
      { longText: "Sydney", types: ["locality"] },
      { longText: "Australia", types: ["country"] },
    ],
    types: ["performing_arts_theater"],
    googleMapsUri: "https://maps.google.com/?cid=123",
    location: { latitude: -33.8568, longitude: 151.2153 },
  };

  test("maps all enrichment fields", () => {
    const event = mapToNormalizedEvent(place);
    expect(event.eventId).toBe("gp_ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(event.title).toBe("Sydney Opera House");
    expect(event.venueName).toBe("Sydney Opera House");
    expect(event.venueCity).toBe("Sydney");
    expect(event.venueNeighborhood).toBe("Bennelong");
    expect(event.venueCountry).toBe("Australia");
    expect(event.latitude).toBe(-33.8568);
    expect(event.longitude).toBe(151.2153);
    expect(event.formattedAddress).toBe("Bennelong Point, Sydney NSW 2000, Australia");
    expect(event.googlePlaceId).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(event.source).toBe("google_places");
    expect(event.url).toBe("https://maps.google.com/?cid=123");
    expect(event.budgetBucket).toBeNull();
    expect(event.startTime).toBeNull();
    expect(event.image).toBeNull();
  });

  test("enrichment fields are undefined when source fields are absent", () => {
    const minimal = {
      id: "place_abc",
      displayName: { text: "Minimal Place" },
    };
    const event = mapToNormalizedEvent(minimal);
    expect(event.eventId).toBe("gp_place_abc");
    expect(event.title).toBe("Minimal Place");
    expect(event.latitude).toBeUndefined();
    expect(event.longitude).toBeUndefined();
    expect(event.formattedAddress).toBeUndefined();
    expect(event.googlePlaceId).toBe("place_abc");
    expect(event.venueCity).toBeNull();
    expect(event.venueNeighborhood).toBeNull();
    expect(event.venueCountry).toBeNull();
    expect(event.description).toBeNull();
    expect(event.budgetBucket).toBeNull();
    expect(event.url).toBe("");
  });

  test("handles partial location object", () => {
    const partial = {
      ...place,
      location: { latitude: 40.7128 },
    };
    const event = mapToNormalizedEvent(partial);
    expect(event.latitude).toBe(40.7128);
    expect(event.longitude).toBeUndefined();
  });

  test("maps regular opening hours when provided", () => {
    const event = mapToNormalizedEvent({
      ...place,
      regularOpeningHours: {
        periods: [
          {
            open: { day: 1, hour: 11, minute: 30 },
            close: { day: 1, hour: 22, minute: 0 },
          },
          {
            open: { day: 5, hour: 9, minute: 0 },
            close: { day: 5, hour: 23, minute: 30 },
          },
        ],
      },
    });

    expect(event.openHours).toEqual([
      { dayOfWeek: 1, openTime: "11:30", closeTime: "22:00" },
      { dayOfWeek: 5, openTime: "09:00", closeTime: "23:30" },
    ]);
  });
});

describe("mapPriceLevelToBudget", () => {
  test("maps price levels to budget buckets", () => {
    expect(mapPriceLevelToBudget("PRICE_LEVEL_FREE")).toBe("low");
    expect(mapPriceLevelToBudget("PRICE_LEVEL_INEXPENSIVE")).toBe("low");
    expect(mapPriceLevelToBudget("PRICE_LEVEL_MODERATE")).toBe("medium");
    expect(mapPriceLevelToBudget("PRICE_LEVEL_EXPENSIVE")).toBe("high");
    expect(mapPriceLevelToBudget("PRICE_LEVEL_VERY_EXPENSIVE")).toBe("high");
    expect(mapPriceLevelToBudget(undefined)).toBeNull();
    expect(mapPriceLevelToBudget(null)).toBeNull();
  });
});

describe("extractCuisineGenre", () => {
  test("maps known types to cuisine", () => {
    expect(extractCuisineGenre(["italian_restaurant"])).toBe("Italian");
    expect(extractCuisineGenre(["coffee_shop", "bakery"])).toBe("Coffee");
  });

  test("returns null for unknown types", () => {
    expect(extractCuisineGenre(["unknown_type"])).toBeNull();
    expect(extractCuisineGenre(undefined)).toBeNull();
  });
});

describe("lookupVenueNeighborhood", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("looks up a venue neighborhood from Google Places address components", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place_123",
              addressComponents: [
                { longText: "Manhattan", types: ["sublocality_level_1"] },
                { longText: "New York", types: ["locality"] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const neighborhood = await lookupVenueNeighborhood("test-key", {
      venueName: "Lyric Theatre",
      venueCity: "New York",
      latitude: 40.756,
      longitude: -73.986,
    });

    expect(neighborhood).toBe("Manhattan");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "X-Goog-Api-Key": "test-key",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      textQuery: "Lyric Theatre in New York",
      maxResultCount: 1,
      locationBias: {
        circle: {
          center: { latitude: 40.756, longitude: -73.986 },
          radius: 500,
        },
      },
    });
  });

  test("prefers broad sublocality over a narrower neighborhood", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place_123",
              addressComponents: [
                { longText: "Theater District", types: ["neighborhood"] },
                { longText: "Manhattan", types: ["sublocality_level_1"] },
                { longText: "New York", types: ["locality"] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const neighborhood = await lookupVenueNeighborhood("test-key", {
      venueName: "Lyric Theatre",
      venueCity: "New York",
    });

    expect(neighborhood).toBe("Manhattan");
  });
});

describe("searchNormalizedEvents", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("requests regular opening hours and maps them onto results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place_hours",
              displayName: { text: "Hours Cafe" },
              types: ["cafe"],
              googleMapsUri: "https://maps.google.com/?cid=456",
              regularOpeningHours: {
                periods: [
                  {
                    open: { day: 2, hour: 8, minute: 0 },
                    close: { day: 2, hour: 18, minute: 15 },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const events = await searchNormalizedEvents("test-key", {
      city: "Los Angeles",
      keyword: "coffee",
      size: 5,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.openHours).toEqual([
      { dayOfWeek: 2, openTime: "08:00", closeTime: "18:15" },
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-Goog-Api-Key": "test-key",
    });
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain(
      "places.regularOpeningHours",
    );
  });
});
