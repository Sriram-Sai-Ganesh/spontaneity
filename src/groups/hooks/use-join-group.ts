import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useJoinGroup() {
  const join = useMutation(api.chats_mutations.joinWithInvite);

  const joinGroup = async ({
    token,
    nickname,
  }: {
    token: string;
    nickname?: string | null;
  }): Promise<Id<"chats"> | null> => {
    try {
      const res = await join({ token, nickname: nickname ?? undefined });
      toast.success("Joined group");
      return res.chatId;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to join group";
      toast.error("Could not join group", { description: message });
      return null;
    }
  };

  return { joinGroup };
}
