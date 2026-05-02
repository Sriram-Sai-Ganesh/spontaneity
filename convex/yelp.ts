import type { BudgetBucket, NormalizedEvent, EventStatus } from "./event_types";
import type { EventSearchParams } from "./ticketmaster";

const YELP_EVENTS_URL = "https://api.yelp.com/v3/events";

export interface YelpEvent {
  id: string;
  name: string;
  event_site_url: string;
  source: "yelp";
  time_start: string | null;
  time_end: string | null;
  category: string | null;
  is_free: boolean;
  is_canceled: boolean;
}

function isoToUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function yelpGenre(raw: Record<string, unknown>): string | null {
  const c = raw.category;
  if (c == null) return null;
  if (typeof c === "string") return c.length > 0 ? c : null;
  if (typeof c === "object" && c !== null && "alias" in c) {
    const alias = (c as { alias?: unknown }).alias;
    return alias != null && String(alias).length > 0 ? String(alias) : null;
  }
  return null;
}

function pickBudgetBucket(
  raw: Record<string, unknown>,
): BudgetBucket | null {
  if (raw.is_free === true) return "low";

  const cost = raw.cost != null ? Number(raw.cost) : null;
  const costMax = raw.cost_max != null ? Number(raw.cost_max) : null;
  const price = cost ?? costMax;

  if (price == null || !Number.isFinite(price)) return null;
  if (price < 30) return "low";
  if (price < 75) return "medium";
  return "high";
}

export function mapToNormalizedEvent(
  raw: Record<string, unknown>,
): NormalizedEvent {
  const location = raw.location as Record<string, unknown> | undefined;
  const displayAddress = location?.display_address as string[] | undefined;

  const isCanceled = raw.is_canceled === true;
  const status: EventStatus | null = isCanceled ? "cancelled" : null;

  const id = String(raw.id ?? "");
  const genre = yelpGenre(raw);
  const rawUrl =
    raw.event_site_url != null && String(raw.event_site_url).length > 0
      ? String(raw.event_site_url)
      : raw.tickets_url != null && String(raw.tickets_url).length > 0
        ? String(raw.tickets_url)
        : id.length > 0
          ? `https://www.yelp.com/events/${encodeURIComponent(id)}`
          : "";

  return {
    eventId: id,
    title: String(raw.name ?? ""),
    description:
      raw.description != null ? String(raw.description) : null,
    startTime:
      raw.time_start != null ? String(raw.time_start) : null,
    venueName:
      displayAddress && displayAddress.length > 0
        ? displayAddress.join(", ")
        : raw.business_id != null
          ? String(raw.business_id)
          : null,
    venueCity:
      location?.city != null ? String(location.city) : null,
    venueCountry:
      location?.country != null ? String(location.country) : null,
    latitude: raw.latitude != null && Number.isFinite(Number(raw.latitude)) ? Number(raw.latitude) : undefined,
    longitude: raw.longitude != null && Number.isFinite(Number(raw.longitude)) ? Number(raw.longitude) : undefined,
    source: "yelp",
    url: rawUrl,
    image: raw.image_url != null ? String(raw.image_url) : null,
    status,
    tags: [],
    budgetBucket: pickBudgetBucket(raw),
    genre,
    venueType: "activity" as const,
  };
}

/** Keep events whose start time falls in [startDateTime, endDateTime] (Ticketmaster-style window). */
function filterRawEventsByStartWindow(
  rows: Record<string, unknown>[],
  params: EventSearchParams,
): Record<string, unknown>[] {
  if (!params.startDateTime || !params.endDateTime) return rows;
  const startMs = new Date(params.startDateTime).getTime();
  const endMs = new Date(params.endDateTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return rows;

  return rows.filter((raw) => {
    if (raw.time_start == null) return false;
    const t = new Date(String(raw.time_start)).getTime();
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
}

async function fetchRawEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams();

  if (params.city) query.set("location", params.city);
  if (params.stateCode) {
    const loc = params.city
      ? `${params.city}, ${params.stateCode}`
      : params.stateCode;
    query.set("location", loc);
  }
  if (params.startDateTime) {
    query.set("start_date", String(isoToUnixSeconds(params.startDateTime)));
  }
  // Do not pass end_date: Yelp interprets it as "event ends by this time", which drops
  // multi-day and late-ending events that still start inside our availability window.
  const pageSize = Math.min(50, Math.max(params.size ?? 20, 20));
  query.set("limit", String(pageSize));
  query.set("sort_on", "time_start");
  query.set("sort_by", "asc");

  const url = `${YELP_EVENTS_URL}?${query.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    throw new Error(
      `Network error contacting Yelp: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON body — handled below */
  }

  const apiErr = data?.error as { code?: string; description?: string } | undefined;
  if (apiErr?.code) {
    const suffix = apiErr.description ? ` — ${apiErr.description}` : "";
    throw new Error(`Yelp API: ${apiErr.code}${suffix}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid Yelp API key");
    }
    if (response.status === 429) {
      throw new Error("Yelp rate limit exceeded; please try again later");
    }
    throw new Error(`Yelp API error: HTTP ${response.status}`);
  }

  let rows = (data?.events as Record<string, unknown>[] | undefined) ?? [];
  rows = filterRawEventsByStartWindow(rows, params);
  const cap = Math.min(params.size ?? 20, 50);
  return rows.slice(0, cap);
}

export async function searchNormalizedEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<NormalizedEvent[]> {
  return (await fetchRawEvents(apiKey, params)).map(mapToNormalizedEvent);
}
