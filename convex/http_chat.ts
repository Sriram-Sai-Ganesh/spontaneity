import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { getLocation, getCurrentWeather } from "./weather";
import { searchEvents } from "./events";
import type { AvailabilityWindow } from "./availability";
import type { NormalizedEvent } from "./event_types";
import { AllEventTags } from "./event_types";
import type { RankingConfidenceResult } from "./ranking";
import { AI_ASSISTANT_CHAT_KIND } from "./chats_constants";

type AppearanceThemeMode = "light" | "dark" | "random" | "system";
type AppearanceFontPreset =
  | "roboto"
  | "manrope"
  | "space-grotesk"
  | "lora"
  | "ibm-plex-sans";
type AppearanceFontSize = "small" | "medium" | "large";
type AppearanceThemeName = "light" | "dark" | "random";
type AppearanceThemeSpecification = {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  typography?: {
    fontFamily?: string;
    fontPreset?: AppearanceFontPreset;
    fontSize?: AppearanceFontSize;
  };
};
type AppearanceThemes = {
  light: AppearanceThemeSpecification;
  dark: AppearanceThemeSpecification;
  random?: AppearanceThemeSpecification;
};

const DEFAULT_APPEARANCE_THEMES: AppearanceThemes = {
  light: {
    colors: {
      primary: "#f0f0f0",
      secondary: "#d9d9d9",
      accent: "#5e5e5e",
    },
    typography: {
      fontPreset: "roboto",
      fontSize: "medium",
    },
  },
  dark: {
    colors: {
      primary: "#141414",
      secondary: "#232323",
      accent: "#b0b0b0",
    },
    typography: {
      fontPreset: "roboto",
      fontSize: "medium",
    },
  },
};

// Hono app typed with Convex action context + userId from auth middleware
type Env = {
  Bindings: {
    ctx: ActionCtx;
    userId: Id<"users">;
  };
};

const weatherTools = {
  getLocation: tool({
    description:
      "Given a city name, returns the location with latitude and longitude coordinates",
    inputSchema: z.object({
      city: z.string().describe("City name, e.g. Chicago"),
    }),
    execute: async ({ city }) => getLocation(city),
  }),
  getCurrentWeather: tool({
    description:
      "Given latitude and longitude coordinates, returns the current weather conditions",
    inputSchema: z.object({
      latitude: z.number().describe("Latitude coordinate, e.g. 39.29"),
      longitude: z.number().describe("Longitude coordinate, e.g. -76.61"),
    }),
    execute: async ({ latitude, longitude }) =>
      getCurrentWeather(latitude, longitude),
  }),
};

const calendarTools = {
  createCalendarEvent: tool({
    description:
      "Create an iCalendar (.ics) event from natural language constraints (title, times, location, description). Times should be in ISO 8601 and include timezone info when possible. If the user does not provide date/time/timezone, first call getCurrentDateTime to anchor the event.",
    inputSchema: z.object({
      title: z.string().describe("Event title"),
      start: z.string().describe("Start datetime ISO 8601"),
      end: z.string().describe("End datetime ISO 8601"),
      location: z.string().optional().describe("Event location"),
      description: z.string().optional().describe("Event description/notes"),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone, e.g. America/New_York; used only for labeling",
        ),
    }),
    execute: async ({ title, start, end, location, description, timezone }) => {
      const startDate = new Date(start);
      const endDate = new Date(end);

      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new Error(
          "Invalid start or end datetime; provide ISO 8601 values.",
        );
      }

      const uid = `${crypto.randomUUID()}@spontaneity.ai`;
      const dtstamp = formatIcsDate(new Date());
      const dtstart = formatIcsDateLocal(startDate);
      const dtend = formatIcsDateLocal(endDate);

      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Spontaneity//Calendar AI//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        timezone
          ? `DTSTART;TZID=${timezone}:${dtstart}`
          : `DTSTART:${formatIcsDate(startDate)}`,
        timezone
          ? `DTEND;TZID=${timezone}:${dtend}`
          : `DTEND:${formatIcsDate(endDate)}`,
        `SUMMARY:${escapeIcsText(title)}`,
        description ? `DESCRIPTION:${escapeIcsText(description)}` : undefined,
        location ? `LOCATION:${escapeIcsText(location)}` : undefined,
        "END:VEVENT",
        "END:VCALENDAR",
      ].filter(Boolean) as string[];

      const ics = lines.join("\r\n");

      return {
        filename: `${slugify(title) || "event"}.ics`,
        ics,
        timezone: timezone ?? "UTC",
      };
    },
  }),
};
const timeTools = {
  getCurrentDateTime: tool({
    description:
      "Return the current date and time with canonical local date/weekday labels for a timezone.",
    inputSchema: z.object({
      timeZone: z
        .string()
        .optional()
        .describe("IANA timezone, e.g. America/New_York"),
    }),
    execute: async ({ timeZone = "America/New_York" }) => {
      const now = new Date();
      let resolvedTimeZone = timeZone;
      let warning: string | undefined;
      try {
        localDateKeyForIso(now.toISOString(), resolvedTimeZone);
      } catch {
        resolvedTimeZone = "America/New_York";
        warning = `Invalid timezone '${timeZone}'. Falling back to ${resolvedTimeZone}.`;
      }
      const dateContext = buildDateContext(resolvedTimeZone);
      return {
        iso: now.toISOString(),
        timeZone: resolvedTimeZone,
        ...dateContext,
        timezoneOffsetMinutes: now.getTimezoneOffset(),
        warning,
      };
    },
  }),
};

export function makeEventTools(ctx: ActionCtx, userId: Id<"users">) {
  return {
    searchEvents: tool({
      description:
        "Search for upcoming events (concerts, sports, shows) by city, keyword, or date range. Returns a list of normalized events with title, date, venue, and ticket URL. If city is omitted, the current user's saved city is used when available; otherwise the tool returns an error asking for a city.",
      inputSchema: z.object({
        city: z.string().optional().describe("City name, e.g. Chicago"),
        keyword: z.string().optional().describe("Search keyword, e.g. Orioles"),
        startDateTime: z
          .string()
          .optional()
          .describe("ISO 8601 start datetime filter"),
        endDateTime: z
          .string()
          .optional()
          .describe("ISO 8601 end datetime filter"),
        size: z
          .number()
          .optional()
          .describe("Max number of results to return (default 5)"),
      }),
      execute: async (params) => {
        // Rate-limit both providers before searching.
        const [tmLimit, yelpLimit, gpLimit] = await Promise.all([
          ctx.runMutation(internal.rate_limit.checkRateLimit, {
            key: "ticketmaster",
            limitPerWindow: 60,
            windowMs: 60_000,
          }),
          ctx.runMutation(internal.rate_limit.checkRateLimit, {
            key: "yelp",
            limitPerWindow: 3,
            windowMs: 60_000,
          }),
          ctx.runMutation(internal.rate_limit.checkRateLimit, {
            key: "google_places",
            limitPerWindow: 30,
            windowMs: 60_000,
          }),
        ]);
        if (!tmLimit.ok && !yelpLimit.ok && !gpLimit.ok) {
          const retryAfterSec = Math.ceil(
            Math.min(
              tmLimit.retryAfterMs ?? 60_000,
              yelpLimit.retryAfterMs ?? 60_000,
              gpLimit.retryAfterMs ?? 60_000,
            ) / 1000,
          );
          return {
            error:
              `Event search is temporarily unavailable — we've hit the search limit. ` +
              `Please try again in ${retryAfterSec}s.`,
          };
        }

        try {
          const userCity =
            params.city?.trim()
              ? null
              : await ctx.runQuery(internal.users_queries.getUserCityInternal, {
                  userId,
                });
          const resolvedCity = params.city?.trim() || userCity || undefined;
          if (!resolvedCity) {
            return {
              error:
                "No default city is saved for your profile. Add a city in your profile or specify one in your request.",
            };
          }
          return await searchEvents({
            ...params,
            city: resolvedCity,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes("rate limit")) {
            return {
              error:
                "Event search is temporarily unavailable — we've hit the search limit. " +
                "Please try again in a few minutes.",
            };
          }
          throw err;
        }
      },
    }),
  };
}

const coreTools = { ...weatherTools, ...calendarTools, ...timeTools };

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const appearanceThemeModeSchema = z.enum(["light", "dark", "random", "system"]);
const appearanceFontPresetSchema = z.enum([
  "roboto",
  "manrope",
  "space-grotesk",
  "lora",
  "ibm-plex-sans",
]);
const appearanceFontSizeSchema = z.enum(["small", "medium", "large"]);
const appearanceColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN)
  .describe("A six-digit hex color, e.g. #2563eb.");
const appearanceThemeUpdateSchema = z.object({
  colors: z
    .object({
      primary: appearanceColorSchema.optional(),
      secondary: appearanceColorSchema.optional(),
      accent: appearanceColorSchema.optional(),
    })
    .optional()
    .describe("Optional color updates for this theme variant."),
  fontPreset: appearanceFontPresetSchema
    .optional()
    .describe("Optional font preset update for this theme variant."),
  fontSize: appearanceFontSizeSchema
    .optional()
    .describe("Optional font size update for this theme variant."),
});
const appearanceToolInputSchema = z.object({
  mode: appearanceThemeModeSchema
    .optional()
    .describe("The page theme mode to use: light, dark, random, or system."),
  randomPreset: z
    .enum(["use_saved", "generate_new"])
    .optional()
    .describe(
      "'use_saved' switches to the existing saved random preset without changing its colors. 'generate_new' generates and saves new random preset colors, then uses the random theme.",
    ),
  fontPreset: appearanceFontPresetSchema
    .optional()
    .describe("Global font preset applied to light and dark themes."),
  fontSize: appearanceFontSizeSchema
    .optional()
    .describe("Global font size applied to light and dark themes."),
  light: appearanceThemeUpdateSchema
    .optional()
    .describe("Light theme color or typography updates."),
  dark: appearanceThemeUpdateSchema
    .optional()
    .describe("Dark theme color or typography updates."),
  random: appearanceThemeUpdateSchema
    .optional()
    .describe("Optional random theme color or typography updates."),
});

type AppearanceToolInput = z.infer<typeof appearanceToolInputSchema>;

function cloneThemeSpecification(
  specification: AppearanceThemeSpecification,
): AppearanceThemeSpecification {
  return {
    colors: { ...specification.colors },
    typography: specification.typography
      ? { ...specification.typography }
      : undefined,
  };
}

function cloneAppearanceThemes(themes: AppearanceThemes): AppearanceThemes {
  return {
    light: cloneThemeSpecification(themes.light),
    dark: cloneThemeSpecification(themes.dark),
    ...(themes.random
      ? { random: cloneThemeSpecification(themes.random) }
      : {}),
  };
}

function getTypographyForRandomPreset(themes: AppearanceThemes) {
  return {
    ...(themes.random?.typography ??
      themes.light.typography ??
      themes.dark.typography ?? {
        fontPreset: "roboto",
        fontSize: "medium",
      }),
  };
}

function applyThemeUpdate(
  themes: AppearanceThemes,
  themeName: AppearanceThemeName,
  update: AppearanceToolInput["light"],
): boolean {
  if (!update) return false;

  const fallback =
    themeName === "dark"
      ? DEFAULT_APPEARANCE_THEMES.dark
      : DEFAULT_APPEARANCE_THEMES.light;
  const existing = themes[themeName] ?? cloneThemeSpecification(fallback);
  const next = cloneThemeSpecification(existing);
  let changed = false;

  for (const colorName of ["primary", "secondary", "accent"] as const) {
    const color = update.colors?.[colorName];
    if (color && next.colors[colorName] !== color) {
      next.colors[colorName] = color;
      changed = true;
    }
  }

  if (update.fontPreset || update.fontSize) {
    const typography = {
      fontPreset: next.typography?.fontPreset ?? "roboto",
      fontSize: next.typography?.fontSize ?? "medium",
      ...(next.typography?.fontFamily
        ? { fontFamily: next.typography.fontFamily }
        : {}),
    };
    if (update.fontPreset && typography.fontPreset !== update.fontPreset) {
      typography.fontPreset = update.fontPreset;
      changed = true;
    }
    if (update.fontSize && typography.fontSize !== update.fontSize) {
      typography.fontSize = update.fontSize;
      changed = true;
    }
    next.typography = typography;
  }

  if (changed) {
    themes[themeName] = next;
  }
  return changed;
}

function applyGlobalTypographyUpdate(
  themes: AppearanceThemes,
  fontPreset: AppearanceFontPreset | undefined,
  fontSize: AppearanceFontSize | undefined,
): boolean {
  if (!fontPreset && !fontSize) return false;

  let changed = false;
  changed =
    applyThemeUpdate(themes, "light", { fontPreset, fontSize }) || changed;
  changed =
    applyThemeUpdate(themes, "dark", { fontPreset, fontSize }) || changed;
  if (themes.random) {
    changed =
      applyThemeUpdate(themes, "random", { fontPreset, fontSize }) || changed;
  }
  return changed;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

function parseWeekday(weekday?: string): number | null {
  if (!weekday) return null;
  return WEEKDAY_TO_INDEX[weekday.trim().toLowerCase()] ?? null;
}

function weekdayForIso(iso: string, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(new Date(iso));
  return WEEKDAY_TO_INDEX[label.toLowerCase()];
}

function localDateKeyForIso(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function localDateTimeForIso(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function localWeekdayForIso(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(new Date(iso));
}

function localDateLabelForIso(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

function buildDateContext(timeZone: string): {
  nowIso: string;
  todayLocalDate: string;
  todayLocalWeekday: string;
  todayLocalLabel: string;
} {
  const nowIso = new Date().toISOString();
  return {
    nowIso,
    todayLocalDate: localDateKeyForIso(nowIso, timeZone),
    todayLocalWeekday: localWeekdayForIso(nowIso, timeZone),
    todayLocalLabel: localDateLabelForIso(nowIso, timeZone),
  };
}

function appendWarning(current: string | undefined, next: string): string {
  return current ? `${current} ${next}` : next;
}

type EventSummaryBudgetBucket = "low" | "medium" | "high" | null;

type EventSummaryInput = {
  title: string;
  localDateLabel: string | null;
  startLocal: string | null;
  venueName: string | null;
  venueCity: string | null;
  fitReasons: string[];
  budgetBucket: EventSummaryBudgetBucket;
};

function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function trimToWordLimit(text: string, maxWords: number): string {
  if (maxWords <= 0) return "";
  const words = text.trim().match(/\S+/g) ?? [];
  if (words.length <= maxWords) {
    return text.trim();
  }
  return `${words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[.,;:!?-]+$/, "")}.`;
}

function parseBudgetPreferenceFromSummary(
  learnedProfileSummary: string[],
): "low" | "medium" | "high" | "mixed" | null {
  const budgetLine = learnedProfileSummary.find((line) => /budget/i.test(line));
  if (!budgetLine) return null;
  if (/lower-budget/i.test(budgetLine)) return "low";
  if (/higher-budget/i.test(budgetLine)) return "high";
  if (/\bmixed\b/i.test(budgetLine)) return "mixed";
  if (/\bmedium\b/i.test(budgetLine)) return "medium";
  return null;
}

function buildEventSummaryConstraintSuffix(args: {
  learnedProfileSummary: string[];
  events: EventSummaryInput[];
  durationMinutes: number;
  requestedDate: string | null;
  requestedWeekday: string | null;
}): string {
  const budgetPreference = parseBudgetPreferenceFromSummary(
    args.learnedProfileSummary,
  );
  const knownBudgetBuckets = args.events
    .map((event) => event.budgetBucket)
    .filter(
      (bucket): bucket is NonNullable<EventSummaryBudgetBucket> =>
        bucket !== null,
    );
  const uniqueBudgetBuckets = [...new Set(knownBudgetBuckets)];
  const timeReference = args.requestedDate
    ? `the group's availability on ${args.requestedDate}`
    : args.requestedWeekday
      ? `the group's ${args.requestedWeekday} availability`
      : `${args.durationMinutes}-minute shared availability windows`;

  if (
    budgetPreference &&
    budgetPreference !== "mixed" &&
    uniqueBudgetBuckets.length > 0 &&
    uniqueBudgetBuckets.every((bucket) => bucket === budgetPreference)
  ) {
    const budgetLabel =
      budgetPreference === "low"
        ? "lower-budget"
        : budgetPreference === "high"
          ? "higher-budget"
          : budgetPreference;
    return `These also match the group's learned ${budgetLabel} preference and ${timeReference}.`;
  }

  if (budgetPreference === "mixed") {
    return `These fit ${timeReference}, and the budget range stays flexible for this group.`;
  }

  if (budgetPreference) {
    return `These fit ${timeReference}, with mixed budget fit against the group's learned preference.`;
  }

  if (uniqueBudgetBuckets.length === 1) {
    return `These fit ${timeReference} and stay in a ${uniqueBudgetBuckets[0]} budget range.`;
  }

  if (uniqueBudgetBuckets.length > 1) {
    return `These fit ${timeReference} and offer a mix of ${uniqueBudgetBuckets.join("/")} budget options.`;
  }

  return `These fit ${timeReference}; the group does not have a learned budget preference yet.`;
}

function buildDeterministicEventSummary(events: EventSummaryInput[]): string {
  const eventSnippets = events.slice(0, 3).map((event) => {
    const timing = event.localDateLabel ?? event.startLocal;
    const venue = event.venueName ?? event.venueCity;
    const details = [timing, venue].filter(Boolean).join(" at ");
    return details ? `${event.title} (${details})` : event.title;
  });

  if (eventSnippets.length === 0) return "";
  if (eventSnippets.length === 1)
    return `${eventSnippets[0]} is the strongest current match.`;
  if (eventSnippets.length === 2) {
    return `${eventSnippets[0]} and ${eventSnippets[1]} are the strongest current matches.`;
  }
  return `${eventSnippets[0]}, ${eventSnippets[1]}, and ${eventSnippets[2]} are the strongest current matches.`;
}

async function generateAvailableEventsSummaryMessage(args: {
  apiKey: string | undefined;
  model: string;
  events: EventSummaryInput[];
  learnedProfileSummary: string[];
  durationMinutes: number;
  requestedDate: string | null;
  requestedWeekday: string | null;
}): Promise<string> {
  const constraintSuffix = buildEventSummaryConstraintSuffix({
    learnedProfileSummary: args.learnedProfileSummary,
    events: args.events,
    durationMinutes: args.durationMinutes,
    requestedDate: args.requestedDate,
    requestedWeekday: args.requestedWeekday,
  });
  const maxSummaryWords = Math.max(18, 75 - wordCount(constraintSuffix));
  const fallbackSummary = trimToWordLimit(
    buildDeterministicEventSummary(args.events),
    maxSummaryWords,
  );

  if (!args.apiKey) {
    return `${fallbackSummary} ${constraintSuffix}`.trim();
  }

  try {
    const openrouter = createOpenRouter({ apiKey: args.apiKey });
    const summaryPrompt = [
      `Write one plain-text sentence under ${maxSummaryWords} words summarizing these top group event matches.`,
      "Use only the provided event facts.",
      "Mention up to the top 3 events by title and, when helpful, timing or venue.",
      "Do not mention budgets or time constraints.",
      "Do not use markdown or bullet points.",
      "",
      "Events:",
      ...args.events.slice(0, 3).map((event, index) => {
        const fitReasonText =
          event.fitReasons.length > 0
            ? `; fit reasons: ${event.fitReasons.join(" ")}`
            : "";
        return `${index + 1}. ${event.title} | date: ${event.localDateLabel ?? event.startLocal ?? "unknown"} | venue: ${event.venueName ?? event.venueCity ?? "unknown"}${fitReasonText}`;
      }),
    ].join("\n");

    const result = streamText({
      model: openrouter.chat(args.model),
      maxOutputTokens: 100,
      messages: [
        {
          role: "user",
          content: summaryPrompt,
        },
      ],
    });

    let summary = "";
    for await (const chunk of (await result).textStream) {
      summary += chunk;
    }

    const cleanedSummary = trimToWordLimit(
      summary
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["']|["']$/g, ""),
      maxSummaryWords,
    );
    const finalSummary = cleanedSummary || fallbackSummary;
    return `${finalSummary} ${constraintSuffix}`.trim();
  } catch (error) {
    console.warn(
      "[findGroupAvailableEvents] Summary generation failed:",
      error,
    );
    return `${fallbackSummary} ${constraintSuffix}`.trim();
  }
}

function shouldEnableUnfilteredEventSearch(
  messages: Array<{ role?: string; content?: unknown }>,
): boolean {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const content = lastUserMessage?.content;
  const text =
    typeof content === "string"
      ? content.toLowerCase()
      : Array.isArray(content)
        ? content
            .map((part) =>
              typeof part === "string"
                ? part
                : typeof part === "object" &&
                    part !== null &&
                    "text" in part &&
                    typeof (part as { text?: unknown }).text === "string"
                  ? (part as { text: string }).text
                  : "",
            )
            .join(" ")
            .toLowerCase()
        : "";

  if (!text) return false;
  return /without\s+(availability|calendar|constraints)|ignore\s+(availability|calendar|constraints)|regardless of availability|unfiltered/.test(
    text,
  );
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatIcsDateLocal(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0];
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

const POLL_TYPE_SELECTION_PROMPT =
  "Would you like this poll to use recommended events or custom options?";
const CUSTOM_POLL_OPTIONS_PROMPT =
  "Tell me the three specific events or activities you want in the poll, and I'll create it.";

type ChatMessageLike = {
  role?: string;
  content?: unknown;
};

function getMessageText(message: ChatMessageLike | undefined) {
  return typeof message?.content === "string" ? message.content.trim() : "";
}

function stripAiMention(text: string) {
  return text.replace(/@ai\b/gi, "").trim();
}

function looksLikePollCreationRequest(text: string) {
  const normalized = stripAiMention(text).toLowerCase();
  if (!normalized) return false;

  const hasPollWord = /\b(poll|ballot)\b/.test(normalized);
  const hasCreateIntent =
    /\b(create|make|start|build|setup|set up)\b/.test(normalized) ||
    /\blet'?s\b/.test(normalized);

  return hasPollWord && hasCreateIntent;
}

function looksLikePollTypeSelectionPrompt(text: string) {
  return text.trim() === POLL_TYPE_SELECTION_PROMPT;
}

function isRecommendedPollChoice(text: string) {
  const normalized = stripAiMention(text).toLowerCase();
  return /\b(recommended|recommendation|suggested)\b/.test(normalized);
}

function isCustomPollChoice(text: string) {
  const normalized = stripAiMention(text).toLowerCase();
  return /\b(custom|manual)\b/.test(normalized);
}

function looksLikeClosePollRequest(text: string) {
  const normalized = stripAiMention(text).toLowerCase();
  return (
    /\bpolls?\b/.test(normalized) &&
    /\b(close|end|stop|finish|archive|delete|remove)\b/.test(normalized)
  );
}

function getLatestAssistantMessageBeforeLastUser(
  messages: ChatMessageLike[],
  lastUserIndex: number,
) {
  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return messages[index];
    }
  }

  return undefined;
}

function selectMessagesForModel<T>({
  messages,
  isAssistantChat,
  useOnlyCurrentMessage,
}: {
  messages: T[];
  isAssistantChat: boolean;
  useOnlyCurrentMessage: boolean;
}) {
  const lastMessage = messages[messages.length - 1];
  if (useOnlyCurrentMessage && lastMessage) {
    return [lastMessage];
  }

  if (isAssistantChat) {
    return messages.slice(-5);
  }

  return messages;
}

function sanitizeToolErrorMessage(error: unknown, fallback: string) {
  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message
      : typeof error === "string" && error.trim()
        ? error
        : fallback;

  if (rawMessage.includes("This group already has an open poll")) {
    return "This group already has an open poll. Vote on or close it before creating another one.";
  }

  const singleLine = rawMessage.trim().split("\n")[0] ?? fallback;
  const withoutPrefix = singleLine.replace(/^Uncaught Error:\s*/, "").trim();
  const withoutStackLocation = withoutPrefix
    .replace(/\s+at\s+[^(]+\(.+\)\s*$/, "")
    .trim();

  return withoutStackLocation || fallback;
}

function trimOptionalString(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createPollOptionEventId(
  title: string,
  index: number,
  existingEventId?: string,
) {
  const trimmedEventId = trimOptionalString(existingEventId);
  if (trimmedEventId) {
    return trimmedEventId;
  }

  const slug = slugify(title) || `option-${index + 1}`;
  return `poll-option-${slug}-${crypto.randomUUID()}`;
}

function formatCreatePollErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (rawMessage.includes("This group already has an open poll")) {
    return "This group already has an open poll. Vote on or close it before creating another one.";
  }
  return (
    rawMessage
      .trim()
      .split("\n")[0]
      ?.replace(/^Uncaught Error:\s*/, "")
      .replace(/\s+at\s+[^(]+\(.+\)\s*$/, "")
      .trim() || "Failed to create poll"
  );
}

function formatClosePollErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    rawMessage
      .trim()
      .split("\n")[0]
      ?.replace(/^Uncaught Error:\s*/, "")
      .replace(/\s+at\s+[^(]+\(.+\)\s*$/, "")
      .trim() || "Failed to close the current open poll."
  );
}

const app = new Hono<Env>();

app.post("/api/chat", async (c) => {
  const { ctx, userId } = c.env;

  // Parse request body
  let chatId: Id<"chats">;
  let model: string;
  let openRouterApiKey: string | undefined;
  try {
    const body = await c.req.json();
    chatId = body.chatId;
    model = body.model;
    openRouterApiKey = body.openRouterApiKey;
    if (!chatId || !model) throw new Error("Missing chatId or model");
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  // Verify chat ownership
  const ownership = await ctx.runQuery(
    internal.messages_internals.verifyChatOwnership,
    { chatId, userId },
  );
  if (!ownership.ok) {
    return c.json({ error: ownership.error }, 403);
  }
  const isAssistantChat = ownership.kind === AI_ASSISTANT_CHAT_KIND;

  // Per-user AI chat rate limit: 20 requests/minute.
  const aiRateLimit = await ctx.runMutation(
    internal.rate_limit.checkRateLimit,
    {
      key: userId,
      limitPerWindow: 20,
      windowMs: 60_000,
    },
  );
  if (!aiRateLimit.ok) {
    const retryAfterSec = Math.ceil(
      (aiRateLimit.retryAfterMs ?? 60_000) / 1000,
    );
    return c.json(
      { error: `Rate limit exceeded. Try again in ${retryAfterSec}s.` },
      429,
    );
  }

  let lastRankingConfidence: RankingConfidenceResult | null = null;
  let activeMidpointContext: string | null = null;

  const availabilityTools = {
    getSharedAvailability: tool({
      description:
        "Get shared free-time windows for the current group chat from Google Calendar data. Can optionally filter by weekday.",
      inputSchema: z.object({
        daysAhead: z
          .number()
          .optional()
          .describe("Lookahead window in days (default 7)"),
        durationMinutes: z
          .number()
          .optional()
          .describe("Required meeting/event duration in minutes (default 120)"),
        weekday: z
          .string()
          .optional()
          .describe("Optional weekday filter, e.g. Friday"),
        date: z
          .string()
          .optional()
          .describe(
            "Optional local calendar date filter (YYYY-MM-DD), e.g. 2026-03-12",
          ),
        timeZone: z
          .string()
          .optional()
          .describe(
            "IANA timezone for weekday filtering, e.g. America/New_York",
          ),
        maxWindows: z
          .number()
          .optional()
          .describe("Max windows to return (default 20, max 50)"),
      }),
      execute: async ({
        daysAhead,
        durationMinutes,
        weekday,
        date,
        timeZone = "America/New_York",
        maxWindows = 20,
      }) => {
        const availability = await ctx.runAction(
          internal.availability_action.getSharedAvailabilityForChatInternal,
          {
            chatId,
            userId,
            daysAhead,
            durationMinutes,
          },
        );

        if (availability.error) {
          return availability;
        }

        const requestedWeekday = parseWeekday(weekday);
        const requestedDate = date?.trim();
        const validDatePattern = /^\d{4}-\d{2}-\d{2}$/;
        let matchingWindows = availability.sharedWindows as Array<{
          start: string;
          end: string;
        }>;
        let resolvedTimeZone = timeZone;
        let warning: string | undefined;

        try {
          // Validate timezone once; if invalid we fallback to ET.
          localDateKeyForIso(availability.dateRange.start, resolvedTimeZone);
        } catch {
          resolvedTimeZone = "America/New_York";
          warning = appendWarning(
            warning,
            `Invalid timezone '${timeZone}'. Falling back to ${resolvedTimeZone}.`,
          );
        }

        if (requestedDate) {
          if (validDatePattern.test(requestedDate)) {
            matchingWindows = matchingWindows.filter(
              (window) =>
                localDateKeyForIso(window.start, resolvedTimeZone) ===
                requestedDate,
            );
          } else {
            warning = appendWarning(
              warning,
              `Invalid date '${requestedDate}'. Expected YYYY-MM-DD; date filter ignored.`,
            );
          }
        }

        if (weekday && requestedWeekday === null) {
          warning = appendWarning(
            warning,
            `Unknown weekday '${weekday}'. Weekday filter ignored.`,
          );
        } else if (requestedWeekday !== null) {
          matchingWindows = matchingWindows.filter(
            (window) =>
              weekdayForIso(window.start, resolvedTimeZone) ===
              requestedWeekday,
          );
        }

        const clampedMax = Math.min(Math.max(1, maxWindows), 50);
        const dateContext = buildDateContext(resolvedTimeZone);
        const localizedWindows = matchingWindows
          .slice(0, clampedMax)
          .map((window) => ({
            start: window.start,
            end: window.end,
            localDate: localDateKeyForIso(window.start, resolvedTimeZone),
            localWeekday: localWeekdayForIso(window.start, resolvedTimeZone),
            localDateLabel: localDateLabelForIso(
              window.start,
              resolvedTimeZone,
            ),
            startLocal: localDateTimeForIso(window.start, resolvedTimeZone),
            endLocal: localDateTimeForIso(window.end, resolvedTimeZone),
          }));
        return {
          memberCount: availability.memberCount,
          dateRange: availability.dateRange,
          durationMinutes: availability.durationMinutes,
          requestedWeekday: weekday ?? null,
          requestedDate: requestedDate ?? null,
          timeZone: resolvedTimeZone,
          totalSharedWindows: availability.sharedWindows.length,
          matchingSharedWindowsCount: matchingWindows.length,
          matchingSharedWindows: localizedWindows,
          truncated: matchingWindows.length > clampedMax,
          warning,
          dateContext,
        };
      },
    }),
    findGroupAvailableEvents: tool({
      description:
        "Find events that fit the group's shared availability windows for this chat. Uses Ticketmaster + Google Calendar shared free-time filtering.",
      inputSchema: z.object({
        city: z
          .string()
          .optional()
          .describe("City name. Defaults to the group's saved location, then the current user's saved city when available"),
        keyword: z
          .string()
          .optional()
          .describe("Optional event keyword, e.g. jazz, comedy"),
        daysAhead: z
          .number()
          .optional()
          .describe("Lookahead window in days (default 7)"),
        durationMinutes: z
          .number()
          .optional()
          .describe("Required event duration in minutes (default 120)"),
        weekday: z
          .string()
          .optional()
          .describe("Optional weekday filter, e.g. Thursday"),
        date: z
          .string()
          .optional()
          .describe("Optional local date filter (YYYY-MM-DD), e.g. 2026-03-12"),
        timeZone: z
          .string()
          .optional()
          .describe(
            "IANA timezone for date/weekday filtering, e.g. America/New_York",
          ),
        maxEvents: z
          .number()
          .optional()
          .describe(
            "Max events to return after filtering (default 10, max 50)",
          ),
        venueTypeFilter: z
          .enum(["food", "activity"])
          .optional()
          .describe(
            "Filter returned events by type. Pass 'food' when user asks for food spots/restaurants/dining. Pass 'activity' when user asks for events, activities, or things to do (not food).",
          ),
      }),
      execute: async ({
        city,
        keyword,
        daysAhead,
        durationMinutes,
        weekday,
        date,
        timeZone = "America/New_York",
        maxEvents = 10,
        venueTypeFilter,
      }) => {
        // Override venueTypeFilter when the user's message clearly signals a different type
        // than the AI inferred from conversation context. The AI sometimes anchors to the
        // previous call's venueTypeFilter across topic switches (e.g. activity → food).
        const effectiveVenueTypeFilter = (() => {
          const text = lastUserContent.toLowerCase();
          const foodWords = [
            "eat",
            "food",
            "restaurant",
            "restaurants",
            "dining",
            "dine",
            "brunch",
            "lunch",
            "dinner",
            "breakfast",
            "cafe",
            "coffee",
            "bar",
            "bars",
            "pub",
            "pubs",
            "bite",
            "drink",
            "drinks",
          ];
          const hasFoodIntent = foodWords.some((word) =>
            new RegExp(`\\b${word}\\b`).test(text),
          );
          if (hasFoodIntent && venueTypeFilter !== "food") {
            console.log(`[venueType:override] User message has food/place intent → forcing venueTypeFilter="food"`);
            return "food" as const;
          }
          return venueTypeFilter;
        })();

        const eventSearchSize = Math.min(Math.max(10, maxEvents * 3), 50);
        const runAvailabilityEventSearch = (cityParam?: string) =>
          ctx.runAction(
            internal.availability_action.findAvailableEventsForChatInternal,
            {
              chatId,
              userId,
              city: cityParam,
              keyword,
              daysAhead,
              durationMinutes,
              size: eventSearchSize,
              venueTypeFilter: effectiveVenueTypeFilter,
            },
          );

        let availabilityEvents = await runAvailabilityEventSearch(city);

        if (availabilityEvents.error) {
          return availabilityEvents;
        }

        const normalizedKeyword = keyword?.toLowerCase() ?? "";
        const normalizedCity = city?.toLowerCase().trim() ?? "";
        const inferredCityFromKeyword =
          Boolean(normalizedCity) &&
          Boolean(normalizedKeyword) &&
          normalizedKeyword.includes(normalizedCity);
        let fallbackWarning: string | undefined;

        // If city likely came from the team name (e.g. "Inter Miami"), widen search once.
        if (
          inferredCityFromKeyword &&
          availabilityEvents.totalEvents === 0 &&
          availabilityEvents.filteredEvents.length === 0
        ) {
          const fallbackResult = await runAvailabilityEventSearch(undefined);
          if (!fallbackResult.error) {
            availabilityEvents = fallbackResult;
            fallbackWarning = `No results found with city '${city}'. Retried without city filter.`;
          }
        }

        const requestedWeekday = parseWeekday(weekday);
        const requestedDate = date?.trim();
        const validDatePattern = /^\d{4}-\d{2}-\d{2}$/;
        const hasValidDateFilter = Boolean(
          requestedDate && validDatePattern.test(requestedDate),
        );
        const hasInvalidDateFilter = Boolean(
          requestedDate && !validDatePattern.test(requestedDate),
        );
        const hasValidWeekdayFilter = Boolean(
          weekday && requestedWeekday !== null,
        );
        const hasInvalidWeekdayFilter = Boolean(
          weekday && requestedWeekday === null,
        );
        let resolvedTimeZone = timeZone;
        let warning: string | undefined = fallbackWarning;

        try {
          localDateKeyForIso(
            availabilityEvents.dateRange.start,
            resolvedTimeZone,
          );
        } catch {
          resolvedTimeZone = "America/New_York";
          warning = appendWarning(
            warning,
            `Invalid timezone '${timeZone}'. Falling back to ${resolvedTimeZone}.`,
          );
        }

        if (hasInvalidDateFilter) {
          warning = appendWarning(
            warning,
            `Invalid date '${requestedDate}'. Expected YYYY-MM-DD; date filter ignored.`,
          );
        }
        if (hasInvalidWeekdayFilter) {
          warning = appendWarning(
            warning,
            `Unknown weekday '${weekday}'. Weekday filter ignored.`,
          );
        }

        const matchesDayFilters = (iso?: string | null): boolean => {
          if (!iso) return !hasValidDateFilter && !hasValidWeekdayFilter;
          if (hasValidDateFilter) {
            if (localDateKeyForIso(iso, resolvedTimeZone) !== requestedDate)
              return false;
          }
          if (hasValidWeekdayFilter) {
            return weekdayForIso(iso, resolvedTimeZone) === requestedWeekday;
          }
          return true;
        };

        const matchesWindowDayFilters = (window: {
          start: string;
          end: string;
        }): boolean => {
          const windowStartIso = window.start;
          const windowEndIso = window.end;
          const endExclusiveMinusMs = new Date(
            Math.max(
              new Date(windowEndIso).getTime() - 1,
              new Date(windowStartIso).getTime(),
            ),
          ).toISOString();

          if (hasValidDateFilter) {
            const overlapsRequestedDate =
              localDateKeyForIso(windowStartIso, resolvedTimeZone) ===
                requestedDate ||
              localDateKeyForIso(endExclusiveMinusMs, resolvedTimeZone) ===
                requestedDate;
            if (!overlapsRequestedDate) return false;
          }

          if (hasValidWeekdayFilter) {
            const overlapsRequestedWeekday =
              weekdayForIso(windowStartIso, resolvedTimeZone) ===
                requestedWeekday ||
              weekdayForIso(endExclusiveMinusMs, resolvedTimeZone) ===
                requestedWeekday;
            if (!overlapsRequestedWeekday) return false;
          }

          return true;
        };

        const matchingWindows = availabilityEvents.sharedWindows.filter(
          matchesWindowDayFilters,
        );

        // Pick the right pre-ranked list based on effectiveVenueTypeFilter so each type
        // gets its own top-3 ranking rather than competing in a single list.
        const rankedOrFilteredEvents = (
          effectiveVenueTypeFilter === "food"
            ? (availabilityEvents.rankedFoodEvents ?? availabilityEvents.filteredEvents)
            : effectiveVenueTypeFilter === "activity"
              ? (availabilityEvents.rankedActivityEvents ?? availabilityEvents.filteredEvents)
              : availabilityEvents.rankedEvents?.length > 0
                ? availabilityEvents.rankedEvents
                : availabilityEvents.filteredEvents
        ) as NormalizedEvent[];


        const matchingAvailableEvents = rankedOrFilteredEvents
          .filter(
            (event: NormalizedEvent) =>
              Boolean(event.startTime) && matchesDayFilters(event.startTime),
          )
          .map((event: NormalizedEvent) => ({
            eventId: event.eventId,
            title: event.title,
            description: event.description ?? null,
            startTime: event.startTime,
            startLocal: event.startTime
              ? localDateTimeForIso(event.startTime, resolvedTimeZone)
              : null,
            localDate: event.startTime
              ? localDateKeyForIso(event.startTime, resolvedTimeZone)
              : null,
            localWeekday: event.startTime
              ? localWeekdayForIso(event.startTime, resolvedTimeZone)
              : null,
            localDateLabel: event.startTime
              ? localDateLabelForIso(event.startTime, resolvedTimeZone)
              : null,
            venueName: event.venueName,
            venueCity: event.venueCity,
            venueCountry: event.venueCountry,
            url: event.url,
            source: event.source,
            image: event.image,
            status: event.status,
            genre: event.genre ?? null,
            tags: Array.isArray(event.tags) ? event.tags : [],
            venueType:
              event.venueType === "food"
                ? "food"
                : "activity",
            openHours: Array.isArray(event.openHours) ? event.openHours : null,
            fitReasons:
              "fitReasons" in event && Array.isArray(event.fitReasons)
                ? event.fitReasons
                : [],
            budgetBucket:
              "budgetBucket" in event &&
              (event.budgetBucket === "low" ||
                event.budgetBucket === "medium" ||
                event.budgetBucket === "high")
                ? event.budgetBucket
                : null,
          }));

        const clampedMax = Math.min(Math.max(1, maxEvents), 50);
        const venueFiltered = effectiveVenueTypeFilter
          ? matchingAvailableEvents.filter((e) => e.venueType === effectiveVenueTypeFilter)
          : matchingAvailableEvents;
        const returnedEvents = venueFiltered.slice(0, clampedMax);
        const dateContext = buildDateContext(resolvedTimeZone);
        const constraintStatus =
          venueFiltered.length > 0
            ? "ok"
            : matchingWindows.length === 0
              ? "no_shared_availability"
              : "no_events_in_shared_availability";
        const constraintMessage =
          constraintStatus === "ok"
            ? null
            : constraintStatus === "no_shared_availability"
              ? hasValidDateFilter
                ? `No shared free-time windows meet the requested duration on ${requestedDate}.`
                : hasValidWeekdayFilter
                  ? `No shared free-time windows meet the requested duration on ${weekday}.`
                  : "No shared free-time windows meet the requested duration in the selected range."
              : hasValidDateFilter
                ? `Shared free-time windows exist on ${requestedDate}, but no events were found that fit those windows.`
                : hasValidWeekdayFilter
                  ? `Shared free-time windows exist on ${weekday}, but no events were found that fit those windows.`
                  : "Shared free-time windows exist, but no events were found that fit those windows.";
        const learnedProfileSummary = Array.isArray(
          availabilityEvents.learnedProfileSummary,
        )
          ? availabilityEvents.learnedProfileSummary
          : [];
        const allergenWarnings =
          typeof availabilityEvents.allergenWarnings === "string" &&
          availabilityEvents.allergenWarnings.length > 0
            ? availabilityEvents.allergenWarnings
            : null;
        // Build summary deterministically — avoids an extra LLM round-trip inside
        // the tool so the result is ready instantly. The summary is written directly
        // to the SSE stream by the displayEventCards handler below.
        const summaryMessageResolved: string | null =
          constraintStatus === "ok" && returnedEvents.length > 0
            ? (() => {
                const eventInputs: EventSummaryInput[] = returnedEvents
                  .slice(0, 3)
                  .map((event) => ({
                    title: event.title,
                    localDateLabel: event.localDateLabel,
                    startLocal: event.startLocal,
                    venueName: event.venueName,
                    venueCity: event.venueCity,
                    fitReasons: event.fitReasons,
                    budgetBucket: event.budgetBucket,
                  }));
                const constraintSuffix = buildEventSummaryConstraintSuffix({
                  learnedProfileSummary,
                  events: eventInputs,
                  durationMinutes: availabilityEvents.durationMinutes,
                  requestedDate: hasValidDateFilter ? (requestedDate ?? null) : null,
                  requestedWeekday: hasValidWeekdayFilter ? (weekday ?? null) : null,
                });
                const midpointContextSentence = activeMidpointContext
                  ? `Using group midpoint: ${activeMidpointContext}.`
                  : "";
                const suffixWords = wordCount(
                  [constraintSuffix, midpointContextSentence, allergenWarnings ?? ""]
                    .filter(Boolean)
                    .join(" "),
                );
                const maxWords = Math.max(18, 75 - suffixWords);
                const base = `${trimToWordLimit(buildDeterministicEventSummary(eventInputs), maxWords)} ${constraintSuffix}`.trim();
                const withMidpoint = midpointContextSentence
                  ? `${base} ${midpointContextSentence}`.trim()
                  : base;
                return allergenWarnings
                  ? `${withMidpoint} ${allergenWarnings}`.trim()
                  : withMidpoint;
              })()
            : null;

        try {
          await ctx.runMutation(
            internal.recommendation_metrics_mutations
              .recordRecommendationRunInternal,
            {
              chatId,
              returnedEventCount: returnedEvents.length,
              fallbackUsed: Boolean(fallbackWarning),
              fallbackReason: fallbackWarning ?? null,
            },
          );
        } catch (error) {
          console.warn(
            "[chat] failed to record recommendation metrics:",
            error,
          );
        }
        return {
          memberCount: availabilityEvents.memberCount,
          dateRange: availabilityEvents.dateRange,
          durationMinutes: availabilityEvents.durationMinutes,
          requestedWeekday: weekday ?? null,
          requestedDate: requestedDate ?? null,
          timeZone: resolvedTimeZone,
          totalEventsFromSources: availabilityEvents.totalEvents,
          availabilityMatchedEventsCount:
            availabilityEvents.filteredEvents.length,
          returnedEventsCount: Math.min(
            venueFiltered.length,
            clampedMax,
          ),
          events: returnedEvents.map(({ budgetBucket, ...event }) => event),
          summary_message: summaryMessageResolved,
          learnedProfileSummary,
          rankingConfidence: (lastRankingConfidence = availabilityEvents.rankingConfidence),
          sharedWindowsCount: availabilityEvents.sharedWindows.length,
          matchingSharedWindowsCount: matchingWindows.length,
          matchingSharedWindows: matchingWindows
            .slice(0, 20)
            .map((window: AvailabilityWindow) => ({
              start: window.start,
              end: window.end,
              startLocal: localDateTimeForIso(window.start, resolvedTimeZone),
              endLocal: localDateTimeForIso(window.end, resolvedTimeZone),
              localDate: localDateKeyForIso(window.start, resolvedTimeZone),
              localWeekday: localWeekdayForIso(window.start, resolvedTimeZone),
              localDateLabel: localDateLabelForIso(
                window.start,
                resolvedTimeZone,
              ),
            })),
          constraintStatus,
          constraintMessage,
          warning,
          dateContext,
        };
      },
    }),
  };

  // Read message history and group metadata in parallel
  const [messages, chatMeta] = await Promise.all([
    ctx.runQuery(internal.messages_internals.getMessagesByChat, { chatId }),
    ctx.runQuery(internal.chats_queries.getChatInternal, { chatId }),
  ]);
  activeMidpointContext =
    chatMeta?.useDistanceRanking === true &&
    chatMeta.midpointLatitude != null &&
    chatMeta.midpointLongitude != null
      ? chatMeta.midpointLabel?.trim() || "the saved group midpoint"
      : null;
  const enableUnfilteredEventSearch = shouldEnableUnfilteredEventSearch(
    messages as Array<{ role?: string; content?: unknown }>,
  );
  const eventTools = makeEventTools(ctx, userId);

  // For preference updates or preference queries, use only the current message—they don't depend on chat history.
  const lastMsg = messages[messages.length - 1];
  const lastContent = lastMsg?.role === "user" ? lastMsg.content : "";
  const lastContentText = typeof lastContent === "string" ? lastContent : "";
  const assistantAddressed = isAssistantChat || /@ai\b/i.test(lastContentText);
  const looksLikePreferenceUpdate =
    assistantAddressed &&
    /\b(?:prefer|like|want|update my preference|set my preference|change my preference|add.*preference|remove.*preference|no longer like|take off)\b/i.test(
      lastContentText,
    ) &&
    !/\b(?:what are|what's|show)\s+(?:my|[\w]+'s)?\s*preference/i.test(
      lastContentText,
    );
  const looksLikePreferenceQuery =
    assistantAddressed &&
    /\b(?:what are|what's|show)\s+(?:my|[\w]+'s)?\s*preference/i.test(
      lastContentText,
    );
  const looksLikeAppearanceUpdate =
    assistantAddressed &&
    /\b(?:appearance|theme|dark mode|light mode|system theme|random theme|randomize|randomise|font|color|palette|accent|display settings?)\b/i.test(
      lastContentText,
    );
  const previousAssistantMessage =
    lastMsg?.role === "user"
      ? getLatestAssistantMessageBeforeLastUser(
          messages as ChatMessageLike[],
          messages.length - 1,
        )
      : undefined;
  const previousAssistantContent = getMessageText(previousAssistantMessage);
  const lastUserContent = lastContentText;
  const useOnlyCurrentMessage =
    (looksLikePreferenceUpdate ||
      looksLikePreferenceQuery ||
      looksLikeAppearanceUpdate) &&
    Boolean(lastMsg);
  const messagesToSend = selectMessagesForModel({
    messages,
    isAssistantChat,
    useOnlyCurrentMessage,
  });

  // Set up AI provider
  const apiKey = openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Server API key not configured" }, 500);
  }

  const openrouter = createOpenRouter({ apiKey });

  return streamSSE(c, async (stream) => {
    // Flush configuration
    const FLUSH_INTERVAL_MS = 200;
    const MIN_FLUSH_SIZE = 100;

    let messageId: Awaited<ReturnType<typeof ctx.runMutation>> | null = null;
    let fullText = "";
    const toolInputs = new Map<
      string,
      { toolName: string; args: Record<string, unknown> }
    >();

    try {
      // Create placeholder assistant message before streaming begins
      messageId = await ctx.runMutation(
        internal.messages_internals.createStreamingMessage,
        { chatId, userId, model },
      );

      // Notify client of the created message ID
      await stream.writeSSE({
        data: JSON.stringify({ messageId }),
        event: "message-created",
      });

      const userName = await ctx.runQuery(
        internal.users_queries.getDisplayNameForUserId,
        { userId },
      );
      const firstName = userName?.trim().split(/\s+/)[0] ?? "you";

      const directPollFollowUp =
        lastMsg?.role === "user" &&
        looksLikePollCreationRequest(lastUserContent) &&
        !looksLikePollTypeSelectionPrompt(previousAssistantContent)
          ? POLL_TYPE_SELECTION_PROMPT
          : lastMsg?.role === "user" &&
              looksLikePollTypeSelectionPrompt(previousAssistantContent) &&
              isCustomPollChoice(lastUserContent) &&
              !isRecommendedPollChoice(lastUserContent)
            ? CUSTOM_POLL_OPTIONS_PROMPT
            : null;

      if (
        lastMsg?.role === "user" &&
        looksLikeClosePollRequest(lastUserContent)
      ) {
        try {
          await ctx.runMutation(
            internal.event_polls_mutations.closeOpenPollInternal,
            { chatId, userId },
          );
          fullText = "Closed the current open poll.";
        } catch (error) {
          fullText = sanitizeToolErrorMessage(
            error,
            "Failed to close the current open poll.",
          );
        }

        await stream.writeSSE({
          data: fullText,
          event: "text-delta",
        });
        await ctx.runMutation(
          internal.messages_internals.completeStreamingMessage,
          { messageId, content: fullText },
        );
        await stream.writeSSE({ data: "[DONE]", event: "text-delta" });
        return;
      }

      if (directPollFollowUp) {
        fullText = directPollFollowUp;
        await stream.writeSSE({
          data: directPollFollowUp,
          event: "text-delta",
        });
        await ctx.runMutation(
          internal.messages_internals.completeStreamingMessage,
          { messageId, content: fullText },
        );
        await stream.writeSSE({ data: "[DONE]", event: "text-delta" });
        return;
      }

      const validPreferenceTags = AllEventTags.filter((t) => t !== "None" && t !== "Custom").join(", ");
      const preferenceTools = {
        setUserEventPreferences: tool({
          description:
            `Update the CURRENT USER's (the message sender's) event preferences. This tool ONLY saves for the person who sent the message—never for another member. ` +
            `Use EXACT tag names for event types from this list: ${validPreferenceTags}. ` +
            `Also supports: allergies (e.g. ['peanuts', 'shellfish']), dietaryRestrictions (e.g. ['vegetarian', 'halal']), cuisinePreferences (e.g. ['Italian', 'Japanese']). ` +
            `Use action='add' to add types to their existing list, action='remove' to remove specific types, or action='replace' to overwrite the entire list.`,
          inputSchema: z.object({
            action: z
              .enum(["add", "remove", "replace"])
              .describe(
                "'add' to add types to the existing list, 'remove' to remove specific types from the existing list, 'replace' to overwrite the entire list. Default to 'add' unless the user is clearly replacing all preferences.",
              ),
            preferredEventTypes: z
              .array(z.string())
              .describe(
                `Event type(s) the user LIKES. Use exact tag names, e.g. ['Concert'] or ['Basketball', 'Soccer']. Pass empty array if no positive preferences to change.`,
              ),
            negativeEventTypes: z
              .array(z.string())
              .describe(
                `Event type(s) the user DISLIKES or wants to avoid. Use exact tag names, e.g. ['Other Sports', 'Night Life']. Pass empty array if no negative preferences to change.`,
              ),
            allergies: z
              .array(z.string())
              .optional()
              .describe(
                "Food allergies the user has, e.g. ['peanuts', 'shellfish', 'gluten']. Omit if the user said nothing about allergies.",
              ),
            dietaryRestrictions: z
              .array(z.string())
              .optional()
              .describe(
                "Dietary restrictions or eating styles, e.g. ['vegetarian', 'vegan', 'halal', 'kosher']. Omit if not mentioned.",
              ),
            cuisinePreferences: z
              .array(z.string())
              .optional()
              .describe(
                "Cuisine types the user enjoys for food/dining events, e.g. ['Italian', 'Japanese', 'Mexican']. Omit if not mentioned.",
              ),
          }),
          execute: async ({
            action,
            preferredEventTypes,
            negativeEventTypes,
            allergies,
            dietaryRestrictions,
            cuisinePreferences,
          }) => {
            const normalized = preferredEventTypes
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean);
            const normalizedNegative = negativeEventTypes
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean);
            const hasOtherFields = allergies !== undefined || dietaryRestrictions !== undefined || cuisinePreferences !== undefined;
            if (normalized.length === 0 && normalizedNegative.length === 0 && !hasOtherFields) {
              return {
                saved: false,
                preferredEventTypes: [],
                negativeEventTypes: [],
                error: "No valid types",
              };
            }
            try {
              await ctx.runMutation(
                internal.user_preferences_mutations
                  .setUserEventPreferencesInternal,
                {
                  userId,
                  preferredEventTypes: normalized,
                  negativeEventTypes: normalizedNegative,
                  action,
                  ...(allergies !== undefined && { allergies }),
                  ...(dietaryRestrictions !== undefined && { dietaryRestrictions }),
                  ...(cuisinePreferences !== undefined && { cuisinePreferences }),
                },
              );
              return {
                saved: true,
                action,
                preferredEventTypes: normalized,
                negativeEventTypes: normalizedNegative,
                ...(allergies !== undefined && { allergies }),
                ...(dietaryRestrictions !== undefined && { dietaryRestrictions }),
                ...(cuisinePreferences !== undefined && { cuisinePreferences }),
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[chat] setUserEventPreferences failed:", msg, {
                userId,
                action,
                preferredEventTypes: normalized,
                negativeEventTypes: normalizedNegative,
              });
              return {
                saved: false,
                action,
                preferredEventTypes: normalized,
                negativeEventTypes: normalizedNegative,
                error: msg,
              };
            }
          },
        }),
        setPersonSpecificEventPreference: tool({
          description:
            `Update the CURRENT USER's person-specific preference for another group member. ` +
            `Use this when the sender says things like 'I don't like going to concerts with Alice', 'I enjoy hiking with Bob', or 'I dislike sports events when John is there'. ` +
            `This records that the CURRENT USER has a preference that applies specifically when a named member is in the group. ` +
            `Use exact EventTag names for likes/dislikes (same list as setUserEventPreferences).`,
          inputSchema: z.object({
            memberName: z
              .string()
              .describe(
                "First name or nickname of the other group member (NOT the current user), e.g. 'Alice', 'Bob'.",
              ),
            likes: z
              .array(z.string())
              .optional()
              .describe(
                "Event tags the current user likes when this member is present, e.g. ['Hiking', 'Camping']. Use exact tag names.",
              ),
            dislikes: z
              .array(z.string())
              .optional()
              .describe(
                "Event tags the current user dislikes when this member is present, e.g. ['Concert', 'Night Life']. Use exact tag names.",
              ),
            action: z
              .enum(["add", "remove", "replace"])
              .optional()
              .describe(
                "'add' (default) to merge, 'remove' to remove specific tags, 'replace' to overwrite.",
              ),
          }),
          execute: async ({ memberName, likes, dislikes, action = "add" }) => {
            const otherUserId = await ctx.runQuery(
              internal.chats_queries.resolveChatMemberNameToUserId,
              { chatId, nameOrNickname: memberName.trim() },
            );
            if (!otherUserId) {
              return { saved: false, error: `Member '${memberName}' not found in this group.` };
            }
            try {
              await ctx.runMutation(
                internal.user_preferences_mutations.setPersonSpecificPreferencesInternal,
                {
                  userId,
                  otherUserId,
                  likes: likes?.map((t) => t.trim().toLowerCase()).filter(Boolean),
                  dislikes: dislikes?.map((t) => t.trim().toLowerCase()).filter(Boolean),
                  action,
                },
              );
              return { saved: true, memberName, likes, dislikes, action };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[chat] setPersonSpecificEventPreference failed:", msg, { userId, otherUserId, action });
              return { saved: false, error: msg };
            }
          },
        }),
        getEventPreferences: tool({
          description:
            "Get a user's saved event type preferences (liked/disliked types, allergies, dietary restrictions, cuisine preferences, and person-specific likes/dislikes). Call when the user asks 'what are my preferences?', 'what are [name]'s preferences?', or similar. forUser: use 'me' for the current user, or the first name/nickname of a group member (e.g. 'Yusoo', 'Arijit').",
          inputSchema: z.object({
            forUser: z
              .string()
              .describe(
                "'me' for the asking user, or a group member's first name or nickname, e.g. 'Yusoo'.",
              ),
          }),
          execute: async ({ forUser }) => {
            const isMe = forUser.trim().toLowerCase() === "me";
            const targetUserId = isMe
              ? userId
              : await ctx.runQuery(
                  internal.chats_queries.resolveChatMemberNameToUserId,
                  { chatId, nameOrNickname: forUser.trim() },
                );
            if (!targetUserId) {
              return {
                displayName: forUser,
                preferredEventTypes: null,
                negativeEventTypes: null,
                error: "User not found in this group.",
              };
            }
            const [prefs, members] = await Promise.all([
              ctx.runQuery(
                internal.user_preferences_queries.getEventPreferencesForUserId,
                { userId: targetUserId },
              ),
              ctx.runQuery(internal.chats_queries.getMembersInternal, {
                chatId,
              }),
            ]);
            const targetName = isMe ? firstName : forUser.trim();

            // Resolve userId keys to display names for person-specific prefs
            const resolvePersonMap = (
              map: Record<string, string[]> | null | undefined,
            ): Record<string, string[]> | null => {
              if (!map || Object.keys(map).length === 0) return null;
              const result: Record<string, string[]> = {};
              for (const [uid, tags] of Object.entries(map)) {
                const member = members.find((m) => m.userId === uid);
                const name = member?.nickname ?? uid;
                result[name] = tags;
              }
              return result;
            };

            return {
              displayName: targetName,
              preferredEventTypes: prefs?.preferredEventTypes ?? null,
              negativeEventTypes: prefs?.negativeEventTypes ?? null,
              allergies: prefs?.allergies ?? null,
              dietaryRestrictions: prefs?.dietaryRestrictions ?? null,
              cuisinePreferences: prefs?.cuisinePreferences ?? null,
              personSpecificLikes: resolvePersonMap(prefs?.personSpecificLikes),
              personSpecificDislikes: resolvePersonMap(
                prefs?.personSpecificDislikes,
              ),
            };
          },
        }),
      };

      const appearanceTools = isAssistantChat
        ? {
            setUserAppearancePreferences: tool({
              description:
                "Update the CURRENT USER's persisted page theme, color palette, font, or display appearance settings. Use this only in the dedicated Spontaneity AI chat, never for normal group chat messages. Convert named colors to reasonable six-digit hex colors. For random themes, use randomPreset='use_saved' to switch to the saved random preset, or randomPreset='generate_new' to generate and save new random preset colors.",
              inputSchema: appearanceToolInputSchema,
              execute: async (input) => {
                const current = (await ctx.runQuery(
                  internal.user_appearance_queries
                    .getUserAppearancePreferencesForUserId,
                  { userId },
                )) as {
                  mode: AppearanceThemeMode;
                  themes: AppearanceThemes;
                } | null;

                let mode = input.mode ?? current?.mode ?? "system";
                const themes = cloneAppearanceThemes(
                  current?.themes ?? DEFAULT_APPEARANCE_THEMES,
                );
                let changed =
                  input.mode !== undefined && input.mode !== current?.mode;

                if (input.randomPreset === "use_saved") {
                  changed = mode !== "random" || changed;
                  mode = "random";
                }

                if (input.randomPreset === "generate_new") {
                  try {
                    const colors = await ctx.runAction(
                      internal.user_appearance_actions
                        .generateRandomAppearancePaletteInternal,
                      {},
                    );
                    themes.random = {
                      colors,
                      typography: getTypographyForRandomPreset(themes),
                    };
                    mode = "random";
                    changed = true;
                  } catch (err) {
                    const message =
                      err instanceof Error ? err.message : String(err);
                    console.error(
                      "[chat] generateRandomAppearancePalette failed:",
                      message,
                      { userId },
                    );
                    return {
                      saved: false,
                      mode,
                      themes,
                      error: message,
                    };
                  }
                }

                changed =
                  applyGlobalTypographyUpdate(
                    themes,
                    input.fontPreset,
                    input.fontSize,
                  ) || changed;
                changed =
                  applyThemeUpdate(themes, "light", input.light) || changed;
                changed =
                  applyThemeUpdate(themes, "dark", input.dark) || changed;
                changed =
                  applyThemeUpdate(themes, "random", input.random) || changed;

                if (!changed) {
                  return {
                    saved: false,
                    mode,
                    themes,
                    error: "No supported appearance changes were requested.",
                  };
                }

                try {
                  const saved = await ctx.runMutation(
                    internal.user_appearance_mutations
                      .setUserAppearancePreferencesInternal,
                    { userId, mode, themes },
                  );
                  return {
                    saved: true,
                    mode: saved.mode,
                    themes: saved.themes,
                  };
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : String(err);
                  console.error(
                    "[chat] setUserAppearancePreferences failed:",
                    message,
                    { userId, mode },
                  );
                  return {
                    saved: false,
                    mode,
                    themes,
                    error: message,
                  };
                }
              },
            }),
          }
        : undefined;

      const customEventTools = {
        createCustomEvent: tool({
          description:
            "Create a custom user-defined event from natural language input and save it to the group's non-ticket events list. Use this when the user describes an event they want to plan (e.g. 'let\'s do a pizza night on Friday at 7pm to 9pm at John\'s place' or 'movie night at my home today at 8pm, ends at 10pm'). IMPORTANT: Do NOT call this tool if any of the five required fields are missing from the user\'s message: title, description, location, start time, or end time — instead ask the user a single follow-up question listing all missing fields. Before calling: (1) always call getCurrentDateTime to anchor any relative time (today, tomorrow, this Friday, etc.) to an explicit ISO 8601 datetime; (2) if the user says \'my home\', \'my place\', \'my house\', etc., replace \'my\' with the user\'s first name so location becomes e.g. \\\"Alex\'s home\\\". The event will automatically receive the \'Custom\' tag plus any other relevant tags.",
          inputSchema: z.object({
            title: z
              .string()
              .describe("Short, clear event title, e.g. 'Pizza Night'"),
            description: z
              .string()
              .optional()
              .describe(
                "Description or notes about the event. Must be provided by the user before calling this tool.",
              ),
            startTime: z
              .string()
              .optional()
              .describe(
                "ISO 8601 start datetime resolved from getCurrentDateTime output. e.g. 2026-04-18T20:00:00-04:00. Never pass a relative phrase like 'today at 8pm' — always resolve it first.",
              ),
            endTime: z
              .string()
              .optional()
              .describe("ISO 8601 end datetime if provided or inferable"),
            location: z
              .string()
              .optional()
              .describe(
                "The location name as stated by the user. If the user said 'my home/place/house', substitute their first name: e.g. \"Alex's home\". Use the name as-is — do NOT attempt to resolve it to a street address.",
              ),
            venueName: z
              .string()
              .optional()
              .describe(
                "Set to the same value as location. Do not infer or invent a separate venue name.",
              ),
            venueCity: z
              .string()
              .optional()
              .describe(
                "City where the event takes place. Only set this if the user explicitly states a city — do NOT infer it from the location name.",
              ),
            budgetBucket: z
              .enum(["low", "medium", "high"])
              .optional()
              .describe(
                "Budget estimate: low (≤$30), medium (≤$75), high (>$75). Only set if the user explicitly mentions a budget — do NOT guess.",
              ),
          }),
          execute: async ({
            title,
            description,
            startTime,
            endTime,
            location,
            venueName,
            venueCity,
            budgetBucket,
          }) => {
            try {
              // Ask AI to tag the event (tags will be supplemented with "Custom" server-side)
              const aiTags = (await ctx.runAction(
                internal.events_actions.tagEvent,
                {
                  event: {
                    eventId: crypto.randomUUID(),
                    title,
                    description,
                    venueName,
                    venueCity,
                  },
                },
              )) as string[] | null;

              const eventId = crypto.randomUUID();
              const resolvedVenueName = venueName ?? location;
              const result = await ctx.runMutation(
                internal.custom_events_mutations.createCustomEvent,
                {
                  eventId,
                  title,
                  description,
                  startTime,
                  endTime,
                  location,
                  venueName: resolvedVenueName,
                  venueCity,
                  tags: (aiTags ??
                    []) as unknown as import("./event_types").EventTag[],
                  tagsConfirmed: true,
                  budgetBucket,
                  chatId,
                  createdBy: userId,
                },
              );

              return {
                success: true,
                eventId: result.eventId,
                title,
                startTime: startTime ?? null,
                location: location ?? null,
                tags: result.tags,
              };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[chat] createCustomEvent failed:", message);
              return { success: false, error: message };
            }
          },
        }),
        deleteCustomEvent: tool({
          description:
            "Delete a custom event that the current user created. First call listMyCustomEvents to find the eventId that matches what the user wants to delete, then call this tool with that eventId. Only the event creator can delete their own events.",
          inputSchema: z.object({
            eventId: z
              .string()
              .describe("The eventId (UUID) of the custom event to delete"),
          }),
          execute: async ({ eventId }) => {
            try {
              const result = await ctx.runMutation(
                internal.custom_events_mutations.deleteCustomEvent,
                { eventId, requestingUserId: userId },
              );
              return { success: true, ...result };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[chat] deleteCustomEvent failed:", message);
              return { success: false, error: message };
            }
          },
        }),
        listMyCustomEvents: tool({
          description:
            "List all custom events that the current user has created in this chat. Use this before deleteCustomEvent to find the eventId matching the event the user wants to delete.",
          inputSchema: z.object({}),
          execute: async () => {
            try {
              const events = await ctx.runQuery(
                internal.custom_events_mutations.getCustomEventsByUser,
                { chatId, createdBy: userId },
              );
              return {
                events: events.map((e) => ({
                  eventId: e.eventId,
                  title: e.title,
                  startTime: e.startTime ?? null,
                  endTime: e.endTime ?? null,
                  location: e.location ?? null,
                })),
              };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return { events: [], error: message };
            }
          },
        }),
      };

      const presentationTools = {
        displayEventCards: tool({
          description:
            "Display event recommendation cards in chat. Call this immediately after findGroupAvailableEvents when constraintStatus is 'ok'. Pass through the exact summary_message, rankingConfidence, and event fields you want shown. Do not invent or rewrite event details.",
          inputSchema: z.object({
            summary_message: z
              .string()
              .nullable()
              .optional()
              .describe(
                "Pass through findGroupAvailableEvents.summary_message when available.",
              ),
            rankingConfidence: z
              .object({
                score: z.number(),
                verdict: z.enum(["high", "medium", "low"]),
                memberSupportRatio: z.number(),
                scoreGapNormalized: z.number(),
                negativeFree: z.boolean(),
                topCategory: z.string().nullable(),
              })
              .nullable()
              .optional()
              .describe(
                "Pass through findGroupAvailableEvents.rankingConfidence verbatim when available.",
              ),
            events: z
              .array(
                z.object({
                  eventId: z.string(),
                  title: z.string(),
                  description: z.string().nullable().optional(),
                  startTime: z.string().nullable().optional(),
                  startLocal: z.string().nullable().optional(),
                  localDateLabel: z.string().nullable().optional(),
                  venueName: z.string().nullable().optional(),
                  venueCity: z.string().nullable().optional(),
                  venueNeighborhood: z.string().nullable().optional(),
                  venueCountry: z.string().nullable().optional(),
                  url: z.string().nullable().optional(),
                  source: z.string(),
                  fitReasons: z.array(z.string()).optional(),
                  status: z.string().nullable().optional(),
                  venueType: z.enum(["food", "activity"]).nullable().optional(),
                  tags: z.array(z.string()).optional().describe("Pass event tags through verbatim from findGroupAvailableEvents for reranking."),
                  genre: z.string().nullable().optional(),
                }),
              )
              .min(1)
              .max(10)
              .describe("The exact events to show as chat cards."),
          }),
          execute: async ({ summary_message, rankingConfidence, events }) => ({
            summary_message: summary_message ?? null,
            rankingConfidence: rankingConfidence ?? lastRankingConfidence ?? null,
            events: events.map((event) => ({
              eventId: event.eventId,
              title: event.title,
              description: event.description ?? null,
              startTime: event.startTime ?? null,
              startLocal: event.startLocal ?? null,
              localDateLabel: event.localDateLabel ?? null,
              venueName: event.venueName ?? null,
              venueCity: event.venueCity ?? null,
              venueNeighborhood: event.venueNeighborhood ?? null,
              venueCountry: event.venueCountry ?? null,
              url: event.url ?? null,
              source: event.source,
              fitReasons: event.fitReasons ?? [],
              status: event.status ?? null,
              venueType: event.venueType === "food" || event.venueType === "activity" ? event.venueType : null,
              tags: Array.isArray(event.tags) ? event.tags : [],
              genre: event.genre ?? null,
            })),
          }),
        }),
        createEventPoll: tool({
          description:
            "Create a real group poll with exactly 3 final options and render the poll cards in chat. Use this only once the final 3 options are known.",
          inputSchema: z.object({
            source: z
              .enum(["manual", "recommendation"])
              .optional()
              .describe(
                "Use 'recommendation' for polls built from recommended real events, or 'manual' for custom user-provided options.",
              ),
            prompt: z
              .string()
              .optional()
              .describe("Short poll question shown above the options."),
            options: z
              .array(
                z.object({
                  eventId: z
                    .string()
                    .optional()
                    .describe(
                      "Existing event ID when available; omit for manual options.",
                    ),
                  title: z.string().min(1).describe("Option title."),
                  description: z
                    .string()
                    .optional()
                    .describe("Optional short description for the option."),
                  startTime: z
                    .string()
                    .optional()
                    .describe("ISO datetime for event options when available."),
                  startLocal: z
                    .string()
                    .optional()
                    .describe(
                      "Human-readable local start label for chat display.",
                    ),
                  localDateLabel: z
                    .string()
                    .optional()
                    .describe(
                      "Human-readable local date label for chat display.",
                    ),
                  venueName: z.string().optional(),
                  venueCity: z.string().optional(),
                  venueNeighborhood: z.string().optional(),
                  url: z
                    .string()
                    .optional()
                    .describe("Ticket or info URL for real event options."),
                  source: z
                    .string()
                    .optional()
                    .describe(
                      "Event source such as ticketmaster, yelp, google_places, or manual.",
                    ),
                  fitReasons: z
                    .array(z.string())
                    .optional()
                    .describe(
                      "Optional fit reasons from the recommendation pipeline.",
                    ),
                  status: z
                    .enum([
                      "onsale",
                      "offsale",
                      "cancelled",
                      "postponed",
                      "rescheduled",
                    ])
                    .nullable()
                    .optional(),
                  genre: z.string().nullable().optional(),
                  image: z.string().optional(),
                  budgetBucket: z
                    .enum(["low", "medium", "high"])
                    .nullable()
                    .optional(),
                }),
              )
              .length(3)
              .describe("Exactly 3 poll options."),
          }),
          execute: async ({ source, prompt, options }) => {
            const normalizedSource =
              source === "recommendation" ? "recommendation" : "manual";
            const normalizedPrompt =
              trimOptionalString(prompt) ??
              "Which option should the group choose?";

            const normalizedOptions = options.map((option, index) => {
              const title = option.title.trim();
              const eventId = createPollOptionEventId(
                title,
                index,
                option.eventId,
              );
              const description =
                trimOptionalString(option.description) ?? null;
              const startTime = trimOptionalString(option.startTime) ?? null;
              const startLocal =
                trimOptionalString(option.startLocal) ??
                trimOptionalString(option.startTime) ??
                null;
              const localDateLabel =
                trimOptionalString(option.localDateLabel) ?? null;
              const venueName = trimOptionalString(option.venueName) ?? null;
              const venueCity = trimOptionalString(option.venueCity) ?? null;
              const venueNeighborhood =
                trimOptionalString(option.venueNeighborhood) ?? null;
              const optionSource =
                trimOptionalString(option.source) ?? "manual";
              const url = trimOptionalString(option.url) ?? "";
              const image = trimOptionalString(option.image) ?? null;
              const genre =
                trimOptionalString(option.genre ?? undefined) ?? null;
              const fitReasons = (option.fitReasons ?? [])
                .map((reason) => reason.trim())
                .filter((reason) => reason.length > 0);

              return {
                storedOption: {
                  eventId,
                  title,
                  description,
                  startTime,
                  venueName,
                  venueCity,
                  venueNeighborhood,
                  venueCountry: null,
                  source: optionSource,
                  url,
                  image,
                  tags: [],
                  status: option.status ?? null,
                  budgetBucket: option.budgetBucket ?? null,
                  genre,
                },
                renderedEvent: {
                  eventId,
                  title,
                  description,
                  startTime,
                  startLocal,
                  localDateLabel,
                  venueName,
                  venueCity,
                  venueNeighborhood,
                  venueCountry: null,
                  url: url || null,
                  source: optionSource,
                  fitReasons,
                  status: option.status ?? null,
                  genre,
                },
              };
            });

            try {
              const pollId = await ctx.runMutation(
                internal.event_polls_mutations.createPollInternal,
                {
                  chatId,
                  userId,
                  source: normalizedSource,
                  prompt: normalizedPrompt,
                  options: normalizedOptions.map(
                    (option) => option.storedOption,
                  ),
                },
              );

              return {
                pollId,
                source: normalizedSource,
                prompt: normalizedPrompt,
                summary_message: normalizedPrompt,
                events: normalizedOptions.map((option) => option.renderedEvent),
              };
            } catch (error) {
              return {
                error: formatCreatePollErrorMessage(error),
              };
            }
          },
        }),
        closeCurrentPoll: tool({
          description:
            "Close the current open poll for this group chat. Use this when the user asks to close, end, or remove the active poll.",
          inputSchema: z.object({}),
          execute: async () => {
            try {
              const result = await ctx.runMutation(
                internal.event_polls_mutations.closeOpenPollInternal,
                { chatId, userId },
              );

              return {
                pollId: result.pollId,
                status: result.status,
                message: "Closed the current open poll.",
              };
            } catch (error) {
              return {
                error: formatClosePollErrorMessage(error),
              };
            }
          },
        }),
      };

      const availableTools = enableUnfilteredEventSearch
        ? {
            ...coreTools,
            ...eventTools,
            ...availabilityTools,
            ...preferenceTools,
            ...(appearanceTools ?? {}),
            ...customEventTools,
            ...presentationTools,
          }
        : {
            ...coreTools,
            ...availabilityTools,
            ...preferenceTools,
            ...(appearanceTools ?? {}),
            ...customEventTools,
            ...presentationTools,
          };

      const result = streamText({
        model: openrouter.chat(model),
        messages: messagesToSend,
        tools: availableTools,
        // Stop after displayEventCards so the summary written directly to the SSE
        // stream isn't followed by a redundant AI-generated text response.
        stopWhen: (state) =>
          stepCountIs(5)(state) ||
          state.steps.some((step) =>
            step.toolCalls.some((tc) => tc?.toolName === "displayEventCards"),
          ),
        maxOutputTokens: 2048,
        system: [
          "You are a helpful, general-purpose assistant for group planning.",
          "Available tools:",
          "- getLocation(city: string) -> coordinates { latitude, longitude }",
          "- getCurrentWeather(latitude: number, longitude: number) -> current conditions",
          "- getCurrentDateTime(timeZone?) -> canonical local date/weekday labels + ISO",
          "- createCalendarEvent(title, start ISO, end ISO, location?, description?, timezone?) -> { filename, ics, timezone }",
          ...(enableUnfilteredEventSearch
            ? [
                "- searchEvents(city?, keyword?, startDateTime?, endDateTime?, size?) -> NormalizedEvent[] (unfiltered; only use when user explicitly asks to ignore availability constraints)",
              ]
            : []),
          "- getSharedAvailability(daysAhead?, durationMinutes?, weekday?, date?, timeZone?, maxWindows?) -> shared windows for this chat",
          "- findGroupAvailableEvents(city?, keyword?, daysAhead?, durationMinutes?, weekday?, date?, timeZone?, maxEvents?) -> events constrained by shared availability, plus summary_message when available",
          "- displayEventCards(summary_message?, events[]) -> renders event cards in chat for the selected events",
          "- createEventPoll(source?, prompt?, options[3]) -> creates a real group poll with exactly 3 options and renders the poll cards in chat",
          "- closeCurrentPoll() -> closes the current open poll for this group chat",
          "- setUserEventPreferences(action: 'add'|'remove'|'replace', preferredEventTypes: string[], negativeEventTypes: string[], allergies?: string[], dietaryRestrictions?: string[], cuisinePreferences?: string[]) -> updates the user's positive/negative event type preferences, food allergies, dietary restrictions, and cuisine preferences. Use exact EventTag names (e.g. 'Concert', 'Basketball', 'Other Sports', 'Night Life').",
          "- setPersonSpecificEventPreference(memberName: string, likes?: string[], dislikes?: string[], action?: 'add'|'remove'|'replace') -> records a preference the CURRENT USER has that applies specifically when a named group member is present.",
          "- getEventPreferences(forUser: 'me' | name) -> returns that user's liked/disliked event types, allergies, dietary restrictions, cuisine preferences, and person-specific likes/dislikes (keyed by member nickname); use 'me' for the current user, or a member's first name/nickname.",
          ...(isAssistantChat
            ? [
                "- setUserAppearancePreferences(mode?, randomPreset?, fontPreset?, fontSize?, light?, dark?, random?) -> updates the user's persisted page theme, color palette, font, or display appearance settings. randomPreset='use_saved' switches to the saved random preset; randomPreset='generate_new' generates and saves new random preset colors.",
              ]
            : []),
          "- createCustomEvent(title, description?, startTime ISO?, endTime ISO?, location?, venueName?, venueCity?, budgetBucket?) -> saves a custom user-defined event with the 'Custom' tag; returns { success, eventId, title, startTime, location, tags }",
          "- listMyCustomEvents() -> returns the current user's custom events in this chat: [{ eventId, title, startTime, endTime, location }]",
          "- deleteCustomEvent(eventId) -> deletes a custom event the current user created; returns { success, deleted, eventId, title } or { success: false, error }",
          "Usage rules:",
          "- setUserEventPreferences ALWAYS applies to the current user (the person who sent the message). When they say 'I like X', use action='add' and put X in preferredEventTypes. When they say 'I dislike X' or 'I don't like X', use action='add' and put X in negativeEventTypes. When they say 'remove X', use action='remove'. When they say 'I only like X' or 'set everything to X', use action='replace'. Always pass both arrays (use [] for the side with no change). Do not confuse 'my' or 'I' with another member; the message sender is always the current user.",
          "- If the user mentions allergies (e.g. 'I'm allergic to peanuts'), dietary restrictions (e.g. 'I'm vegetarian', 'I keep halal'), or cuisine preferences (e.g. 'I love Italian food'), call setUserEventPreferences with those fields (allergies, dietaryRestrictions, cuisinePreferences) in the same call. You can include all fields in one call.",
          "- If the user says something like 'I don't like going to concerts WITH Alice' or 'I enjoy hiking when Bob is around', call setPersonSpecificEventPreference with Alice/Bob's name and the appropriate likes/dislikes. Use action='add' unless the user is clearly replacing.",
          "- When the user asks what someone's preferences are (e.g. 'what are my preferences?', 'what are Yusoo's preferences?'), call getEventPreferences with 'me' for the sender or the member's name for others. Then reply with one short paragraph mentioning liked types, disliked types, food details, and person-specific likes/dislikes if present. Do not output a table or list.",
          "- After calling setUserEventPreferences, respond with ONLY this one line—no table, no list, no markdown: 'Preferences updated for " +
            firstName +
            ": likes [types], dislikes [types], allergies [items], dietary [items].' Omit a section if the array is empty.",
          "- After calling setPersonSpecificEventPreference, respond with ONLY this one line—no table, no list, no markdown: 'Updated preferences when [memberName] is around for " +
            firstName +
            ": likes [types], dislikes [types].' Omit a section if the array is empty. Always name the specific person in the confirmation.",
          ...(isAssistantChat
            ? [
                "- In this dedicated Spontaneity AI chat, when the user asks to change page theme, light/dark/system/random mode, colors, palette, accent color, font, or font size, call setUserAppearancePreferences. Convert named colors to reasonable six-digit hex values. If they ask to use/switch to the saved random preset, call setUserAppearancePreferences with randomPreset='use_saved'. If they ask to randomize/generate/refresh the random theme or random colors, call it with randomPreset='generate_new'. After a successful call, reply with one short sentence that the settings were updated. Do not mention tool JSON or implementation details.",
                "- In this dedicated Spontaneity AI chat, event preference updates can be handled by setUserEventPreferences without posting those changes into a normal group chat.",
              ]
            : []),
          "- createCustomEvent: call this when the user wants to create or plan a custom event. Before calling, check that all five required fields are present in the user message: (1) title, (2) description, (3) location, (4) start time, (5) end time. If ANY of these are missing, DO NOT call createCustomEvent — instead reply with a single question asking for all missing fields at once, e.g. 'To create your event I still need: description, location, start time, and end time. What are those?' Once all required information is available: call getCurrentDateTime to resolve any relative time (today, tomorrow, this Friday, 8pm, etc.) into an explicit ISO 8601 datetime; if the user refers to \'my home\', \'my place\', \'my house\', or similar, replace \'my\' with their first name (" +
            firstName +
            ") so the location reads e.g. '" +
            firstName +
            "'s home'. After a successful createCustomEvent, confirm in one sentence: 'Created custom event: [title] on [date/time] at [location] with tags [tags].' If createCustomEvent returns success=false, relay the error.",
          "- createCustomEvent is for custom/user-defined events only. Do not use it for Ticketmaster, Yelp, or Google Places events.",
          "- To delete a custom event: always call listMyCustomEvents first. Then: (a) if the user clearly named one specific event and exactly one entry in the list matches that title, call deleteCustomEvent immediately; (b) if the user did not name a specific event, or the name is ambiguous (matches zero or multiple events), reply with a short numbered list of the user's events from listMyCustomEvents (title + date if available) and ask them which one to delete — do NOT call deleteCustomEvent yet; (c) if listMyCustomEvents returns an empty list, tell the user they have no custom events to delete in this chat. Never guess an eventId.",
          "- deleteCustomEvent only works for events the current user created. If the delete returns success=false with 'You can only delete events you created', tell the user they cannot delete someone else's event.",
          "- For questions about when the group is free (e.g. 'when is everyone free Friday?'), ALWAYS call getSharedAvailability first. If a weekday is mentioned, pass weekday. If a specific calendar date is mentioned, pass date as YYYY-MM-DD.",
          "- When reporting availability, use getSharedAvailability.matchingSharedWindows[].startLocal/endLocal/localDateLabel exactly; do not do your own timezone conversion from raw ISO values.",
          "- Never compute or guess weekday names yourself. If you mention 'today' or any weekday/date label, copy it from tool fields such as dateContext.todayLocalLabel, localDateLabel, or startLocal.",
          "- For event/activity suggestions for the group, ALWAYS call findGroupAvailableEvents first. Do not use raw searchEvents unless the user explicitly asks for events without availability filtering.",
          "- When calling findGroupAvailableEvents: re-derive venueTypeFilter fresh from the user's latest message on every call — do not carry it forward from any previous findGroupAvailableEvents call, even if the topic seems similar. Determine venueTypeFilter from the user's intent, not just keyword matching. Pass venueTypeFilter='food' when the user's intent is to find somewhere to eat — e.g. food spots, restaurants, dining, brunch, coffee, cuisine, 'where should we eat', 'grab a bite', 'recommend places to eat'. Pass venueTypeFilter='activity' when the user's intent is to find something to do or experience together — e.g. 'recommend things to do', 'what should we do', 'suggest something fun', 'where should we go', concerts, games, shows, sports, outings, hangouts, activities, events, anything that is clearly not food. Omit venueTypeFilter only when the request is genuinely mixed or ambiguous (e.g. 'plan a day out' covering both eating and doing things).",
          "- If findGroupAvailableEvents.constraintStatus is 'ok', do NOT output any text before calling displayEventCards or createEventPoll. Make the tool call immediately without a preamble sentence.",
          "- When the user asks to create a poll, custom poll, ballot, or vote, never write a manual copy-paste poll or emoji-reaction instructions.",
          "- For a new poll request, ask one brief follow-up question asking whether they want recommended events or custom options.",
          "- If the user chooses recommended events for a poll, call findGroupAvailableEvents first, branch ONLY from its constraintStatus, and if constraintStatus is 'ok', call createEventPoll with source='recommendation' using exactly 3 returned events.",
          "- If the user chooses a custom poll, ask them which 3 events or activities they want as the options unless they already provided exactly 3 options.",
          "- For a custom poll, use only the events or activities the user explicitly provided. Do not invent, pad, or substitute generic options to reach 3 choices.",
          "- Only call createEventPoll once you already have exactly 3 final options.",
          "- If createEventPoll returns an error field, respond with that message in one brief sentence. Do not expose stack traces, file paths, or implementation details.",
          "- If the user asks to close, end, or remove the active/current poll, call closeCurrentPoll.",
          "- If searchEvents returns an object with an error field, relay that message exactly and do not retry automatically.",
          "- For any event/activity answer, branch ONLY from findGroupAvailableEvents.constraintStatus.",
          "- If the user explicitly asks for a poll from recommendations and findGroupAvailableEvents.constraintStatus is 'ok', call createEventPoll next with source='recommendation' using exactly 3 returned events.",
          "- If findGroupAvailableEvents.constraintStatus is 'ok', do not state 'no shared availability' and do not state 'no matching events'. Unless the user explicitly asked for a poll, ALWAYS call displayEventCards immediately using the returned events, summary_message, and rankingConfidence (pass rankingConfidence through verbatim from findGroupAvailableEvents). Pass each event's venueType through to displayEventCards verbatim.",
          "- For relative date phrases such as today/tomorrow/this weekend/upcoming Thursday, ALWAYS call getCurrentDateTime first and then call the availability/event tool with an explicit date (YYYY-MM-DD) or weekday filter before answering.",
          "- If findGroupAvailableEvents.constraintStatus is 'no_shared_availability', state that there is no shared availability and stop. Do not suggest activities, schedules, or alternatives.",
          "- If findGroupAvailableEvents.constraintStatus is 'no_events_in_shared_availability', state that no matching events fit the shared windows. Do not generate generic activity ideas unless the user explicitly asks for non-ticketed suggestions.",
          "- Never generate, guess, or fabricate event data. Only present events returned by tools.",
          "- Never render event results as a markdown table.",
          "- After displayEventCards or createEventPoll succeeds, keep any additional text to one brief sentence and do not repeat the full option details in prose.",
          "- When findGroupAvailableEvents returns learnedProfileSummary or events[].fitReasons, use those exact learned preference reasons when explaining recommendations.",
          "- If learnedProfileSummary and fitReasons are empty, do not invent a learned preference-based explanation.",
          ...(activeMidpointContext
            ? [
                `- This group's midpoint is set to: ${activeMidpointContext}. Prefer nearby events is enabled, so findGroupAvailableEvents results for the base All ranking are finally distance-ranked from this midpoint. Mention the active midpoint briefly when recommending events.`,
              ]
            : []),
          ...(chatMeta?.planningLocation
            ? [`- This group's saved planning location is: ${chatMeta.planningLocation}. When calling findGroupAvailableEvents or any event tool that accepts a city, always pass this value as city unless the user explicitly requests a different city.`]
            : ["- If city is not provided, the group's saved location will be used automatically when available; otherwise use the current user's saved city when available. If neither is saved, ask one follow-up question for the city instead of inventing one."]),
          "- Do not infer city from a team or artist name (e.g., 'Inter Miami', 'LA Lakers'). Only set city when the user explicitly gives a location.",
          "- For weather questions, call getLocation first, then getCurrentWeather with those coords.",
          "- For scheduling/meetings/trips with concrete times, convert to clear start/end ISO datetimes, ensure end is after start, include timezone when provided, and call createCalendarEvent. If the user does not provide a date or timezone, first call getCurrentDateTime and use that as the anchor.",
          "- If a detail is missing or ambiguous, infer a reasonable default and continue, but never override tool constraints or invent availability/event matches.",
          "- Outside the poll-creation clarification flow above, do not ask follow-up questions. Return the best possible answer in one shot.",
        ].join("\n"),
        onStepFinish: async ({
          text,
          toolCalls,
          toolResults,
          finishReason,
        }) => {
        },
      });

      fullText = "";
      let unflushedLength = 0;
      let lastFlushTime = Date.now();

      for await (const part of (await result).fullStream) {
        switch (part.type) {
          case "text-delta":
            fullText += part.text;
            unflushedLength += part.text.length;
            await stream.writeSSE({
              data: part.text,
              event: "text-delta",
            });

            // Periodic DB flush
            if (
              unflushedLength >= MIN_FLUSH_SIZE &&
              Date.now() - lastFlushTime >= FLUSH_INTERVAL_MS
            ) {
              await ctx.runMutation(
                internal.messages_internals.updateStreamingContent,
                { messageId, content: fullText },
              );
              unflushedLength = 0;
              lastFlushTime = Date.now();
            }
            break;
          case "tool-call":
            toolInputs.set(part.toolCallId, {
              toolName: part.toolName,
              args: part.input as Record<string, unknown>,
            });
            await stream.writeSSE({
              data: JSON.stringify({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
              }),
              event: "tool-call",
            });
            break;
          case "tool-result":
            if (messageId) {
              const input = toolInputs.get(part.toolCallId);
              await ctx.runMutation(
                internal.messages_internals.updateStreamingLatestToolCall,
                {
                  messageId,
                  latestToolCall: {
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    state: "output-available",
                    args: input?.args ?? {},
                    result: part.output as Record<string, unknown>,
                  },
                },
              );
            }
            await stream.writeSSE({
              data: JSON.stringify({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
              }),
              event: "tool-result",
            });
            break;
          case "error":
            console.error("[chat] stream error:", part.error);
            throw part.error;
        }
      }

      // Final flush: mark message as complete BEFORE sending [DONE]
      await ctx.runMutation(
        internal.messages_internals.completeStreamingMessage,
        { messageId, content: fullText },
      );

      // Auto-title if still default name
      const isDefaultTitle =
        !isAssistantChat &&
        ownership.ok &&
        (ownership.title === "New Chat" || ownership.title === "New Group");
      if (isDefaultTitle && fullText.length > 0) {
        try {
          const titleMessages = [
            ...messages,
            { role: "assistant" as const, content: fullText },
          ];
          const excerpt = titleMessages
            .slice(0, 6)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n");

          const titleResult = streamText({
            model: openrouter.chat(model),
            maxOutputTokens: 20,
            messages: [
              {
                role: "user",
                content: `Generate a short title (3-6 words) for the following conversation. Return only the title, no quotes or punctuation.\n\n${excerpt}`,
              },
            ],
          });

          let title = "";
          for await (const chunk of (await titleResult).textStream) {
            title += chunk;
          }
          title = title.trim();

          if (title) {
            await ctx.runMutation(internal.messages_internals.updateChatTitle, {
              chatId,
              title,
            });
          }
        } catch {
          // Title generation is best-effort — don't fail the stream
        }
      }

      await stream.writeSSE({ data: "[DONE]", event: "text-delta" });
    } catch (error) {
      // On error, save whatever accumulated text exists
      if (messageId) {
        try {
          await ctx.runMutation(
            internal.messages_internals.completeStreamingMessage,
            { messageId, content: fullText },
          );
        } catch {
          // Best-effort error recovery
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      await stream.writeSSE({
        data: `[ERROR]: ${message}`,
        event: "text-delta",
      });
    }
  });
});

export default app;
