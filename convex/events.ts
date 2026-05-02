import { NormalizedEventSchema, type NormalizedEvent } from "./event_types";
import { searchNormalizedEvents, type EventSearchParams } from "./ticketmaster";
import { searchNormalizedEvents as searchYelpEvents } from "./yelp";
import { searchNormalizedEvents as searchGooglePlacesEvents } from "./google_places";
import { deduplicateCandidateEvents } from "./event_dedup";

export type { EventSearchParams };

export interface EventProvider {
  name: string;
  search(params: EventSearchParams): Promise<NormalizedEvent[]>;
}

function makeTicketmasterProvider(): EventProvider | null {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return null;
  return {
    name: "ticketmaster",
    search: (params) => searchNormalizedEvents(apiKey, params),
  };
}

function makeYelpProvider(): EventProvider | null {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) return null;
  return {
    name: "yelp",
    search: (params) => searchYelpEvents(apiKey, params),
  };
}

function makeGooglePlacesProvider(): EventProvider | null {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  return {
    name: "google_places",
    search: (params) => searchGooglePlacesEvents(apiKey, params),
  };
}

function getProviders(): EventProvider[] {
  return (
    [makeTicketmasterProvider(), makeYelpProvider(), makeGooglePlacesProvider()] as (EventProvider | null)[]
  ).filter((p): p is EventProvider => p !== null);
}

function validateEvents(events: unknown[]): NormalizedEvent[] {
  const valid: NormalizedEvent[] = [];
  for (const event of events) {
    const result = NormalizedEventSchema.safeParse(event);
    if (result.success) {
      valid.push(result.data);
    } else {
      console.warn("[events] Rejected invalid event:", result.error.issues);
    }
  }
  return valid;
}

export async function searchEvents(
  params: EventSearchParams & { skipProviders?: string[] },
): Promise<NormalizedEvent[]> {
  const providers = getProviders().filter(
    (p) => !(params.skipProviders ?? []).includes(p.name),
  );
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        return await p.search(params);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[events] Provider "${p.name}" search failed:`, message);
        return [] as NormalizedEvent[];
      }
    }),
  );
  const validatedEvents = validateEvents(results.flat());
  return deduplicateCandidateEvents(validatedEvents);
}
