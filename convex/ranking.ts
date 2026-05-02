import type { BudgetBucket, NormalizedEvent, EventTag } from "./event_types";

const CUSTOM_TAG_BOOST = 1000;

/**
 * Fine-grained patterns for each EventTag value, used as a fallback when an
 * event has no pre-assigned tags (e.g. untagged Ticketmaster events).
 * When the event already has tags from the AI classifier, those take priority.
 * A single event can match multiple TAG_PATTERNS (e.g. a Rock Concert → ["Concert", "Rock"]).
 */
export const TAG_PATTERNS: Array<{ tag: EventTag; patterns: RegExp[] }> = [
  { tag: "Concert", patterns: [/\bconcert\b/, /\blive music\b/, /\btour\b/, /\bband\b/] },
  { tag: "Movie", patterns: [/\bmovie\b/, /\bfilm\b/, /\bcinema\b/, /\bscreening\b/] },
  { tag: "Basketball", patterns: [/\bbasketball\b/, /\bnba\b/] },
  { tag: "Baseball", patterns: [/\bbaseball\b/, /\bmlb\b/] },
  { tag: "Hockey", patterns: [/\bhockey\b/, /\bnhl\b/] },
  { tag: "Cheerleading", patterns: [/\bcheerleading\b/, /\bcheer\b/] },
  { tag: "Rap", patterns: [/\brap\b/, /\bhip.?hop\b/] },
  { tag: "Pop", patterns: [/\bpop\b/] },
  { tag: "Country", patterns: [/\bcountry\b/] },
  { tag: "R&B", patterns: [/\br&b\b/, /\brhythm.?and.?blues\b/] },
  { tag: "Alternative", patterns: [/\balternative\b/, /\balt.?rock\b/] },
  { tag: "Indie", patterns: [/\bindie\b/] },
  { tag: "Rock", patterns: [/\brock\b/] },
  { tag: "Comedy Night", patterns: [/\bcomedy\b/, /\bstand.?up\b/, /\bcomedian\b/] },
  { tag: "Theater", patterns: [/\btheater\b/, /\btheatre\b/, /\bbroadway\b/, /\bmusical\b/] },
  { tag: "Art", patterns: [/\bexhibit\b/, /\bgallery\b/, /\bart show\b/] },
  { tag: "Orchestra", patterns: [/\borchestra\b/, /\bsymphony\b/] },
  { tag: "Golf", patterns: [/\bgolf\b/] },
  { tag: "Charity", patterns: [/\bcharity\b/, /\bfundraiser\b/, /\bbenefit\b/, /\bgala\b/, /\bdonation\b/] },
  { tag: "Mini Golf", patterns: [/\bmini.?golf\b/, /\bputt.?putt\b/] },
  { tag: "Escape Room", patterns: [/\bescape room\b/] },
  { tag: "Trivia", patterns: [/\btrivia\b/, /\bquiz night\b/] },
  { tag: "Festival", patterns: [/\bfestival\b/] },
  { tag: "Hiking", patterns: [/\bhiking\b/, /\bhike\b/, /\btrail\b/] },
  { tag: "Swimming", patterns: [/\bswimming\b/, /\bswim\b/] },
  { tag: "Camping", patterns: [/\bcamping\b/, /\bcamp\b/] },
  { tag: "Cooking", patterns: [/\bcooking\b/, /\bculinary\b/, /\bchef\b/] },
  { tag: "Wine Tasting", patterns: [/\bwine tasting\b/, /\bwinery\b/] },
  { tag: "Bowling", patterns: [/\bbowling\b/] },
  { tag: "Soccer", patterns: [/\bsoccer\b/, /\bmls\b/, /\bfifa\b/] },
  { tag: "Other Sports", patterns: [/\bvs\b/, /\bgame\b/, /\bmatch\b/, /\bfootball\b/, /\btennis\b/, /\blacrosse\b/, /\bsports\b/] },
  { tag: "Pottery", patterns: [/\bpottery\b/, /\bceramics\b/] },
  { tag: "Reading", patterns: [/\breading\b/, /\bbook club\b/] },
  { tag: "Night Life", patterns: [/\bnight.?life\b/, /\blounge\b/] },
  { tag: "Cycling", patterns: [/\bcycling\b/, /\bcyclist\b/, /\bbicycle\b/] },
  { tag: "Yoga", patterns: [/\byoga\b/] },
  { tag: "CrossFit", patterns: [/\bcrossfit\b/] },
  { tag: "Board Games", patterns: [/\bboard game\b/, /\bboard games\b/] },
  { tag: "Dance Class", patterns: [/\bdance class\b/, /\bdancing class\b/, /\bsalsa class\b/, /\bballet class\b/, /\bdance lesson\b/] },
  { tag: "Poetry", patterns: [/\bpoetry\b/, /\bpoem\b/, /\bpoet\b/, /\bspoken word\b/] },
  { tag: "Opera", patterns: [/\bopera\b/] },
  { tag: "Kids & Family", patterns: [/\bkids\b/, /\bchildren\b/, /\bfamily.?friendly\b/, /\bfamily\b/, /\btoddler\b/, /\bjunior\b/] },
  { tag: "Museum", patterns: [/\bmuseum\b/, /\bexhibition\b/, /\bhistorical\b/, /\bscience center\b/, /\baquarium\b/, /\bplanetarium\b/, /\bzoo\b/] },
];

const MEMBER_LIKE_WEIGHT = 2;   // initial preference scoring (cold-start, soft signal)
const LEARNED_LIKE_WEIGHT = 8;  // feedback-learned category signals (strong positive signal)
const MEMBER_DISLIKE_WEIGHT = 8;
const BUDGET_MATCH_WEIGHT = 1;
const BUDGET_MISMATCH_WEIGHT = 1;
const MIN_CATEGORY_SIGNAL_SCORE = -4;
const MAX_CATEGORY_SIGNAL_SCORE = 4;
const MAX_MEANINGFUL_SCORE_GAP = 10;
const MAX_CONFIDENT_TOP_SCORE = 10;
const ALLERGY_PENALTY = 25;
const DIETARY_PENALTY = 12;
const DIETARY_COMPATIBLE_BOOST = 5;
const CUISINE_FOOD_WEIGHT = 5;
const QUERY_WORD_MATCH_WEIGHT = 10;
const MAX_QUERY_SCORE = 50;
const DISTANCE_MAX_BOOST = 15;
const DISTANCE_HALF_LIFE_MILES = 3;
const DISTANCE_FAR_MILES = 30;
const DISTANCE_FAR_PENALTY = -2;

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_MILES = 3959;

export interface ReferenceLocation {
  latitude: number;
  longitude: number;
}

export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceFromReferenceLocation(
  event: NormalizedEvent,
  referenceLocation: ReferenceLocation | undefined,
): number | null {
  if (!referenceLocation || event.latitude == null || event.longitude == null) {
    return null;
  }
  return haversineDistanceMiles(
    referenceLocation.latitude,
    referenceLocation.longitude,
    event.latitude,
    event.longitude,
  );
}

function scoreDistance(
  event: NormalizedEvent,
  referenceLocation: ReferenceLocation | undefined,
): number {
  const miles = distanceFromReferenceLocation(event, referenceLocation);
  if (miles == null) return 0;
  if (miles > DISTANCE_FAR_MILES) return DISTANCE_FAR_PENALTY;
  // Exponential decay: full boost at 0 miles, halves every DISTANCE_HALF_LIFE_MILES
  return DISTANCE_MAX_BOOST * Math.pow(0.5, miles / DISTANCE_HALF_LIFE_MILES);
}

/**
 * Hard allergen risk: the allergen is the *core* of the cuisine, meaning the
 * restaurant almost certainly cannot accommodate (e.g. shellfish allergy at a
 * Seafood restaurant). Incurs the full ALLERGY_PENALTY.
 */
const FOOD_TAG_ALLERGEN_RISK_HARD: Record<string, string[]> = {
  Seafood:     ["shellfish", "fish", "seafood", "crustacean", "shrimp", "lobster", "crab"],
  Sushi:       ["fish", "seafood", "shellfish"],
  "Ice Cream": ["dairy", "milk"],
  Bakery:      ["gluten", "wheat", "egg"],
};

/**
 * Soft allergen risk: the allergen is *commonly present but easily removed or
 * avoided* (e.g. nut allergy at Thai — kitchens can omit nuts). Incurs only
 * ALLERGY_SOFT_PENALTY as a gentle warning rather than exclusion.
 */
const FOOD_TAG_ALLERGEN_RISK_SOFT: Record<string, string[]> = {
  Thai:          ["peanut", "nut"],
  Chinese:       ["peanut", "nut", "soy", "soya"],
  Vietnamese:    ["peanut", "nut"],
  Indian:        ["dairy", "milk", "nut", "peanut"],
  Japanese:      ["soy", "soya"],
  Korean:        ["soy", "soya"],
  Italian:       ["dairy", "milk", "gluten", "wheat"],
  Pizza:         ["dairy", "milk", "gluten", "wheat"],
  French:        ["dairy", "milk"],
  Burgers:       ["gluten", "wheat", "dairy", "milk"],
  Sandwiches:    ["gluten", "wheat"],
  BBQ:           ["gluten", "wheat"],
  American:      ["dairy", "gluten", "wheat"],
  Greek:         ["dairy", "milk"],
  Mediterranean: ["dairy", "milk"],
  Coffee:        ["dairy", "milk"],
};

/**
 * Maps dietary restriction keywords to FoodTags that are incompatible
 * (should be penalized) and compatible (should be boosted).
 *
 * The restriction keyword is matched case-insensitively against member's
 * rawDietaryRestrictions.
 */
const DIETARY_INCOMPATIBLE_TAGS: Record<string, string[]> = {
  vegan:         ["Steakhouse", "BBQ", "Seafood", "Sushi", "Burgers", "American", "Korean"],
  vegetarian:    ["Steakhouse", "BBQ", "Seafood", "Sushi"],
  "gluten-free": ["Pizza", "Bakery", "Sandwiches", "Burgers", "BBQ"],
  "gluten free": ["Pizza", "Bakery", "Sandwiches", "Burgers", "BBQ"],
  "dairy-free":  ["Pizza", "Italian", "French", "Greek", "Mediterranean", "Bakery", "Ice Cream", "Coffee"],
  "lactose":     ["Pizza", "Italian", "French", "Greek", "Mediterranean", "Bakery", "Ice Cream", "Coffee"],
  halal:         ["Bar", "BBQ"],   // pork risk + alcohol
  kosher:        ["Seafood", "Sushi", "Bar"],
};

const DIETARY_COMPATIBLE_TAGS: Record<string, string[]> = {
  vegan:         ["Vegan", "Vegetarian"],
  vegetarian:    ["Vegan", "Vegetarian"],
  "gluten-free": ["Vegan", "Vegetarian"], // crude approximation; better than nothing
  "dairy-free":  ["Vegan"],
};

type BudgetPreference = BudgetBucket | "mixed" | "unknown";

export interface MemberPreference {
  name: string;
  preferredEventTypes: string[];
  negativeEventTypes: string[];
  cuisinePreferences?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  // Keys are other user IDs; values are lists of activity/event tags.
  personSpecificLikes?: Record<string, string[]>;
  personSpecificDislikes?: Record<string, string[]>;
}

export interface GroupPreferenceProfileSummary {
  categorySignals: Array<{
    category: string;
    acceptCount: number;
    rejectCount: number;
    moreLikeThisCount: number;
  }>;
  budgetPreference: BudgetPreference;
  feedbackCount: number;
}

export interface RankingConfidenceResult {
  score: number;
  verdict: "high" | "medium" | "low";
  memberSupportRatio: number;
  scoreGapNormalized: number;
  negativeFree: boolean;
  /** Best EventTag label for the top-ranked event (e.g. "Bowling", "Concert"). */
  topCategory: string | null;
}

function buildCategoryText(event: NormalizedEvent): string {
  return [
    event.title,
    event.description,
    event.venueName,
    event.venueCity,
    event.venueCountry,
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Given a member's raw preferences and the set of other user IDs present in the
 * current group, return the effective likes and dislikes after applying
 * person-specific overrides.
 *
 * Rules:
 *  - personSpecificDislikes for a group member override preferredEventTypes.
 *  - personSpecificLikes for a group member override negativeEventTypes.
 *  - When a tag appears in both person-specific likes and dislikes (conflicting
 *    signals across different group members), the dislike wins.
 */
function resolveEffectivePreferences(
  prefs: MemberPreference,
  groupMemberUserIds: string[],
): { effectiveLikes: string[]; effectiveDislikes: string[] } {
  const personLikeTags = new Set<string>();
  const personDislikeTags = new Set<string>();

  for (const uid of groupMemberUserIds) {
    for (const tag of prefs.personSpecificLikes?.[uid] ?? []) {
      personLikeTags.add(tag.toLowerCase());
    }
    for (const tag of prefs.personSpecificDislikes?.[uid] ?? []) {
      personDislikeTags.add(tag.toLowerCase());
    }
  }

  // Person-specific dislikes override general likes.
  const effectiveLikes = [
    ...prefs.preferredEventTypes.filter((t) => !personDislikeTags.has(t.toLowerCase())),
    // Add person-specific likes not already present, but only if no conflicting dislike.
    ...[...personLikeTags]
      .filter((t) => !personDislikeTags.has(t))
      .filter((t) => !prefs.preferredEventTypes.some((p) => p.toLowerCase() === t)),
  ];

  // Person-specific likes override general dislikes.
  const effectiveDislikes = [
    ...prefs.negativeEventTypes.filter((t) => !personLikeTags.has(t.toLowerCase())),
    // Add person-specific dislikes not already present.
    ...[...personDislikeTags]
      .filter((t) => !prefs.negativeEventTypes.some((n) => n.toLowerCase() === t)),
  ];

  return { effectiveLikes, effectiveDislikes };
}

// Google Places activity genres (from ACTIVITY_GENRE_MAP in google_places.ts).
// Used as a legacy fallback for rows that pre-date venueType.
const GOOGLE_PLACES_ACTIVITY_GENRES = new Set([
  "Climbing Gym",
  "Gym",
  "Bowling",
  "Movie Theater",
  "Amusement Park",
  "Spa",
]);

/**
 * Returns true for food/dining/drinking venue events (places to eat or drink).
 * `venueType` is the authoritative source — set at fetch time for all new events.
 * The genre-based check is a legacy fallback for rows that pre-date venueType.
 */
function isFoodEvent(event: NormalizedEvent): boolean {
  if (event.venueType === "food") return true;
  if (event.venueType === "activity") return false;
  // Legacy fallback: Google Places rows without venueType use genre to distinguish
  if (event.source === "google_places") {
    if (event.genre && GOOGLE_PLACES_ACTIVITY_GENRES.has(event.genre)) return false;
    return true;
  }
  return false;
}

/**
 * Scores an event against a free-text keyword from the user's query.
 * Each keyword token that appears in the event text adds QUERY_WORD_MATCH_WEIGHT,
 * capped at MAX_QUERY_SCORE. This is intentionally stronger than per-member
 * preference boosts so that an explicit query wins over learned preferences.
 */
function scoreQueryRelevance(event: NormalizedEvent, keyword: string | undefined): number {
  if (!keyword) return 0;
  const eventText = [
    event.title,
    event.description,
    event.venueName,
    event.genre,
    Array.isArray(event.tags) ? (event.tags as string[]).join(" ") : "",
  ]
    .filter((v): v is string => v != null && v.length > 0)
    .join(" ")
    .toLowerCase();

  const tokens = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;

  let matchCount = 0;
  for (const token of tokens) {
    if (eventText.includes(token)) matchCount++;
  }
  return Math.min(matchCount * QUERY_WORD_MATCH_WEIGHT, MAX_QUERY_SCORE);
}

/**
 * Infers specific EventTag values for an event.
 * Primary source: the event's own tags array (assigned by the AI classifier).
 * Fallback: TAG_PATTERNS text matching when the event has no useful tags.
 * Returns multiple tags (e.g. a Rock Concert → ["Concert", "Rock"]).
 */
export function inferEventTags(event: NormalizedEvent): EventTag[] {
  const assignedTags = (Array.isArray(event.tags) ? event.tags as EventTag[] : [])
    .filter((t) => t !== "Custom" && t !== "None");

  if (assignedTags.length > 0) {
    return assignedTags;
  }

  return inferTagsFromText(buildCategoryText(event));
}

/**
 * Infers EventTag values from a plain text string using TAG_PATTERNS.
 * Exported for use in feedback processing (group_preferences_mutations.ts)
 * where only snapshot text fields (not full NormalizedEvent) are available.
 */
export function inferTagsFromText(text: string): EventTag[] {
  const lower = text.toLowerCase();
  return TAG_PATTERNS
    .filter(({ patterns }) => patterns.some((p) => p.test(lower)))
    .map(({ tag }) => tag);
}

function eventConfidenceLabels(event: NormalizedEvent): string[] {
  const labels = new Set<string>();

  for (const tag of inferEventTags(event)) {
    labels.add(tag);
  }

  for (const tag of Array.isArray(event.tags) ? (event.tags as string[]) : []) {
    if (tag !== "Custom" && tag !== "None") {
      labels.add(tag);
    }
  }

  if (event.genre) {
    labels.add(event.genre);
  }

  return [...labels].filter((label) => label.trim().length > 0);
}

function buildConfidenceMatchText(event: NormalizedEvent, labels: string[]): string {
  return [
    buildCategoryText(event),
    event.genre,
    labels.join(" "),
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function preferenceListMatchesEvent(
  preferences: string[] | undefined,
  eventLabelSet: Set<string>,
  eventText: string,
): boolean {
  return (preferences ?? []).some((preference) => {
    const normalized = preference.trim().toLowerCase();
    return normalized.length > 0 &&
      (eventLabelSet.has(normalized) || eventText.includes(normalized));
  });
}

function scoreExplicitPreferences(
  tags: EventTag[],
  memberPrefs: MemberPreference[],
  groupMemberUserIds: string[],
): number {
  const eventLabels = tags.map((t) => t.toLowerCase());
  if (eventLabels.length === 0) return 0;

  // Each member contributes the full weight — one person's preference matters
  // equally whether the group has 2 or 20 members. Group consensus amplifies
  // the signal naturally (10 people disliking = 10x stronger than 1 person).
  return memberPrefs.reduce((score, prefs) => {
    const { effectiveLikes, effectiveDislikes } = resolveEffectivePreferences(prefs, groupMemberUserIds);
    let nextScore = score;

    if (effectiveLikes.some((t) => eventLabels.includes(t.toLowerCase()))) {
      nextScore += MEMBER_LIKE_WEIGHT;
    }

    if (effectiveDislikes.some((t) => eventLabels.includes(t.toLowerCase()))) {
      nextScore -= MEMBER_DISLIKE_WEIGHT;
    }

    return nextScore;
  }, 0);
}

/**
 * Computes the learned signal score for a set of category labels against the
 * group's accumulated feedback history.
 *
 * Weights mirror the per-member explicit preference weights so that:
 *  - N group rejections of a category = N × MEMBER_DISLIKE_WEIGHT penalty
 *  - N accepts = N × MEMBER_LIKE_WEIGHT boost
 *  - N more-like-this = N × (MEMBER_LIKE_WEIGHT × 2) boost (stronger signal)
 *
 * No total cap — accumulated consensus should be allowed to dominate.
 * A category rejected 10 times should far outweigh a single member preference.
 */
function scoreLearnedCategorySignalsForLabels(
  eventLabels: string[],
  groupProfile: GroupPreferenceProfileSummary | null,
  eventTitle?: string,
): number {
  if (!groupProfile) return 0;
  if (eventLabels.length === 0 && !eventTitle) return 0;

  // Build a map from lowercased category → signal for fast lookup.
  const signalMap = new Map<string, (typeof groupProfile.categorySignals)[0]>();
  for (const signal of groupProfile.categorySignals) {
    signalMap.set(signal.category.toLowerCase(), signal);
  }

  // --- Tag match scoring — full effect per matching tag ---
  // Each matching tag independently contributes its full signal score.
  // 3-tag event disliked → another event with the same 3 tags gets 3× the
  // penalty; an event sharing only 1 of those tags gets 1× the penalty.
  let tagScore = 0;
  const seenTags = new Set<string>();

  for (const label of eventLabels) {
    const key = label.toLowerCase();
    const signal = signalMap.get(key);
    if (!signal || seenTags.has(key)) continue;
    seenTags.add(key);
    tagScore +=
      signal.acceptCount * LEARNED_LIKE_WEIGHT * 2 +
      signal.moreLikeThisCount * LEARNED_LIKE_WEIGHT -
      signal.rejectCount * MEMBER_DISLIKE_WEIGHT;
  }

  // --- Title word similarity scoring ---
  // Supplements tag scoring: if the event title contains words that match a
  // signal category name, add a partial score. This captures cases where tag
  // classification is imperfect or the event title is more descriptive than
  // its inferred category. Signals already matched by tags are skipped to
  // avoid double-counting.
  const TITLE_STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "at", "in", "on", "for", "with",
    "vs", "live", "night", "day", "show", "event",
  ]);
  let titleScore = 0;
  if (eventTitle) {
    const titleWords = new Set(
      eventTitle
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4 && !TITLE_STOP_WORDS.has(w)),
    );
    // Start seenTitle from already-matched tag keys to avoid double-counting.
    const seenTitle = new Set<string>(seenTags);
    for (const [categoryKey, signal] of signalMap) {
      if (seenTitle.has(categoryKey)) continue;
      const categoryWords = categoryKey.split(/\W+/).filter((w) => w.length >= 3);
      if (categoryWords.length === 0) continue;
      const overlapCount = categoryWords.filter((w) => titleWords.has(w)).length;
      if (overlapCount === 0) continue;
      seenTitle.add(categoryKey);
      const overlapRatio = overlapCount / categoryWords.length;
      const signalScore =
        signal.moreLikeThisCount * LEARNED_LIKE_WEIGHT * 2 +
        signal.acceptCount * LEARNED_LIKE_WEIGHT -
        signal.rejectCount * MEMBER_DISLIKE_WEIGHT;
      // Title similarity is a weaker signal than a direct tag match — weight at 0.5.
      titleScore += signalScore * overlapRatio * 0.5;
    }
  }

  return tagScore + titleScore;
}

function scoreLearnedCategorySignals(
  tags: EventTag[],
  groupProfile: GroupPreferenceProfileSummary | null,
  eventTitle?: string,
): number {
  return scoreLearnedCategorySignalsForLabels(
    tags.map((t) => t.toLowerCase()),
    groupProfile,
    eventTitle,
  );
}

/**
 * Scores a food/restaurant event against member food preferences.
 *
 * Allergy scoring: uses FOOD_TAG_ALLERGEN_RISK to infer whether a cuisine type
 * is likely to contain an allergen, because allergen words (e.g. "shellfish")
 * will not appear literally in cuisine tags like "Seafood".
 *
 * Dietary restriction scoring: uses DIETARY_INCOMPATIBLE_TAGS / DIETARY_COMPATIBLE_TAGS
 * to determine whether a cuisine is compatible with a restriction. A restriction word
 * matching the restaurant's own tag (e.g. "vegan" matching a "Vegan" tagged place)
 * is a *boost*, not a penalty.
 *
 * Cuisine preference scoring: positive boost when a preferred cuisine matches a foodTag.
 */
function scoreFoodPreferences(
  event: NormalizedEvent,
  memberPrefs: MemberPreference[],
): number {
  // For food events, tags holds FoodTag[] (cuisine types). Use genre as fallback.
  const rawFoodTags: string[] = Array.isArray(event.tags) ? (event.tags as string[]) : [];
  const eventFoodTags: string[] =
    rawFoodTags.length > 0 || event.genre == null
      ? rawFoodTags
      : [event.genre];

  // Also build a free-text string for fallback description matching
  const descriptionText = [event.title, event.description, event.venueName]
    .filter((v): v is string => v != null && v.length > 0)
    .join(" ")
    .toLowerCase();

  const n = memberPrefs.length;

  // Safety signals (allergy, dietary) are categorical: if ANY member is affected,
  // the full penalty/boost applies regardless of group size. A single allergic
  // member in a group of 10 deserves the same protection as a solo user.
  // Cuisine preferences are proportional: averaged across the group (1 of 10
  // liking Japanese is a weaker signal than 10 of 10).
  let anyAllergyHit = false;
  let anyDietaryIncompatible = false;
  let anyDietaryCompatible = false;
  let cuisineMatchCount = 0;

  for (const prefs of memberPrefs) {
    // ── Allergies ─────────────────────────────────────────────────────────────
    // First check structured tag → allergen mapping.
    // Then fall back to literal text match in the description.
    if (!anyAllergyHit) {
      for (const allergy of prefs.allergies ?? []) {
        const allergyLower = allergy.toLowerCase();
        // Structured check: does any of the event's tags imply this allergen?
        const tagImpliesAllergen = eventFoodTags.some((tag) =>
          [...(FOOD_TAG_ALLERGEN_RISK_HARD[tag] ?? []), ...(FOOD_TAG_ALLERGEN_RISK_SOFT[tag] ?? [])].some(
            (a: string) => a.includes(allergyLower) || allergyLower.includes(a),
          ),
        );
        // Literal fallback: does the description mention it?
        const descriptionMentions = descriptionText.includes(allergyLower);
        if (tagImpliesAllergen || descriptionMentions) {
          anyAllergyHit = true;
          break;
        }
      }
    }

    // ── Dietary restrictions ──────────────────────────────────────────────────
    // Incompatible tags are penalized; compatible tags are boosted.
    if (!anyAllergyHit && !anyDietaryIncompatible) {
      for (const restriction of prefs.dietaryRestrictions ?? []) {
        const restrictionLower = restriction.toLowerCase();

        // Find the best matching key in our maps
        const matchedKey = Object.keys(DIETARY_INCOMPATIBLE_TAGS).find((k) =>
          restrictionLower.includes(k) || k.includes(restrictionLower),
        );

        if (matchedKey) {
          const incompatible = DIETARY_INCOMPATIBLE_TAGS[matchedKey] ?? [];
          const compatible = DIETARY_COMPATIBLE_TAGS[matchedKey] ?? [];
          const isIncompatible = eventFoodTags.some((t) => incompatible.includes(t));
          const isCompatible = eventFoodTags.some((t) => compatible.includes(t));
          if (isIncompatible) {
            anyDietaryIncompatible = true;
            break;
          }
          if (isCompatible || descriptionText.includes(restrictionLower)) {
            anyDietaryCompatible = true;
            break;
          }
        }
      }
    }

    // ── Cuisine preferences ───────────────────────────────────────────────────
    for (const cuisine of prefs.cuisinePreferences ?? []) {
      const cuisineLower = cuisine.toLowerCase();
      const matched = eventFoodTags.some((tag) => tag.toLowerCase().includes(cuisineLower) || cuisineLower.includes(tag.toLowerCase()));
      if (matched || descriptionText.includes(cuisineLower)) {
        cuisineMatchCount++;
        break; // one boost per member per event
      }
    }
  }

  // Apply categorical safety signals at full strength (group-size-independent)
  let score = 0;
  if (anyAllergyHit) {
    score -= ALLERGY_PENALTY;
  } else if (anyDietaryIncompatible) {
    score -= DIETARY_PENALTY;
  } else if (anyDietaryCompatible) {
    score += DIETARY_COMPATIBLE_BOOST;
  }

  // Cuisine preference is proportional to how many group members prefer this cuisine
  if (n > 0) score += (cuisineMatchCount / n) * CUISINE_FOOD_WEIGHT;

  return score;
}

function scoreBudgetPreference(
  eventBudgetBucket: BudgetBucket | null,
  groupProfile: GroupPreferenceProfileSummary | null,
): number {
  if (!groupProfile || !eventBudgetBucket) return 0;
  if (
    groupProfile.budgetPreference === "unknown" ||
    groupProfile.budgetPreference === "mixed"
  ) {
    return 0;
  }

  return groupProfile.budgetPreference === eventBudgetBucket
    ? BUDGET_MATCH_WEIGHT
    : -BUDGET_MISMATCH_WEIGHT;
}

/**
 * Scores an event by directly matching each member's effective preference tags
 * against the event's full text (title, description, venue, genre, tags).
 *
 * This complements category-based scoring: a member with preferredEventTypes: ["bowling"]
 * gets a boost for a bowling alley even though "bowling" isn't a LearnedCategory.
 * Tags that already matched via inferredCategory are skipped to avoid double-counting.
 */
function scoreTagTextMatch(
  event: NormalizedEvent,
  memberPrefs: MemberPreference[],
  groupMemberUserIds: string[],
  inferredTags: EventTag[],
): number {
  const eventText = [
    event.title,
    event.description,
    event.venueName,
    event.genre,
    Array.isArray(event.tags) ? (event.tags as string[]).join(" ") : "",
  ]
    .filter((v): v is string => v != null && v.length > 0)
    .join(" ")
    .toLowerCase();

  if (!eventText) return 0;

  // Labels already scored by scoreExplicitPreferences — skip to avoid double-counting.
  const alreadyHandled = new Set(inferredTags.map((t) => t.toLowerCase()));

  // Same full-weight-per-member approach as scoreExplicitPreferences.
  return memberPrefs.reduce((score, prefs) => {
    const { effectiveLikes, effectiveDislikes } = resolveEffectivePreferences(prefs, groupMemberUserIds);
    let nextScore = score;

    for (const tag of effectiveLikes) {
      const t = tag.toLowerCase();
      if (alreadyHandled.has(t)) continue; // already handled by scoreExplicitPreferences
      if (eventText.includes(t)) {
        nextScore += MEMBER_LIKE_WEIGHT;
        break; // one boost per member per event
      }
    }

    for (const tag of effectiveDislikes) {
      const t = tag.toLowerCase();
      if (alreadyHandled.has(t)) continue;
      if (eventText.includes(t)) {
        nextScore -= MEMBER_DISLIKE_WEIGHT;
        break; // one penalty per member per event
      }
    }

    return nextScore;
  }, 0);
}

export function scoreEventForGroup(
  event: NormalizedEvent,
  memberPrefs: MemberPreference[],
  groupProfile: GroupPreferenceProfileSummary | null,
  groupMemberUserIds: string[] = [],
  keyword?: string,
  referenceLocation?: ReferenceLocation,
): number {
  const tags = inferEventTags(event);

  // Custom events (user-created) always float above non-custom events.
  const customBoost = Array.isArray(event.tags) && (event.tags as EventTag[]).includes("Custom")
    ? CUSTOM_TAG_BOOST
    : 0;

  // Query relevance is the highest-priority signal after the custom boost.
  const queryScore = scoreQueryRelevance(event, keyword);
  const distanceScore = scoreDistance(event, referenceLocation);

  if (isFoodEvent(event)) {
    // Food events: allergies > dietary restrictions > cuisine preferences + learned signals.
    // event.tags holds FoodTag[] for food venues; include genre as fallback.
    const rawFoodTags: string[] = Array.isArray(event.tags) && event.tags.length > 0
      ? (event.tags as string[])
      : event.genre
        ? [event.genre]
        : [];
    const foodLabels = [...new Set([...tags.map((t) => t.toLowerCase()), ...rawFoodTags.map((t) => t.toLowerCase())])];
    return (
      customBoost +
      queryScore +
      distanceScore +
      scoreFoodPreferences(event, memberPrefs) +
      scoreLearnedCategorySignalsForLabels(foodLabels, groupProfile, event.title) +
      scoreBudgetPreference(event.budgetBucket, groupProfile)
    );
  }

  // Activity events: tag-based preference scoring + learned feedback signals
  return (
    customBoost +
    queryScore +
    distanceScore +
    scoreExplicitPreferences(tags, memberPrefs, groupMemberUserIds) +
    scoreTagTextMatch(event, memberPrefs, groupMemberUserIds, tags) +
    scoreLearnedCategorySignals(tags, groupProfile, event.title) +
    scoreBudgetPreference(event.budgetBucket, groupProfile)
  );
}

/**
 * Produces a plain-text allergen/dietary warning string for the top recommended
 * food events, intended to be appended to the recommendation summary message.
 *
 * Hard risk  — allergen is core to the cuisine (e.g. shellfish at Seafood):
 *   "⚠️ Heads up: Ocean Grill contains shellfish — may not suit Sam."
 * Soft risk — allergen is commonly present but removable (e.g. nuts at Thai):
 *   "ℹ️ Thai Palace may contain peanuts, but most kitchens can accommodate — check with Alex."
 *
 * Returns an empty string when there are no warnings.
 */
export function buildAllergenWarningText(
  events: NormalizedEvent[],
  memberPrefs: MemberPreference[],
): string {
  const hardWarnings: string[] = [];
  const softWarnings: string[] = [];

  for (const event of events) {
    if (!isFoodEvent(event)) continue;

    const rawFoodTags: string[] = Array.isArray(event.tags) ? (event.tags as string[]) : [];
    const eventFoodTags: string[] =
      rawFoodTags.length > 0 || event.genre == null
        ? rawFoodTags
        : [event.genre];
    const label = event.venueName ?? event.title;

    for (const prefs of memberPrefs) {
      for (const allergy of prefs.allergies ?? []) {
        const allergyLower = allergy.toLowerCase();

        // Hard risk check
        const hardHit = eventFoodTags.some((tag) =>
          (FOOD_TAG_ALLERGEN_RISK_HARD[tag] ?? []).some(
            (a) => a.includes(allergyLower) || allergyLower.includes(a),
          ),
        );
        if (hardHit) {
          hardWarnings.push(
            `⚠️ ${label} may not be suitable for ${prefs.name} (${allergy} allergy — kitchen cannot easily remove)`,
          );
          break;
        }

        // Soft risk check
        const softHit = eventFoodTags.some((tag) =>
          (FOOD_TAG_ALLERGEN_RISK_SOFT[tag] ?? []).some(
            (a) => a.includes(allergyLower) || allergyLower.includes(a),
          ),
        );
        if (softHit) {
          softWarnings.push(
            `ℹ️ ${label} may contain ${allergy} — most kitchens can accommodate, worth checking for ${prefs.name}`,
          );
          break;
        }
      }
    }
  }

  return [...hardWarnings, ...softWarnings].join(" ").trim();
}

export function rankEventsForGroup<T extends NormalizedEvent>(
  events: T[],
  memberPrefs: MemberPreference[],
  groupProfile: GroupPreferenceProfileSummary | null,
  groupMemberUserIds: string[] = [],
  keyword?: string,
  referenceLocation?: ReferenceLocation,
): (T & { rankScore: number })[] {
  const scored = events.map((event, index) => ({
    event,
    originalRank: index + 1,
    score: scoreEventForGroup(event, memberPrefs, groupProfile, groupMemberUserIds, keyword, referenceLocation),
  }));

  const sorted = scored
    .slice()
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : left.originalRank - right.originalRank,
    );

  return sorted.map((entry) => ({ ...entry.event, rankScore: entry.score }));
}

export function applyFinalDistanceRanking<T extends NormalizedEvent & { rankScore?: number }>(
  events: T[],
  referenceLocation: ReferenceLocation,
): (T & { rankScore: number })[] {
  return events
    .map((event, preferenceRank) => ({
      event,
      preferenceRank,
      distanceMiles: distanceFromReferenceLocation(event, referenceLocation),
    }))
    .sort((left, right) => {
      const leftHasDistance = left.distanceMiles != null;
      const rightHasDistance = right.distanceMiles != null;

      if (leftHasDistance !== rightHasDistance) {
        return leftHasDistance ? -1 : 1;
      }

      if (left.distanceMiles != null && right.distanceMiles != null) {
        const distanceDelta = left.distanceMiles - right.distanceMiles;
        if (distanceDelta !== 0) return distanceDelta;
      }

      const scoreDelta = (right.event.rankScore ?? 0) - (left.event.rankScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;

      return left.preferenceRank - right.preferenceRank;
    })
    .map(({ event }, finalRank, sortedEvents) => ({
      ...event,
      rankScore: sortedEvents.length - finalRank,
    }));
}

export function computeRankingConfidence(
  rankedEvents: NormalizedEvent[],
  memberPrefs: MemberPreference[],
  groupProfile: GroupPreferenceProfileSummary | null,
  groupMemberUserIds: string[] = [],
  keyword?: string,
  referenceLocation?: ReferenceLocation,
): RankingConfidenceResult {
  if (rankedEvents.length === 0) {
    return {
      score: 0,
      verdict: "low",
      memberSupportRatio: 0,
      scoreGapNormalized: 0,
      negativeFree: true,
      topCategory: null,
    };
  }

  const topEvent = rankedEvents[0];
  const topScore = scoreEventForGroup(topEvent, memberPrefs, groupProfile, groupMemberUserIds, keyword, referenceLocation);
  const secondScore = rankedEvents.length > 1 ? scoreEventForGroup(rankedEvents[1], memberPrefs, groupProfile, groupMemberUserIds, keyword, referenceLocation) : 0;

  // Use the same evidence ranking can use: classified tags, raw food/place tags,
  // genre, and text fallback. This keeps confidence calibrated for query,
  // cuisine, learned-profile, and tag-text matches.
  const topLabels = eventConfidenceLabels(topEvent);
  const allTopLabels = topLabels.map((t) => t.toLowerCase());
  const topLabelSet = new Set(allTopLabels);
  const topMatchText = buildConfidenceMatchText(topEvent, topLabels);

  const supportingMembers = memberPrefs.length > 0
    ? memberPrefs.filter((m) => {
        const { effectiveLikes } = resolveEffectivePreferences(m, groupMemberUserIds);
        return preferenceListMatchesEvent(effectiveLikes, topLabelSet, topMatchText) ||
          preferenceListMatchesEvent(m.cuisinePreferences, topLabelSet, topMatchText) ||
          preferenceListMatchesEvent(m.dietaryRestrictions, topLabelSet, topMatchText);
      }).length
    : 0;
  const memberSupportRatio = memberPrefs.length > 0
    ? supportingMembers / memberPrefs.length
    : 0;

  const scoreGapNormalized = clamp((topScore - secondScore) / MAX_MEANINGFUL_SCORE_GAP, 0, 1);

  const negativeFree = !memberPrefs.some((m) => {
    const { effectiveDislikes } = resolveEffectivePreferences(m, groupMemberUserIds);
    return preferenceListMatchesEvent(effectiveDislikes, topLabelSet, topMatchText);
  });

  const topScoreNormalized = clamp(topScore / MAX_CONFIDENT_TOP_SCORE, 0, 1);
  const score =
    memberSupportRatio * 0.4 +
    topScoreNormalized * 0.3 +
    scoreGapNormalized * 0.15 +
    (negativeFree ? 0.15 : 0);

  const verdict = score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";

  const topCategory: string | null = topLabels[0] ?? null;

  return { score, verdict, memberSupportRatio, scoreGapNormalized, negativeFree, topCategory };
}