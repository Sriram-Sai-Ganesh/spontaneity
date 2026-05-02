import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  removePersistedMessage,
  updatePersistedMessage,
} from "@/messages/store/messages";

export function useMutationMessage(messageId: string, chatId: string) {
  const updateMutation = useMutation(api.messages_mutations.update);
  const removeMutation = useMutation(api.messages_mutations.remove);

  const editMessage = async (updates: { content?: string }): Promise<boolean> => {
    const content = updates.content?.trim();
    if (!content) {
      toast.error("Message content is required");
      return false;
    }

    try {
      await updateMutation({
        messageId: messageId as Id<"messages">,
        content,
      });
      updatePersistedMessage(chatId, messageId, { content });
      toast.success("Message updated");
      return true;
    } catch (error) {
      toast.error("Failed to update message", {
        description: (error as Error).message,
      });
      return false;
    }
  };

  const deleteMessage = async (): Promise<boolean> => {
    try {
      await removeMutation({
        messageId: messageId as Id<"messages">,
      });
      removePersistedMessage(chatId, messageId);
      toast.success("Message deleted");
      return true;
    } catch (error) {
      toast.error("Failed to delete message", {
        description: (error as Error).message,
      });
      return false;
    }
  };

  return {
    edit: editMessage,
    delete: deleteMessage,
  };
}
