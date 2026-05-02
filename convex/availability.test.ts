import { describe, test, expect } from "vitest";
import {
  mergeBusyBlocks,
  computeFreeWindows,
  intersectWindows,
  applyPreferences,
  computeSharedWindows,
  filterEventsByAvailability,
  filterEventsByBusyBlocks,
} from "./availability";
import type { NormalizedEvent } from "./event_types";

// ── mergeBusyBlocks ──────────────────────────────────────────────

describe("mergeBusyBlocks", () => {
  test("returns empty for no blocks", () => {
    expect(mergeBusyBlocks([])).toEqual([]);
  });

  test("returns single block unchanged", () => {
    const blocks = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" }];
    expect(mergeBusyBlocks(blocks)).toEqual(blocks);
  });

  test("merges overlapping blocks", () => {
    const blocks = [
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T11:00:00Z" },
      { start: "2026-03-10T10:00:00Z", end: "2026-03-10T12:00:00Z" },
    ];
    expect(mergeBusyBlocks(blocks)).toEqual([
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" },
    ]);
  });

  test("merges adjacent blocks", () => {
    const blocks = [
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
      { start: "2026-03-10T10:00:00Z", end: "2026-03-10T11:00:00Z" },
    ];
    expect(mergeBusyBlocks(blocks)).toEqual([
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T11:00:00Z" },
    ]);
  });

  test("keeps non-overlapping blocks separate", () => {
    const blocks = [
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
      { start: "2026-03-10T14:00:00Z", end: "2026-03-10T15:00:00Z" },
    ];
    expect(mergeBusyBlocks(blocks)).toEqual(blocks);
  });

  test("handles unsorted input", () => {
    const blocks = [
      { start: "2026-03-10T14:00:00Z", end: "2026-03-10T15:00:00Z" },
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
    ];
    expect(mergeBusyBlocks(blocks)).toEqual([
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" },
      { start: "2026-03-10T14:00:00Z", end: "2026-03-10T15:00:00Z" },
    ]);
  });
});

// ── computeFreeWindows ───────────────────────────────────────────

describe("computeFreeWindows", () => {
  const day = {
    start: "2026-03-10T09:00:00Z",
    end: "2026-03-10T17:00:00Z",
  };

  test("entire range is free when no busy blocks", () => {
    expect(computeFreeWindows([], day)).toEqual([day]);
  });

  test("busy block in the middle splits into two free windows", () => {
    const busy = [{ start: "2026-03-10T12:00:00Z", end: "2026-03-10T13:00:00Z" }];
    expect(computeFreeWindows(busy, day)).toEqual([
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" },
      { start: "2026-03-10T13:00:00Z", end: "2026-03-10T17:00:00Z" },
    ]);
  });

  test("busy block covering entire range returns no free windows", () => {
    const busy = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T17:00:00Z" }];
    expect(computeFreeWindows(busy, day)).toEqual([]);
  });

  test("busy block at start leaves free time at end", () => {
    const busy = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" }];
    expect(computeFreeWindows(busy, day)).toEqual([
      { start: "2026-03-10T12:00:00Z", end: "2026-03-10T17:00:00Z" },
    ]);
  });

  test("busy block at end leaves free time at start", () => {
    const busy = [{ start: "2026-03-10T14:00:00Z", end: "2026-03-10T17:00:00Z" }];
    expect(computeFreeWindows(busy, day)).toEqual([
      { start: "2026-03-10T09:00:00Z", end: "2026-03-10T14:00:00Z" },
    ]);
  });

  test("busy block outside range is ignored", () => {
    const busy = [{ start: "2026-03-10T18:00:00Z", end: "2026-03-10T20:00:00Z" }];
    expect(computeFreeWindows(busy, day)).toEqual([day]);
  });
});

// ── intersectWindows ─────────────────────────────────────────────

describe("intersectWindows", () => {
  test("no overlap returns empty", () => {
    const a = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T10:00:00Z" }];
    const b = [{ start: "2026-03-10T11:00:00Z", end: "2026-03-10T12:00:00Z" }];
    expect(intersectWindows(a, b)).toEqual([]);
  });

  test("partial overlap returns the overlap", () => {
    const a = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" }];
    const b = [{ start: "2026-03-10T11:00:00Z", end: "2026-03-10T14:00:00Z" }];
    expect(intersectWindows(a, b)).toEqual([
      { start: "2026-03-10T11:00:00Z", end: "2026-03-10T12:00:00Z" },
    ]);
  });

  test("one window fully inside another", () => {
    const a = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T17:00:00Z" }];
    const b = [{ start: "2026-03-10T11:00:00Z", end: "2026-03-10T14:00:00Z" }];
    expect(intersectWindows(a, b)).toEqual([
      { start: "2026-03-10T11:00:00Z", end: "2026-03-10T14:00:00Z" },
    ]);
  });

  test("identical windows return one window", () => {
    const w = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" }];
    expect(intersectWindows(w, w)).toEqual(w);
  });

  test("empty input returns empty", () => {
    const a = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" }];
    expect(intersectWindows(a, [])).toEqual([]);
    expect(intersectWindows([], a)).toEqual([]);
  });
});

// ── applyPreferences ─────────────────────────────────────────────

describe("applyPreferences", () => {
  const prefs = { startHour: 10, endHour: 20, includeWeekends: true };

  test("trims a window to preference hours", () => {
    // Full day window, should be trimmed to 10:00-20:00
    const windows = [{ start: "2026-03-10T00:00:00Z", end: "2026-03-10T23:59:00Z" }];
    expect(applyPreferences(windows, prefs)).toEqual([
      { start: "2026-03-10T10:00:00.000Z", end: "2026-03-10T20:00:00.000Z" },
    ]);
  });

  test("excludes weekends when preference says so", () => {
    // 2026-03-14 is a Saturday, 2026-03-15 is a Sunday
    const windows = [{ start: "2026-03-14T00:00:00Z", end: "2026-03-14T23:59:00Z" }];
    const noWeekends = { ...prefs, includeWeekends: false };
    expect(applyPreferences(windows, noWeekends)).toEqual([]);
  });

  test("keeps weekends when preference includes them", () => {
    const windows = [{ start: "2026-03-14T00:00:00Z", end: "2026-03-14T23:59:00Z" }];
    const result = applyPreferences(windows, prefs);
    expect(result.length).toBe(1);
  });

  test("window entirely outside preference hours is dropped", () => {
    // Window is 6am-8am, prefs are 10am-8pm
    const windows = [{ start: "2026-03-10T06:00:00Z", end: "2026-03-10T08:00:00Z" }];
    expect(applyPreferences(windows, prefs)).toEqual([]);
  });
});

// ── computeSharedWindows ─────────────────────────────────────────

describe("computeSharedWindows", () => {
  const dateRange = {
    start: "2026-03-10T00:00:00Z",
    end: "2026-03-10T23:59:00Z",
  };
  const prefs = { startHour: 9, endHour: 21, includeWeekends: true };

  test("two members with non-overlapping busy blocks share the gap", () => {
    // Member A busy 9-12, Member B busy 14-17
    // Both free 12-14 and 17-21 (after pref trimming)
    const memberA = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T12:00:00Z" }];
    const memberB = [{ start: "2026-03-10T14:00:00Z", end: "2026-03-10T17:00:00Z" }];

    const windows = computeSharedWindows([memberA, memberB], dateRange, prefs, 60);

    expect(windows.length).toBe(2);
    // Both windows should be at least 60 minutes
    for (const w of windows) {
      const duration = new Date(w.end).getTime() - new Date(w.start).getTime();
      expect(duration).toBeGreaterThanOrEqual(60 * 60 * 1000);
    }
  });

  test("drops windows shorter than minDuration", () => {
    // Member A busy 9-11:30, Member B busy 12:00-21:00
    // Shared free: 11:30-12:00 (30 min) — too short for 60 min
    const memberA = [{ start: "2026-03-10T09:00:00Z", end: "2026-03-10T11:30:00Z" }];
    const memberB = [{ start: "2026-03-10T12:00:00Z", end: "2026-03-10T21:00:00Z" }];

    const windows = computeSharedWindows([memberA, memberB], dateRange, prefs, 60);

    // The 30-min gap should be filtered out
    for (const w of windows) {
      const duration = new Date(w.end).getTime() - new Date(w.start).getTime();
      expect(duration).toBeGreaterThanOrEqual(60 * 60 * 1000);
    }
  });

  test("returns empty when no members provided", () => {
    expect(computeSharedWindows([], dateRange, prefs, 60)).toEqual([]);
  });

  test("single member returns their free windows", () => {
    const busy = [{ start: "2026-03-10T12:00:00Z", end: "2026-03-10T13:00:00Z" }];
    const windows = computeSharedWindows([busy], dateRange, prefs, 60);
    expect(windows.length).toBeGreaterThan(0);
  });
});

// ── filterEventsByAvailability ───────────────────────────────────

describe("filterEventsByAvailability", () => {
  const makeEvent = (id: string, startTime: string | null): NormalizedEvent => ({
    eventId: id,
    title: `Event ${id}`,
    description: null,
    startTime,
    venueName: null,
    venueCity: null,
    venueCountry: null,
    source: "ticketmaster",
    url: `https://example.com/${id}`,
    image: null,
    status: null,
    budgetBucket: null,
    genre: null,
  });

  const windows = [
    { start: "2026-03-10T14:00:00Z", end: "2026-03-10T18:00:00Z" }, // 4-hour window
  ];

  test("keeps event that fits inside a window", () => {
    // Event at 14:00, default 120 min → ends 16:00, fits in 14:00-18:00
    const events = [makeEvent("a", "2026-03-10T14:00:00Z")];
    expect(filterEventsByAvailability(events, windows, 120)).toEqual(events);
  });

  test("drops event that extends past window end", () => {
    // Event at 17:00, default 120 min → ends 19:00, exceeds 18:00
    const events = [makeEvent("a", "2026-03-10T17:00:00Z")];
    expect(filterEventsByAvailability(events, windows, 120)).toEqual([]);
  });

  test("drops event that starts before window", () => {
    const events = [makeEvent("a", "2026-03-10T13:00:00Z")];
    expect(filterEventsByAvailability(events, windows, 120)).toEqual([]);
  });

  test("keeps event with no startTime (evergreen)", () => {
    const events = [makeEvent("a", null)];
    expect(filterEventsByAvailability(events, windows, 120)).toEqual(events);
  });

  test("returns empty when no windows", () => {
    const events = [makeEvent("a", "2026-03-10T14:00:00Z")];
    expect(filterEventsByAvailability(events, [], 120)).toEqual([]);
  });

  test("filters a mix of fitting and non-fitting events", () => {
    const events = [
      makeEvent("fits", "2026-03-10T14:00:00Z"),      // fits
      makeEvent("too-late", "2026-03-10T17:00:00Z"),   // too late
      makeEvent("no-time", null),                       // no time
      makeEvent("also-fits", "2026-03-10T15:00:00Z"),  // fits
    ];
    const result = filterEventsByAvailability(events, windows, 120);
    expect(result.map((e) => e.eventId)).toEqual(["fits", "no-time", "also-fits"]);
  });

  test("keeps Yelp-style offset timestamps when they fit shared windows", () => {
    const yelpStyleEvent = [makeEvent("yelp-offset", "2026-03-10T15:00:00-0400")];
    const yelpWindow = [{ start: "2026-03-10T18:00:00Z", end: "2026-03-10T22:00:00Z" }];

    expect(filterEventsByAvailability(yelpStyleEvent, yelpWindow, 120)).toEqual(yelpStyleEvent);
  });
});

describe("filterEventsByBusyBlocks", () => {
  const makeEvent = (id: string, startTime: string | null): NormalizedEvent => ({
    eventId: id,
    title: `Event ${id}`,
    description: null,
    startTime,
    venueName: null,
    venueCity: null,
    venueCountry: null,
    source: "ticketmaster",
    url: `https://example.com/${id}`,
    image: null,
    status: null,
    budgetBucket: null,
    genre: null,
  });

  test("keeps event when all members are free at start time", () => {
    const events = [makeEvent("free", "2026-03-10T15:00:00Z")];
    const memberBusyBlocks = [
      [{ start: "2026-03-10T12:00:00Z", end: "2026-03-10T13:00:00Z" }],
      [{ start: "2026-03-10T16:00:00Z", end: "2026-03-10T17:00:00Z" }],
    ];
    expect(filterEventsByBusyBlocks(events, memberBusyBlocks)).toEqual(events);
  });

  test("drops event when any member is busy at event start", () => {
    const events = [makeEvent("busy", "2026-03-10T15:00:00Z")];
    const memberBusyBlocks = [
      [{ start: "2026-03-10T14:00:00Z", end: "2026-03-10T16:00:00Z" }],
      [],
    ];
    expect(filterEventsByBusyBlocks(events, memberBusyBlocks)).toEqual([]);
  });

  test("keeps late event for solo user with clear calendar", () => {
    const events = [makeEvent("late", "2026-03-10T20:30:00-0400")];
    expect(filterEventsByBusyBlocks(events, [[]])).toEqual(events);
  });
});
