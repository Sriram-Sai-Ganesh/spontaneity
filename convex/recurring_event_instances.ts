import type { Doc } from "./_generated/dataModel";

export type RecurringEventInstance = {
  configId: string;
  eventId: string;
  title: string;
  chatId: string;
  instanceDate: string; // YYYY-MM-DD
  cadence: "daily" | "weekly" | "monthly";
  interval: number;
  startTime: string | null; // HH:MM or null
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextOccurrence(
  current: Date,
  cadence: "daily" | "weekly" | "monthly",
  interval: number,
): Date {
  if (cadence === "daily") return addDays(current, interval);
  if (cadence === "weekly") return addDays(current, interval * 7);
  return addMonths(current, interval);
}

/**
 * Generates future occurrence dates for a recurring event config.
 * Returns at most `maxCount` instances with `instanceDate >= fromDate`.
 */
export function generateInstances(
  config: Doc<"recurring_event_configs">,
  fromDate: string,
  maxCount: number,
): RecurringEventInstance[] {
  const instances: RecurringEventInstance[] = [];
  let current = new Date(config.startDate);
  let occurrenceIndex = 0;

  const endCondition = config.endCondition;

  while (instances.length < maxCount) {
    const dateStr = toDateString(current);

    // Check end condition
    if (endCondition.type === "on_date" && dateStr > endCondition.date) break;
    if (endCondition.type === "after_occurrences" && occurrenceIndex >= endCondition.count) break;

    if (dateStr >= fromDate) {
      instances.push({
        configId: config._id,
        eventId: config.eventId,
        title: config.title,
        chatId: config.chatId,
        instanceDate: dateStr,
        cadence: config.cadence,
        interval: config.interval,
        startTime: config.startTime ?? null,
      });
    }

    occurrenceIndex++;
    const next = nextOccurrence(current, config.cadence, config.interval);

    // Safety: prevent infinite loops if next doesn't advance past fromDate
    if (toDateString(next) <= dateStr) break;

    current = next;

    // Avoid scanning too far into the past — stop early if well before fromDate
    // and we've already advanced past a reasonable number of skipped occurrences
    if (toDateString(current) < fromDate && occurrenceIndex > 10000) break;
  }

  return instances;
}
