import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { History, Calendar, MapPin } from "lucide-react";
import { api } from "../../../convex/_generated/api";

type HistoryItem = {
  rsvpId: string;
  eventId: string;
  rsvpStatus: string;
  updatedAt: number;
  title: string | null;
  startTime: string | null;
  location: string | null;
  eventStatus: string | null;
};

function formatEventDate(startTime: string | null): string | null {
  if (!startTime) return null;
  try {
    return new Date(startTime).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return startTime;
  }
}

function formatActivityDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const UserHistoryFeed: React.FC = () => {
  const { isAuthenticated } = useConvexAuth();
  const history = useQuery(
    api.user_history_queries.getUserPlanningHistory,
    isAuthenticated ? {} : "skip",
  ) as HistoryItem[] | undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Planning History
        </p>
      </div>

      {history === undefined ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <History className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No events yet</p>
          <p className="text-xs text-muted-foreground/70">
            Events you RSVP to will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y overflow-y-auto flex-1 min-h-0">
          {history.map((item) => (
            <li key={item.rsvpId} className="flex flex-col gap-1 px-3 py-2.5">
              <span className="font-medium text-sm leading-snug">
                {item.title ?? "Unknown event"}
              </span>
              {item.startTime && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {formatEventDate(item.startTime)}
                </span>
              )}
              {item.location && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {item.location}
                </span>
              )}
              <span className="text-xs text-muted-foreground/60 mt-0.5">
                Accepted {formatActivityDate(item.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UserHistoryFeed;
