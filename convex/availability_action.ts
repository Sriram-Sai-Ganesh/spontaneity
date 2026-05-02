import { v } from "convex/values";
import { actionWithAuth } from "./lib";
import { api, internal } from "./_generated/api";
import { searchEvents } from "./events";
import {
  computeSharedWindows,
  filterEventsByBusyBlocks,
  mergeBusyBlocks,
  type AvailabilityWindow,
  type BusyBlock,
  type AvailabilityPreferences,
} from "./availability";
import { fetchGoogleFreeBusy, refreshGoogleAccessToken } from "./google_calendar";
import { normalizeEventTags, type NormalizedEvent, type OpenHoursPeriod } from "./event_types";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  inferEventTags,
  rankEventsForGroup,
  applyFinalDistanceRanking,
  computeRankingConfidence,
  buildAllergenWarningText,
  haversineDistanceMiles,
  type GroupPreferenceProfileSummary,
  type MemberPreference,
  type RankingConfidenceResult,
  type ReferenceLocation,
} from "./ranking";
import { dbEventToNormalizedEvent } from "./events_queries";
import { deduplicateCandidateEvents } from "./event_dedup";
import { tagEventWithAI } from "./events_actions";
import { getLocation } from "./weather";
import { lookupVenueNeighborhood } from "./google_places";
import { normalizeProviderCityLabel } from "./location_aliases";

const DAY_MS = 24 * 60 * 60 * 1000;

// Non-ticket (Google Places) venue caps
const INITIAL_NON_TICKET_PLACES = 80; // target on group-creation warm-cache
const MAX_NON_TICKET_PLACES = 120;    // hard cap enforced on cron refresh
const MAX_VENUE_NEIGHBORHOOD_LOOKUPS = 15;
const MAX_LOCATION_AREA_OPTIONS = 3;

// Budget ordering used for restriction comparisons: low < medium < high
const BUDGET_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3 };

const KNOWN_CITY_CENTERS: Record<string, ReferenceLocation> = {
  baltimore: { latitude: 39.3299, longitude: -76.6205 },
};

async function resolveReferenceLocation(city: string): Promise<ReferenceLocation | undefined> {
  const normalized = city.split(",")[0]?.trim().toLowerCase();
  if (!normalized) return undefined;
  const known = KNOWN_CITY_CENTERS[normalized];
  if (known) return known;
  try {
    const loc = await getLocation(normalized);
    if (loc?.latitude != null && loc?.longitude != null) {
      return { latitude: loc.latitude, longitude: loc.longitude };
    }
  } catch {
    // Geocoding failed — proceed without distance scoring
  }
  return undefined;
}

interface UserHardRestrictions {
  maxBudget?: "low" | "medium";
  maxEventEndHour?: number;
  maxDistanceMiles?: number;
}

interface GroupHardRestrictions {
  effectiveBudgetCap?: "low" | "medium"; // most restrictive cap across all members
  effectiveMaxEndHour?: number; // earliest end-hour limit across all members
  effectiveMaxDistanceMiles?: number; // smallest distance cap across all members
}

/**
 * Derive the most restrictive hard limits across all group members.
 * For budget: lowest cap wins. For end time: earliest cutoff wins.
 */
function computeGroupHardRestrictions(
  memberRestrictions: (UserHardRestrictions | null)[],
): GroupHardRestrictions {
  let effectiveBudgetCap: "low" | "medium" | undefined;
  let effectiveMaxEndHour: number | undefined;
  let effectiveMaxDistanceMiles: number | undefined;

  for (const r of memberRestrictions) {
    if (!r) continue;

    if (r.maxBudget) {
      if (
        effectiveBudgetCap === undefined ||
        BUDGET_LEVEL[r.maxBudget] < BUDGET_LEVEL[effectiveBudgetCap]
      ) {
        effectiveBudgetCap = r.maxBudget;
      }
    }

    if (r.maxEventEndHour !== undefined) {
      if (effectiveMaxEndHour === undefined || r.maxEventEndHour < effectiveMaxEndHour) {
        effectiveMaxEndHour = r.maxEventEndHour;
      }
    }

    if (r.maxDistanceMiles !== undefined) {
      if (effectiveMaxDistanceMiles === undefined || r.maxDistanceMiles < effectiveMaxDistanceMiles) {
        effectiveMaxDistanceMiles = r.maxDistanceMiles;
      }
    }
  }

  return { effectiveBudgetCap, effectiveMaxEndHour, effectiveMaxDistanceMiles };
}

/**
 * Filter events that violate any group-level hard restriction.
 * - Budget cap: exclude events whose budgetBucket exceeds the cap.
 * - Max end hour: exclude events that would end after the cutoff, using
 *   durationMinutes as an estimate of how long the event lasts.
 *   The hour is extracted from the ISO datetime string (venue local time).
 */
function applyHardRestrictions<T extends NormalizedEvent>(
  events: T[],
  restrictions: GroupHardRestrictions,
  durationMinutes: number,
  referenceLocation?: ReferenceLocation,
): T[] {
  const { effectiveBudgetCap, effectiveMaxEndHour, effectiveMaxDistanceMiles } = restrictions;
  if (!effectiveBudgetCap && effectiveMaxEndHour === undefined && effectiveMaxDistanceMiles === undefined) return events;

  return events.filter((event) => {
    if (effectiveBudgetCap && event.budgetBucket) {
      if (BUDGET_LEVEL[event.budgetBucket] > BUDGET_LEVEL[effectiveBudgetCap]) {
        return false;
      }
    }

    if (effectiveMaxEndHour !== undefined && event.startTime) {
      // Extract local hour/minute from ISO string (e.g. "2024-01-15T19:00:00-05:00")
      const match = event.startTime.match(/T(\d{2}):(\d{2})/);
      if (match) {
        const startMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
        if (startMinutes + durationMinutes > effectiveMaxEndHour * 60) {
          return false;
        }
      }
    }

    if (
      effectiveMaxDistanceMiles !== undefined &&
      referenceLocation &&
      event.latitude != null &&
      event.longitude != null
    ) {
      const miles = haversineDistanceMiles(
        referenceLocation.latitude,
        referenceLocation.longitude,
        event.latitude,
        event.longitude,
      );
      if (miles > effectiveMaxDistanceMiles) {
        return false;
      }
    }

    return true;
  });
}
const DEFAULT_DAYS_AHEAD = 7;
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_EVENT_SEARCH_SIZE = 50;
const DEFAULT_INCLUDE_WEEKENDS = true;
// Default to full-day availability; only calendar busy blocks should constrain results.
const DEFAULT_PREFERENCE_START_HOUR = 0;
const DEFAULT_PREFERENCE_END_HOUR = 24;

async function resolveEventSearchCity(
  ctx: ActionCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
  requestedCity?: string,
): Promise<string | undefined> {
  const trimmedCity = normalizeProviderCityLabel(requestedCity);
  if (trimmedCity) {
    return trimmedCity;
  }

  const [chat, userCity] = await Promise.all([
    ctx.runQuery(internal.chats_queries.getChatInternal, {
      chatId,
    }),
    ctx.runQuery(internal.users_queries.getUserCityInternal, {
      userId,
    }),
  ]);
  const planningLocation = normalizeProviderCityLabel(chat?.planningLocation);
  return planningLocation || normalizeProviderCityLabel(userCity) || undefined;
}

/**
 * Maps a NormalizedEvent to the shape accepted by storeAndTagEvents / storeEvents.
 * Extracted at module level so it can be shared between findAvailableEventsForMembers
 * and warmEventCacheForChat.
 */
function toStorableEvent(event: NormalizedEvent) {
  return {
    eventId: event.eventId,
    title: event.title,
    source: event.source,
    url: event.url,
    ...(event.sourceLinks != null && { sourceLinks: event.sourceLinks }),
    ...(event.description != null && { description: event.description }),
    ...(event.startTime != null && { startTime: event.startTime }),
    ...(event.venueName != null && { venueName: event.venueName }),
    ...(event.venueCity != null && { venueCity: event.venueCity }),
    ...(event.venueNeighborhood != null && { venueNeighborhood: event.venueNeighborhood }),
    ...(event.venueCountry != null && { venueCountry: event.venueCountry }),
    ...(event.image != null && { image: event.image }),
    tags: (event.tags ?? []) as import("./event_types").EventTag[],
    ...(event.status != null && { status: event.status }),
    ...(event.budgetBucket != null && { budgetBucket: event.budgetBucket }),
    ...(event.genre != null && { genre: event.genre }),
    ...(event.venueType != null && { venueType: event.venueType }),
    ...(event.latitude != null && { latitude: event.latitude }),
    ...(event.longitude != null && { longitude: event.longitude }),
    ...(event.formattedAddress != null && { formattedAddress: event.formattedAddress }),
    ...(event.googlePlaceId != null && { googlePlaceId: event.googlePlaceId }),
  };
}

function venueNeighborhoodLookupKey(event: NormalizedEvent): string | null {
  const venueName = event.venueName?.trim().toLowerCase();
  const venueCity = event.venueCity?.trim().toLowerCase();
  if (!venueName || !venueCity) return null;
  return `${venueName}|${venueCity}`;
}

async function enrichMissingVenueNeighborhoods(
  events: NormalizedEvent[],
  lookupCache: Map<string, string | null>,
): Promise<NormalizedEvent[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return events;

  const lookupEvents = new Map<string, NormalizedEvent>();
  for (const event of events) {
    if (event.venueNeighborhood || event.source === "google_places") continue;
    const key = venueNeighborhoodLookupKey(event);
    if (key && !lookupCache.has(key) && !lookupEvents.has(key)) {
      lookupEvents.set(key, event);
    }
    if (lookupEvents.size >= MAX_VENUE_NEIGHBORHOOD_LOOKUPS) break;
  }
  await Promise.all(
    Array.from(lookupEvents.entries()).map(async ([key, event]) => {
      try {
        const neighborhood = await lookupVenueNeighborhood(apiKey, event);
        lookupCache.set(key, neighborhood);
      } catch (err) {
        lookupCache.set(key, null);
        console.warn(
          "[availability] Venue neighborhood enrichment failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }),
  );

  return events.map((event) => {
    if (event.venueNeighborhood) return event;
    const key = venueNeighborhoodLookupKey(event);
    const venueNeighborhood = key ? lookupCache.get(key) : undefined;
    return venueNeighborhood ? { ...event, venueNeighborhood } : event;
  });
}

function normalizeLocationAreaOption(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function locationAreaComparisonKey(value: string | null | undefined): string | null {
  const normalized = normalizeLocationAreaOption(value)
    ?.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(d\.?c\.?|district of columbia|nyc)\b/g, "")
    .replace(/\b(city|county)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized : null;
}

function isSearchCityAlias(value: string | null | undefined, city: string): boolean {
  const valueKey = locationAreaComparisonKey(value);
  const cityKey = locationAreaComparisonKey(city);
  const shortCityKey = locationAreaComparisonKey(city.split(",")[0]);
  return !!valueKey && (valueKey === cityKey || valueKey === shortCityKey);
}

function isSameOrContainedLocationArea(
  value: string | null | undefined,
  locationArea: string,
): boolean {
  const normalizedValue = locationAreaComparisonKey(value);
  const normalizedArea = locationAreaComparisonKey(locationArea);
  if (!normalizedValue || !normalizedArea) return false;
  return (
    normalizedValue === normalizedArea ||
    normalizedValue.endsWith(` ${normalizedArea}`) ||
    normalizedArea.endsWith(` ${normalizedValue}`)
  );
}

function eventMatchesLocationArea(
  event: { venueCity?: string | null; venueNeighborhood?: string | null },
  locationArea: string,
): boolean {
  const area = locationAreaComparisonKey(locationArea);
  if (!area) return true;
  return (
    isSameOrContainedLocationArea(event.venueNeighborhood, area) ||
    locationAreaComparisonKey(event.venueCity) === area
  );
}

function eventBelongsToSearchCity(
  event: { venueCity?: string | null },
  city: string,
  locationArea?: string,
): boolean {
  if (isSearchCityAlias(event.venueCity, city)) return true;
  if (!locationArea || isSearchCityAlias(locationArea, city)) return false;
  return locationAreaComparisonKey(event.venueCity) === locationAreaComparisonKey(locationArea);
}

function areOverlappingLocationAreas(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(` ${normalizedRight}`) ||
    normalizedRight.endsWith(` ${normalizedLeft}`)
  );
}

function addDistinctLocationAreaOption(options: string[], area: string): void {
  const existingIndex = options.findIndex((option) =>
    areOverlappingLocationAreas(option, area),
  );
  if (existingIndex === -1) {
    options.push(area);
    return;
  }

  const existing = options[existingIndex];
  if (existing.toLowerCase().endsWith(` ${area.toLowerCase()}`)) {
    options[existingIndex] = area;
  }
}

function hasEventsForLocationArea(events: NormalizedEvent[], area: string): boolean {
  return events.some((event) => eventMatchesLocationArea(event, area));
}

async function buildLocationAreaOptions(
  city: string,
  events: NormalizedEvent[],
): Promise<string[]> {
  const options: string[] = [];
  for (const event of events) {
    if (options.length >= MAX_LOCATION_AREA_OPTIONS) break;
    const area = normalizeLocationAreaOption(event.venueNeighborhood ?? event.venueCity);
    if (!area || isSearchCityAlias(area, city)) continue;
    if (!hasEventsForLocationArea(events, area)) continue;
    addDistinctLocationAreaOption(options, area);
  }

  return options;
}

function buildPlanningDateRange(daysAhead: number): { start: string; end: string } {
  const now = new Date();
  const lastPlanningDayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, 0, 0, 0, 0),
  );
  const endDate = new Date(
    lastPlanningDayUtcMidnight.getTime() + DEFAULT_PREFERENCE_END_HOUR * 60 * 60 * 1000,
  );
  return {
    start: now.toISOString(),
    end: endDate.toISOString(),
  };
}

interface FindAvailableEventsResult {
  memberCount: number;
  dateRange: { start: string; end: string };
  durationMinutes: number;
  sharedWindows: AvailabilityWindow[];
  totalEvents: number;
  allEvents: NormalizedEvent[];
  availabilityFilteredEvents: NormalizedEvent[];
  filteredEvents: RecommendedEvent[];
  /** Top 3 food venues ranked by group preferences; best fit first. */
  rankedFoodEvents: RecommendedEvent[];
  /** Top 3 activity events ranked by group preferences; best fit first. */
  rankedActivityEvents: RecommendedEvent[];
  /** @deprecated Use rankedFoodEvents or rankedActivityEvents. Kept for backwards compat. */
  rankedEvents: RecommendedEvent[];
  learnedProfileSummary: string[];
  rankingConfidence: RankingConfidenceResult;
  /** Plain-text allergen/dietary warning for the top recommended food venues. Empty string when no warnings apply. */
  allergenWarnings: string;
  locationAreaOptions: string[];
  searchLocation?: string;
  error?: string;
}

interface UserBusyBlocksResult {
  busyBlocks: BusyBlock[] | null;
  reason: string | null;
}

interface RecommendedEvent extends NormalizedEvent {
  fitReasons: string[];
}

type GroupMember = {
  userId: Id<"users">;
  nickname?: string;
};

interface SharedAvailabilityResult {
  memberCount: number;
  dateRange: { start: string; end: string };
  durationMinutes: number;
  memberBusyBlocks: BusyBlock[][];
  sharedWindows: AvailabilityWindow[];
  error?: string;
}

interface FindAvailableEventsOptions {
  chatId?: Id<"chats">;
  currentUserId?: Id<"users">;
  city?: string;
  locationArea?: string;
  keyword?: string;
  /** Cuisine-specific keyword passed only to Google Places (not Ticketmaster/Yelp).
   * Derived from the requesting user's cuisinePreferences when no keyword is set. */
  foodKeyword?: string;
  daysAhead?: number;
  durationMinutes?: number;
  size?: number;
  /** When true, deletes stored provider-backed events whose startTime falls in this planning window before calling providers. */
  clearStoredInPlanningWindow?: boolean;
  /** When true, skip the external API fetch if events for this city are already cached (used for regen/re-rank flows). */
  isRegen?: boolean;
  /** E2E-only: treat missing Google Calendar OAuth as fully available. */
  ignoreMissingCalendars?: boolean;
  /** When set, passed to Google Places to search for the right type of venues.
   * 'food' → cuisine-based keyword; 'activity' → activity-oriented keyword. */
  venueTypeFilter?: "food" | "activity";
}

/**
 * Fetch Google Calendar busy blocks for a single user.
 * Returns null busyBlocks when Google Calendar data is unavailable for this user.
 */
async function getBusyBlocksForUser(
  ctx: ActionCtx,
  userId: Id<"users">,
  tokenInfo: {
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: number;
  },
  dateRange: { start: string; end: string },
): Promise<UserBusyBlocksResult> {
  let { googleAccessToken, googleTokenExpiry } = tokenInfo;
  const { googleRefreshToken } = tokenInfo;

  if (!googleAccessToken) {
    return { busyBlocks: null, reason: "missing_access_token" };
  }

  // Refresh the access token if it has expired (or will expire in the next 60 s).
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isExpired = googleTokenExpiry !== undefined && googleTokenExpiry - 60 < nowSeconds;

  if (isExpired && !googleRefreshToken) {
    return { busyBlocks: null, reason: "token_expired_missing_refresh_token" };
  }

  if (isExpired && googleRefreshToken) {
    const refreshed = await refreshGoogleAccessToken(googleRefreshToken);
    if (!refreshed) {
      // Refresh failed (token revoked) — treat as unavailable calendar.
      return { busyBlocks: null, reason: "refresh_failed_or_revoked" };
    }

    googleAccessToken = refreshed.accessToken;
    googleTokenExpiry = refreshed.expiresAt;
    await ctx.runMutation(internal.users_queries.storeRefreshedGoogleToken, {
      userId,
      googleAccessToken,
      googleTokenExpiry,
    });
  }

  const freeBusy = await fetchGoogleFreeBusy(googleAccessToken, dateRange);
  if (freeBusy.busyBlocks === null) {
    return { busyBlocks: null, reason: freeBusy.reason ?? "freebusy_unavailable" };
  }
  return { busyBlocks: freeBusy.busyBlocks, reason: null };
}

/**
 * For a venue that has weekly open hours, find the start of the first shared
 * availability window that falls within an open period.  If no window matches
 * any open period (or no open hours are provided), return the start of the
 * first shared window so the venue still surfaces in recommendations.
 */
function assignVirtualStartTime(
  openHours: OpenHoursPeriod[],
  sharedWindows: AvailabilityWindow[],
): string | null {
  if (sharedWindows.length === 0) return null;

  if (openHours.length === 0) {
    // No open-hours data — use the first shared window start as a fallback.
    return sharedWindows[0].start;
  }

  for (const window of sharedWindows) {
    const windowStartDate = new Date(window.start);
    const dayOfWeek = windowStartDate.getUTCDay(); // 0 = Sunday
    const windowMinutes =
      windowStartDate.getUTCHours() * 60 + windowStartDate.getUTCMinutes();

    const period = openHours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!period) continue;

    const [openH, openM = 0] = period.openTime.split(":").map(Number);
    const [closeH, closeM = 0] = period.closeTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (windowMinutes >= openMinutes && windowMinutes < closeMinutes) {
      return window.start;
    }
  }

  // No window fell inside an open period — fall back to first window.
  return sharedWindows[0].start;
}

async function computeSharedAvailability(
  ctx: ActionCtx,
  members: GroupMember[],
  options: {
    daysAhead?: number;
    durationMinutes?: number;
    ignoreMissingCalendars?: boolean;
  },
): Promise<SharedAvailabilityResult> {
  const memberCount = members.length;
  const daysAhead = options.daysAhead ?? DEFAULT_DAYS_AHEAD;
  const durationMinutes = options.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const dateRange = buildPlanningDateRange(daysAhead);
  const preferenceStartHour = DEFAULT_PREFERENCE_START_HOUR;
  const preferenceEndHour = DEFAULT_PREFERENCE_END_HOUR;

  const memberUserIds = members.map((m) => m.userId);
  const [tokensBatch, acceptedPlansByMember] = await Promise.all([
    ctx.runQuery(internal.users_queries.getGoogleTokensBatch, {
      userIds: memberUserIds,
    }),
    Promise.all(
      memberUserIds.map((userId) =>
        ctx.runQuery(internal.event_polls_queries.getAcceptedPlansForUserInternal, {
          userId,
        }) as Promise<AcceptedHeatmapPlanRecord[]>,
      ),
    ),
  ]);

  const memberBusyResults = await Promise.all(
    tokensBatch.map(
      async (tokenInfo: {
        userId: Id<"users">;
        googleAccessToken?: string;
        googleRefreshToken?: string;
        googleTokenExpiry?: number;
      }) =>
        getBusyBlocksForUser(
          ctx,
          tokenInfo.userId,
          tokenInfo,
          dateRange,
        ),
    ),
  );

  const unavailableIndexes = memberBusyResults
    .map((result: UserBusyBlocksResult, index: number) => (result.busyBlocks === null ? index : -1))
    .filter((index: number) => index >= 0);

  if (unavailableIndexes.length > 0 && !options.ignoreMissingCalendars) {
    const unavailableLabels = unavailableIndexes.map(
      (index: number) => members[index]?.nickname ?? `Member ${index + 1}`,
    );
    const preview = unavailableLabels.slice(0, 3).join(", ");
    const remainingCount = unavailableLabels.length - 3;
    const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
    return {
      memberCount,
      dateRange,
      durationMinutes,
      memberBusyBlocks: [],
      sharedWindows: [],
      error:
        `Google Calendar is not connected or accessible for ${unavailableIndexes.length} ` +
        `member(s): ${preview}${suffix}. Ask everyone to reconnect Google Calendar and try again.`,
    };
  }

  // Playwright uses anonymous users, so there is no real Google Calendar OAuth
  // token to query. Keep external event providers real while allowing the E2E
  // caller to treat missing calendars as fully available.
  const busyBlocks = memberBusyResults
    .map((result: UserBusyBlocksResult, index: number) => {
      const acceptedPlanBusyBlocks = buildAcceptedPlanBusyBlocks(
        acceptedPlansByMember[index] ?? [],
        dateRange,
      );
      return mergeBusyBlocks([
        ...(result.busyBlocks ?? []),
        ...acceptedPlanBusyBlocks,
      ]);
    })
    .filter((blocks: BusyBlock[] | null): blocks is BusyBlock[] => blocks !== null);

  const preferences: AvailabilityPreferences = {
    startHour: preferenceStartHour,
    endHour: preferenceEndHour,
    includeWeekends: DEFAULT_INCLUDE_WEEKENDS,
  };
  const sharedWindows = computeSharedWindows(busyBlocks, dateRange, preferences, durationMinutes);

  return {
    memberCount,
    dateRange,
    durationMinutes,
    memberBusyBlocks: busyBlocks,
    sharedWindows,
  };
}

async function findAvailableEventsForMembers(
  ctx: ActionCtx,
  members: GroupMember[],
  options: FindAvailableEventsOptions,
): Promise<FindAvailableEventsResult> {
  const city = normalizeProviderCityLabel(options.city);
  const locationArea = options.locationArea?.trim();
  const durationMinutes = options.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const availability = await computeSharedAvailability(ctx, members, {
    daysAhead: options.daysAhead,
    durationMinutes,
    ignoreMissingCalendars: options.ignoreMissingCalendars,
  });
  const { memberCount, dateRange, memberBusyBlocks, sharedWindows, error } = availability;
  await ctx.runMutation(internal.events_mutations.deleteExpiredEvents, {});
  if (error) {
    return {
      memberCount,
      dateRange,
      durationMinutes,
      sharedWindows: [],
      totalEvents: 0,
      allEvents: [],
      availabilityFilteredEvents: [],
      filteredEvents: [],
      rankedFoodEvents: [],
      rankedActivityEvents: [],
      rankedEvents: [],
      learnedProfileSummary: [],
      rankingConfidence: {
        score: 0,
        verdict: "low",
        memberSupportRatio: 0,
        scoreGapNormalized: 0,
        negativeFree: true,
        topCategory: null,
      },
      allergenWarnings: "",
      locationAreaOptions: [],
      ...(city ? { searchLocation: city } : {}),
      error,
    };
  }

  if (!city) {
    return {
      memberCount,
      dateRange,
      durationMinutes,
      sharedWindows,
      totalEvents: 0,
      allEvents: [],
      availabilityFilteredEvents: [],
      filteredEvents: [],
      rankedFoodEvents: [],
      rankedActivityEvents: [],
      rankedEvents: [],
      learnedProfileSummary: [],
      rankingConfidence: {
        score: 0,
        verdict: "low",
        memberSupportRatio: 0,
        scoreGapNormalized: 0,
        negativeFree: true,
        topCategory: null,
      },
      allergenWarnings: "",
      locationAreaOptions: [],
      error:
        "No event-search location is saved for this group. Add a group location or save a city in your profile, then try again.",
    };
  }

  let referenceLocation: ReferenceLocation | undefined;
  let useDistanceRankingFlag = false;
  let hasMidpoint = false;
  let midpointLabel: string | null = null;

  if (options.chatId) {
    const chatRecord = await ctx.runQuery(internal.chats_queries.getChatInternal, {
      chatId: options.chatId,
    });

    useDistanceRankingFlag = chatRecord?.useDistanceRanking ?? false;
    midpointLabel = chatRecord?.midpointLabel?.trim() || null;
    if (
      useDistanceRankingFlag &&
      chatRecord?.midpointLatitude != null &&
      chatRecord?.midpointLongitude != null
    ) {
      referenceLocation = {
        latitude: chatRecord.midpointLatitude,
        longitude: chatRecord.midpointLongitude,
      };
      hasMidpoint = true;
    } else if (city) {
      referenceLocation = await resolveReferenceLocation(city);
    }
  }

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  const isoStart = formatISODateTime(startDate);
  const isoEnd = formatISODateTime(endDate);

  if (options.clearStoredInPlanningWindow) {
    await ctx.runMutation(internal.events_mutations.deleteEventsInDateRange, {
      startDate: dateRange.start,
      endDate: dateRange.end,
    });
  }

  // Shared city-normalisation used for both cache checks and pool building.
  const targetCity = city.split(",")[0]?.trim().toLowerCase();

  // Fetch non-ticket places for this chat. If the chat has no places of its own
  // (e.g. a new group in a city that already has a cached pool), fall back to the
  // city-wide pool so we never create per-group duplicate rows.
  let existingNonTicketPlaces = options.chatId
    ? await ctx.runQuery(internal.non_ticket_events_mutations.getNonTicketPlacesForChat, { chatId: options.chatId })
    : ([] as Awaited<ReturnType<typeof ctx.runQuery<typeof internal.non_ticket_events_mutations.getNonTicketPlacesForChat>>>);

  if (existingNonTicketPlaces.length === 0 && targetCity) {
    const cityVenueCity = city.split(",")[0]?.trim() ?? city.trim();
    const cityPlaces = await ctx.runQuery(
      internal.non_ticket_events_mutations.getExistingPlacesByCity,
      { venueCity: cityVenueCity },
    );
    if (cityPlaces.length > 0) {
      existingNonTicketPlaces = cityPlaces as typeof existingNonTicketPlaces;
    }
  }

  const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
  const MIN_CACHED_EVENTS = 5;
  // Regen calls always skip the external fetch — they re-rank from DB only.
  // Non-regen calls skip if timed events were recently cached (avoids re-tagging on every query).
  let skipFetch = false;
  if (options.isRegen && !options.clearStoredInPlanningWindow) {
    skipFetch = true;
  } else if (!options.clearStoredInPlanningWindow) {
    const existingTimedEvents = await ctx.runQuery(api.events_queries.getEventsByDateRange, {
      startDate: dateRange.start,
      endDate: dateRange.end,
    });
    const cityTimedEvents = existingTimedEvents.filter(
      (e) => e.venueCity?.trim().toLowerCase() === targetCity,
    );
    const latestTimedAt = cityTimedEvents.reduce(
      (max, e) => Math.max(max, (e as { createdAt?: number }).createdAt ?? 0), 0,
    );
    if (cityTimedEvents.length >= MIN_CACHED_EVENTS && Date.now() - latestTimedAt < CACHE_TTL_MS) {
      skipFetch = true;
    }
  }

  // Non-ticket places (Google Places) are populated exclusively by warmEventCacheForChat.
  // Queries only read from the existing pool — they never write new places.
  const skipGooglePlaces = true;

  const resolvedKeyword = options.keyword ??
    (options.venueTypeFilter === "activity" ? "things to do" : undefined);
  const venueNeighborhoodLookupCache = new Map<string, string | null>();
  const shouldUseMidpointFinalDistanceRanking =
    Boolean(referenceLocation && hasMidpoint && useDistanceRankingFlag && !locationArea);
  const midpointSearchArea =
    shouldUseMidpointFinalDistanceRanking &&
    midpointLabel &&
    !isSearchCityAlias(midpointLabel, city)
      ? midpointLabel
      : null;
  const baseEvents = skipFetch ? [] : await searchEvents({
    city,
    keyword: resolvedKeyword,
    foodKeyword: options.foodKeyword,
    startDateTime: isoStart,
    endDateTime: isoEnd,
    size: options.size ?? DEFAULT_EVENT_SEARCH_SIZE,
    skipProviders: skipGooglePlaces ? ["google_places"] : undefined,
  });
  const shouldFetchSelectedArea =
    !!locationArea &&
    !options.isRegen &&
    !isSearchCityAlias(locationArea, city);
  const areaEvents = shouldFetchSelectedArea ? await searchEvents({
    city: locationArea,
    keyword: resolvedKeyword,
    foodKeyword: options.foodKeyword,
    startDateTime: isoStart,
    endDateTime: isoEnd,
    size: options.size ?? DEFAULT_EVENT_SEARCH_SIZE,
    skipProviders: skipGooglePlaces ? ["google_places"] : undefined,
  }) : [];
  const midpointAreaEvents = midpointSearchArea && !skipFetch ? await searchEvents({
    city: midpointSearchArea,
    keyword: resolvedKeyword,
    foodKeyword: options.foodKeyword,
    startDateTime: isoStart,
    endDateTime: isoEnd,
    size: options.size ?? DEFAULT_EVENT_SEARCH_SIZE,
    skipProviders: skipGooglePlaces ? ["google_places"] : undefined,
  }) : [];
  const events = [...baseEvents, ...areaEvents, ...midpointAreaEvents];

  if (events.length > 0) {
    // Only store timed events (from Ticketmaster, Yelp) in the main events table.
    const timedEvents = await enrichMissingVenueNeighborhoods(
      events.filter((e) => e.source !== "google_places"),
      venueNeighborhoodLookupCache,
    );
    if (timedEvents.length > 0) {
      await ctx.runAction(
        internal.events_actions.storeAndTagEvents,
        { events: timedEvents.map(toStorableEvent) },
      );
    }
  }

  const storedEvents = await ctx.runQuery(api.events_queries.getEventsByDateRange, {
    startDate: dateRange.start,
    endDate: dateRange.end,
  });
  const cityEvents = storedEvents.filter((e) => {
    if (!e.venueCity) return false;
    return eventBelongsToSearchCity(e, city, locationArea ?? midpointSearchArea ?? undefined);
  });

  let normalizedEvents: NormalizedEvent[] = cityEvents.map((e) =>
    dbEventToNormalizedEvent(e),
  );
  const eventsBeforeNeighborhoodEnrichment = normalizedEvents;
  normalizedEvents = await enrichMissingVenueNeighborhoods(
    normalizedEvents,
    venueNeighborhoodLookupCache,
  );
  await Promise.all(
    normalizedEvents.map(async (event, index) => {
      if (
        !event.venueNeighborhood ||
        eventsBeforeNeighborhoodEnrichment[index]?.venueNeighborhood
      ) {
        return;
      }
      try {
        await ctx.runMutation(internal.events_mutations.updateEvent, {
          eventId: event.eventId,
          updates: { venueNeighborhood: event.venueNeighborhood },
        });
      } catch (err) {
        console.warn(
          "[availability] Failed to persist venue neighborhood:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }),
  );
  const baseTimedEvents = normalizedEvents;
  if (locationArea) {
    normalizedEvents = baseTimedEvents.filter((event) =>
      eventMatchesLocationArea(event, locationArea),
    );
  }

  // When Google Places was not skipped, upsert the new venues into non_ticket_events.
  let nonTicketPlacesForPool = existingNonTicketPlaces;
  if (!skipGooglePlaces) {
    const evergreenProviderEvents = events.filter(
      (e) => !e.startTime && e.source === "google_places",
    );

    if (evergreenProviderEvents.length > 0 && options.chatId) {
      const chatId = options.chatId;
      await Promise.all(
        evergreenProviderEvents
          .filter((e) => !targetCity || e.venueCity?.trim().toLowerCase() === targetCity)
          .map((e) =>
            ctx.runMutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
              placeId: e.eventId,
              source: e.source,
              title: e.title,
              description: e.description ?? undefined,
              venueName: e.venueName ?? undefined,
              venueCity: e.venueCity ?? undefined,
              venueNeighborhood: e.venueNeighborhood ?? undefined,
              venueCountry: e.venueCountry ?? undefined,
              url: e.url || undefined,
              venueType: e.venueType ?? "activity",
              openHours: e.openHours,
              latitude: e.latitude ?? undefined,
              longitude: e.longitude ?? undefined,
              formattedAddress: e.formattedAddress ?? undefined,
              googlePlaceId: e.googlePlaceId ?? undefined,
              tags: e.tags?.length ? (e.tags as import("./event_types").EventTag[]) : undefined,
              budgetBucket: e.budgetBucket ?? undefined,
              chatId,
            }),
          ),
      );

      const activityPlaceIds = evergreenProviderEvents
        .filter((e) => (e.venueType ?? "activity") === "activity")
        .map((e) => e.eventId);
      if (activityPlaceIds.length > 0) {
        await ctx.runAction(internal.non_ticket_events_actions.tagAndUpdateNonTicketPlaces, {
          chatId,
          placeIds: activityPlaceIds,
        });
      }

      // Re-fetch after upserts so the pool includes the newly added places.
      nonTicketPlacesForPool = await ctx.runQuery(
        internal.non_ticket_events_mutations.getNonTicketPlacesForChat,
        { chatId: options.chatId },
      );
    }
  }

  // Build evergreen events (Google Places venues) with virtual start times.
  // These are collected separately so they can bypass the busy-block filter:
  // a restaurant or bowling alley is always open on its own schedule — filtering
  // it out because its virtual start time falls inside a calendar block is wrong.
  const baseEvergreenNormalized: NormalizedEvent[] = [];
  const evergreenNormalized: NormalizedEvent[] = [];
  for (const place of nonTicketPlacesForPool) {
    if (targetCity && !eventBelongsToSearchCity(place, city, locationArea ?? midpointSearchArea ?? undefined)) continue;
    const virtualStartTime = assignVirtualStartTime(place.openHours ?? [], sharedWindows);
    if (!virtualStartTime) continue;
    const normalizedPlace: NormalizedEvent = {
      eventId: place.placeId,
      title: place.title,
      description: place.description ?? null,
      startTime: virtualStartTime,
      venueName: place.venueName ?? null,
      venueCity: place.venueCity ?? null,
      venueNeighborhood: place.venueNeighborhood ?? null,
      venueCountry: place.venueCountry ?? null,
      source: place.source,
      url: place.url ?? "",
      image: null,
      tags: place.venueType === "food"
        ? (place.tags as import("./event_types").FoodTag[] | undefined ?? [])
        : normalizeEventTags(place.tags),
      status: null,
      budgetBucket: place.budgetBucket ?? null,
      genre: (place.tags as string[] | undefined)?.[0] ?? null,
      venueType: place.venueType,
      openHours: place.openHours,
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
      formattedAddress: place.formattedAddress ?? null,
      googlePlaceId: place.googlePlaceId ?? null,
    };
    baseEvergreenNormalized.push(normalizedPlace);
    if (!locationArea || eventMatchesLocationArea(normalizedPlace, locationArea)) {
      evergreenNormalized.push(normalizedPlace);
    }
  }

  const groupMemberUserIds = members.map((m) => m.userId);
  // Run all independent per-member and group reads in parallel.
  const [memberPrefs, groupProfile, memberRestrictions] = await Promise.all([
    // #1: per-member prefs
    Promise.all(
      members.map(async (m) => {
        const [prefs, displayName] = await Promise.all([
          ctx.runQuery(internal.user_preferences_queries.getEventPreferencesForUserId, { userId: m.userId }),
          ctx.runQuery(internal.users_queries.getDisplayNameForUserId, { userId: m.userId }),
        ]);
        const name = displayName?.trim().split(/\s+/)[0] ?? "Member";
        return {
          name,
          preferredEventTypes: prefs?.preferredEventTypes ?? [],
          negativeEventTypes: prefs?.negativeEventTypes ?? [],
          cuisinePreferences: prefs?.cuisinePreferences ?? [],
          dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
          allergies: prefs?.allergies ?? [],
          personSpecificLikes: prefs?.personSpecificLikes ?? {},
          personSpecificDislikes: prefs?.personSpecificDislikes ?? {},
        } satisfies MemberPreference;
      }),
    ),
    // #2: group preference profile
    options.chatId
      ? ctx.runQuery(internal.group_preferences_queries.getGroupPreferenceProfileForChatId, { chatId: options.chatId })
      : Promise.resolve(null),
    // #3: per-member hard restrictions
    Promise.all(
      members.map((m) =>
        ctx.runQuery(internal.user_hard_restrictions_queries.getHardRestrictionsForUserId, { userId: m.userId }),
      ),
    ),
  ]);

  const groupRestrictions = computeGroupHardRestrictions(memberRestrictions);

  // Deduplicate timed events and apply the busy-block filter to them only.
  // Evergreen venues (Google Places) are merged back in after filtering — they
  // always appear regardless of calendar blocks since they have no fixed start time.
  const deduplicatedTimed = deduplicateCandidateEvents(normalizedEvents);
  const availableTimedEvents = filterEventsByBusyBlocks(deduplicatedTimed, memberBusyBlocks);
  const deduplicatedEvergreen = deduplicateCandidateEvents(evergreenNormalized);
  const availableEvents = [...availableTimedEvents, ...deduplicatedEvergreen];

  // Hard restrictions always use referenceLocation for distance filtering
  const filteredEvents = applyHardRestrictions(availableEvents, groupRestrictions, durationMinutes, referenceLocation);
  const explainedFilteredEvents: RecommendedEvent[] = filteredEvents.map((event) => ({
    ...event,
    fitReasons: fitReasonsForEvent(event, groupProfile),
  }));
  const learnedProfileSummary = learnedProfileSummaryForRecommendations(groupProfile);

  const foodFilteredEvents = explainedFilteredEvents.filter((e) => e.venueType === "food");
  const activityFilteredEvents = explainedFilteredEvents.filter((e) => e.venueType !== "food");

  // Neighborhood-specific views hard-filter to the selected area and skip distance ordering.
  // The base "All" view may use the regular soft distance score, or the midpoint-only
  // final distance pass below when the nearby toggle and a valid midpoint are both set.
  const rankingRefLocation =
    !locationArea && !shouldUseMidpointFinalDistanceRanking && (useDistanceRankingFlag || hasMidpoint)
      ? referenceLocation
      : undefined;

  const preferenceRankedFoodEvents = rankEventsForGroup(
    foodFilteredEvents,
    memberPrefs,
    groupProfile,
    groupMemberUserIds,
    options.keyword,
    rankingRefLocation,
  );

  const preferenceRankedActivityEvents = rankEventsForGroup(
    activityFilteredEvents,
    memberPrefs,
    groupProfile,
    groupMemberUserIds,
    options.keyword,
    rankingRefLocation,
  );

  const rankedFoodEvents =
    shouldUseMidpointFinalDistanceRanking && referenceLocation
      ? applyFinalDistanceRanking(preferenceRankedFoodEvents, referenceLocation)
      : preferenceRankedFoodEvents;

  const rankedActivityEvents =
    shouldUseMidpointFinalDistanceRanking && referenceLocation
      ? applyFinalDistanceRanking(preferenceRankedActivityEvents, referenceLocation)
      : preferenceRankedActivityEvents;

  // Top-3 combined list for backward compat and mixed recommendation displays.
  const top3Food = rankedFoodEvents.slice(0, 3);
  const top3Activity = rankedActivityEvents.slice(0, 3);
  const rankedEvents =
    shouldUseMidpointFinalDistanceRanking && referenceLocation
      ? applyFinalDistanceRanking(
          rankEventsForGroup(
            explainedFilteredEvents,
            memberPrefs,
            groupProfile,
            groupMemberUserIds,
            options.keyword,
            undefined,
          ),
          referenceLocation,
        ).slice(0, 3)
      : [...top3Food, ...top3Activity].slice(0, 3);
  const confidenceEvents = options.venueTypeFilter === "food"
    ? top3Food
    : options.venueTypeFilter === "activity"
      ? top3Activity
      : rankedEvents;

  const rankingConfidence = computeRankingConfidence(
    confidenceEvents,
    memberPrefs,
    groupProfile,
    groupMemberUserIds,
    options.keyword,
    rankingRefLocation,
  );

  // Snapshot creation removed — group preference profile is now updated directly
  // from event tags in non_ticket_events/events tables when feedback is submitted.

  const allergenWarnings = buildAllergenWarningText(top3Food, memberPrefs);

  const allDeduplicatedEvents = [...deduplicatedTimed, ...deduplicatedEvergreen];
  const baseLocationAreaEvents = deduplicateCandidateEvents([
    ...baseTimedEvents,
    ...baseEvergreenNormalized,
  ]);
  const locationAreaOptions = await buildLocationAreaOptions(city, baseLocationAreaEvents);

  return {
    memberCount,
    dateRange,
    durationMinutes,
    sharedWindows,
    totalEvents: allDeduplicatedEvents.length,
    allEvents: allDeduplicatedEvents,
    availabilityFilteredEvents: availableEvents,
    filteredEvents: explainedFilteredEvents,
    rankedFoodEvents,
    rankedActivityEvents,
    rankedEvents,
    learnedProfileSummary,
    rankingConfidence,
    allergenWarnings,
    locationAreaOptions,
    searchLocation: city,
  };
}

export const getSharedAvailabilityForChatInternal = internalAction({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    durationMinutes: v.optional(v.number()),
    daysAhead: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<SharedAvailabilityResult> => {
    const ownership = await ctx.runQuery(internal.messages_internals.verifyChatOwnership, {
      chatId: args.chatId,
      userId: args.userId,
    });
    if (!ownership.ok) {
      throw new Error(ownership.error ?? "Forbidden");
    }

    const members = await ctx.runQuery(internal.chats_queries.getMembersInternal, {
      chatId: args.chatId,
    });

    return computeSharedAvailability(ctx as ActionCtx, members, {
      daysAhead: args.daysAhead,
      durationMinutes: args.durationMinutes,
    });
  },
});

export const findAvailableEventsForChatInternal = internalAction({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    city: v.optional(v.string()),
    locationArea: v.optional(v.string()),
    keyword: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    daysAhead: v.optional(v.number()),
    size: v.optional(v.number()),
    clearStoredInPlanningWindow: v.optional(v.boolean()),
    isRegen: v.optional(v.boolean()),
    ignoreMissingCalendars: v.optional(v.boolean()),
    venueTypeFilter: v.optional(v.union(v.literal("food"), v.literal("activity"))),
  },
  returns: v.object({
    memberCount: v.number(),
    dateRange: v.object({ start: v.string(), end: v.string() }),
    durationMinutes: v.number(),
    sharedWindows: v.array(v.any()), // AvailabilityWindow type
    totalEvents: v.number(),
    allEvents: v.array(v.any()), // NormalizedEvent type
    availabilityFilteredEvents: v.array(v.any()), // NormalizedEvent type
    filteredEvents: v.array(v.any()), // RecommendedEvent type
    rankedFoodEvents: v.array(v.any()), // RecommendedEvent type
    rankedActivityEvents: v.array(v.any()), // RecommendedEvent type
    rankedEvents: v.array(v.any()), // RecommendedEvent type (backward compat)
    learnedProfileSummary: v.array(v.string()),
    rankingConfidence: v.any(),
    allergenWarnings: v.string(),
    locationAreaOptions: v.array(v.string()),
    searchLocation: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<FindAvailableEventsResult> => {
    const ownership = await ctx.runQuery(internal.messages_internals.verifyChatOwnership, {
      chatId: args.chatId,
      userId: args.userId,
    });
    if (!ownership.ok) {
      throw new Error(ownership.error ?? "Forbidden");
    }

    const [members, city] = await Promise.all([
      ctx.runQuery(internal.chats_queries.getMembersInternal, {
        chatId: args.chatId,
      }),
      resolveEventSearchCity(ctx as ActionCtx, args.chatId, args.userId, args.city),
    ]);

    // Derive a cuisine-specific food keyword for Google Places when no explicit
    // keyword is provided and we are NOT searching for activity venues.
    // Aggregate all members' cuisine preferences and pick the most-preferred cuisine
    // so the food keyword reflects the full group, not just the querying user.
    let foodKeyword: string | undefined;
    if (args.venueTypeFilter !== "activity" && !args.keyword) {
      const allMemberPrefs = await Promise.all(
        members.map((m) =>
          ctx.runQuery(internal.user_preferences_queries.getEventPreferencesForUserId, {
            userId: m.userId,
          }),
        ),
      );
      const cuisineCounts = new Map<string, number>();
      for (const prefs of allMemberPrefs) {
        for (const cuisine of prefs?.cuisinePreferences ?? []) {
          cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) ?? 0) + 1);
        }
      }
      const topCuisine = [...cuisineCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topCuisine) {
        foodKeyword = `${topCuisine} restaurants`;
      }
    }

    const result = await findAvailableEventsForMembers(ctx as ActionCtx, members, {
      chatId: args.chatId,
      currentUserId: args.userId,
      city,
      locationArea: args.locationArea,
      keyword: args.keyword,
      foodKeyword,
      daysAhead: args.daysAhead,
      durationMinutes: args.durationMinutes,
      size: args.size,
      clearStoredInPlanningWindow: args.clearStoredInPlanningWindow,
      isRegen: args.isRegen,
      ignoreMissingCalendars: args.ignoreMissingCalendars,
      venueTypeFilter: args.venueTypeFilter,
    });

    if (result.rankedFoodEvents.length > 0 || result.rankedActivityEvents.length > 0) {
      await ctx.runAction(internal.email_notifications.sendNewRecommendationsEmails, {
        chatId: args.chatId,
      });
    }

    return result;
  },
});

/**
 * Background event cache warm-up triggered immediately after a group chat is
 * created with a planningLocation.
 *
 * Fetches events from all providers (Ticketmaster, Yelp, Google Places) for
 * the group's city and stores them with AI tagging before the first chat
 * message is sent. This moves the cold-start AI tagging cost (~3-7s per
 * provider event) off the first-query critical path.
 *
 * Performance choices:
 *  - Double the default search window (14 days) to maximise cache fill.
 *  - Double the default fetch size (40 events) so more events are pre-tagged.
 *  - Timed events (Ticketmaster/Yelp) are tagged via storeAndTagEvents which
 *    runs all AI calls in parallel (Promise.all internally).
 *  - Google Places upserts also run in parallel.
 *  - Both operations run concurrently via Promise.all at the top level so
 *    neither waits for the other.
 *  - Already-tagged events are skipped by storeAndTagEvents (idempotent).
 *  - Failures are swallowed — the warm-up is best-effort; the first real
 *    query degrades gracefully to the current synchronous path.
 */
export const warmEventCacheForChat = internalAction({
  args: {
    chatId: v.id("chats"),
    city: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, { chatId, city, userId }) => {
    city = normalizeProviderCityLabel(city) ?? city.trim();
    // Skip if this chat's venue pool has already reached the hard cap.
    // On cron refresh this keeps the count bounded at MAX_NON_TICKET_PLACES.
    const existingPlaces = await ctx.runQuery(
      internal.non_ticket_events_mutations.getNonTicketPlacesForChat,
      { chatId },
    );
    if (existingPlaces.length >= MAX_NON_TICKET_PLACES) {
      return;
    }

    // Mark warm cache as in-progress so queries skip their own Google fetch.
    await ctx.runMutation(internal.chats_mutations.setVenueCacheReady, { chatId, ready: false })
      .catch((err: unknown) => {
        console.warn("[warm-cache] setVenueCacheReady(false) failed:", err instanceof Error ? err.message : String(err));
      });

    // If another group in the same city already has enough places, copy them to this
    // chatId instead of re-fetching from Google Places. Avoids duplicate API calls
    // and redundant entries when multiple groups share a city.
    const venueCity = city.split(",")[0]?.trim() ?? city.trim();
    const existingCityPlaces = await ctx.runQuery(
      internal.non_ticket_events_mutations.getExistingPlacesByCity,
      { venueCity },
    );
    if (existingCityPlaces.length >= 30) {
      // City already has enough places — mark ready without copying rows.
      // Queries will fall back to the city-wide pool automatically.
      await ctx.runMutation(internal.chats_mutations.setVenueCacheReady, { chatId, ready: true })
        .catch(() => {});
      if (userId) {
        await ctx.runMutation(internal.messages_internals.insertAssistantMessage, {
          chatId,
          userId,
          content: `All set! Venues in ${venueCity} are already cached — your first event search is ready.`,
        }).catch(() => {});
      }
      return;
    }

    // Notify the group that venue fetching is in progress.
    if (userId) {
      await ctx.runMutation(internal.messages_internals.insertAssistantMessage, {
        chatId,
        userId,
        content: `Getting everything ready! I'm fetching and tagging venues in ${city} for your group. This usually takes about 30–60 seconds — your first event search will be much faster once I'm done.`,
      }).catch((err: unknown) => {
        console.warn("[warm-cache] insertAssistantMessage failed:", err instanceof Error ? err.message : String(err));
      });
    }

    const WARM_DAYS_AHEAD = DEFAULT_DAYS_AHEAD * 2; // 14 days

    const dateRange = buildPlanningDateRange(WARM_DAYS_AHEAD);
    const isoStart = formatISODateTime(new Date(dateRange.start));
    const isoEnd = formatISODateTime(new Date(dateRange.end));

    // 6 targeted Google Places keyword calls in parallel.
    // restaurant1 + restaurant2 → target 30 restaurants
    // cafes         → target 10 cafes
    // bars          → target 15 bars/wine/nightlife
    // activity1 + activity2 → target 15 other activities
    const WARM_KEYWORDS = [
      "restaurants",
      "steakhouse seafood pizza burgers",
      "cafes coffee bakeries",
      "bars wine clubs nightlife",
      "things to do activities",
      "museums parks entertainment",
    ];

    const [timedResults, ...googleResultSets] = await Promise.all([
      searchEvents({
        city,
        keyword: undefined,
        startDateTime: isoStart,
        endDateTime: isoEnd,
        size: 100,
        skipProviders: ["google_places"],
      }).catch((err: unknown) => {
        console.warn("[warm-cache] TM/Yelp fetch failed:", err instanceof Error ? err.message : String(err));
        return [] as NormalizedEvent[];
      }),
      ...WARM_KEYWORDS.map((kw) =>
        searchEvents({
          city,
          keyword: kw,
          startDateTime: isoStart,
          endDateTime: isoEnd,
          size: 20,
          skipProviders: ["ticketmaster", "yelp"],
        }).catch((err: unknown) => {
          console.warn(`[warm-cache] Google Places "${kw}" failed:`, err instanceof Error ? err.message : String(err));
          return [] as NormalizedEvent[];
        }),
      ),
    ]);

    const targetCity = city.split(",")[0]?.trim().toLowerCase();

    const allGoogleRaw = googleResultSets.flat().filter(
      (e) => e.source === "google_places" && !e.startTime &&
        (!targetCity || e.venueCity?.trim().toLowerCase() === targetCity),
    );
    const allDeduped = deduplicateCandidateEvents(allGoogleRaw);

    const CAFE_TAGS = new Set(["Coffee", "Bakery", "Ice Cream", "Dessert", "Brunch"]);
    const BAR_GENRES = new Set(["Bar", "Night Club", "Brewery", "Brewpub", "Beer Garden", "Wine Bar"]);
    const BAR_TAGS = new Set(["Drinking", "Night Life", "Wine Tasting"]);
    const isBar = (e: NormalizedEvent) =>
      (!!e.genre && BAR_GENRES.has(e.genre)) ||
      (e.tags?.some((t) => BAR_TAGS.has(t as string)) ?? false);
    const isCafe = (e: NormalizedEvent) =>
      e.venueType === "food" && (e.tags?.some((t) => CAFE_TAGS.has(t as string)) ?? false);

    const restaurants = allDeduped.filter((e) => e.venueType === "food" && !isCafe(e)).slice(0, 30);
    const restaurantIds = new Set(restaurants.map((e) => e.eventId));
    const cafes = allDeduped.filter((e) => isCafe(e) && !restaurantIds.has(e.eventId)).slice(0, 10);
    const bars = allDeduped.filter((e) => e.venueType === "activity" && isBar(e)).slice(0, 15);
    const barIds = new Set(bars.map((e) => e.eventId));
    const otherActivity = allDeduped.filter((e) => e.venueType === "activity" && !isBar(e) && !barIds.has(e.eventId)).slice(0, 15);

    const evergreenEvents = [...restaurants, ...cafes, ...bars, ...otherActivity];

    // Timed events (Ticketmaster, Yelp) — AI-tag and store
    const timedEvents = timedResults.filter((e) => e.startTime);

    // Run both storage paths concurrently — neither depends on the other
    await Promise.all([
      timedEvents.length > 0
        ? ctx.runAction(internal.events_actions.storeAndTagEvents, {
            events: timedEvents.map(toStorableEvent),
          }).catch((err: unknown) => {
            console.warn("[warm-cache] storeAndTagEvents failed:", err instanceof Error ? err.message : String(err));
          })
        : Promise.resolve(),

      evergreenEvents.length > 0
        ? Promise.all(
            evergreenEvents.map((e) =>
              ctx.runMutation(internal.non_ticket_events_mutations.upsertNonTicketPlace, {
                placeId: e.eventId,
                source: e.source,
                title: e.title,
                description: e.description ?? undefined,
                venueName: e.venueName ?? undefined,
                venueCity: e.venueCity ?? undefined,
                venueNeighborhood: e.venueNeighborhood ?? undefined,
                venueCountry: e.venueCountry ?? undefined,
                url: e.url || undefined,
                venueType: e.venueType ?? "activity",
                openHours: e.openHours,
                latitude: e.latitude ?? undefined,
                longitude: e.longitude ?? undefined,
                formattedAddress: e.formattedAddress ?? undefined,
                googlePlaceId: e.googlePlaceId ?? undefined,
                tags: e.tags?.length ? (e.tags as import("./event_types").EventTag[]) : undefined,
                budgetBucket: e.budgetBucket ?? undefined,
                chatId,
              }).catch((err: unknown) => {
                console.warn("[warm-cache] upsertNonTicketPlace failed for", e.eventId, ":", err instanceof Error ? err.message : String(err));
              }),
            ),
          ).then(async () => {
            const activityPlaceIds = evergreenEvents
              .filter((e) => (e.venueType ?? "activity") === "activity")
              .map((e) => e.eventId);
            if (activityPlaceIds.length === 0) return;
            // Tag synchronously with up to 3 passes so every activity venue has
            // exhausted its retry budget before the first query runs.
            for (let pass = 0; pass < 3; pass++) {
              await ctx.runAction(internal.non_ticket_events_actions.tagAndUpdateNonTicketPlaces, {
                chatId,
                placeIds: activityPlaceIds,
              }).catch((err: unknown) => {
                console.warn(`[warm-cache] tagging pass ${pass + 1} failed:`, err instanceof Error ? err.message : String(err));
              });
            }
          })
        : Promise.resolve(),
    ]);

    // Notify the group that venue pre-loading is complete.
    await ctx.runMutation(internal.chats_mutations.setVenueCacheReady, { chatId, ready: true })
      .catch((err: unknown) => {
        console.warn("[warm-cache] setVenueCacheReady(true) failed:", err instanceof Error ? err.message : String(err));
      });

    if (userId) {
      await ctx.runMutation(internal.messages_internals.insertAssistantMessage, {
        chatId,
        userId,
        content: `All done! I've finished loading venues in ${city}. Your first event search will be fast now.`,
      }).catch((err: unknown) => {
        console.warn("[warm-cache] done insertAssistantMessage failed:", err instanceof Error ? err.message : String(err));
      });
    }
  },
});

interface HeatmapMemberAvailability {
  userId: string;
  name: string;
  busyBlocks: BusyBlock[];
  connected: boolean;
}

interface AcceptedHeatmapPlan {
  pollId: Id<"event_polls">;
  chatId: Id<"chats">;
  chatTitle: string;
  chatIcon: string | null;
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  venueName: string | null;
  venueCity: string | null;
  source: string;
  url: string;
  resolvedAt: number;
}

interface AcceptedHeatmapPlanRecord {
  pollId: Id<"event_polls">;
  chatId: Id<"chats">;
  chatTitle: string;
  chatIcon: string | null;
  eventId: string;
  title: string;
  startTime: string;
  venueName: string | null;
  venueCity: string | null;
  source: string;
  url: string;
  resolvedAt: number;
}

interface GoingRSVPEvent {
  eventId: string;
  chatId: string;
  title: string;
  startTime: string;
  endTime: string;
  source: string;
  goingUserIds: string[];
}

interface HeatmapAvailabilityResult {
  memberCount: number;
  dateRange: { start: string; end: string };
  members: HeatmapMemberAvailability[];
  acceptedPlans: AcceptedHeatmapPlan[];
  goingRSVPEvents: GoingRSVPEvent[];
  error?: string;
}

function buildAcceptedPlanBusyBlocks(
  acceptedPlans: AcceptedHeatmapPlanRecord[],
  dateRange: { start: string; end: string },
): BusyBlock[] {
  const rangeStart = new Date(dateRange.start).getTime();
  const rangeEnd = new Date(dateRange.end).getTime();

  return acceptedPlans.flatMap((plan) => {
    const startTime = new Date(plan.startTime).getTime();
    const endTime = addDurationMinutes(plan.startTime, DEFAULT_DURATION_MINUTES);
    const endMs = endTime ? new Date(endTime).getTime() : Number.NaN;
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endMs) ||
      endMs <= rangeStart ||
      startTime >= rangeEnd
    ) {
      return [];
    }
    if (!endTime) {
      return [];
    }
    return [{ start: plan.startTime, end: endTime }];
  });
}

function addDurationMinutes(startTime: string, durationMinutes: number): string | null {
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start)) {
    return null;
  }
  return new Date(start + durationMinutes * 60 * 1000).toISOString();
}

export const getHeatmapAvailability = actionWithAuth({
  args: {
    chatId: v.id("chats"),
    daysAhead: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<HeatmapAvailabilityResult> => {
    const daysAhead = args.daysAhead ?? DEFAULT_DAYS_AHEAD;
    const now = new Date();
    const dateRange = buildPlanningDateRange(daysAhead);
    const endDate = new Date(dateRange.end);

    const [chat, userName, tokensBatch, acceptedPlanRecords, rawGoingRSVPs] = await Promise.all([
      ctx.runQuery(api.chats_queries.getOne, {
        chatId: args.chatId,
      }),
      ctx.runQuery(internal.users_queries.getDisplayNameForUserId, {
        userId: ctx.userId,
      }),
      ctx.runQuery(internal.users_queries.getGoogleTokensBatch, {
        userIds: [ctx.userId],
      }),
      ctx.runQuery(internal.event_polls_queries.getAcceptedPlansForUserInternal, {
        userId: ctx.userId,
      }) as Promise<AcceptedHeatmapPlanRecord[]>,
      ctx.runQuery(internal.rsvp_queries.getGoingRSVPEventsForViewerInternal, {
        userId: ctx.userId,
      }) as Promise<GoingRSVPEvent[]>,
    ]);

    if (!chat) {
      throw new Error("Chat not found");
    }

    const acceptedPlans = acceptedPlanRecords.flatMap((plan) => {
      const startTime = new Date(plan.startTime).getTime();
      const endTime = addDurationMinutes(plan.startTime, DEFAULT_DURATION_MINUTES);
      if (
        !Number.isFinite(startTime) ||
        endTime === null ||
        startTime < now.getTime() ||
        startTime > endDate.getTime()
      ) {
        return [];
      }
      return [{ ...plan, endTime }];
    });

    const acceptedPlanBusyBlocks = buildAcceptedPlanBusyBlocks(
      acceptedPlanRecords,
      dateRange,
    );

    const goingRSVPEvents = rawGoingRSVPs.filter((evt) => {
      const startMs = new Date(evt.startTime).getTime();
      return Number.isFinite(startMs) && startMs >= now.getTime() && startMs <= endDate.getTime();
    });
    const goingRSVPBusyBlocks: BusyBlock[] = goingRSVPEvents.map((evt) => ({
      start: evt.startTime,
      end: evt.endTime,
    }));

    const [tokenInfo] = tokensBatch;
    const busyResult = tokenInfo
      ? await getBusyBlocksForUser(ctx as ActionCtx, ctx.userId, tokenInfo, dateRange)
      : { busyBlocks: null, reason: "missing_token_record" as const };
    const name = userName?.trim().split(/\s+/)[0] ?? "You";
    const heatmapMembers: HeatmapMemberAvailability[] = [
      {
        userId: ctx.userId,
        name,
        busyBlocks: mergeBusyBlocks([
          ...(busyResult.busyBlocks ?? []),
          ...acceptedPlanBusyBlocks,
          ...goingRSVPBusyBlocks,
        ]),
        connected: busyResult.busyBlocks !== null,
      },
    ];

    return {
      memberCount: 1,
      dateRange,
      members: heatmapMembers,
      acceptedPlans,
      goingRSVPEvents,
      error:
        !heatmapMembers[0].connected
          ? `Calendar not connected for: ${name}`
          : undefined,
    };
  },
});

export const findAvailableEvents = actionWithAuth({
  args: {
    chatId: v.id("chats"),
    city: v.optional(v.string()),
    locationArea: v.optional(v.string()),
    keyword: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    daysAhead: v.optional(v.number()),
    size: v.optional(v.number()),
    clearStoredInPlanningWindow: v.optional(v.boolean()),
    isRegen: v.optional(v.boolean()),
    ignoreMissingCalendars: v.optional(v.boolean()),
    venueTypeFilter: v.optional(v.union(v.literal("food"), v.literal("activity"))),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<FindAvailableEventsResult> => {
    const [members, city] = await Promise.all([
      ctx.runQuery(api.chats_queries.getMembers, {
        chatId: args.chatId,
      }),
      resolveEventSearchCity(ctx as ActionCtx, args.chatId, ctx.userId, args.city),
    ]);
    return findAvailableEventsForMembers(ctx as ActionCtx, members, {
      chatId: args.chatId,
      currentUserId: ctx.userId,
      city,
      locationArea: args.locationArea,
      keyword: args.keyword,
      daysAhead: args.daysAhead,
      durationMinutes: args.durationMinutes,
      size: args.size,
      clearStoredInPlanningWindow: args.clearStoredInPlanningWindow,
      isRegen: args.isRegen,
      ignoreMissingCalendars: args.ignoreMissingCalendars,
      venueTypeFilter: args.venueTypeFilter,
    });
  },
});

function formatISODateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function positiveCategoryScore(
  signal: GroupPreferenceProfileSummary["categorySignals"][number],
): number {
  return signal.acceptCount + signal.moreLikeThisCount - signal.rejectCount;
}

function negativeCategoryScore(
  signal: GroupPreferenceProfileSummary["categorySignals"][number],
): number {
  return signal.rejectCount - (signal.acceptCount + signal.moreLikeThisCount);
}

function learnedProfileSummaryForRecommendations(
  groupProfile: GroupPreferenceProfileSummary | null,
): string[] {
  if (!groupProfile || groupProfile.feedbackCount === 0) {
    return [];
  }

  const summary: string[] = [];
  const strongestPositive = [...groupProfile.categorySignals]
    .map((signal) => ({ signal, score: positiveCategoryScore(signal) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.signal.category.localeCompare(right.signal.category))[0]
    ?.signal;
  const strongestNegative = [...groupProfile.categorySignals]
    .map((signal) => ({ signal, score: negativeCategoryScore(signal) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.signal.category.localeCompare(right.signal.category))[0]
    ?.signal;

  if (strongestPositive) {
    summary.push(`The group has responded most positively to ${strongestPositive.category} events.`);
  }

  if (strongestNegative) {
    summary.push(
      `The group has rejected ${strongestNegative.category} events more often than accepted them.`,
    );
  }

  if (groupProfile.budgetPreference !== "unknown") {
    const budgetLabel =
      groupProfile.budgetPreference === "low"
        ? "lower-budget"
        : groupProfile.budgetPreference === "high"
          ? "higher-budget"
          : groupProfile.budgetPreference;
    summary.push(`The group shows a learned ${budgetLabel} preference.`);
  }

  return summary;
}

function fitReasonsForEvent(
  event: NormalizedEvent,
  groupProfile: GroupPreferenceProfileSummary | null,
): string[] {
  if (!groupProfile) {
    return [];
  }

  const tags = inferEventTags(event);
  const allLabels = tags.map((t) => t.toLowerCase());
  if (allLabels.length === 0) return [];

  const matchingSignal = groupProfile.categorySignals
    .filter((s) => allLabels.includes(s.category.toLowerCase()))
    .map((s) => ({ signal: s, score: s.acceptCount + s.moreLikeThisCount - s.rejectCount }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!matchingSignal) return [];

  return [`Matches the group's positive history with ${matchingSignal.signal.category} events.`];
}

export const refreshEventCacheForAllGroups = internalAction({
  args: {},
  handler: async (ctx) => {
    const chats = await ctx.runQuery(
      internal.chats_queries.getChatsWithPlanningLocationInternal,
    );
    if (chats.length === 0) return;
    await Promise.all(
      chats.map((chat) =>
        ctx.runAction(internal.availability_action.warmEventCacheForChat, {
          chatId: chat._id,
          city: chat.planningLocation,
        }).catch((err: unknown) => {
          console.warn("[cron-refresh] failed for", chat._id, ":", err instanceof Error ? err.message : String(err));
        }),
      ),
    );
  },
});
