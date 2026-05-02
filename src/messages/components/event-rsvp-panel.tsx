import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RSVPStatus = "going" | "maybe" | "not_going";

type RSVPEntry = {
  _id: string;
  eventId: string;
  userId: string;
  status: RSVPStatus;
  updatedAt: number;
  userName: string;
  userImage: string | null;
};

export interface EventRSVPPanelProps {
  eventId: string;
  pollId?: string;
  chatId: string;
  eventTitle?: string;
  startTime?: string | null;
  venueType?: "food" | "activity" | null;
}

const STATUS_OPTIONS: { value: RSVPStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Not going" },
];

export function EventRSVPPanel({
  eventId,
  pollId,
  chatId,
  eventTitle,
  startTime,
}: EventRSVPPanelProps) {
  // For venues with no fixed startTime (e.g. food spots, google_places activities), collect a preferred date/time before RSVPing
  const needsDatePicker = !startTime;
  const [chosenDateTime, setChosenDateTime] = useState<string>("");
  const [dateConfirmed, setDateConfirmed] = useState(false);

  const rsvps = useQuery(api.rsvp_queries.getRSVPsForEvent, {
    eventId,
    chatId: chatId as Id<"chats">,
  });
  const myRSVP = useQuery(api.rsvp_queries.getUserRSVP, {
    eventId,
    chatId: chatId as Id<"chats">,
  });
  const submitRSVPAndNotify = useAction(api.rsvp_actions.submitRSVPAndNotify);

  const resolvedStartTime = needsDatePicker ? (chosenDateTime || undefined) : (startTime ?? undefined);

  const handleRSVP = (status: RSVPStatus) => {
    void submitRSVPAndNotify({
      eventId,
      pollId: pollId as Id<"event_polls"> | undefined,
      chatId: chatId as Id<"chats">,
      status,
      eventTitle,
      startTime: resolvedStartTime,
    });
  };

  const entries = (rsvps as RSVPEntry[] | undefined) ?? [];
  const goingList = entries.filter((r) => r.status === "going");
  const maybeList = entries.filter((r) => r.status === "maybe");
  const notGoingList = entries.filter((r) => r.status === "not_going");

  return (
    <div
      data-testid="event-rsvp-panel"
      className="mt-4 space-y-3 border-t border-border/50 pt-3"
    >
      <p className="text-xs font-medium text-muted-foreground">RSVP</p>

      {needsDatePicker && !dateConfirmed && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            When would the group like to go? Pick a date and time.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={chosenDateTime}
              onChange={(e) => setChosenDateTime(e.target.value)}
              className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              size="sm"
              className="h-8 rounded-full text-xs"
              disabled={!chosenDateTime}
              onClick={() => setDateConfirmed(true)}
            >
              Confirm time
            </Button>
          </div>
        </div>
      )}

      {needsDatePicker && dateConfirmed && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Time:{" "}
            <span className="font-medium text-foreground">
              {new Date(chosenDateTime).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </p>
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setDateConfirmed(false)}
          >
            Change
          </button>
        </div>
      )}

      {(!needsDatePicker || dateConfirmed) && (
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={myRSVP?.status === value ? "default" : "outline"}
              className={cn(
                "h-7 rounded-full text-xs",
                myRSVP?.status === value && "ring-2 ring-primary ring-offset-1",
              )}
              onClick={() => handleRSVP(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-2 text-xs text-muted-foreground">
          {goingList.length > 0 && (
            <AttendeeRow label={`Going (${goingList.length})`} attendees={goingList} />
          )}
          {maybeList.length > 0 && (
            <AttendeeRow label={`Maybe (${maybeList.length})`} attendees={maybeList} />
          )}
          {notGoingList.length > 0 && (
            <AttendeeRow label={`Not going (${notGoingList.length})`} attendees={notGoingList} />
          )}
        </div>
      )}
    </div>
  );
}

function AttendeeRow({
  label,
  attendees,
}: {
  label: string;
  attendees: { userName: string; userImage: string | null }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0">{label}</span>
      <div className="flex -space-x-1.5">
        {attendees.map((a, i) => (
          <Avatar key={i} size="sm" title={a.userName}>
            {a.userImage && <AvatarImage src={a.userImage} alt={a.userName} />}
            <AvatarFallback>{a.userName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        ))}
      </div>
    </div>
  );
}
