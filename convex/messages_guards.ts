import type { Id } from "./_generated/dataModel";
import type { AuthQueryCtx, AuthMutationCtx } from "./lib";
import { getChatIfMember } from "./chats_guards";

/**
 * Verify the current user owns the parent chat.
 * Returns false if the chat does not exist (e.g. deleted), true if authorized.
 */
export async function requireMessageChatOwner(
  ctx: AuthQueryCtx | AuthMutationCtx,
  chatId: Id<"chats">,
): Promise<boolean> {
  return (await getChatIfMember(ctx, chatId)) !== null;
}
