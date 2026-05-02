import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { EventTagSchema } from "../../../convex/event_types";

const EVENT_TYPE_BANK = EventTagSchema.options.filter(option => option !== "None" && option !== "Custom");

const BUDGET_OPTIONS: { label: string; value: "low" | "medium" | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "Up to $30", value: "low" },
  { label: "Up to $75", value: "medium" },
];

const END_TIME_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "8 PM", value: 20 },
  { label: "9 PM", value: 21 },
  { label: "10 PM", value: 22 },
  { label: "11 PM", value: 23 },
];

const DISTANCE_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "No limit", value: undefined },
  { label: "< 5 miles", value: 5 },
  { label: "< 20 miles", value: 20 },
  { label: "< 50 miles", value: 50 },
];

interface OnboardingPreferencesDialogProps {
  open: boolean;
  onComplete: () => void;
}

const OnboardingPreferencesDialog: React.FC<OnboardingPreferencesDialogProps> = ({
  open,
  onComplete,
}) => {
  const setPreferences = useMutation(
    api.user_preferences_mutations.setUserEventPreferences,
  );
  const setHardRestrictions = useMutation(
    api.user_hard_restrictions_mutations.setUserHardRestrictions,
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [maxBudget, setMaxBudget] = useState<"low" | "medium" | undefined>(undefined);
  const [maxEventEndHour, setMaxEventEndHour] = useState<number | undefined>(undefined);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const dismissed = useRef(false);

  const toggleLiked = (type: string) => {
    const normalized = type.toLowerCase();
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  };

  const saveAndClose = async (opts: {
    eventTypes: string[];
    budget: "low" | "medium" | undefined;
    endHour: number | undefined;
    distance: number | undefined;
  }) => {
    if (dismissed.current) return;
    dismissed.current = true;
    setSaving(true);
    try {
      await setPreferences({
        preferredEventTypes: opts.eventTypes,
        negativeEventTypes: [],
      });
      await setHardRestrictions({
        ...(opts.budget !== undefined && { maxBudget: opts.budget }),
        ...(opts.endHour !== undefined && { maxEventEndHour: opts.endHour }),
        ...(opts.distance !== undefined && { maxDistanceMiles: opts.distance }),
      });
    } finally {
      setSaving(false);
      onComplete();
    }
  };

  // "Skip for now" on step 1 — skip everything
  const handleSkipAll = async () => {
    await saveAndClose({ eventTypes: [], budget: undefined, endHour: undefined, distance: undefined });
  };

  // "Next →" on step 1
  const handleNext = () => setStep(2);

  // "← Back" on step 2
  const handleBack = () => setStep(1);

  // "Skip this step" on step 2 — save event types, no restrictions
  const handleSkipRestrictions = async () => {
    await saveAndClose({
      eventTypes: [...liked],
      budget: undefined,
      endHour: undefined,
      distance: undefined,
    });
  };

  // "Save Preferences" on step 2
  const handleSave = async () => {
    await saveAndClose({
      eventTypes: [...liked],
      budget: maxBudget,
      endHour: maxEventEndHour,
      distance: maxDistanceMiles,
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) return;
    if (step === 1) {
      void handleSkipAll();
    } else {
      void handleSkipRestrictions();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="onboarding-desc">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Welcome to Spontaneity!</DialogTitle>
              <DialogDescription id="onboarding-desc">
                Select the types of events you enjoy to help us personalize your
                group recommendations. You can update these anytime from your
                profile.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2 py-2">
                {EVENT_TYPE_BANK.map((type) => {
                  const isLiked = liked.has(type.toLowerCase());
                  return (
                    <button
                      key={type}
                      onClick={() => toggleLiked(type)}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                        isLiked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => void handleSkipAll()}
                disabled={saving}
              >
                Skip for now
              </Button>
              <Button onClick={handleNext} disabled={saving}>
                Next →
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Set Your Limits</DialogTitle>
              <DialogDescription id="onboarding-desc">
                Tell us about any hard limits so we only suggest events that work
                for everyone. You can update these anytime from your profile.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Budget cap (per person)</p>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setMaxBudget(opt.value)}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                        maxBudget === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Latest event end time</p>
                <div className="flex flex-wrap gap-2">
                  {END_TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setMaxEventEndHour(opt.value)}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                        maxEventEndHour === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Max travel distance</p>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setMaxDistanceMiles(opt.value)}
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                        maxDistanceMiles === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={saving}
              >
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => void handleSkipRestrictions()}
                  disabled={saving}
                >
                  Skip this step
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  Save Preferences
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingPreferencesDialog;
