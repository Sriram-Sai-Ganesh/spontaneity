import { CalendarPlus, Clock3, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEventSourceLabel } from "@/lib/event-source-presentation";
import { getEventPollOptionHref } from "@/polls/lib";
import type { ToolCallPart } from "@/messages/types/tool-call";
import { EventRSVPPanel } from "./event-rsvp-panel";
import { buildCalendarIcsPayload, downloadCalendarIcs } from "@/lib/calendar-ics";

type AcceptedEventNotificationPayload = {
  pollId: string;
  eventId: string;
  title: string;
  startTime: string | null;
  venueName: string | null;
  venueCity: string | null;
  source: string;
  url: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatStartTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function venueLabel(payload: AcceptedEventNotificationPayload): string | null {
  const venue = [payload.venueName, payload.venueCity].filter(Boolean).join(", ");
  return venue.length > 0 ? venue : null;
}

export function getAcceptedEventNotificationPayload(
  toolCall: ToolCallPart,
): AcceptedEventNotificationPayload | null {
  if (
    toolCall.toolName !== "acceptedEventNotification" ||
    toolCall.state !== "output-available" ||
    !toolCall.result
  ) {
    return null;
  }

  const result = toolCall.result;
  if (!isRecord(result)) {
    return null;
  }

  const pollId = asOptionalString(result.pollId);
  const eventId = asOptionalString(result.eventId);
  const title = asOptionalString(result.title);
  const source = asOptionalString(result.source);

  if (!pollId || !eventId || !title || !source) {
    return null;
  }

  return {
    pollId,
    eventId,
    title,
    startTime: asOptionalString(result.startTime),
    venueName: asOptionalString(result.venueName),
    venueCity: asOptionalString(result.venueCity),
    source,
    url: asOptionalString(result.url),
  };
}

interface AcceptedEventNotificationProps {
  payload: AcceptedEventNotificationPayload;
  chatId: string;
}

const AcceptedEventNotification: React.FC<AcceptedEventNotificationProps> = ({
  payload,
  chatId,
}) => {
  const acceptedEventHref = getEventPollOptionHref(
    payload.pollId,
    payload.eventId,
  );
  const locationLabel = venueLabel(payload);

  return (
    <section className="px-4 pb-2">
      <div className="rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            Agreement reached
          </span>
          <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {formatEventSourceLabel(payload.source)}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold leading-5 text-foreground">
            {payload.title}
          </h3>
          {payload.startTime && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              <span>{formatStartTime(payload.startTime)}</span>
            </p>
          )}
          {locationLabel && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{locationLabel}</span>
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="h-8 rounded-full">
            <a href={acceptedEventHref}>View accepted event</a>
          </Button>
          {payload.startTime && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full"
              onClick={() => {
                const ics = buildCalendarIcsPayload({
                  eventId: payload.eventId,
                  title: payload.title,
                  startTime: payload.startTime,
                  venueName: payload.venueName,
                  venueCity: payload.venueCity,
                  url: payload.url,
                  source: payload.source,
                });
                if (ics) downloadCalendarIcs(ics);
              }}
            >
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Calendar
            </Button>
          )}
          {payload.url && (
            <Button asChild variant="outline" size="sm" className="h-8 rounded-full">
              <a href={payload.url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open source listing
              </a>
            </Button>
          )}
        </div>

        <EventRSVPPanel
          eventId={payload.eventId}
          pollId={payload.pollId}
          chatId={chatId}
          eventTitle={payload.title}
          startTime={payload.startTime}
        />
      </div>
    </section>
  );
};

export default AcceptedEventNotification;
