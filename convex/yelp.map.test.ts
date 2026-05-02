import { describe, test, expect } from "vitest";
import { mapToNormalizedEvent } from "./yelp";

describe("yelp mapToNormalizedEvent", () => {
  const raw = {
    id: "austin-rsvps-closed-yelp-austins-backyard-blowout",
    name: "Yelp Austin's Backyard Blowout",
    description: "An outdoor block party featuring local artists and food vendors.",
    event_site_url: "https://www.yelp.com/events/austin-rsvps-closed",
    image_url: "https://s3-media3.fl.yelpcdn.com/ephoto/test/o.jpg",
    time_start: "2026-06-15T14:00:00-05:00",
    time_end: "2026-06-15T18:00:00-05:00",
    category: "music",
    cost: 15.0,
    cost_max: 25.0,
    is_free: false,
    is_canceled: false,
    attending_count: 120,
    interested_count: 1890,
    latitude: 30.284,
    longitude: -97.717,
    location: {
      address1: "2 Manor St",
      address2: "",
      address3: "",
      city: "Austin",
      zip_code: "78732",
      country: "US",
      state: "TX",
      display_address: ["2 Manor St", "Austin, TX 78732"],
      cross_streets: "",
    },
    business_id: "the-vortex-austin-2",
  };

  test("maps category object to genre alias", () => {
    const withObjCat = {
      ...raw,
      category: { alias: "food-and-drink", title: "Food & Drink" },
    };
    expect(mapToNormalizedEvent(withObjCat).genre).toBe("food-and-drink");
  });

  test("uses yelp events URL when event_site_url missing", () => {
    const noUrl = { ...raw, event_site_url: null, tickets_url: null };
    expect(mapToNormalizedEvent(noUrl).url).toContain("yelp.com/events/");
    expect(mapToNormalizedEvent(noUrl).url).toContain(encodeURIComponent(raw.id));
  });

  test("maps all required fields", () => {
    const event = mapToNormalizedEvent(raw);
    expect(event.eventId).toBe("austin-rsvps-closed-yelp-austins-backyard-blowout");
    expect(event.title).toBe("Yelp Austin's Backyard Blowout");
    expect(event.description).toBe("An outdoor block party featuring local artists and food vendors.");
    expect(event.startTime).toBe("2026-06-15T14:00:00-05:00");
    expect(event.venueName).toBe("2 Manor St, Austin, TX 78732");
    expect(event.venueCity).toBe("Austin");
    expect(event.venueCountry).toBe("US");
    expect(event.source).toBe("yelp");
    expect(event.url).toBe("https://www.yelp.com/events/austin-rsvps-closed");
    expect(event.image).toBe("https://s3-media3.fl.yelpcdn.com/ephoto/test/o.jpg");
    expect(event.genre).toBe("music");
    expect(event.latitude).toBe(30.284);
    expect(event.longitude).toBe(-97.717);
  });

  test("sets budgetBucket from cost field", () => {
    expect(mapToNormalizedEvent(raw).budgetBucket).toBe("low");

    expect(
      mapToNormalizedEvent({ ...raw, cost: 50 }).budgetBucket,
    ).toBe("medium");

    expect(
      mapToNormalizedEvent({ ...raw, cost: 100 }).budgetBucket,
    ).toBe("high");
  });

  test("free events get low budget bucket", () => {
    const free = { ...raw, is_free: true, cost: null, cost_max: null };
    expect(mapToNormalizedEvent(free).budgetBucket).toBe("low");
  });

  test("uses cost_max when cost is absent", () => {
    const noCost = { ...raw, cost: null, cost_max: 50 };
    expect(mapToNormalizedEvent(noCost).budgetBucket).toBe("medium");
  });

  test("null budget when no pricing info", () => {
    const noPricing = { ...raw, is_free: false, cost: null, cost_max: null };
    expect(mapToNormalizedEvent(noPricing).budgetBucket).toBeNull();
  });

  test("maps cancelled status from is_canceled", () => {
    const cancelled = { ...raw, is_canceled: true };
    expect(mapToNormalizedEvent(cancelled).status).toBe("cancelled");
  });

  test("non-cancelled event has null status", () => {
    expect(mapToNormalizedEvent(raw).status).toBeNull();
  });

  test("handles missing optional fields safely", () => {
    const minimal = {
      id: "x",
      name: "Minimal Event",
      event_site_url: "https://www.yelp.com/events/x",
    };
    const event = mapToNormalizedEvent(minimal);
    expect(event.eventId).toBe("x");
    expect(event.title).toBe("Minimal Event");
    expect(event.description).toBeNull();
    expect(event.startTime).toBeNull();
    expect(event.venueName).toBeNull();
    expect(event.venueCity).toBeNull();
    expect(event.venueCountry).toBeNull();
    expect(event.image).toBeNull();
    expect(event.budgetBucket).toBeNull();
    expect(event.genre).toBeNull();
    expect(event.source).toBe("yelp");
    expect(event.latitude).toBeUndefined();
    expect(event.longitude).toBeUndefined();
  });

  test("falls back to business_id for venueName when no display_address", () => {
    const noAddr = {
      ...raw,
      location: { city: "Austin", country: "US" },
      business_id: "cool-bar-austin",
    };
    expect(mapToNormalizedEvent(noAddr).venueName).toBe("cool-bar-austin");
  });

  test("tags are always an empty array", () => {
    expect(mapToNormalizedEvent(raw).tags).toEqual([]);
  });
});
