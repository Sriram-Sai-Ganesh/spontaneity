import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useQueryExploreEvents(limit?: number) {
  const events = useQuery(api.events_queries.getUpcomingEvents, { limit });

  return {
    data: events ?? [],
    loading: events === undefined,
    error: false,
  };
}
