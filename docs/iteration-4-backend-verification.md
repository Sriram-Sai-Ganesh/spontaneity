# Iteration 4 Backend Verification

This document tracks reusable regression coverage for the key Iteration 4 backend recommendation changes: open-ended ingestion (Google Places as an evergreen venue provider) and maps enrichment (location coordinates, addresses, and place IDs across the pipeline).

## Automated Coverage

| Flow | Coverage |
| --- | --- |
| Google Places field mapping | `convex/google_places.test.ts` verifies all enrichment fields (latitude, longitude, formattedAddress, googlePlaceId) map correctly from the API response, and handles missing and partial location objects. |
| Location type validators | `convex/location_types.test.ts` verifies venue location enrichment field schema compliance with the `NormalizedEvent` Zod schema, including present, null, and missing enrichment values. |
| Enrichment field merging in dedup | `convex/event_dedup.test.ts` verifies latitude, longitude, formattedAddress, and googlePlaceId are preserved from the richer event during merging and fall back to the other event when the preferred source has none. |
| Google Places venue-name dedup | `convex/event_dedup.test.ts` verifies two Google Places events with the same venue name are deduplicated without requiring a startTime match, and that different venue names are kept separate. |
| Evergreen event pipeline integration | `convex/availability_action.test.ts` verifies Google Places events with null startTime bypass busy-block filtering and appear in the final ranked results with enrichment fields intact. |
| Provider error isolation (Google Places) | `convex/availability_action.test.ts` verifies a Google Places API failure does not crash the pipeline and Ticketmaster results are still returned. |
| Distance restriction filtering | `convex/availability_action.test.ts` verifies events with coordinates beyond maxDistanceMiles are excluded while nearby events are kept. |
| Distance scoring | `convex/ranking.test.ts` verifies haversine distance calculation, closer-event ranking, neutral score for missing coordinates, and custom event boost override. |
| Ticketmaster lat/lng extraction | `convex/ticketmaster.test.ts` verifies latitude and longitude are extracted from Ticketmaster venue location data. |
| Yelp lat/lng mapping | `convex/yelp.map.test.ts` verifies latitude and longitude are mapped from Yelp event coordinate data. |

Run the targeted backend regression checks with:

```bash
pnpm vitest run --project convex \
  convex/google_places.test.ts \
  convex/location_types.test.ts \
  convex/event_dedup.test.ts \
  convex/availability_action.test.ts \
  convex/ranking.test.ts \
  convex/ticketmaster.test.ts \
  convex/yelp.map.test.ts
```

## Manual QA Checklist

### 1. Google Places ingestion

1. Ensure `GOOGLE_PLACES_API_KEY` is set in the Convex dashboard.
2. Open a group chat with a planning location set (e.g. Baltimore).
3. Click `Find Events` or ask the assistant to suggest activities.
4. Confirm the results include evergreen venues (restaurants, gyms, coffee shops) alongside timed Ticketmaster and Yelp events.
5. Confirm evergreen events display with no date/time but show a venue address and a Google Maps link.

### 2. Distance filtering

1. Open user settings and set a `maxDistanceMiles` hard restriction (e.g. 10 miles).
2. Enable distance ranking on a group chat.
3. Click `Find Events`.
4. Confirm far-away events are excluded and nearby events are kept.

### 3. Cross-source deduplication with enrichment

1. Trigger `Find Events` in a city where multiple providers are likely to return overlapping venues.
2. Confirm no duplicate entries appear in the results.
3. If a merged result appears, confirm it shows source links from both providers and retains the richer description and location data.

## Known Gaps

- No end-to-end test with real API keys for the full three-provider flow (requires live credentials).
- No test for `useDistanceRanking` toggle behavior in isolation (tested implicitly via the distance restriction integration test).
- Frontend display of `formattedAddress` on event cards is not covered by frontend component tests.
- No test for Google Places + Yelp cross-source deduplication at the integration level (covered at the unit level in `event_dedup.test.ts`).
