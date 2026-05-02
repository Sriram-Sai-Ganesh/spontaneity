import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const DEFAULT_TTL_HOURS = 72;

export function useInviteLink(chatId: string) {
  const createInvite = useMutation(api.chats_mutations.createInvite);

  const copyInviteLink = async (): Promise<string | null> => {
    try {
      const { token, expiresAt } = await createInvite({
        chatId: chatId as Id<"chats">,
        expiresInHours: DEFAULT_TTL_HOURS,
      });
      // Respect GitHub Pages base path (e.g., /team-05/) when building shareable links.
      // In local dev, fall back to root if the current path isn't under that base.
      const configuredBase = import.meta.env.BASE_URL || "/";
      const baseWithoutTrailingSlash =
        configuredBase === "/" ? "/" : configuredBase.replace(/\/$/, "");
      const baseWithSlash =
        baseWithoutTrailingSlash === "/"
          ? "/"
          : `${baseWithoutTrailingSlash}/`;
      const basePath = window.location.pathname.startsWith(
        baseWithoutTrailingSlash,
      )
        ? baseWithSlash
        : "/";
      const baseUrl = new URL(basePath, window.location.origin);
      const url = new URL(`invite/${token}`, baseUrl).toString();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Fallback: show the URL so user can copy manually
        toast.info("Copy this invite link", { description: url });
        return url;
      }
      const expiresDate = new Date(expiresAt).toLocaleString();
      toast.success("Invite link copied", {
        description: `Expires on ${expiresDate}`,
      });
      return url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create invite";
      toast.error("Could not create invite link", { description: message });
      return null;
    }
  };

  return { copyInviteLink };
}
