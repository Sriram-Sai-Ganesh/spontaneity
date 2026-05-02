import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PendingSignal } from "@/messages/hooks/use-passive-preference-extraction";

interface PreferenceSuggestionBannerProps {
  signal: PendingSignal;
  onAccept: (id: Id<"passivePreferenceSignals">) => Promise<void>;
  onDismiss: (id: Id<"passivePreferenceSignals">) => Promise<void>;
}

function toSentenceCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getSignalLabel(signal: PendingSignal): string {
  const value = toSentenceCase(signal.value);
  if (signal.polarity === "positive") {
    return `It looks like you're interested in ${value} events`;
  }
  return `It looks like you prefer to avoid ${value} events`;
}

function getTimeScopeLabel(signal: PendingSignal): string {
  return signal.timeScope === "short_term" ? "for now" : "in general";
}

/**
 * Non-blocking banner that appears above the message input when a passive
 * preference signal has been extracted from recent chat messages.
 * The user can save it to their preferences or dismiss it.
 */
export function PreferenceSuggestionBanner({
  signal,
  onAccept,
  onDismiss,
}: PreferenceSuggestionBannerProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm shadow-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-muted-foreground">
          <span className="font-medium text-foreground">{getSignalLabel(signal)}</span>
          {" "}
          <span className="text-xs">({getTimeScopeLabel(signal)})</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 px-3 text-xs"
            onClick={() => void onAccept(signal._id)}
          >
            Save preference
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label="Dismiss suggestion"
            onClick={() => void onDismiss(signal._id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
