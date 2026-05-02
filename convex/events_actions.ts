import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  AllEventTags,
  type EventTag,
  eventSourceLinksValidator,
  eventTagsValidator,
} from "./event_types";
import { inferTagsFromText } from "./ranking";
import { venueLocationAllFields } from "./location_types";
import { api, internal } from "./_generated/api";



/**
 * AI-powered event tagging function (can be called from mutations).
 * Analyzes event title and description to determine appropriate tags and
 * whether the event is primarily a food/dining experience or an activity.
 */
export async function tagEventWithAI(event: {
  eventId: string;
  title: string;
  description?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
}): Promise<{ tags: EventTag[]; venueType: "food" | "activity" } | null> {
  // Build context for the AI
  const eventContext = [
    `Title: ${event.title}`,
    event.description ? `Description: ${event.description}` : null,
    event.venueName ? `Venue: ${event.venueName}` : null,
    event.venueCity ? `City: ${event.venueCity}` : null,
  ].filter(Boolean).join('\n');

  const availableTags = AllEventTags.filter(t => t !== "Custom" && t !== "None").join(', ');
  
  const prompt = `Analyze this event and return a JSON object with two fields: "tags" and "venueType".
    Available tags: ${availableTags}
    Event details: ${eventContext}
    Tag rules:
    - Use "Other Sports" ONLY for sports or athletic activities not already represented by a specific tag (Basketball, Baseball, Hockey, Cheerleading, Golf, Mini Golf, Hiking, Swimming, Cycling, Yoga, CrossFit, Bowling). If the event matches one of those specific sports, use that tag instead of "Other Sports".
    - "Concert" = a single artist, band, or performer playing one show. "Festival" = a multi-artist, multi-stage event spanning one or more days (e.g. Coachella, Lollapalooza, a music festival). Never assign both Concert and Festival to the same event.
    - Do NOT assign music genre tags (Rap, Pop, Country, R&B, Alternative, Indie, Rock, Orchestra, Opera) to events tagged as "Festival". Festivals span many genres; use only the "Festival" tag for festival events.
    - "Opera" is a specific classical vocal performance genre — use it instead of "Theater" or "Concert" for opera events. Only use "Orchestra" for purely instrumental ensemble performances with no vocal soloists.
    - "Soccer" covers association football / MLS / FIFA events. Use "Soccer" instead of "Other Sports" for soccer matches.
    - "Dance Class" is for participatory dance instruction (salsa, ballet, ballroom, hip-hop class). Do not use it for dance performances or recitals — use "Theater" or "Concert" for those.
    - "Kids & Family" applies to events explicitly designed for children or families — theme character events, kids shows, family days, children's activities. If an event is family-oriented, always add this tag.
    - "Museum" applies to museum visits, exhibits, tours, or events hosted at a museum, science center, aquarium, zoo, or planetarium.
    venueType rules:
    - "food" = the PRIMARY purpose of attending is eating or drinking (e.g. going to a restaurant for a meal, brunch service at a cafe, happy hour at a bar, a wine/beer tasting). Classify as "food" when the event IS the dining experience — people are primarily going there to eat or drink.
    - "activity" = the PRIMARY purpose is attending a performance, show, competition, class, or organized activity, even if food is served (e.g. a drag show at a restaurant, trivia night at a bar, a cooking class, a concert at a venue, a comedy night at a pub).
    - When the event title or description is a straightforward meal occasion — "Sunday Brunch at X", "Dinner Service at X", "Happy Hour at X", "Wine Tasting at X" — classify as "food".
    - Only classify as "activity" if there is an explicit performance, show, class, competition, or organized event component beyond just dining.
    - When in doubt, prefer "food" if the event is at a food venue and no explicit non-dining activity is mentioned.
    Return format: {"tags": ["Tag1", "Tag2"], "venueType": "food" | "activity"}`;

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return null;
    }

    const openrouter = createOpenRouter({ apiKey });

    const result = await streamText({
      model: openrouter.chat("openai/gpt-oss-120b"),
      system: "You are a JSON-only API. You must respond with only a valid JSON object. No text before or after. No markdown code blocks.",
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 700,
    });

    let response = "";
    for await (const chunk of (await result).textStream) {
      response += chunk;
    }
    // Strip markdown code fences before parsing
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    if (!cleaned) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to salvage tags from a malformed response
      const extracted = [...cleaned.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      if (extracted.length === 0) return null;
      const validFallback = extracted.filter((tag): tag is EventTag =>
        AllEventTags.includes(tag as EventTag) && tag !== "Custom" && tag !== "None"
      );
      return validFallback.length > 0 ? { tags: validFallback, venueType: "activity" } : null;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    const obj = parsed as Record<string, unknown>;
    const rawTags = Array.isArray(obj.tags) ? obj.tags : [];
    const validTags = (rawTags as string[]).filter((tag): tag is EventTag =>
      AllEventTags.includes(tag as EventTag) && tag !== "Custom" && tag !== "None"
    );
    if (validTags.length === 0) return null;

    const venueType: "food" | "activity" =
      obj.venueType === "food" ? "food" : "activity";

    return { tags: validTags, venueType };
  } catch (error) {
    console.error("AI tagging failed:", error);
    return null;
  }
}

export const storeAndTagEvents = internalAction({
  args: {
      events: v.array(v.object({
      eventId: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      startTime: v.optional(v.string()),
      ...venueLocationAllFields,
      source: v.string(),
      url: v.string(),
      sourceLinks: eventSourceLinksValidator,
      image: v.optional(v.string()),
      tags: eventTagsValidator,
      status: v.optional(v.union(v.literal("onsale"), v.literal("offsale"), v.literal("cancelled"), v.literal("postponed"), v.literal("rescheduled"))),
      budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
      genre: v.optional(v.string()),
      venueType: v.optional(v.union(v.literal("food"), v.literal("activity"))),
    })),
  },
  handler: async (ctx, args) => {
    const existingEvents = await ctx.runQuery(api.events_queries.getEventsByIds, { 
      eventIds: args.events.map(e => e.eventId), 
    });
    const MAX_TAG_ATTEMPTS = 3;
    const taggedEvents = await Promise.all(
      args.events.map(async (event, i) => {
        const existing = existingEvents[i];
        // Only tag if event doesn't exist or has no tags
        if (existing?.tagsConfirmed && existing.tags && existing.tags.length > 0) {
          return { ...event, tags: existing.tags as EventTag[], tagsConfirmed: true, tagAttempts: existing.tagAttempts };
        }

        if ((existing?.tagAttempts ?? 0) >= MAX_TAG_ATTEMPTS) {
          return { ...event, tags: (existing?.tags?.length ? existing.tags : ["None"]) as EventTag[], tagsConfirmed: true, tagAttempts: existing?.tagAttempts };
        }

        const result = await tagEventWithAI(event);
        return { ...event, tags: (result?.tags ?? []) as EventTag[], venueType: result?.venueType ?? event.venueType, tagsConfirmed: result !== null, tagAttempts: (existing?.tagAttempts ?? 0) + 1, };
      })
    );
    await ctx.runMutation(internal.events_mutations.storeEvents, {
      events: taggedEvents.map(({ tags, ...rest }) => ({ ...rest, tags: tags as EventTag[] })),
    });
  },
});

/**
 * AI-powered event tagging action.
 * Analyzes event title and description to determine appropriate tags.
 */
export const tagEvent = internalAction({
  args: {
    event: v.object({
      eventId: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      venueName: v.optional(v.string()),
      venueCity: v.optional(v.string()),
    }),
  },
  returns: v.union(v.object({ tags: v.array(v.string()), venueType: v.union(v.literal("food"), v.literal("activity")) }), v.null()),
  handler: async (_ctx, { event }) => {
    return await tagEventWithAI(event);
  },
});

/**
 * Tag multiple events in batch
 */
export const tagEvents = internalAction({
  args: {
    events: v.array(v.object({
      eventId: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      venueName: v.optional(v.string()),
      venueCity: v.optional(v.string()),
    })),
  },
  returns: v.array(v.object({
    eventId: v.string(),
    tags: v.union(v.object({ tags: v.array(v.string()), venueType: v.union(v.literal("food"), v.literal("activity")) }), v.null()),
  })),
  handler: async (_ctx, { events }) => {
    const results = await Promise.all(
      events.map(async (event) => {
        const tags = await tagEventWithAI(event);
        return {
          eventId: event.eventId,
          tags,
        };
      })
    );
    return results;
  },
});

const STORE_EVENTS_ARGS = v.array(v.object({
  eventId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  startTime: v.optional(v.string()),
  ...venueLocationAllFields,
  source: v.string(),
  url: v.string(),
  sourceLinks: eventSourceLinksValidator,
  image: v.optional(v.string()),
  tags: eventTagsValidator,
  status: v.optional(v.union(v.literal("onsale"), v.literal("offsale"), v.literal("cancelled"), v.literal("postponed"), v.literal("rescheduled"))),
  budgetBucket: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  genre: v.optional(v.string()),
}));

/**
 * Stores events immediately using fast pattern-based tags, then returns the
 * IDs of events that still need AI tagging so the caller can schedule that
 * work in the background without blocking the recommendation response.
 */
export const storeEventsWithPatternTags = internalAction({
  args: { events: STORE_EVENTS_ARGS },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const existingEvents = await ctx.runQuery(api.events_queries.getEventsByIds, {
      eventIds: args.events.map((e) => e.eventId),
    });
    const MAX_TAG_ATTEMPTS = 3;
    const needsAITagging: string[] = [];

    const eventsToStore = args.events.map((event, i) => {
      const existing = existingEvents[i];

      // Already confirmed — never overwrite
      if (existing?.tagsConfirmed && existing.tags && existing.tags.length > 0) {
        return { ...event, tags: existing.tags as EventTag[], tagsConfirmed: true, tagAttempts: existing.tagAttempts };
      }

      // Too many failed AI attempts — give up
      if ((existing?.tagAttempts ?? 0) >= MAX_TAG_ATTEMPTS) {
        return { ...event, tags: (existing?.tags?.length ? existing.tags : ["None"]) as EventTag[], tagsConfirmed: true, tagAttempts: existing?.tagAttempts };
      }

      // Use fast pattern-based tags as an interim; schedule AI tagging in the background
      const patternTags = inferTagsFromText(
        [event.title, event.description ?? "", event.venueName ?? ""].join(" "),
      );
      const interimTags: EventTag[] =
        patternTags.length > 0
          ? patternTags
          : existing?.tags?.length
            ? (existing.tags as EventTag[])
            : [];

      needsAITagging.push(event.eventId);
      return { ...event, tags: interimTags, tagsConfirmed: false, tagAttempts: existing?.tagAttempts ?? 0 };
    });

    await ctx.runMutation(internal.events_mutations.storeEvents, {
      events: eventsToStore.map(({ tags, ...rest }) => ({ ...rest, tags: tags as EventTag[] })),
    });

    return needsAITagging;
  },
});

/**
 * Background action: runs AI tagging on events that were stored with interim
 * pattern-based tags and updates them in-place. Scheduled via ctx.scheduler
 * so it never blocks the recommendation response.
 */
export const tagAndUpdateStoredEvents = internalAction({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.eventIds.length === 0) return;

    const existingEvents = await ctx.runQuery(api.events_queries.getEventsByIds, {
      eventIds: args.eventIds,
    });
    const MAX_TAG_ATTEMPTS = 3;

    await Promise.all(
      args.eventIds.map(async (eventId, i) => {
        const existing = existingEvents[i];
        if (!existing) return;
        if (existing.tagsConfirmed && existing.tags && existing.tags.length > 0) return;
        if ((existing.tagAttempts ?? 0) >= MAX_TAG_ATTEMPTS) return;

        const tags = await tagEventWithAI({
          eventId,
          title: existing.title,
          description: existing.description ?? null,
          venueName: existing.venueName ?? null,
          venueCity: existing.venueCity ?? null,
        });

        await ctx.runMutation(internal.events_mutations.updateEvent, {
          eventId,
          updates: {
            ...(tags !== null && { tags: tags.tags as EventTag[], venueType: tags.venueType, tagsConfirmed: true }),
            tagAttempts: (existing.tagAttempts ?? 0) + 1,
          },
        });
      }),
    );
  },
});
