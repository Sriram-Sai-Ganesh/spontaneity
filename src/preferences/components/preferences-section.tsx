import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Plus, Star, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";

type Section = "liked" | "disliked" | "allergies" | "dietary" | "cuisine";

const SECTION_LABELS: Record<Section, string> = {
  liked: "Types of events you enjoy",
  disliked: "Types of events you'd rather avoid",
  allergies: "Allergies",
  dietary: "Dietary restrictions",
  cuisine: "Cuisine preferences",
};

const PreferencesSection: React.FC = () => {
  const preferences = useQuery(api.user_preferences_queries.getUserEventPreferences);
  const setPreferences = useMutation(api.user_preferences_mutations.setUserEventPreferences);
  const classifyPreferences = useAction(api.classify_preferences_action.classifyPreferences);

  const [addingTo, setAddingTo] = useState<Section | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Use raw text if available, fall back to tag names for legacy data
  const rawLikes = preferences?.rawLikes ?? preferences?.preferredEventTypes ?? [];
  const rawDislikes = preferences?.rawDislikes ?? preferences?.negativeEventTypes ?? [];
  const rawAllergies = preferences?.allergies ?? [];
  const rawDietary = preferences?.dietaryRestrictions ?? [];
  const rawCuisine = preferences?.cuisinePreferences ?? [];

  const saveUpdated = async (
    newLikes: string[],
    newDislikes: string[],
    newAllergies: string[],
    newDietary: string[],
    newCuisine: string[],
  ) => {
    const likesChanged = JSON.stringify(newLikes) !== JSON.stringify(rawLikes);
    const dislikesChanged = JSON.stringify(newDislikes) !== JSON.stringify(rawDislikes);

    if (likesChanged || dislikesChanged) {
      const result = await classifyPreferences({
        likesText: newLikes.join(", "),
        dislikesText: newDislikes.join(", "),
        allergiesText: "",
      });
      await setPreferences({
        preferredEventTypes: result.likes,
        negativeEventTypes: result.dislikes,
        rawLikes: newLikes,
        rawDislikes: newDislikes,
        allergies: newAllergies,
        dietaryRestrictions: newDietary,
        cuisinePreferences: newCuisine,
      });
    } else {
      await setPreferences({
        preferredEventTypes: preferences?.preferredEventTypes ?? [],
        negativeEventTypes: preferences?.negativeEventTypes ?? [],
        rawLikes: newLikes,
        rawDislikes: newDislikes,
        allergies: newAllergies,
        dietaryRestrictions: newDietary,
        cuisinePreferences: newCuisine,
      });
    }
  };

  const handleAdd = async () => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed || !addingTo) return;

    // Prevent duplicates
    const existing =
      addingTo === "liked" ? rawLikes :
      addingTo === "disliked" ? rawDislikes :
      addingTo === "allergies" ? rawAllergies :
      addingTo === "dietary" ? rawDietary :
      rawCuisine;
    if (existing.includes(trimmed)) {
      setInputValue("");
      setAddingTo(null);
      return;
    }

    setSaving(true);
    try {
      const newLikes = addingTo === "liked" ? [...rawLikes, trimmed] : rawLikes;
      const newDislikes = addingTo === "disliked" ? [...rawDislikes, trimmed] : rawDislikes;
      const newAllergies = addingTo === "allergies" ? [...rawAllergies, trimmed] : rawAllergies;
      const newDietary = addingTo === "dietary" ? [...rawDietary, trimmed] : rawDietary;
      const newCuisine = addingTo === "cuisine" ? [...rawCuisine, trimmed] : rawCuisine;
      await saveUpdated(newLikes, newDislikes, newAllergies, newDietary, newCuisine);
      setAddingTo(null);
      setInputValue("");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (text: string, section: Section) => {
    setSaving(true);
    try {
      const newLikes = section === "liked" ? rawLikes.filter((t) => t !== text) : rawLikes;
      const newDislikes = section === "disliked" ? rawDislikes.filter((t) => t !== text) : rawDislikes;
      const newAllergies = section === "allergies" ? rawAllergies.filter((t) => t !== text) : rawAllergies;
      const newDietary = section === "dietary" ? rawDietary.filter((t) => t !== text) : rawDietary;
      const newCuisine = section === "cuisine" ? rawCuisine.filter((t) => t !== text) : rawCuisine;
      await saveUpdated(newLikes, newDislikes, newAllergies, newDietary, newCuisine);
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (section: Section, items: string[]) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{SECTION_LABELS[section]}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            setInputValue("");
            setAddingTo(section);
          }}
          disabled={saving}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-medium"
            >
              {item}
              <button
                onClick={() => void handleRemove(item, section)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${item}`}
                disabled={saving}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">None set yet.</p>
      )}
    </div>
  );

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Event preferences</h2>
        </div>

        <div className="flex flex-col gap-4">
          {renderSection("liked", rawLikes)}
          {renderSection("disliked", rawDislikes)}
          {renderSection("allergies", rawAllergies)}
          {renderSection("dietary", rawDietary)}
          {renderSection("cuisine", rawCuisine)}
        </div>
      </section>

      <Dialog
        open={addingTo !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setAddingTo(null);
            setInputValue("");
          }
        }}
      >
        <DialogContent aria-describedby="add-pref-desc">
          <DialogHeader>
            <DialogTitle>
              {addingTo ? `Add to: ${SECTION_LABELS[addingTo]}` : "Add preference"}
            </DialogTitle>
            <DialogDescription id="add-pref-desc">
              Type whatever you want — we'll match it to the right category automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. jazz concerts, hiking trails..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                autoFocus
                disabled={saving}
              />
              <Button onClick={() => void handleAdd()} disabled={!inputValue.trim() || saving}>
                {saving ? "Saving..." : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreferencesSection;
