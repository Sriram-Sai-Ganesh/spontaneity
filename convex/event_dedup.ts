import type { EventSourceLink, NormalizedEvent } from "./event_types";

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeDedupText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

export function providerEventScore(event: NormalizedEvent): number {
  return (
    [
      event.description,
      event.venueName,
      event.venueCity,
      event.venueCountry,
      event.image,
      event.genre,
      event.status,
      event.budgetBucket,
      event.url,
      event.formattedAddress,
      event.googlePlaceId,
    ].filter(isNonEmptyString).length +
    (event.latitude != null ? 1 : 0) +
    (event.longitude != null ? 1 : 0) +
    (event.tags?.length ?? 0) +
    (event.sourceLinks?.length ?? 0)
  );
}

export function isDuplicateProviderCandidate(
  left: NormalizedEvent,
  right: NormalizedEvent,
): boolean {
  if (left.source === "custom" || right.source === "custom") return false;

  if (left.source === "google_places" && right.source === "google_places") {
    // Deduplicate by venueName — same name means same place (or same chain branch that
    // should only appear once). Different placeIds with the same name are treated as one.
    const leftVenue = normalizeDedupText(left.venueName);
    const rightVenue = normalizeDedupText(right.venueName);
    if (leftVenue.length > 0 && rightVenue.length > 0 && leftVenue === rightVenue) {
      return true;
    }
    return false;
  }

  if (!left.startTime || !right.startTime || left.startTime !== right.startTime) {
    return false;
  }

  const leftVenue = normalizeDedupText(left.venueName);
  const rightVenue = normalizeDedupText(right.venueName);
  const leftTitle = normalizeDedupText(left.title);
  const rightTitle = normalizeDedupText(right.title);
  const leftCity = normalizeDedupText(left.venueCity);
  const rightCity = normalizeDedupText(right.venueCity);

  const sameVenue =
    leftVenue.length > 0 && rightVenue.length > 0 && leftVenue === rightVenue;
  const sameTitle =
    leftTitle.length > 0 && rightTitle.length > 0 && leftTitle === rightTitle;
  const sameCity =
    leftCity.length > 0 && rightCity.length > 0 && leftCity === rightCity;

  return sameVenue || (sameTitle && sameCity);
}

function richerNullableString(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (isNonEmptyString(preferred) && isNonEmptyString(fallback)) {
    return fallback.length > preferred.length ? fallback : preferred;
  }
  if (isNonEmptyString(preferred)) return preferred;
  if (isNonEmptyString(fallback)) return fallback;
  return null;
}

function mergeEventTags(
  preferred: NormalizedEvent["tags"],
  fallback: NormalizedEvent["tags"],
): NormalizedEvent["tags"] {
  const merged = [...(preferred ?? []), ...(fallback ?? [])];
  if (merged.length === 0) return preferred ?? fallback ?? [];
  return [...new Set(merged)];
}

function addSourceLink(
  map: Map<string, EventSourceLink>,
  source: string | null | undefined,
  eventId: string | null | undefined,
  url: string | null | undefined,
): void {
  if (!isNonEmptyString(source) || !isNonEmptyString(eventId) || !isNonEmptyString(url)) {
    return;
  }
  const key = `${source}|${eventId}|${url}`;
  if (!map.has(key)) {
    map.set(key, { source, eventId, url });
  }
}

function collectSourceLinks(events: NormalizedEvent[]): EventSourceLink[] {
  const byKey = new Map<string, EventSourceLink>();
  for (const event of events) {
    addSourceLink(byKey, event.source, event.eventId, event.url);
    for (const link of event.sourceLinks ?? []) {
      addSourceLink(byKey, link.source, link.eventId, link.url);
    }
  }
  return [...byKey.values()];
}

export function mergeDuplicateEvents(
  left: NormalizedEvent,
  right: NormalizedEvent,
): NormalizedEvent {
  const leftScore = providerEventScore(left);
  const rightScore = providerEventScore(right);
  const preferred = rightScore > leftScore ? right : left;
  const fallback = preferred === left ? right : left;

  const sourceLinks = collectSourceLinks([left, right]);
  const shouldAttachSourceLinks =
    sourceLinks.length > 1 ||
    Boolean(left.sourceLinks?.length) ||
    Boolean(right.sourceLinks?.length);

  return {
    ...preferred,
    description: richerNullableString(preferred.description, fallback.description),
    startTime: preferred.startTime ?? fallback.startTime ?? null,
    venueName: richerNullableString(preferred.venueName, fallback.venueName),
    venueCity: richerNullableString(preferred.venueCity, fallback.venueCity),
    venueCountry: richerNullableString(preferred.venueCountry, fallback.venueCountry),
    latitude: preferred.latitude ?? fallback.latitude,
    longitude: preferred.longitude ?? fallback.longitude,
    formattedAddress: richerNullableString(preferred.formattedAddress, fallback.formattedAddress),
    googlePlaceId: preferred.googlePlaceId ?? fallback.googlePlaceId,
    image: richerNullableString(preferred.image, fallback.image),
    tags: mergeEventTags(preferred.tags, fallback.tags),
    status: preferred.status ?? fallback.status ?? null,
    budgetBucket: preferred.budgetBucket ?? fallback.budgetBucket ?? null,
    genre: richerNullableString(preferred.genre, fallback.genre),
    tagsConfirmed:
      preferred.tagsConfirmed === true || fallback.tagsConfirmed === true
        ? true
        : preferred.tagsConfirmed ?? fallback.tagsConfirmed,
    tagAttempts:
      preferred.tagAttempts === undefined && fallback.tagAttempts === undefined
        ? undefined
        : Math.max(preferred.tagAttempts ?? 0, fallback.tagAttempts ?? 0),
    ...(shouldAttachSourceLinks ? { sourceLinks } : {}),
  };
}

export function deduplicateCandidateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const deduplicated: NormalizedEvent[] = [];

  for (const event of events) {
    const duplicateIndex = deduplicated.findIndex((existing) =>
      isDuplicateProviderCandidate(existing, event),
    );

    if (duplicateIndex === -1) {
      deduplicated.push(event);
      continue;
    }

    deduplicated[duplicateIndex] = mergeDuplicateEvents(
      deduplicated[duplicateIndex],
      event,
    );
  }

  return deduplicated;
}
