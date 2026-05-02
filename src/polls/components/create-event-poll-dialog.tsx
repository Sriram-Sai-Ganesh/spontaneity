import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatEventSourceLabel } from "@/lib/event-source-presentation";
import { EVENT_POLL_OPTION_COUNT } from "@/polls/lib";
import type { NormalizedEvent } from "../../../convex/event_types";

interface CreateEventPollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateEvents: NormalizedEvent[];
  isCreating: boolean;
  onCreate: (events: NormalizedEvent[]) => void;
}

interface CreateEventPollDialogBodyProps {
  candidateEvents: NormalizedEvent[];
  isCreating: boolean;
  onCancel: () => void;
  onCreate: (events: NormalizedEvent[]) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CreateEventPollDialogBody: React.FC<CreateEventPollDialogBodyProps> = ({
  candidateEvents,
  isCreating,
  onCancel,
  onCreate,
}) => {
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  const sortedCandidates = useMemo(() => [...candidateEvents], [candidateEvents]);

  const selectedIdSet = useMemo(
    () => new Set(selectedEventIds),
    [selectedEventIds],
  );

  const selectedEvents = useMemo(
    () => sortedCandidates.filter((event) => selectedIdSet.has(event.eventId)),
    [selectedIdSet, sortedCandidates],
  );

  const selectedCount = selectedEventIds.length;
  const canCreatePoll =
    selectedEvents.length === EVENT_POLL_OPTION_COUNT && !isCreating;

  const toggleSelection = (eventId: string) => {
    setSelectedEventIds((current) => {
      if (current.includes(eventId)) {
        return current.filter((candidate) => candidate !== eventId);
      }
      if (current.length >= EVENT_POLL_OPTION_COUNT) {
        return current;
      }
      return [...current, eventId];
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick exactly {EVENT_POLL_OPTION_COUNT} events. Group members will only
        see the results after they vote.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {selectedCount} of {EVENT_POLL_OPTION_COUNT} selected
        </span>
        {selectedCount >= EVENT_POLL_OPTION_COUNT && (
          <span>Select one event again to remove it.</span>
        )}
      </div>

      <div className="space-y-2">
        {sortedCandidates.map((event) => {
          const isSelected = selectedIdSet.has(event.eventId);
          return (
            <button
              key={event.eventId}
              type="button"
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/8"
                  : "border-border hover:bg-muted/50"
              }`}
              onClick={() => toggleSelection(event.eventId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.startTime && (
                    <p className="text-xs text-muted-foreground">
                      {formatTime(event.startTime)}
                    </p>
                  )}
                  {(event.venueName || event.venueCity) && (
                    <p className="text-xs text-muted-foreground">
                      {[event.venueName, event.venueCity]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {formatEventSourceLabel(event.source)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!canCreatePoll}
          onClick={() => onCreate(selectedEvents)}
        >
          {isCreating ? "Creating..." : "Create Poll"}
        </Button>
      </div>
    </div>
  );
};

const CreateEventPollDialog: React.FC<CreateEventPollDialogProps> = ({
  open,
  onOpenChange,
  candidateEvents,
  isCreating,
  onCreate,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80vh] max-w-2xl overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Create Custom Poll</DialogTitle>
        </DialogHeader>
        {open && (
          <CreateEventPollDialogBody
            candidateEvents={candidateEvents}
            isCreating={isCreating}
            onCancel={() => onOpenChange(false)}
            onCreate={onCreate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateEventPollDialog;
