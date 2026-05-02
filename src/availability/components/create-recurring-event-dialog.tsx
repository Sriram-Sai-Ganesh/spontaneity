import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Trash2, Pencil, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Cadence = "daily" | "weekly" | "monthly";
type EndConditionType = "never" | "on_date" | "after_occurrences";

interface CreateRecurringEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function EndConditionFields({
  endType,
  setEndType,
  endDate,
  setEndDate,
  endCount,
  setEndCount,
}: {
  endType: EndConditionType;
  setEndType: (v: EndConditionType) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  endCount: number;
  setEndCount: (v: number) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Ends</label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={endType}
          onChange={(e) => setEndType(e.target.value as EndConditionType)}
        >
          <option value="never">Never</option>
          <option value="on_date">On date</option>
          <option value="after_occurrences">After occurrences</option>
        </select>
      </div>
      {endType === "on_date" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">End date</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      )}
      {endType === "after_occurrences" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Number of occurrences</label>
          <Input
            type="number"
            min={1}
            value={endCount}
            onChange={(e) => setEndCount(Math.max(1, Number(e.target.value)))}
          />
        </div>
      )}
    </>
  );
}

export function CreateRecurringEventDialog({
  open,
  onOpenChange,
  chatId,
}: CreateRecurringEventDialogProps) {
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [interval, setIntervalVal] = useState(1);
  const [startDate, setStartDate] = useState(todayString);
  const [endType, setEndType] = useState<EndConditionType>("never");
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState(10);
  const [startTime, setStartTime] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<Id<"recurring_event_configs"> | null>(null);
  const [editCadence, setEditCadence] = useState<Cadence>("weekly");
  const [editInterval, setEditInterval] = useState(1);
  const [editEndType, setEditEndType] = useState<EndConditionType>("never");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndCount, setEditEndCount] = useState(10);
  const [editStartTime, setEditStartTime] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const createConfig = useMutation(api.recurring_event_mutations.createRecurringEventConfig);
  const updateConfig = useMutation(api.recurring_event_mutations.updateRecurringEventConfig);
  const deleteConfig = useMutation(api.recurring_event_mutations.deleteRecurringEventConfig);
  const configs = useQuery(
    api.recurring_event_queries.getRecurringEventConfigsForChat,
    { chatId: chatId as Id<"chats"> },
  );

  function buildEndCondition(type: EndConditionType, date: string, count: number) {
    if (type === "on_date") return { type: "on_date" as const, date };
    if (type === "after_occurrences") return { type: "after_occurrences" as const, count };
    return { type: "never" as const };
  }

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (endType === "on_date" && !endDate) { toast.error("End date is required"); return; }
    setSaving(true);
    try {
      await createConfig({
        chatId: chatId as Id<"chats">,
        eventId: `recurring-${Date.now()}`,
        title: title.trim(),
        cadence,
        interval,
        startDate,
        endCondition: buildEndCondition(endType, endDate, endCount),
        startTime: startTime || undefined,
      });
      toast.success("Recurring event created");
      setTitle(""); setCadence("weekly"); setIntervalVal(1);
      setStartDate(todayString()); setEndType("never"); setEndDate(""); setEndCount(10); setStartTime("");
    } catch (err) {
      toast.error("Failed to create", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: NonNullable<typeof configs>[number]) => {
    setEditingId(config._id);
    setEditCadence(config.cadence);
    setEditInterval(config.interval);
    const ec = config.endCondition;
    if (ec.type === "on_date") { setEditEndType("on_date"); setEditEndDate(ec.date); setEditEndCount(10); }
    else if (ec.type === "after_occurrences") { setEditEndType("after_occurrences"); setEditEndCount(ec.count); setEditEndDate(""); }
    else { setEditEndType("never"); setEditEndDate(""); setEditEndCount(10); }
    setEditStartTime(config.startTime ?? "");
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (editEndType === "on_date" && !editEndDate) { toast.error("End date is required"); return; }
    setEditSaving(true);
    try {
      await updateConfig({
        id: editingId,
        cadence: editCadence,
        interval: editInterval,
        endCondition: buildEndCondition(editEndType, editEndDate, editEndCount),
        startTime: editStartTime || undefined,
      });
      toast.success("Recurring event updated");
      setEditingId(null);
    } catch (err) {
      toast.error("Failed to update", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: Id<"recurring_event_configs">) => {
    if (editingId === id) setEditingId(null);
    try {
      await deleteConfig({ id });
      toast.success("Recurring event deleted");
    } catch (err) {
      toast.error("Failed to delete", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recurring Events</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {configs && configs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Existing</p>
              <div className="space-y-2">
                {configs.map((config) => (
                  <div key={config._id} className="rounded-md border text-sm">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="font-medium leading-tight">{config.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          Every {config.interval > 1 ? `${config.interval} ` : ""}
                          {config.cadence} · from {config.startDate}
                          {config.occurrencesRemaining !== null && (
                            <span className="ml-1 text-primary font-medium">
                              · {config.occurrencesRemaining} left
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            editingId === config._id
                              ? setEditingId(null)
                              : handleEdit(config)
                          }
                        >
                          {editingId === config._id ? (
                            <X className="h-3.5 w-3.5" />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(config._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {editingId === config._id && (
                      <div className="border-t px-3 py-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Repeats</label>
                            <select
                              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                              value={editCadence}
                              onChange={(e) => setEditCadence(e.target.value as Cadence)}
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Every</label>
                            <Input
                              type="number"
                              min={1}
                              value={editInterval}
                              onChange={(e) => setEditInterval(Math.max(1, Number(e.target.value)))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Time (optional)</label>
                          <Input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                          />
                        </div>
                        <EndConditionFields
                          endType={editEndType}
                          setEndType={setEditEndType}
                          endDate={editEndDate}
                          setEndDate={setEditEndDate}
                          endCount={editEndCount}
                          setEndCount={setEditEndCount}
                        />
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={editSaving}
                          onClick={() => void handleUpdate()}
                        >
                          {editSaving ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">New recurring event</p>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Title</label>
              <Input
                placeholder="e.g. Weekly Trivia Night"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Repeats</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as Cadence)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Every</label>
                <Input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setIntervalVal(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Time (optional)</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>

            <EndConditionFields
              endType={endType}
              setEndType={setEndType}
              endDate={endDate}
              setEndDate={setEndDate}
              endCount={endCount}
              setEndCount={setEndCount}
            />

            <Button
              className="w-full"
              disabled={saving}
              onClick={() => void handleCreate()}
            >
              {saving ? "Creating..." : "Create recurring event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
