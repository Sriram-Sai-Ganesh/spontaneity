import { describe, test, expect } from "vitest";
import { NormalizedEventSchema } from "./event_types";
import {
  venueLocationFields,
  venueLocationEnrichmentFields,
  venueLocationAllFields,
  planningLocationField,
  planningLocationUpdateField,
} from "./location_types";

const baseEvent = {
  eventId: "test-1",
  title: "Test Event",
  description: null,
  startTime: null,
  venueName: "Arena",
  venueCity: "Baltimore",
  venueCountry: "US",
  source: "ticketmaster",
  url: "https://example.com",
  image: null,
  status: null,
  budgetBucket: null,
  genre: null,
};

describe("location_types contract", () => {
  describe("venue location field sets", () => {
    test("venueLocationFields contains only core fields", () => {
      expect(Object.keys(venueLocationFields)).toEqual([
        "venueName",
        "venueCity",
        "venueNeighborhood",
        "venueCountry",
      ]);
    });

    test("venueLocationEnrichmentFields contains only enrichment fields", () => {
      expect(Object.keys(venueLocationEnrichmentFields)).toEqual([
        "latitude",
        "longitude",
        "formattedAddress",
        "googlePlaceId",
      ]);
    });

    test("venueLocationAllFields contains all 8 fields", () => {
      const fields = Object.keys(venueLocationAllFields);
      expect(fields).toContain("venueName");
      expect(fields).toContain("venueCity");
      expect(fields).toContain("venueNeighborhood");
      expect(fields).toContain("venueCountry");
      expect(fields).toContain("latitude");
      expect(fields).toContain("longitude");
      expect(fields).toContain("formattedAddress");
      expect(fields).toContain("googlePlaceId");
      expect(fields).toHaveLength(8);
    });
  });

  describe("planning location validators", () => {
    test("planningLocationField has planningLocation key", () => {
      expect(Object.keys(planningLocationField)).toEqual(["planningLocation"]);
    });

    test("planningLocationUpdateField has planningLocation key", () => {
      expect(Object.keys(planningLocationUpdateField)).toEqual([
        "planningLocation",
      ]);
    });
  });

  describe("NormalizedEventSchema with venue location fields", () => {
    test("existing event without enrichment fields passes validation", () => {
      const result = NormalizedEventSchema.safeParse(baseEvent);
      expect(result.success).toBe(true);
    });

    test("event with enrichment fields passes validation", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        latitude: 39.2904,
        longitude: -76.6122,
        venueNeighborhood: "Mount Vernon",
        formattedAddress: "123 Main St, Baltimore, MD 21201",
        googlePlaceId: "ChIJt4P01q4DyIkR2oHH6KgHjWY",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.latitude).toBe(39.2904);
        expect(result.data.longitude).toBe(-76.6122);
        expect(result.data.formattedAddress).toBe(
          "123 Main St, Baltimore, MD 21201",
        );
        expect(result.data.venueNeighborhood).toBe("Mount Vernon");
        expect(result.data.googlePlaceId).toBe("ChIJt4P01q4DyIkR2oHH6KgHjWY");
      }
    });

    test("event with null enrichment fields passes validation", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        venueName: null,
        venueCity: null,
        venueNeighborhood: null,
        venueCountry: null,
        latitude: null,
        longitude: null,
        formattedAddress: null,
        googlePlaceId: null,
      });
      expect(result.success).toBe(true);
    });

    test("latitude must be a number when present", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        latitude: "not-a-number",
      });
      expect(result.success).toBe(false);
    });

    test("longitude must be a number when present", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        longitude: "not-a-number",
      });
      expect(result.success).toBe(false);
    });

    test("formattedAddress must be a string when present", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        formattedAddress: 12345,
      });
      expect(result.success).toBe(false);
    });

    test("venueNeighborhood must be a string when present", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        venueNeighborhood: 12345,
      });
      expect(result.success).toBe(false);
    });

    test("googlePlaceId must be a string when present", () => {
      const result = NormalizedEventSchema.safeParse({
        ...baseEvent,
        googlePlaceId: 12345,
      });
      expect(result.success).toBe(false);
    });
  });
});
