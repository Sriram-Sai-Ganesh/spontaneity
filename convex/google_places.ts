import type { BudgetBucket, NormalizedEvent, FoodTag, EventTag, OpenHoursPeriod } from "./event_types";
import { AllFoodTags } from "./event_types";
import type { EventSearchParams } from "./ticketmaster";

const TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

// Base Google Places fields plus regularOpeningHours so venue cards can show
// true opening hours. Including regularOpeningHours triggers the higher-cost
// Enterprise+Atmosphere SKU ($40/1000, 5 000 free/month).
// Other Enterprise / Enterprise+Atmosphere fields (priceLevel,
// editorialSummary, servesVegetarianFood, servesBeer, servesWine) remain
// excluded for now.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.primaryType",
  "places.types",
  "places.googleMapsUri",
  "places.location",
  "places.regularOpeningHours",
].join(",");

// Minimal mask for neighborhood lookups — only the fields actually consumed.
const NEIGHBORHOOD_FIELD_MASK = [
  "places.id",
  "places.addressComponents",
  "places.location",
].join(",");

interface AddressComponent {
  longText?: string;
  types?: string[];
}

interface OpenHourPeriodPoint {
  day: number;
  hour: number;
  minute: number;
}

interface RegularOpeningHoursPeriod {
  open?: OpenHourPeriodPoint;
  close?: OpenHourPeriodPoint;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  primaryType?: string;
  types?: string[];
  priceLevel?: string;
  editorialSummary?: { text?: string };
  googleMapsUri?: string;
  servesVegetarianFood?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  regularOpeningHours?: {
    periods?: RegularOpeningHoursPeriod[];
  };
  location?: { latitude?: number; longitude?: number };
}

/**
 * Maps Google Places type strings to our FoodTag values.
 * Every entry here must be a valid FoodTag literal from FoodTagSchema.
 * Used by extractFoodTags() to tag food venues.
 */
const CUISINE_TYPE_MAP: Record<string, FoodTag> = {
  // ── Core cuisine types ──────────────────────────────────────────────────────
  italian_restaurant: "Italian",
  pizza_restaurant: "Pizza",
  japanese_restaurant: "Japanese",
  sushi_restaurant: "Sushi",
  chinese_restaurant: "Chinese",
  dim_sum_restaurant: "Chinese",
  dumpling_restaurant: "Chinese",
  hot_pot_restaurant: "Chinese",
  mexican_restaurant: "Mexican",
  thai_restaurant: "Thai",
  indian_restaurant: "Indian",
  korean_restaurant: "Korean",
  vietnamese_restaurant: "Vietnamese",
  french_restaurant: "French",
  greek_restaurant: "Greek",
  mediterranean_restaurant: "Mediterranean",
  american_restaurant: "American",
  new_american_restaurant: "American",
  bar_and_grill: "American",
  family_restaurant: "American",
  fine_dining_restaurant: "American",
  bistro: "American",
  seafood_restaurant: "Seafood",
  fish_and_chips_restaurant: "Seafood",
  steak_house: "Steakhouse",
  barbecue_restaurant: "BBQ",
  vegan_restaurant: "Vegan",
  vegetarian_restaurant: "Vegetarian",
  brunch_restaurant: "Brunch",
  sandwich_shop: "Sandwiches",
  hamburger_restaurant: "Burgers",
  ice_cream_shop: "Ice Cream",
  coffee_shop: "Coffee",
  cafe: "Coffee",
  bakery: "Bakery",
  // ── Breakfast / Diner ───────────────────────────────────────────────────────
  breakfast_restaurant: "Breakfast",
  diner: "Breakfast",
  bagel_shop: "Breakfast",
  // ── Fast Food ───────────────────────────────────────────────────────────────
  fast_food_restaurant: "Fast Food",
  burrito_restaurant: "Fast Food",
  buffet_restaurant: "Fast Food",
  food_court: "Fast Food",
  // ── Dessert ─────────────────────────────────────────────────────────────────
  dessert_shop: "Dessert",
  dessert_restaurant: "Dessert",
  donut_shop: "Dessert",
  acai_shop: "Dessert",
  candy_store: "Dessert",
  // ── Brazilian ───────────────────────────────────────────────────────────────
  brazilian_restaurant: "Brazilian",
  // ── Middle Eastern ──────────────────────────────────────────────────────────
  middle_eastern_restaurant: "Middle Eastern",
  falafel_restaurant: "Middle Eastern",
  turkish_restaurant: "Middle Eastern",
  lebanese_restaurant: "Middle Eastern",
  afghani_restaurant: "Middle Eastern",
  moroccan_restaurant: "Middle Eastern",
  israeli_restaurant: "Middle Eastern",
  halal_restaurant: "Middle Eastern",
  egyptian_restaurant: "Middle Eastern",
  iranian_restaurant: "Middle Eastern",
  // ── Spanish ─────────────────────────────────────────────────────────────────
  spanish_restaurant: "Spanish",
  tapas_bar: "Spanish",
  basque_restaurant: "Spanish",
  // ── Asian Fusion / Other Asian ──────────────────────────────────────────────
  asian_fusion_restaurant: "Asian Fusion",
  asian_restaurant: "Asian Fusion",
  pan_asian_restaurant: "Asian Fusion",
  singaporean_restaurant: "Asian Fusion",
  taiwanese_restaurant: "Asian Fusion",
  malay_restaurant: "Asian Fusion",
  indonesian_restaurant: "Asian Fusion",
  burmese_restaurant: "Asian Fusion",
  filipino_restaurant: "Asian Fusion",
  bangladeshi_restaurant: "Asian Fusion",
  pakistani_restaurant: "Asian Fusion",
  sri_lankan_restaurant: "Asian Fusion",
  hawaiian_restaurant: "Asian Fusion",
  // ── Ramen / Noodles ─────────────────────────────────────────────────────────
  ramen_restaurant: "Ramen",
  noodle_restaurant: "Ramen",
  // ── Latin American ──────────────────────────────────────────────────────────
  latin_american_restaurant: "Latin American",
  caribbean_restaurant: "Latin American",
  peruvian_restaurant: "Latin American",
  venezuelan_restaurant: "Latin American",
  colombian_restaurant: "Latin American",
  salvadoran_restaurant: "Latin American",
  guatemalan_restaurant: "Latin American",
  argentinian_restaurant: "Latin American",
  cuban_restaurant: "Latin American",
  honduran_restaurant: "Latin American",
  puerto_rican_restaurant: "Latin American",
  // ── African ─────────────────────────────────────────────────────────────────
  african_restaurant: "African",
  ethiopian_restaurant: "African",
  soul_food_restaurant: "African",
  cajun_restaurant: "African",
  // ── European (mapped to closest cuisine) ────────────────────────────────────
  british_restaurant: "American",
  australian_restaurant: "American",
  european_restaurant: "Mediterranean",
  german_restaurant: "American",
  bavarian_restaurant: "American",
  austrian_restaurant: "American",
  eastern_european_restaurant: "Mediterranean",
  polish_restaurant: "Mediterranean",
  russian_restaurant: "Mediterranean",
  ukrainian_restaurant: "Mediterranean",
  hungarian_restaurant: "Mediterranean",
  swiss_restaurant: "Mediterranean",
  dutch_restaurant: "Mediterranean",
  belgian_restaurant: "Mediterranean",
  georgian_restaurant: "Mediterranean",
  fondue_restaurant: "Mediterranean",
  // ── Drinks (non-alcohol) ────────────────────────────────────────────────────
  juice_bar: "Coffee",
  bubble_tea_store: "Coffee",
  tea_house: "Coffee",
};

/**
 * Maps Google Places type strings to a genre label for non-food (activity) venues.
 * Only used by extractCuisineGenre() for activity spots.
 */
const ACTIVITY_GENRE_MAP: Record<string, string> = {
  climbing_gym: "Climbing Gym",
  gym: "Gym",
  bowling_alley: "Bowling",
  movie_theater: "Movie Theater",
  amusement_park: "Amusement Park",
  spa: "Spa",
  // Drinking / nightlife
  bar: "Bar",
  night_club: "Night Club",
  brewery: "Brewery",
  brewpub: "Brewpub",
  beer_garden: "Beer Garden",
  wine_bar: "Wine Bar",
  // Outdoors
  park: "Park",
  national_park: "National Park",
  // Tours / attractions
  tourist_attraction: "Tourist Attraction",
  tour_operator: "Tour",
};

/**
 * Drinking/nightlife venue types — classified as activity, not food.
 * A place with ONLY these types (and no cuisine types from CUISINE_TYPE_MAP)
 * becomes an activity venue tagged as "Drinking" or "Night Life".
 */
const DRINKING_VENUE_TYPES = new Set([
  "bar",
  "night_club",
  "brewery",
  "brewpub",
  "beer_garden",
  "wine_bar",
]);

/** Maps a drinking venue's primary type to the EventTag that best describes it. */
const DRINKING_VENUE_TAG_MAP: Record<string, string> = {
  bar: "Drinking",
  night_club: "Night Life",
  brewery: "Drinking",
  brewpub: "Drinking",
  beer_garden: "Drinking",
  wine_bar: "Wine Tasting",
};

/** Set of valid FoodTag values for O(1) validation. */
const VALID_FOOD_TAGS = new Set<string>(AllFoodTags);

// Google Places types that classify a place as a food/drink venue.
// Drinking/nightlife types (bar, night_club, etc.) are intentionally excluded —
// those are handled by DRINKING_VENUE_TYPES and classified as activity venues.
const FOOD_PLACE_TYPES = new Set([
  // Generic food categories
  "restaurant",
  "food",
  "meal_takeaway",
  "meal_delivery",
  "cafe",
  "bakery",
  // Specific restaurant types — all covered by CUISINE_TYPE_MAP above
  "italian_restaurant",
  "pizza_restaurant",
  "japanese_restaurant",
  "sushi_restaurant",
  "chinese_restaurant",
  "dim_sum_restaurant",
  "dumpling_restaurant",
  "hot_pot_restaurant",
  "mexican_restaurant",
  "thai_restaurant",
  "indian_restaurant",
  "korean_restaurant",
  "vietnamese_restaurant",
  "french_restaurant",
  "greek_restaurant",
  "mediterranean_restaurant",
  "american_restaurant",
  "new_american_restaurant",
  "seafood_restaurant",
  "steak_house",
  "barbecue_restaurant",
  "vegan_restaurant",
  "vegetarian_restaurant",
  "brunch_restaurant",
  "sandwich_shop",
  "hamburger_restaurant",
  "ice_cream_shop",
  "coffee_shop",
  "breakfast_restaurant",
  "diner",
  "bagel_shop",
  "fast_food_restaurant",
  "burrito_restaurant",
  "dessert_shop",
  "dessert_restaurant",
  "donut_shop",
  "acai_shop",
  "brazilian_restaurant",
  "middle_eastern_restaurant",
  "falafel_restaurant",
  "turkish_restaurant",
  "lebanese_restaurant",
  "afghani_restaurant",
  "moroccan_restaurant",
  "israeli_restaurant",
  "halal_restaurant",
  "egyptian_restaurant",
  "iranian_restaurant",
  "spanish_restaurant",
  "tapas_bar",
  "basque_restaurant",
  "asian_fusion_restaurant",
  "asian_restaurant",
  "pan_asian_restaurant",
  "singaporean_restaurant",
  "taiwanese_restaurant",
  "malay_restaurant",
  "indonesian_restaurant",
  "burmese_restaurant",
  "filipino_restaurant",
  "bangladeshi_restaurant",
  "pakistani_restaurant",
  "sri_lankan_restaurant",
  "ramen_restaurant",
  "noodle_restaurant",
  "latin_american_restaurant",
  "caribbean_restaurant",
  "peruvian_restaurant",
  "venezuelan_restaurant",
  "colombian_restaurant",
  "salvadoran_restaurant",
  "guatemalan_restaurant",
  "argentinian_restaurant",
  "cuban_restaurant",
  "honduran_restaurant",
  "puerto_rican_restaurant",
  "african_restaurant",
  "ethiopian_restaurant",
  // Additional food types without a specific tag (still food)
  "bar_and_grill",
  "bistro",
  "buffet_restaurant",
  "family_restaurant",
  "fine_dining_restaurant",
  "food_court",
  "fish_and_chips_restaurant",
  "fondue_restaurant",
  "british_restaurant",
  "belgian_restaurant",
  "dutch_restaurant",
  "eastern_european_restaurant",
  "bavarian_restaurant",
  "austrian_restaurant",
  "australian_restaurant",
  "georgian_restaurant",
  "german_restaurant",
  "hungarian_restaurant",
  "polish_restaurant",
  "russian_restaurant",
  "ukrainian_restaurant",
  "swiss_restaurant",
  "european_restaurant",
  "juice_bar",
  "bubble_tea_store",
  "tea_house",
  "soul_food_restaurant",
  "cajun_restaurant",
  "hawaiian_restaurant",
]);

export function mapPriceLevelToBudget(
  priceLevel: string | undefined | null,
): BudgetBucket | null {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return "low";
    case "PRICE_LEVEL_MODERATE":
      return "medium";
    case "PRICE_LEVEL_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "high";
    default:
      return null;
  }
}

export function extractCuisineGenre(types: string[] | undefined): string | null {
  if (!types) return null;
  for (const t of types) {
    const foodMapped = CUISINE_TYPE_MAP[t];
    if (foodMapped) return foodMapped;
    const activityMapped = ACTIVITY_GENRE_MAP[t];
    if (activityMapped) return activityMapped;
  }
  return null;
}

/**
 * Determine whether the place is a food/drink venue or a general activity venue.
 *
 * Priority:
 * 1. Any type in CUISINE_TYPE_MAP → food (handles bar_and_grill that also has a cuisine type).
 * 2. Any type in DRINKING_VENUE_TYPES (with no cuisine) → activity.
 * 3. Any type in FOOD_PLACE_TYPES → food.
 * 4. Default → activity.
 */
export function classifyVenueType(types: string[] | undefined): "food" | "activity" {
  if (!types) return "activity";
  // If any type maps to a specific cuisine, it's a food spot regardless of bar presence.
  if (types.some((t) => t in CUISINE_TYPE_MAP)) return "food";
  // Pure drinking/nightlife venues with no cuisine become activity spots.
  if (types.some((t) => DRINKING_VENUE_TYPES.has(t))) return "activity";
  for (const t of types) {
    if (FOOD_PLACE_TYPES.has(t)) return "food";
  }
  return "activity";
}

/**
 * Extract all matching food tags (cuisine types) from a place's Google types.
 * Uses CUISINE_TYPE_MAP directly — every value there is a valid FoodTag.
 * Checks `primaryType` first (most specific), then scans all `types`.
 * Deduplicates results.
 */
export function extractFoodTags(
  types: string[] | undefined,
  primaryType?: string,
): FoodTag[] {
  const seen = new Set<string>();
  const tags: FoodTag[] = [];

  // primaryType is the most specific single type — check it first
  if (primaryType) {
    const mapped = CUISINE_TYPE_MAP[primaryType];
    if (mapped && VALID_FOOD_TAGS.has(mapped)) {
      seen.add(mapped);
      tags.push(mapped as FoodTag);
    }
  }

  for (const t of types ?? []) {
    const mapped = CUISINE_TYPE_MAP[t];
    if (mapped && VALID_FOOD_TAGS.has(mapped) && !seen.has(mapped)) {
      seen.add(mapped);
      tags.push(mapped as FoodTag);
    }
  }
  return tags;
}

/**
 * Parse Google Places regularOpeningHours.periods into our OpenHoursPeriod format.
 * Returns an empty array if no periods are available.
 */
export function parseOpenHours(
  regularOpeningHours: GooglePlace["regularOpeningHours"],
): OpenHoursPeriod[] {
  if (!regularOpeningHours?.periods) return [];

  return regularOpeningHours.periods
    .filter((p) => p.open != null && p.close != null)
    .map((p) => ({
      dayOfWeek: p.open!.day,
      openTime: `${String(p.open!.hour).padStart(2, "0")}:${String(p.open!.minute).padStart(2, "0")}`,
      closeTime: `${String(p.close!.hour).padStart(2, "0")}:${String(p.close!.minute).padStart(2, "0")}`,
    }));
}

function extractCity(components: AddressComponent[] | undefined): string | null {
  if (!components) return null;
  const locality = components.find((c) => c.types?.includes("locality"));
  return locality?.longText ?? null;
}

function extractNeighborhood(components: AddressComponent[] | undefined): string | null {
  if (!components) return null;
  const broadSublocality = components.find((c) =>
    c.types?.includes("sublocality_level_1"),
  );
  if (broadSublocality?.longText) return broadSublocality.longText;
  const sublocality = components.find((c) =>
    c.types?.some((type) =>
      type === "sublocality" || type.startsWith("sublocality_level_"),
    ),
  );
  if (sublocality?.longText) return sublocality.longText;
  const neighborhood = components.find((c) => c.types?.includes("neighborhood"));
  return neighborhood?.longText ?? null;
}

function extractCountry(components: AddressComponent[] | undefined): string | null {
  if (!components) return null;
  const country = components.find((c) => c.types?.includes("country"));
  return country?.longText ?? null;
}

function buildDescription(place: GooglePlace): string | null {
  if (place.editorialSummary?.text) return place.editorialSummary.text;
  return null;
}

export function mapToNormalizedEvent(place: GooglePlace): NormalizedEvent {
  const name = place.displayName?.text ?? "";
  const venueType = classifyVenueType(place.types);
  const openHours = parseOpenHours(place.regularOpeningHours);

  let tags: FoodTag[] | EventTag[] = [];

  if (venueType === "food") {
    // Food spots: assign cuisine tags directly; fall back to genre if none found.
    let foodTags = extractFoodTags(place.types, place.primaryType);
    if (foodTags.length === 0) {
      const genre = extractCuisineGenre(place.types);
      if (genre && VALID_FOOD_TAGS.has(genre)) {
        foodTags = [genre as FoodTag];
      }
    }
    tags = foodTags;
  } else {
    // Activity spots: assign a tag directly for drinking/nightlife venues so they
    // don't need to wait for AI tagging. Other activity types are tagged by AI later.
    const allTypes = place.types ?? [];
    const primaryType = place.primaryType ?? allTypes[0] ?? "";
    const drinkingTag = DRINKING_VENUE_TAG_MAP[primaryType]
      ?? allTypes.map((t) => DRINKING_VENUE_TAG_MAP[t]).find(Boolean);
    if (drinkingTag) {
      tags = [drinkingTag as EventTag];
    }
  }

  return {
    eventId: `gp_${place.id}`,
    title: name,
    description: buildDescription(place),
    startTime: null,
    venueName: name,
    venueCity: extractCity(place.addressComponents),
    venueNeighborhood: extractNeighborhood(place.addressComponents),
    venueCountry: extractCountry(place.addressComponents),
    source: "google_places",
    url: place.googleMapsUri ?? "",
    image: null,
    tags,
    status: null,
    budgetBucket: mapPriceLevelToBudget(place.priceLevel),
    genre: extractCuisineGenre(place.types),
    venueType,
    openHours: openHours.length > 0 ? openHours : undefined,
    latitude: place.location?.latitude ?? undefined,
    longitude: place.location?.longitude ?? undefined,
    formattedAddress: place.formattedAddress ?? undefined,
    googlePlaceId: place.id ?? undefined,
  };
}

export async function searchNormalizedEvents(
  apiKey: string,
  params: EventSearchParams,
): Promise<NormalizedEvent[]> {
  const city = params.city?.trim();
  const keyword = params.foodKeyword ?? params.keyword?.trim() ?? "restaurants";
  const textQuery = city ? `${keyword} in ${city}` : keyword;
  const maxResults = Math.min(params.size ?? 10, 20);

  let response: Response;
  try {
    response = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: maxResults,
        languageCode: "en",
      }),
    });
  } catch (err) {
    throw new Error(
      `Network error contacting Google Places: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Invalid Google Places API key");
  }
  if (response.status === 429) {
    throw new Error("Google Places rate limit exceeded; please try again later");
  }
  if (!response.ok) {
    throw new Error(`Google Places API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  const places = data.places ?? [];
  return places.map(mapToNormalizedEvent);
}

export async function lookupVenueNeighborhood(
  apiKey: string,
  venue: {
    venueName?: string | null;
    venueCity?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<string | null> {
  const venueName = venue.venueName?.trim();
  const venueCity = venue.venueCity?.trim();
  if (!venueName || !venueCity) return null;

  const body: Record<string, unknown> = {
    textQuery: `${venueName} in ${venueCity}`,
    maxResultCount: 1,
    languageCode: "en",
  };
  if (venue.latitude != null && venue.longitude != null) {
    body.locationBias = {
      circle: {
        center: {
          latitude: venue.latitude,
          longitude: venue.longitude,
        },
        radius: 500,
      },
    };
  }

  const response = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": NEIGHBORHOOD_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Invalid Google Places API key");
  }
  if (response.status === 429) {
    throw new Error("Google Places rate limit exceeded; please try again later");
  }
  if (!response.ok) {
    throw new Error(`Google Places API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  return extractNeighborhood(data.places?.[0]?.addressComponents);
}
