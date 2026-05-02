import { describe, expect, test } from "vitest";
import { deduplicateCandidateEvents, mergeDuplicateEvents, providerEventScore } from "./event_dedup";
import type { NormalizedEvent } from "./event_types";

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: "evt-1",
    title: "Shared Night Out",
    description: null,
    startTime: "2026-06-01T20:00:00Z",
    venueName: "Shared Hall",
    venueCity: "Baltimore",
    venueCountry: "US",
    source: "ticketmaster",
    url: "https://ticketmaster.com/event/evt-1",
    image: null,
    tags: [],
    status: null,
    budgetBucket: null,
    genre: null,
    ...overrides,
  };
}

describe("event_dedup", () => {
  test("deduplicates cross-source matches and preserves source links", () => {
    const ticketmaster = makeEvent({
      eventId: "tm-dup",
      source: "ticketmaster",
      url: "https://ticketmaster.com/event/tm-dup",
      description: null,
      tags: ["Other Sports"],
    });
    const yelp = makeEvent({
      eventId: "yelp-dup",
      source: "yelp",
      url: "https://www.yelp.com/events/yelp-dup",
      description: "Provider has richer details and imagery.",
      image: "https://images.example.com/yelp-dup.jpg",
      tags: ["Concert"],
    });

    const deduplicated = deduplicateCandidateEvents([ticketmaster, yelp]);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.source).toBe("yelp");
    expect(deduplicated[0]?.eventId).toBe("yelp-dup");
    expect(deduplicated[0]?.tags).toEqual(expect.arrayContaining(["Other Sports", "Concert"]));
    expect(deduplicated[0]?.sourceLinks).toEqual(
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

  test("mergeDuplicateEvents carries forward existing source links", () => {
    const withExistingLinks = makeEvent({
      eventId: "canon-1",
      source: "yelp",
      url: "https://www.yelp.com/events/canon-1",
      sourceLinks: [
        {
          source: "yelp",
          eventId: "canon-1",
          url: "https://www.yelp.com/events/canon-1",
        },
        {
          source: "ticketmaster",
          eventId: "tm-prior",
          url: "https://ticketmaster.com/event/tm-prior",
        },
      ],
    });
    const thirdSource = makeEvent({
      eventId: "other-1",
      source: "another-source",
      url: "https://example.com/events/other-1",
      description: "A much richer description than the prior item.",
      venueCountry: null,
    });

    const merged = mergeDuplicateEvents(withExistingLinks, thirdSource);

    expect(merged.description).toBe("A much richer description than the prior item.");
    expect(merged.venueCountry).toBe("US");
    expect(merged.sourceLinks).toEqual(
      expect.arrayContaining([
        {
          source: "yelp",
          eventId: "canon-1",
          url: "https://www.yelp.com/events/canon-1",
        },
        {
          source: "ticketmaster",
          eventId: "tm-prior",
          url: "https://ticketmaster.com/event/tm-prior",
        },
        {
          source: "another-source",
          eventId: "other-1",
          url: "https://example.com/events/other-1",
        },
      ]),
    );
  });

  test("does not deduplicate custom events with provider events", () => {
    const custom = makeEvent({
      eventId: "custom-1",
      source: "custom",
      url: "",
    });
    const provider = makeEvent({
      eventId: "tm-1",
      source: "ticketmaster",
      url: "https://ticketmaster.com/event/tm-1",
    });

    const deduplicated = deduplicateCandidateEvents([custom, provider]);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.map((event) => event.eventId)).toEqual(["custom-1", "tm-1"]);
  });

  test("mergeDuplicateEvents preserves enrichment fields from the richer event", () => {
    const ticketmaster = makeEvent({
      eventId: "tm-loc",
      source: "ticketmaster",
      url: "https://ticketmaster.com/event/tm-loc",
      latitude: 39.29,
      longitude: -76.61,
    });
    const googlePlaces = makeEvent({
      eventId: "gp-loc",
      source: "google_places",
      url: "https://maps.google.com/?cid=123",
      description: "A richer description that scores higher.",
      latitude: 39.2904,
      longitude: -76.6122,
      formattedAddress: "123 Main St, Baltimore, MD 21201",
      googlePlaceId: "ChIJtest123",
    });

    expect(providerEventScore(googlePlaces)).toBeGreaterThan(
      providerEventScore(ticketmaster),
    );

    const merged = mergeDuplicateEvents(ticketmaster, googlePlaces);

    expect(merged.latitude).toBe(39.2904);
    expect(merged.longitude).toBe(-76.6122);
    expect(merged.formattedAddress).toBe("123 Main St, Baltimore, MD 21201");
    expect(merged.googlePlaceId).toBe("ChIJtest123");
  });

  test("mergeDuplicateEvents falls back to other event's enrichment when preferred has none", () => {
    const higherScore = makeEvent({
      eventId: "rich-1",
      source: "yelp",
      url: "https://www.yelp.com/events/rich-1",
      description: "Very detailed description with lots of info.",
      image: "https://images.example.com/rich.jpg",
      genre: "Dining",
      status: "onsale",
      budgetBucket: "medium",
      tags: ["Night Life"],
    });
    const withCoords = makeEvent({
      eventId: "coords-1",
      source: "google_places",
      url: "https://maps.google.com/?cid=456",
      latitude: 39.33,
      longitude: -76.62,
      formattedAddress: "456 Elm St, Baltimore, MD 21218",
      googlePlaceId: "ChIJcoords456",
    });

    expect(providerEventScore(higherScore)).toBeGreaterThan(
      providerEventScore(withCoords),
    );

    const merged = mergeDuplicateEvents(higherScore, withCoords);

    expect(merged.source).toBe("yelp");
    expect(merged.latitude).toBe(39.33);
    expect(merged.longitude).toBe(-76.62);
    expect(merged.formattedAddress).toBe("456 Elm St, Baltimore, MD 21218");
    expect(merged.googlePlaceId).toBe("ChIJcoords456");
  });

  test("deduplicates two google_places events with same venue name (no time check)", () => {
    const gp1 = makeEvent({
      eventId: "gp_cafe-1",
      source: "google_places",
      url: "https://maps.google.com/?cid=111",
      venueName: "Blue Moon Cafe",
      startTime: null,
    });
    const gp2 = makeEvent({
      eventId: "gp_cafe-2",
      source: "google_places",
      url: "https://maps.google.com/?cid=222",
      venueName: "Blue Moon Cafe",
      startTime: null,
      description: "Richer description to win the merge.",
      image: "https://images.example.com/cafe.jpg",
    });

    const deduplicated = deduplicateCandidateEvents([gp1, gp2]);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        { source: "google_places", eventId: "gp_cafe-1", url: "https://maps.google.com/?cid=111" },
        { source: "google_places", eventId: "gp_cafe-2", url: "https://maps.google.com/?cid=222" },
      ]),
    );
  });

  test("does not deduplicate two google_places events with different venue names", () => {
    const gp1 = makeEvent({
      eventId: "gp_cafe-a",
      source: "google_places",
      url: "https://maps.google.com/?cid=aaa",
      venueName: "Blue Moon Cafe",
      startTime: null,
    });
    const gp2 = makeEvent({
      eventId: "gp_gym-b",
      source: "google_places",
      url: "https://maps.google.com/?cid=bbb",
      venueName: "Iron Gym",
      startTime: null,
    });

    const deduplicated = deduplicateCandidateEvents([gp1, gp2]);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.map((e) => e.eventId)).toEqual(["gp_cafe-a", "gp_gym-b"]);
  });
});
