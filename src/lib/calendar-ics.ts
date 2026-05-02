import { formatEventSourceLabel } from "@/lib/event-source-presentation";

const DEFAULT_EVENT_DURATION_MINUTES = 120;
const EST_TIMEZONE = "America/New_York";
const ICS_NEWLINE = "\r\n";

export type CalendarIcsEvent = {
  eventId: string;
  title: string;
  startTime?: string | null;
  description?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  venueCountry?: string | null;
  url?: string | null;
  source?: string | null;
};

function formatIcsDateUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatIcsDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCalendarIcsPayload(
  event: CalendarIcsEvent,
  durationMinutes?: number,
): { ics: string; filename: string } | null {
  if (!event.startTime) {
    return null;
  }

  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const safeDuration = Math.max(
    durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES,
    30,
  );
  const end = new Date(start.getTime() + safeDuration * 60 * 1000);

  const dtstamp = formatIcsDateUtc(new Date());
  const dtstart = formatIcsDateInZone(start, EST_TIMEZONE);
  const dtend = formatIcsDateInZone(end, EST_TIMEZONE);

  const location = [event.venueName, event.venueCity, event.venueCountry]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  const description = [
    event.description ?? undefined,
    event.url ? `Source link: ${event.url}` : undefined,
    event.source
      ? `Source: ${formatEventSourceLabel(event.source)}`
      : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Spontaneity//Find Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${EST_TIMEZONE}`,
    `X-LIC-LOCATION:${EST_TIMEZONE}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${event.eventId}@spontaneity.ai`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${EST_TIMEZONE}:${dtstart}`,
    `DTEND;TZID=${EST_TIMEZONE}:${dtend}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : undefined,
    location ? `LOCATION:${escapeIcsText(location)}` : undefined,
    event.url ? `URL:${escapeIcsText(event.url)}` : undefined,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));

  return {
    ics: lines.join(ICS_NEWLINE),
    filename: `${slugify(event.title) || "event"}.ics`,
  };
}

function buildVEvent(
  event: CalendarIcsEvent,
  durationMinutes: number,
  dtstamp: string,
): string[] | null {
  if (!event.startTime) return null;
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const dtstart = formatIcsDateInZone(start, EST_TIMEZONE);
  const dtend = formatIcsDateInZone(end, EST_TIMEZONE);

  const location = [event.venueName, event.venueCity, event.venueCountry]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  const description = [
    event.description ?? undefined,
    event.url ? `Source link: ${event.url}` : undefined,
    event.source ? `Source: ${formatEventSourceLabel(event.source)}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\\n");

  return [
    "BEGIN:VEVENT",
    `UID:${event.eventId}@spontaneity.ai`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${EST_TIMEZONE}:${dtstart}`,
    `DTEND;TZID=${EST_TIMEZONE}:${dtend}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : undefined,
    location ? `LOCATION:${escapeIcsText(location)}` : undefined,
    event.url ? `URL:${escapeIcsText(event.url)}` : undefined,
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ].filter((line): line is string => Boolean(line));
}

export function buildMultiEventCalendarIcs(
  events: CalendarIcsEvent[],
  calendarTitle: string,
  durationMinutes?: number,
): { ics: string; filename: string } | null {
  const safeDuration = Math.max(durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES, 30);
  const dtstamp = formatIcsDateUtc(new Date());

  const vevents = events
    .flatMap((e) => buildVEvent(e, safeDuration, dtstamp) ?? []);

  if (vevents.length === 0) return null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Spontaneity//Find Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${EST_TIMEZONE}`,
    `X-LIC-LOCATION:${EST_TIMEZONE}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...vevents,
    "END:VCALENDAR",
  ];

  return {
    ics: lines.join(ICS_NEWLINE),
    filename: `${slugify(calendarTitle) || "recurring-events"}.ics`,
  };
}

export function downloadCalendarIcs(payload: {
  ics: string;
  filename: string;
}) {
  const blob = new Blob([payload.ics], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
