import { z } from "zod";
import { v } from "convex/values";
import { VenueLocationAllZodFields } from "./location_types";

// Add alongside your existing Zod schemas:

// ── Food tags (cuisine / dining types) ───────────────────────────────────────
// Used for food-spot rows in non_ticket_events instead of eventTags.
export const foodTagValidator = v.union(
  v.literal("Italian"),
  v.literal("Pizza"),
  v.literal("Japanese"),
  v.literal("Sushi"),
  v.literal("Chinese"),
  v.literal("Mexican"),
  v.literal("Thai"),
  v.literal("Indian"),
  v.literal("Korean"),
  v.literal("Vietnamese"),
  v.literal("French"),
  v.literal("Greek"),
  v.literal("Mediterranean"),
  v.literal("American"),
  v.literal("Seafood"),
  v.literal("Steakhouse"),
  v.literal("BBQ"),
  v.literal("Vegan"),
  v.literal("Vegetarian"),
  v.literal("Brunch"),
  v.literal("Sandwiches"),
  v.literal("Burgers"),
  v.literal("Ice Cream"),
  v.literal("Coffee"),
  v.literal("Bakery"),
  v.literal("Bar"),
  v.literal("Breakfast"),
  v.literal("Fast Food"),
  v.literal("Dessert"),
  v.literal("Brazilian"),
  v.literal("Middle Eastern"),
  v.literal("Spanish"),
  v.literal("Asian Fusion"),
  v.literal("Latin American"),
  v.literal("African"),
  v.literal("Brewery"),
  v.literal("Wine Bar"),
  v.literal("Ramen"),
);

export const FoodTagSchema = z.enum([
  "Italian",
  "Pizza",
  "Japanese",
  "Sushi",
  "Chinese",
  "Mexican",
  "Thai",
  "Indian",
  "Korean",
  "Vietnamese",
  "French",
  "Greek",
  "Mediterranean",
  "American",
  "Seafood",
  "Steakhouse",
  "BBQ",
  "Vegan",
  "Vegetarian",
  "Brunch",
  "Sandwiches",
  "Burgers",
  "Ice Cream",
  "Coffee",
  "Bakery",
  "Bar",
  "Breakfast",
  "Fast Food",
  "Dessert",
  "Brazilian",
  "Middle Eastern",
  "Spanish",
  "Asian Fusion",
  "Latin American",
  "African",
  "Brewery",
  "Wine Bar",
  "Ramen",
]);

export type FoodTag = z.infer<typeof FoodTagSchema>;
export const AllFoodTags: FoodTag[] = FoodTagSchema.options;

// Event types
export const eventTagValidator = v.union(
  v.literal("Concert"),
  v.literal("Movie"),
  v.literal("Basketball"),
  v.literal("Baseball"),
  v.literal("Hockey"),
  v.literal("Cheerleading"),
  v.literal("Rap"),
  v.literal("Pop"),
  v.literal("Country"),
  v.literal("R&B"),
  v.literal("Alternative"),
  v.literal("Indie"),
  v.literal("Rock"),
  v.literal("Comedy Night"),
  v.literal("Theater"),
  v.literal("Art"),
  v.literal("Orchestra"),
  v.literal("Golf"),
  v.literal("Charity"),
  v.literal("Mini Golf"),
  v.literal("Escape Room"),
  v.literal("Trivia"),
  v.literal("Festival"),
  v.literal("Hiking"),
  v.literal("Swimming"),
  v.literal("Camping"),
  v.literal("Cooking"),
  v.literal("Wine Tasting"),
  v.literal("Bowling"),
  v.literal("Soccer"),
  v.literal("Other Sports"),
  v.literal("Pottery"),
  v.literal("Reading"),
  v.literal("Night Life"),
  v.literal("Cycling"),
  v.literal("Yoga"),
  v.literal("CrossFit"),
  v.literal("Board Games"),
  v.literal("Dance Class"),
  v.literal("Poetry"),
  v.literal("Opera"),
  v.literal("Kids & Family"),
  v.literal("Museum"),
  v.literal("Drinking"),
  v.literal("Tour"),
  v.literal("Park"),
  v.literal("Custom"),
  v.literal("None")
);


export const EventStatusSchema = z.enum([
  "onsale",
  "offsale",
  "cancelled",
  "postponed",
  "rescheduled",
]);

export type EventStatus = z.infer<typeof EventStatusSchema>;
export const eventStatusValidator = v.union(
  v.literal("onsale"),
  v.literal("offsale"),
  v.literal("cancelled"),
  v.literal("postponed"),
  v.literal("rescheduled"),
);
export const BudgetBucketSchema = z.enum(["low", "medium", "high"]);
export type BudgetBucket = z.infer<typeof BudgetBucketSchema>;
export const budgetBucketValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const EventTagSchema = z.enum([
  "Concert",
  "Movie",
  "Basketball",
  "Baseball",
  "Hockey",
  "Cheerleading",
  "Rap",
  "Pop",
  "Country",
  "R&B",
  "Alternative",
  "Indie",
  "Rock",
  "Comedy Night",
  "Theater",
  "Art",
  "Orchestra",
  "Golf",
  "Charity",
  "Mini Golf",
  "Escape Room",
  "Trivia",
  "Festival",
  "Hiking",
  "Swimming",
  "Camping",
  "Cooking",
  "Wine Tasting",
  "Bowling",
  "Soccer",
  "Other Sports",
  "Pottery",
  "Reading",
  "Night Life",
  "Cycling",
  "Yoga",
  "CrossFit",
  "Board Games",
  "Dance Class",
  "Poetry",
  "Opera",
  "Kids & Family",
  "Museum",
  "Drinking",
  "Tour",
  "Park",
  "Custom",
  "None",
]);

export type EventTag = z.infer<typeof EventTagSchema>;
export const AllEventTags: EventTag[] = EventTagSchema.options;

export const EventSourceLinkSchema = z.object({
  source: z.string().min(1),
  eventId: z.string().min(1),
  url: z.string().min(1),
});
export type EventSourceLink = z.infer<typeof EventSourceLinkSchema>;
export const eventSourceLinkValidator = v.object({
  source: v.string(),
  eventId: v.string(),
  url: v.string(),
});
export const eventSourceLinksValidator = v.optional(
  v.array(eventSourceLinkValidator),
);
const eventTagSet = new Set<string>(AllEventTags);

const legacyEventTagAliases = {
  Nature: "Hiking",
  Athletics: "Other Sports",
  Sports: "Other Sports",
  Games: "Board Games",
  Indoor: null,
  Concerts: "Concert",
  Festivals: "Festival",
  Theatre: "Theater",
  "Comedy Show": "Comedy Night",
  "Trivia Night": "Trivia",
  "Cooking Class": "Cooking",
  "Pottery Class": "Pottery",
  "Book Club": "Reading",
  "Art Gallery": "Art",
  "Live Music": "Concert",
  Dinner: null,
  Museum: null,
  Karaoke: null,
  Dancing: null,
  "Bar Hopping": "Night Life",
  Beach: null,
  "Road Trip": null,
  Volunteering: "Charity",
  Arcade: null,
  "Fitness Class": "CrossFit",
  Picnic: null,
  Brunch: null,
  Coffee: null,
  "Farmers Market": null,
  "Game Night": "Board Games",
  Hackathon: null,
  Outdoor: "Hiking",
  "Asian Cuisine": null,
  "American Cuisine": null,
  "Latin-American Cuisine": null,
  "African Cuisine": null,
  "Mediterranean Cuisine": null,
  "West-Asian Cuisine": null,
} satisfies Record<string, EventTag | null>;

export type LegacyEventTag = keyof typeof legacyEventTagAliases;

const legacyEventTagValidator = v.union(
  v.literal("Nature"),
  v.literal("Athletics"),
  v.literal("Sports"),
  v.literal("Games"),
  v.literal("Indoor"),
  v.literal("Concerts"),
  v.literal("Festivals"),
  v.literal("Theatre"),
  v.literal("Comedy Show"),
  v.literal("Trivia Night"),
  v.literal("Cooking Class"),
  v.literal("Pottery Class"),
  v.literal("Book Club"),
  v.literal("Art Gallery"),
  v.literal("Live Music"),
  v.literal("Dinner"),
  v.literal("Museum"),
  v.literal("Karaoke"),
  v.literal("Dancing"),
  v.literal("Bar Hopping"),
  v.literal("Beach"),
  v.literal("Road Trip"),
  v.literal("Volunteering"),
  v.literal("Arcade"),
  v.literal("Fitness Class"),
  v.literal("Picnic"),
  v.literal("Brunch"),
  v.literal("Coffee"),
  v.literal("Farmers Market"),
  v.literal("Game Night"),
  v.literal("Hackathon"),
  v.literal("Outdoor"),
  v.literal("Asian Cuisine"),
  v.literal("American Cuisine"),
  v.literal("Latin-American Cuisine"),
  v.literal("African Cuisine"),
  v.literal("Mediterranean Cuisine"),
  v.literal("West-Asian Cuisine"),
);

export const legacyCompatibleEventTagsValidator = v.optional(
  v.array(v.union(eventTagValidator, legacyEventTagValidator)),
);

/** Combined validator that accepts both EventTag and FoodTag values in one column. */
export const combinedVenueTagValidator = v.union(
  eventTagValidator,
  legacyEventTagValidator,
  foodTagValidator,
);

export function normalizeEventTags(
  tags: readonly string[] | null | undefined,
): EventTag[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  const normalizedTags: EventTag[] = [];
  const seen = new Set<EventTag>();

  for (const tag of tags) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) {
      continue;
    }

    const legacyAlias = Object.prototype.hasOwnProperty.call(
      legacyEventTagAliases,
      trimmedTag,
    )
      ? legacyEventTagAliases[trimmedTag as LegacyEventTag]
      : null;

    const normalizedTag = eventTagSet.has(trimmedTag)
      ? (trimmedTag as EventTag)
      : legacyAlias;

    if (!normalizedTag || seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags;
}
// Schema for weekly open/close hours used by venue-type non_ticket_events.
export const OpenHoursPeriodSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
  openTime: z.string(),  // "HH:MM" 24-hour
  closeTime: z.string(), // "HH:MM" 24-hour
});
export type OpenHoursPeriod = z.infer<typeof OpenHoursPeriodSchema>;

/** Zod schema for the normalized event shape shared across all providers. */
export const NormalizedEventSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  startTime: z.string().nullable(),
  ...VenueLocationAllZodFields,
  source: z.string().min(1),
  url: z.string().min(1),
  image: z.string().nullable(),
  // For activity venues: EventTag[]. For food venues: FoodTag[]. One column, venueType decides.
  tags: z.array(z.union([EventTagSchema, FoodTagSchema])).optional(),
  status: EventStatusSchema.nullable(),
  budgetBucket: BudgetBucketSchema.nullable(),
  genre: z.string().nullable(),
  sourceLinks: z.array(EventSourceLinkSchema).optional(),
  tagsConfirmed: z.boolean().optional(),
  tagAttempts: z.number().optional(),
  // Venue-specific fields for non-ticket places (Google Places, Yelp)
  venueType: z.enum(["food", "activity"]).optional(),
  openHours: z.array(OpenHoursPeriodSchema).optional(),
});

/** Internal normalized event schema shared across all event providers. */
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
export const eventTagsValidator = legacyCompatibleEventTagsValidator;
