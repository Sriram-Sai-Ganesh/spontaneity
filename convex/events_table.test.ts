import { describe, test, expect, vi } from "vitest";
import { NormalizedEventSchema, EventTagSchema, type NormalizedEvent } from "./event_types";

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
    tags: [],
    genre: null,
    ...overrides,
  };
}


describe("events table operations", () => {
  describe("event storage validation", () => {
    test("valid event can be stored", () => {
      const event = makeEvent();
      const result = NormalizedEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    test("event with all optional fields can be stored", () => {
      const event: NormalizedEvent = {
        eventId: "evt-2",
        title: "Minimal Event",
        description: null,
        startTime: null,
        venueName: null,
        venueCity: null,
        venueCountry: null,
        source: "test",
        url: "https://example.com/2",
        image: null,
        status: null,
        budgetBucket: null,
        genre: null,
      };
      const result = NormalizedEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    test("event with budget bucket can be stored", () => {
      const event = makeEvent({ budgetBucket: "low" });
      const result = NormalizedEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    test("event with status can be stored", () => {
      const event = makeEvent({ status: "onsale" });
      const result = NormalizedEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    test("event with tags can be stored", () => {
      console.log("DEBUG EventTagSchema options", EventTagSchema.options);
      const event = makeEvent({ tags: ["Concert", "Hiking"] });
      const result = NormalizedEventSchema.safeParse(event);
      if (!result.success) {
        console.log("DEBUG parse issues", result.error.issues);
      }
      expect(result.success).toBe(true);
      expect(result.data?.tags).toEqual(["Concert", "Hiking"]);
    });

    test("event tags can be updated", () => {
      const event = makeEvent({ tags: ["Movie", "Theater"] });
      const validated = NormalizedEventSchema.safeParse(event);
      expect(validated.success).toBe(true);

      const updatedEvent = { ...event, tags: ["Hiking", "Cycling"] };
      const updatedValid = NormalizedEventSchema.safeParse(updatedEvent);
      expect(updatedValid.success).toBe(true);
      expect(updatedValid.data?.tags).toEqual(["Hiking", "Cycling"]);
    });

    test("event with invalid tag is rejected", () => {
      const invalidEvent = {
        ...makeEvent(),
        tags: ["InvalidTag", "Soccer"],
      } as unknown;
      const result = NormalizedEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });
});