import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Plus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { EventTagSchema } from "../../../convex/event_types";

const EVENT_TYPE_BANK = EventTagSchema.options.filter(option => option !== "None" && option !== "Custom");

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = "liked" | "disliked";

const PreferencesDialog: React.FC<PreferencesDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const preferences = useQuery(api.user_preferences_queries.getUserEventPreferences);
  const setPreferences = useMutation(api.user_preferences_mutations.setUserEventPreferences);

  const [addingTo, setAddingTo] = useState<Section | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const liked = preferences?.preferredEventTypes ?? [];
  const disliked = preferences?.negativeEventTypes ?? [];

  const handleAdd = async (eventType: string) => {
    const normalized = eventType.toLowerCase();
    const newLiked = addingTo === "liked" ? [...liked, normalized] : liked;
    const newDisliked = addingTo === "disliked" ? [...disliked, normalized] : disliked;
    await setPreferences({
      preferredEventTypes: newLiked,
      negativeEventTypes: newDisliked,
    });
    setAddingTo(null);
    setSearchQuery("");
  };

  const handleRemove = async (eventType: string, section: Section) => {
    const newLiked = section === "liked" ? liked.filter((t) => t !== eventType) : liked;
    const newDisliked = section === "disliked" ? disliked.filter((t) => t !== eventType) : disliked;
    await setPreferences({
      preferredEventTypes: newLiked,
      negativeEventTypes: newDisliked,
    });
  };

  const getFilteredOptions = (section: Section) => {
    const existing = section === "liked" ? liked : disliked;
    return EVENT_TYPE_BANK.filter((type) => {
      const normalized = type.toLowerCase();
      return (
        !existing.includes(normalized) &&
        type.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>My Preferences</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">What events you like:</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    setSearchQuery("");
                    setAddingTo("liked");
                  }}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {liked.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {liked.map((type) => (
                    <span key={type} className="inline-flex items-center gap-1 rounded-full border bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-medium">
                      {type}
                      <button
                        onClick={() => handleRemove(type, "liked")}
                        className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${type}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None set yet.</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">What events you don&apos;t like:</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    setSearchQuery("");
                    setAddingTo("disliked");
                  }}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {disliked.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {disliked.map((type) => (
                    <span key={type} className="inline-flex items-center gap-1 rounded-full border bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-medium">
                      {type}
                      <button
                        onClick={() => handleRemove(type, "disliked")}
                        className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${type}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None set yet.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addingTo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddingTo(null);
            setSearchQuery("");
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {addingTo === "liked" ? "Add events you like" : "Add events you don't like"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search event types..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto py-1">
              {addingTo !== null && getFilteredOptions(addingTo).length > 0 ? (
                getFilteredOptions(addingTo).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleAdd(type)}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                  >
                    {type}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground w-full text-center py-4">
                  {searchQuery ? "No matching event types." : "All event types already added."}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreferencesDialog;
