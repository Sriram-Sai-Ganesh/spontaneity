import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";

export function useMutationChats() {
  const createMutation = useMutation(api.chats_mutations.create);

  const createChat = async (chat: {
    title: string;
    planningLocation?: string;
  }): Promise<string | null> => {
    try {
      const chatId = await createMutation({
        title: chat.title,
        planningLocation: chat.planningLocation,
      });
      toast.success("Group created successfully");
      return chatId;
    } catch (error) {
      toast.error("Error creating group", {
        description: (error as Error).message || "Please try again later",
      });
      return null;
    }
  };

  return {
    add: createChat,
  };
}
