import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useMutationChat(chatId: string) {
  const updateMutation = useMutation(api.chats_mutations.update);
  const removeMutation = useMutation(api.chats_mutations.remove);

  const editChat = async (updates: {
    title?: string;
    icon?: string | null;
    planningLocation?: string | null;
    useDistanceRanking?: boolean | null;
    midpointLatitude?: number | null;
    midpointLongitude?: number | null;
    midpointLabel?: string | null;
  }): Promise<boolean> => {
    try {
      await updateMutation({
        chatId: chatId as Id<"chats">,
        ...updates,
      });
      toast.success("Group updated successfully");
      return true;
    } catch (error) {
      toast.error("Failed to update group.");
      return false;
    }
  };

  const deleteChat = async (): Promise<boolean> => {
    try {
      await removeMutation({ chatId: chatId as Id<"chats"> });
      toast.success("Group deleted successfully");
      return true;
    } catch (error) {
      toast.error("You must be the owner to delete this group.");
      return false;
    }
  };

  return {
    edit: editChat,
    delete: deleteChat,
  };
}
