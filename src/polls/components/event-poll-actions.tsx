import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventPollView } from "@/polls/lib";

interface EventPollActionsProps {
  poll: EventPollView;
  eventId: string;
  onVote: (eventId: string) => void;
  loading: boolean;
  compact?: boolean;
}

const EventPollActions: React.FC<EventPollActionsProps> = ({
  poll,
  eventId,
  onVote,
  loading,
  compact = false,
}) => {
  const option = poll.options.find(
    (candidate) => candidate.eventId === eventId,
  );
  if (!option) {
    return null;
  }

  const isLeading =
    poll.resultsVisible && poll.leadingEventIds.includes(option.eventId);
  const isTiedLead = isLeading && poll.leadingEventIds.length > 1;
  const voteDisabled = loading || !poll.canVote;

  let voteLabel = "Pick this";
  if (poll.status === "closed") {
    voteLabel = option.isSelected ? "Your pick" : "Closed";
  } else if (option.isSelected) {
    voteLabel = "Your pick";
  } else if (poll.hasVoted) {
    voteLabel = "Switch vote";
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        compact ? "pt-1" : "pt-2",
      )}
    >
      <Button
        type="button"
        variant={option.isSelected ? "default" : "outline"}
        size="sm"
        className={cn(
          compact ? "h-7 rounded-full px-2 text-xs" : "h-8 rounded-full",
        )}
        disabled={voteDisabled}
        aria-label={`${voteLabel} for ${option.title}`}
        onClick={() => onVote(option.eventId)}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : voteLabel}
      </Button>

      {poll.resultsVisible ? (
        <span className="text-xs text-muted-foreground">
          {option.tally ?? 0} vote{option.tally === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Vote to reveal results
        </span>
      )}

      {isLeading && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
          {isTiedLead ? "Tied lead" : "Leading"}
        </span>
      )}
    </div>
  );
};

export default EventPollActions;
