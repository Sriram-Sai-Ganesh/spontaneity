import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutationChats } from "@/chats/hooks/use-mutation-chats";

interface AddChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddChatDialog: React.FC<AddChatDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [title, setTitle] = useState("");
  const [planningLocation, setPlanningLocation] = useState("");
  const [, setLocation] = useLocation();
  const { add: createChat } = useMutationChats();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    const trimmedPlanningLocation = planningLocation.trim();
    if (!trimmed) return;
    const chatId = await createChat({
      title: trimmed,
      planningLocation: trimmedPlanningLocation || undefined,
    });
    if (chatId) {
      setTitle("");
      setPlanningLocation("");
      onOpenChange(false);
      setLocation(`/groups/${chatId}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New Group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Group name"
              autoFocus
            />
            <Input
              value={planningLocation}
              onChange={(e) => setPlanningLocation(e.target.value)}
              placeholder="Group Location (optional)"
              aria-label="Group Location"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddChatDialog;
