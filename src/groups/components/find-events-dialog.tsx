import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  formatEventSourceLabel,
  formatEventSourceLinkLabel,
} from "@/lib/event-source-presentation";
import {
  buildCalendarIcsPayload,
  downloadCalendarIcs,
} from "@/lib/calendar-ics";
import { api } from "../../../convex/_generated/api";
import type { AvailabilityWindow } from "../../../convex/availability";
import type { NormalizedEvent } from "../../../convex/event_types";
import type { Id } from "../../../convex/_generated/dataModel";

interface FindEventsDialogProps {
  chatId: string;
  memberCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FindEventsResult {
  memberCount: number;
  dateRange: { start: string; end: string };
  durationMinutes: number;
  sharedWindows: AvailabilityWindow[];
  totalEvents: number;
  allEvents: NormalizedEvent[];
  availabilityFilteredEvents?: NormalizedEvent[];
  filteredEvents: NormalizedEvent[];
  rankedEvents?: NormalizedEvent[];
  error?: string;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-foreground">
      {message}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FindEventsDialog: React.FC<FindEventsDialogProps> = ({
  chatId,
  memberCount,
  open,
  onOpenChange,
}) => {
  const [result, setResult] = useState<FindEventsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const findEvents = useAction(api.availability_action.findAvailableEvents);
  const fittingEventIds = useMemo(
    () =>
      new Set(
        (result?.availabilityFilteredEvents ?? result?.filteredEvents ?? []).map(
          (event) => event.eventId,
        ),
      ),
    [result],
  );

  const handleDownloadCalendar = (event: NormalizedEvent) => {
    const payload = buildCalendarIcsPayload(event, result?.durationMinutes);
    if (!payload) {
      toast.error("Calendar file unavailable", {
        description: "This event is missing a valid start time.",
      });
      return;
    }

    downloadCalendarIcs(payload);
    toast.success("Calendar file ready", {
      description: "Open the downloaded .ics to add it to your calendar.",
    });
  };

  const handleFind = async (opts?: { clearStoredInPlanningWindow?: boolean }) => {
    setError(null);
    setLoading(true);
    try {
      const res = await findEvents({
        chatId: chatId as Id<"chats">,
        clearStoredInPlanningWindow: opts?.clearStoredInPlanningWindow ?? false,
      });
      setResult(res);
      if (res.error) {
        setError(res.error);
        toast.error("Could not fetch events", { description: res.error });
      } else {
        toast.success("Event search completed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error while finding events";
      setError(message);
      toast.error("Could not fetch events", { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Find Available Events</DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Fetches Ticketmaster, Yelp, and Google Places recommendations, then checks each one
              against shared availability windows computed from calendar busy blocks and accepted
              plans across your groups.
            </p>
            <Button onClick={() => void handleFind()} disabled={loading}>
              {loading ? "Searching…" : `Find events for ${memberCount || 1} members`}
            </Button>
            {error && <ErrorBanner message={error} />}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {error && <ErrorBanner message={error} />}

            {/* Summary */}
            <div className="text-sm text-muted-foreground">
              {result.memberCount} members &middot;{" "}
              {result.sharedWindows.length} shared free windows &middot;{" "}
              {result.filteredEvents.length} of {result.totalEvents} events fit
            </div>

            {/* Top 3 for your group */}
            {(result.rankedEvents ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Top picks for your group</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Ranked by group preferences (best fit first).
                </p>
                <div className="space-y-3">
                  {(result.rankedEvents ?? []).map((event, index) => {
                    const fits = fittingEventIds.has(event.eventId);
                    const startDate = event.startTime ? new Date(event.startTime) : null;
                    const hasValidStart =
                      startDate !== null && !Number.isNaN(startDate.getTime());
                    return (
                      <div
                        key={event.eventId}
                        className="block rounded-lg border-2 border-primary/30 bg-primary/5 p-3 overflow-hidden"
                      >
                        <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                            #{index + 1}
                          </span>
                          <p
                            className={
                              fits
                                ? "rounded-full border border-status-success/35 bg-status-success/15 px-2 py-0.5 text-xs font-medium text-foreground"
                                : "rounded-full border border-status-danger/35 bg-status-danger/15 px-2 py-0.5 text-xs font-medium text-foreground"
                            }
                          >
                            {fits ? "Everyone available" : "Not available for everyone"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight break-words">
                            {event.title}
                          </p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {formatEventSourceLabel(event.source)}
                          </p>
                          {event.startTime && (
                            <p className="text-xs text-muted-foreground break-words">
                              {formatTime(event.startTime)}
                            </p>
                          )}
                          {event.venueName && (
                            <p className="text-xs text-muted-foreground break-words">
                              {event.venueName}
                              {event.venueCity ? `, ${event.venueCity}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!hasValidStart}
                            onClick={() => handleDownloadCalendar(event)}
                          >
                            Add event to calendar
                          </Button>
                          {event.url && (
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={event.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {formatEventSourceLinkLabel(event.source)}
                              </a>
                            </Button>
                          )}
                          {!hasValidStart && (
                            <span className="text-[11px] text-muted-foreground">
                              Start time not available yet
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shared windows */}
            <div>
              <h3 className="text-sm font-medium mb-2">Shared Free Windows</h3>
              {result.sharedWindows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shared availability found.</p>
              ) : (
                <div className="space-y-1">
                  {result.sharedWindows.slice(0, 10).map((w, i) => (
                    <div
                      key={i}
                      className="text-xs px-3 py-2 rounded-md bg-muted"
                    >
                      {formatTime(w.start)} — {formatTime(w.end)}
                    </div>
                  ))}
                  {result.sharedWindows.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      +{result.sharedWindows.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* All events + availability status */}
            <div>
              <h3 className="text-sm font-medium mb-2">All Events (Availability Check)</h3>
              {result.allEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Ticketmaster, Yelp, or Google Places results found for this query.
                </p>
              ) : (
                <div className="space-y-3">
                  {result.allEvents.map((event) => {
                    const fits = fittingEventIds.has(event.eventId);
                    return (
                      <div
                        key={event.eventId}
                        className="block rounded-lg border p-3 overflow-hidden"
                      >
                        <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p
                            className={
                              fits
                                ? "rounded-full border border-status-success/35 bg-status-success/15 px-2 py-0.5 text-xs font-medium text-foreground break-words"
                                : "rounded-full border border-status-danger/35 bg-status-danger/15 px-2 py-0.5 text-xs font-medium text-foreground break-words"
                            }
                          >
                            {fits ? "Everyone available" : "Not available for everyone"}
                          </p>
                          <p className="text-xs text-muted-foreground break-words sm:text-right">
                            +{result.durationMinutes} min assumed duration
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight break-words">
                            {event.title}
                          </p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {formatEventSourceLabel(event.source)}
                          </p>
                          {event.startTime && (
                            <p className="text-xs text-muted-foreground break-words">
                              {formatTime(event.startTime)}
                            </p>
                          )}
                          {event.venueName && (
                            <p className="text-xs text-muted-foreground break-words">
                              {event.venueName}
                              {event.venueCity ? `, ${event.venueCity}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {event.url && (
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={event.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {formatEventSourceLinkLabel(event.source)}
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Events are fetched from Ticketmaster, Yelp, and Google Places, then filtered with
              Google Calendar FreeBusy data plus accepted plans across group calendars.
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleFind({ clearStoredInPlanningWindow: true })}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FindEventsDialog;
