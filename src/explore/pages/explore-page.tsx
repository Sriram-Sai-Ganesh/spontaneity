import { MapPin, Clock, Tag } from "lucide-react";
import { useQueryExploreEvents } from "../hooks/use-query-explore-events";

type ExploreEvent = {
  _id: string;
  title: string;
  startTime?: string;
  venueName?: string;
  venueCity?: string;
  description?: string;
  tags?: string[];
  url: string;
};

function formatStartTime(startTime?: string): string {
  if (!startTime) return "Date TBD";
  const date = new Date(startTime);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActivityCard({ event }: { event: ExploreEvent }) {
  const location = [event.venueName, event.venueCity].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div>
        <h3 className="font-semibold text-base leading-tight">{event.title}</h3>
      </div>
      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{formatStartTime(event.startTime)}</span>
        </div>
        {location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
      {event.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {event.description}
        </p>
      )}
      {event.tags && event.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          <Tag className="h-3.5 w-3.5 text-muted-foreground self-center flex-shrink-0" />
          {event.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const ExplorePage: React.FC = () => {
  const { data: events, loading, error } = useQueryExploreEvents(30);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none border-b px-4 py-4">
        <h2 className="text-2xl font-bold">Explore</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Discover activities and events happening around you.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading activities...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Failed to load activities. Please try again.</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-sm text-muted-foreground">No upcoming activities found.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <ActivityCard key={event._id} event={event as ExploreEvent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExplorePage;
