import { useRef, useState } from "react";
import { useMutation, useAction } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

interface FreeformPreferencesDialogProps {
  open: boolean;
  onComplete: () => void;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5 | "loading" | "complete";

const FreeformPreferencesDialog: React.FC<FreeformPreferencesDialogProps> = ({
  open,
  onComplete,
}) => {
  const classifyPreferences = useAction(api.classify_preferences_action.classifyPreferences);
  const updateMyProfile = useMutation(api.users_mutations.updateMyProfile);
  const setPreferences = useMutation(
    api.user_preferences_mutations.setUserEventPreferences,
  );

  const [step, setStep] = useState<Step>(0);
  const [city, setCity] = useState("");
  const [likesText, setLikesText] = useState("");
  const [dislikesText, setDislikesText] = useState("");
  const [allergiesText, setAllergiesText] = useState("");
  const [dietaryText, setDietaryText] = useState("");
  const [cuisineText, setCuisineText] = useState("");
  const [currentInput, setCurrentInput] = useState("");

  const dismissed = useRef(false);

  const addPreference = (type: "likes" | "dislikes" | "allergies" | "dietary" | "cuisine") => {
    if (!currentInput.trim()) return;

    // Split on commas to allow adding multiple items at once
    const newItems = currentInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (newItems.length === 0) return;

    const append = (prev: string) => {
      const existing = prev ? prev.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const merged = Array.from(new Set([...existing, ...newItems]));
      return merged.join(", ");
    };

    if (type === "likes") {
      setLikesText(append);
    } else if (type === "dislikes") {
      setDislikesText(append);
    } else if (type === "allergies") {
      setAllergiesText(append);
    } else if (type === "dietary") {
      setDietaryText(append);
    } else {
      setCuisineText(append);
    }

    setCurrentInput("");
  };

  const removePreference = (
    type: "likes" | "dislikes" | "allergies" | "dietary" | "cuisine",
    index: number,
  ) => {
    if (type === "likes") {
      const items = likesText.split(",").map((s) => s.trim());
      items.splice(index, 1);
      setLikesText(items.join(", "));
    } else if (type === "dislikes") {
      const items = dislikesText.split(",").map((s) => s.trim());
      items.splice(index, 1);
      setDislikesText(items.join(", "));
    } else if (type === "allergies") {
      const items = allergiesText.split(",").map((s) => s.trim());
      items.splice(index, 1);
      setAllergiesText(items.join(", "));
    } else if (type === "dietary") {
      const items = dietaryText.split(",").map((s) => s.trim());
      items.splice(index, 1);
      setDietaryText(items.join(", "));
    } else {
      const items = cuisineText.split(",").map((s) => s.trim());
      items.splice(index, 1);
      setCuisineText(items.join(", "));
    }
  };

  const getPreferenceItems = (
    type: "likes" | "dislikes" | "allergies" | "dietary" | "cuisine",
  ): string[] => {
    const text =
      type === "likes" ? likesText :
      type === "dislikes" ? dislikesText :
      type === "allergies" ? allergiesText :
      type === "dietary" ? dietaryText :
      cuisineText;
    return text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleContinue = async () => {
    if (step === 0) {
      await updateMyProfile({ city: city.trim() || null });
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      // Classify preferences using AI
      setStep("loading");
      try {
        const result = await classifyPreferences({
          likesText,
          dislikesText,
          allergiesText,
          dietaryRestrictionsText: dietaryText,
          cuisinePreferencesText: cuisineText,
        });

        // Save all preferences together
        await setPreferences({
          preferredEventTypes: result.likes,
          negativeEventTypes: result.dislikes,
          rawLikes: getPreferenceItems("likes"),
          rawDislikes: getPreferenceItems("dislikes"),
          allergies: result.allergies,
          dietaryRestrictions: result.dietaryRestrictions,
          cuisinePreferences: result.cuisinePreferences,
        });

        setStep("complete");
      } catch (err) {
        console.error("Error classifying preferences:", err);
        setStep(5);
      }
    }
  };

  const canContinue = () => {
    return true; // Allow continuing even if empty (blank option available)
  };

  const handleSkip = async () => {
    if (dismissed.current) return;
    const trimmedCity = city.trim();
    if (!trimmedCity) return;
    dismissed.current = true;

    await updateMyProfile({ city: trimmedCity });

    // Save empty preferences
    await setPreferences({
      preferredEventTypes: [],
      negativeEventTypes: [],
    });
    onComplete();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && step !== "loading" && step !== "complete") {
      void handleSkip();
    }
  };

  if (step === "complete") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg" aria-describedby="completion-desc">
          <DialogHeader>
            <DialogTitle>All Set!</DialogTitle>
            <DialogDescription id="completion-desc">
              We've classified your preferences and saved them. Let's find some
              great events for you!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                onComplete();
              }}
            >
              Get Started
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const getStepDescription = () => {
    if (step === 0)
      return "What city should we save to your profile for event searches when a group doesn't have its own location?";
    if (step === 1)
      return "What types of events or activities do you enjoy? (e.g. live music, hiking, trivia nights). Type each one and click Add.";
    if (step === 2)
      return "What types of events or activities would you rather avoid? Leave blank and press continue if none.";
    if (step === 3)
      return "Let us know about any food allergies. Leave blank and press continue if none.";
    if (step === 4)
      return "Any dietary restrictions? (e.g. vegan, keto, halal). Leave blank and press continue if none.";
    if (step === 5)
      return "Any cuisine preferences? (e.g. Italian, Japanese, Mexican). Leave blank and press continue if none.";
    return "";
  };

  const currentInputType =
    step === 1 ? "likes" :
    step === 2 ? "dislikes" :
    step === 3 ? "allergies" :
    step === 4 ? "dietary" :
    step === 5 ? "cuisine" : "likes";
  const currentItems = getPreferenceItems(currentInputType);
  const isLoading = step === "loading";
  const isCityStep = step === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="onboarding-desc">
        <DialogHeader>
          <DialogTitle>Welcome to Spontaneity!</DialogTitle>
          <DialogDescription id="onboarding-desc">
            {isLoading ? "Classifying your preferences..." : getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        {!isLoading && (
          <div className="space-y-4 py-4">
            {isCityStep ? (
              <div className="space-y-2">
                <label htmlFor="defaultCity" className="text-sm font-medium">
                  City
                </label>
                <Input
                  id="defaultCity"
                  placeholder="Chicago, IL"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  You can change this later from your profile.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder={`Type a preference and press Add...`}
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addPreference(currentInputType);
                      }
                    }}
                    disabled={isLoading}
                  />
                  <Button
                    onClick={() => addPreference(currentInputType)}
                    disabled={!currentInput.trim() || isLoading}
                    variant="outline"
                  >
                    Add
                  </Button>
                </div>

                {currentItems.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {currentItems.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => removePreference(currentInputType, idx)}
                        className={cn(
                          "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors",
                          "border-primary bg-primary text-primary-foreground hover:bg-primary/80",
                        )}
                      >
                        {item} ×
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave blank and press continue if none.
                </p>
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="py-8 flex justify-center">
            <div className="text-center space-y-2">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground">
                Analyzing your preferences...
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step !== 0 && !isLoading && (
            <Button
              variant="ghost"
              onClick={() =>
                setStep((prev) => {
                  if (prev === 1) return 0;
                  if (prev === 2) return 1;
                  if (prev === 3) return 2;
                  if (prev === 4) return 3;
                  if (prev === 5) return 4;
                  return prev;
                })
              }
              disabled={isLoading}
            >
              ← Back
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            {!isLoading && (
              <Button
                onClick={() => void handleContinue()}
                disabled={(isCityStep && !city.trim()) || !canContinue() || isLoading}
              >
                {step === 5 ? "Finish" : "Continue →"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FreeformPreferencesDialog;
