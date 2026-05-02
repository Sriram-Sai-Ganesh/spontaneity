import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageAvatar, MessageContent } from "@/components/prompt-kit/message";
import { cn } from "@/lib/utils";
import { useMutationMessage } from "@/messages/hooks/use-mutation-message";
import type { MessageType } from "@/messages/types/message";
import type { MemberProfile } from "@/messages/types/member-profile";

interface MessageProps {
  message: MessageType;
  author?: MemberProfile;
  isCurrentUser?: boolean;
}

const Message: React.FC<MessageProps> = ({ message, author, isCurrentUser }) => {
  const isAssistant = message.role === "assistant";
  const alignRight = isCurrentUser && !isAssistant;
  const isPersistedMessage = !message._id.startsWith("optimistic-");
  const canManage = isCurrentUser && !isAssistant && isPersistedMessage;
  const displayName =
    author?.nickname || author?.name || (isAssistant ? "Assistant" : "Member");
  const timestamp = new Date(message._creationTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const avatarSrc = isAssistant ? "" : author?.image ?? "";
  const fallback = isAssistant
    ? "AI"
    : displayName?.charAt(0)?.toUpperCase() || "?";
  const { edit, delete: deleteMessage } = useMutationMessage(
    message._id,
    message.chatId,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const lastPersistedContentRef = useRef(message.content);

  useEffect(() => {
    if (!isEditing && message.content !== lastPersistedContentRef.current) {
      setDraft(message.content);
    }
    lastPersistedContentRef.current = message.content;
  }, [isEditing, message.content]);

  const handleAvatarClick = () => {
    const nicknameLabel = author?.nickname || displayName;

    toast.info(nicknameLabel || "No nickname set", {
      description: author?.nickname
        ? "Group nickname"
        : isAssistant
          ? "Assistant"
          : "Nickname not set",
    });
  };

  const handleSave = async () => {
    const content = draft.trim();
    if (!content || pendingAction) return;
    setPendingAction("save");
    const success = await edit({ content });
    setPendingAction(null);
    if (success) {
      setDraft(content);
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (pendingAction) return;

    setPendingAction("delete");
    const success = await deleteMessage();
    setPendingAction(null);
    if (success) {
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        alignRight && "flex-row-reverse",
      )}
      role="listitem"
    >
      <button
        type="button"
        onClick={handleAvatarClick}
        className="rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={displayName ? `View nickname for ${displayName}` : "View nickname"}
      >
        <MessageAvatar
          src={avatarSrc}
          alt={displayName || "Member"}
          fallback={fallback}
          className="shadow-sm"
        />
      </button>
      <div
        className={cn(
          "flex flex-col gap-1 max-w-[86%] sm:max-w-[80%]",
          alignRight ? "items-end" : "items-start",
        )}
      >
        {isEditing ? (
          <div className="w-full space-y-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
              className="min-h-24 text-sm"
              aria-label="Edit message"
            />
            <div className={cn("flex gap-2", alignRight && "justify-end")}>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!draft.trim() || pendingAction !== null}
              >
                {pendingAction === "save" ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(message.content);
                  setIsEditing(false);
                }}
                disabled={pendingAction !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <MessageContent
            markdown
            className={cn(
              "prose prose-neutral prose-sm dark:prose-invert text-left",
              isAssistant
                ? "bg-secondary/70"
                : "bg-primary/10 border border-border/50",
            )}
          >
            {canManage ? draft : message.content}
          </MessageContent>
        )}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
            alignRight && "justify-end",
          )}
        >
          <span className="font-medium">{displayName}</span>
          <span className="opacity-70">•</span>
          <span>{timestamp}</span>
          {canManage && !isEditing && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsEditing(true)}
                aria-label="Edit message"
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={pendingAction !== null}
                aria-label="Delete message"
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction !== null}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "delete" ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Message;
