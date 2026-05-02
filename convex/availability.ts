import type { NormalizedEvent } from "./event_types";

// ── Types ────────────────────────────────────────────────────────

/** A block of time when a user is busy (from Google Calendar FreeBusy). */
export interface BusyBlock {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/** A shared free time slot across group members. */
export interface AvailabilityWindow {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/** Per-user availability preferences. */
export interface AvailabilityPreferences {
  /** Earliest acceptable hour (0–23, e.g. 9 = 9 AM). */
  startHour: number;
  /** Latest acceptable hour (0–23, e.g. 21 = 9 PM). */
  endHour: number;
  /** Whether to include weekends (Saturday/Sunday). */
  includeWeekends: boolean;
}

function parseIsoToMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const offsetWithoutColon = /([+-]\d{2})(\d{2})$/;
  const normalized = offsetWithoutColon.test(trimmed)
    ? trimmed.replace(offsetWithoutColon, "$1:$2")
    : trimmed;

  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Merge overlapping or adjacent busy blocks into non-overlapping ranges. */
export function mergeBusyBlocks(blocks: BusyBlock[]): BusyBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const merged: BusyBlock[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      // Overlapping or adjacent — extend
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Compute free windows for a single user by inverting their busy blocks
 * within a date range.
 */
export function computeFreeWindows(
  busyBlocks: BusyBlock[],
  dateRange: { start: string; end: string },
): AvailabilityWindow[] {
  const merged = mergeBusyBlocks(busyBlocks);
  const free: AvailabilityWindow[] = [];

  let cursor = dateRange.start;

  for (const block of merged) {
    // Busy block is entirely before our cursor — skip
    if (block.end <= cursor) continue;
    // Busy block starts after our range — done
    if (block.start >= dateRange.end) break;

    // Gap between cursor and this busy block = free time
    if (block.start > cursor) {
      free.push({ start: cursor, end: block.start });
    }
    // Advance cursor past this busy block
    cursor = block.end;
  }

  // Remaining time after the last busy block
  if (cursor < dateRange.end) {
    free.push({ start: cursor, end: dateRange.end });
  }

  return free;
}

/** Return the intersection of two sorted lists of windows. */
export function intersectWindows(
  a: AvailabilityWindow[],
  b: AvailabilityWindow[],
): AvailabilityWindow[] {
  const result: AvailabilityWindow[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const start = a[i].start > b[j].start ? a[i].start : b[j].start;
    const end = a[i].end < b[j].end ? a[i].end : b[j].end;

    if (start < end) {
      result.push({ start, end });
    }

    // Advance the pointer whose window ends first
    if (a[i].end < b[j].end) i++;
    else j++;
  }

  return result;
}

/**
 * Apply preference filters to a list of windows:
 * - Trim windows to startHour/endHour bounds on each day
 * - Exclude weekends if preferences say so
 */
export function applyPreferences(
  windows: AvailabilityWindow[],
  preferences: AvailabilityPreferences,
): AvailabilityWindow[] {
  const result: AvailabilityWindow[] = [];

  for (const window of windows) {
    const winStart = new Date(window.start);
    const winEnd = new Date(window.end);

    // Walk through each day the window spans
    const dayStart = new Date(
      Date.UTC(winStart.getUTCFullYear(), winStart.getUTCMonth(), winStart.getUTCDate()),
    );

    for (
      let d = new Date(dayStart);
      d < winEnd;
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    ) {
      // Skip weekends if not included
      if (!preferences.includeWeekends && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) {
        continue;
      }

      // Preference bounds for this day
      const prefStart = new Date(d.getTime() + preferences.startHour * 60 * 60 * 1000);
      const prefEnd = new Date(d.getTime() + preferences.endHour * 60 * 60 * 1000);

      // Intersect with the original window
      const slotStart = prefStart > winStart ? prefStart : winStart;
      const slotEnd = prefEnd < winEnd ? prefEnd : winEnd;

      if (slotStart < slotEnd) {
        result.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }
  }

  return result;
}

/**
 * Compute shared availability windows for a group.
 *
 * @param memberBusyBlocks - Array of busy blocks per member
 * @param dateRange - The date range to consider
 * @param preferences - Availability preferences to apply
 * @param minDurationMinutes - Minimum window length (60, 90, or 120)
 */
export function computeSharedWindows(
  memberBusyBlocks: BusyBlock[][],
  dateRange: { start: string; end: string },
  preferences: AvailabilityPreferences,
  minDurationMinutes: number,
): AvailabilityWindow[] {
  if (memberBusyBlocks.length === 0) return [];

  // Get free windows for each member
  const memberFreeWindows = memberBusyBlocks.map((blocks) =>
    computeFreeWindows(blocks, dateRange),
  );

  // Intersect all members' free windows
  let shared = memberFreeWindows[0];
  for (let i = 1; i < memberFreeWindows.length; i++) {
    shared = intersectWindows(shared, memberFreeWindows[i]);
    if (shared.length === 0) return [];
  }

  // Apply preference filters
  shared = applyPreferences(shared, preferences);

  // Filter out windows shorter than the minimum duration
  const minMs = minDurationMinutes * 60 * 1000;
  return shared.filter((w) => {
    const duration = new Date(w.end).getTime() - new Date(w.start).getTime();
    return duration >= minMs;
  });
}

/**
 * Filter events to only those that fit entirely within at least one
 * shared availability window.
 *
 * @param events - Normalized events from external providers
 * @param windows - Shared availability windows for the group
 * @param defaultDurationMinutes - Assumed event duration when endTime is missing
 */
export function filterEventsByAvailability(
  events: NormalizedEvent[],
  windows: AvailabilityWindow[],
  defaultDurationMinutes: number = 120,
): NormalizedEvent[] {
  if (windows.length === 0) return [];

  return events.filter((event) => {
    if (!event.startTime) return true;

    const eventStart = parseIsoToMs(event.startTime);
    if (eventStart === null) return false;
    const eventEnd = eventStart + defaultDurationMinutes * 60 * 1000;

    return windows.some((w) => {
      const winStart = parseIsoToMs(w.start);
      const winEnd = parseIsoToMs(w.end);
      if (winStart === null || winEnd === null) return false;
      return eventStart >= winStart && eventEnd <= winEnd;
    });
  });
}

/**
 * Filter events based on member busy blocks:
 * keep an event only when its start time is outside every member's busy interval.
 */
export function filterEventsByBusyBlocks(
  events: NormalizedEvent[],
  memberBusyBlocks: BusyBlock[][],
): NormalizedEvent[] {
  if (memberBusyBlocks.length === 0) return [];

  return events.filter((event) => {
    if (!event.startTime) return true;
    const eventStart = parseIsoToMs(event.startTime);
    if (eventStart === null) return false;

    return memberBusyBlocks.every((memberBlocks) =>
      memberBlocks.every((block) => {
        const blockStart = parseIsoToMs(block.start);
        const blockEnd = parseIsoToMs(block.end);
        if (blockStart === null || blockEnd === null) return true;
        return !(eventStart >= blockStart && eventStart < blockEnd);
      }),
    );
  });
}
