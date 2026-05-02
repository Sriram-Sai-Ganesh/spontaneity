import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useMutationMessages() {
  const createMutation = useMutation(api.messages_mutations.create);

  const createMessage = async (message: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
  }): Promise<string | null> => {
    try {
      const messageId = await createMutation({
        chatId: message.chatId as Id<"chats">,
        role: message.role,
        content: message.content,
      });
      return messageId;
    } catch (error) {
      toast.error("Error creating message", {
        description: (error as Error).message || "Please try again later",
      });
      return null;
    }
  };

  return {
    add: createMessage,
  };
}
