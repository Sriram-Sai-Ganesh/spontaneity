import type { BudgetBucket, NormalizedEvent, EventStatus } from "./event_types";

const DISCOVERY_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

export interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  source: "ticketmaster";
  date: string | null;
  time: string | null;
}

export interface EventSearchParams {
  keyword?: string;
  /** Overrides the search keyword specifically for Google Places food/venue queries.
   * Ignored by Ticketmaster and Yelp providers. */
  foodKeyword?: string;
  city?: string;
  stateCode?: string;
  startDateTime?: string;
  endDateTime?: string;
  size?: number;
}

function parseEvent(raw: Record<string, unknown>): TicketmasterEvent {
  const dates = raw.dates as Record<string, unknown> | undefined;
  const start = dates?.start as Record<string, unknown> | undefined;

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    url: String(raw.url ?? ""),
    source: "ticketmaster",
    date: start?.localDate != null ? String(start.localDate) : null,
    time: start?.localTime != null ? String(start.localTime) : null,
  };
}

function pickImage(raw: Record<string, unknown>): string | null {
  const images = raw.images as Record<string, unknown>[] | undefined;
  if (!images || images.length === 0) return null;
  const sixteenNine = images
    .filter((img) => img.ratio === "16_9")
    .sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0));
  const best = sixteenNine[0] ?? images[0];
  return best?.url != null ? String(best.url) : null;
}

function pickBudgetBucket(raw: Record<string, unknown>): BudgetBucket | null {
  const priceRanges = raw.priceRanges as Record<string, unknown>[] | undefined;
  const min = priceRanges
    ?.map((range) => Number(range.min))
    .filter(Number.isFinite)
    .reduce<number | null>((lowest, value) => {
      if (lowest === null || value < lowest) return value;
      return lowest;
    }, null);

  if (min == null) return null;
  if (min < 30) return "low";
  if (min < 75) return "medium";
  return "high";
}

export function mapToNormalizedEvent(raw: Record<string, unknown>): NormalizedEvent {
  const dates = raw.dates as Record<string, unknown> | undefined;
  const start = dates?.start as Record<string, unknown> | undefined;

  const startTime =
    start?.dateTime != null
      ? String(start.dateTime)
      : start?.localDate != null
        ? `${start.localDate}${start?.localTime != null ? `T${start.localTime}` : ""}`
        : null;

  const embedded = raw._embedded as Record<string, unknown> | undefined;
  const venue = (embedded?.venues as Record<string, unknown>[] | undefined)?.[0];
  const city = venue?.city as Record<string, unknown> | undefined;
  const country = venue?.country as Record<string, unknown> | undefined;
  const venueLocation = venue?.location as Record<string, unknown> | undefined;

  const statusObj = dates?.status as Record<string, unknown> | undefined;
  const statusCode = statusObj?.code != null ? String(statusObj.code) : null;
  const validStatuses: EventStatus[] = ["onsale", "offsale", "cancelled", "postponed", "rescheduled"];
  const status = validStatuses.includes(statusCode as EventStatus) ? (statusCode as EventStatus) : null;

  const description =
    raw.description != null
      ? String(raw.description)
      : raw.info != null
        ? String(raw.info)
        : raw.pleaseNote != null
          ? String(raw.pleaseNote)
          : null;

  const classifications = raw.classifications as Record<string, unknown>[] | undefined;
  const segment = (classifications?.[0] as Record<string, unknown> | undefined)?.segment as
    | Record<string, unknown>
    | undefined;
  const genre =
    segment?.name != null && String(segment.name) !== "Undefined"
      ? String(segment.name)
      : null;

  return {
    eventId: String(raw.id ?? ""),
    title: String(raw.name ?? ""),
    description,
    startTime,
    venueName: venue?.name != null ? String(venue.name) : null,
    venueCity: city?.name != null ? String(city.name) : null,
    venueCountry: country?.name != null ? String(country.name) : null,
    latitude: venueLocation?.latitude != null && Number.isFinite(Number(venueLocation.latitude)) ? Number(venueLocation.latitude) : undefined,
    longitude: venueLocation?.longitude != null && Number.isFinite(Number(venueLocation.longitude)) ? Number(venueLocation.longitude) : undefined,
    source: "ticketmaster",
    url: String(raw.url ?? ""),
    image: pickImage(raw),
    status,
    tags: [],
    budgetBucket: pickBudgetBucket(raw),
    genre,
    venueType: "activity" as const,
  };
}

async function fetchRawEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ apikey: apiKey });

  if (params.keyword) query.set("keyword", params.keyword);
  if (params.city) query.set("city", params.city);
  if (params.stateCode) query.set("stateCode", params.stateCode);
  if (params.startDateTime) query.set("startDateTime", params.startDateTime);
  if (params.endDateTime) query.set("endDateTime", params.endDateTime);
  query.set("size", String(params.size ?? 5));

  const url = `${DISCOVERY_URL}?${query.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Network error contacting Ticketmaster: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 401) {
    throw new Error("Invalid Ticketmaster API key");
  }
  if (response.status === 429) {
    throw new Error("Ticketmaster rate limit exceeded; please try again later");
  }
  if (!response.ok) {
    throw new Error(`Ticketmaster API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  // No results — API returns a 200 with no _embedded when nothing is found
  const embedded = data._embedded as Record<string, unknown> | undefined;
  if (!embedded) return [];

  return (embedded.events as Record<string, unknown>[] | undefined) ?? [];
}

export async function searchEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<TicketmasterEvent[]> {
  return (await fetchRawEvents(apiKey, params)).map(parseEvent);
}

export async function searchNormalizedEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<NormalizedEvent[]> {
  return (await fetchRawEvents(apiKey, params)).map(mapToNormalizedEvent);
}
