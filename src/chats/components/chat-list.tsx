import { useState } from "react";
import { useLocation } from "wouter";
import { Bot, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useQueryChats } from "@/chats/hooks/use-query-chats";
import { useMutationChat } from "@/chats/hooks/use-mutation-chat";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ChatType } from "@/chats/types/chat";
import EditChatDialog from "@/chats/components/edit-chat-dialog";
import DeleteChatDialog from "@/chats/components/delete-chat-dialog";
import { useSidebar } from "@/layout/sidebar-context";
import { AI_ASSISTANT_CHAT_KIND } from "@/chats/constants";

interface ChatListProps {
  activeChatId?: string;
  searchQuery?: string;
  sortOrder?: "desc" | "asc";
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function groupByDate(
  chats: ChatType[],
): { label: string; chats: ChatType[] }[] {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekAgoStart = todayStart - 7 * 86400000;

  const groups: Record<string, ChatType[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const chat of chats) {
    const t = chat._creationTime;
    if (t >= todayStart) {
      groups["Today"].push(chat);
    } else if (t >= yesterdayStart) {
      groups["Yesterday"].push(chat);
    } else if (t >= weekAgoStart) {
      groups["Previous 7 days"].push(chat);
    } else {
      groups["Older"].push(chat);
    }
  }

  return Object.entries(groups)
    .filter(([, chats]) => chats.length > 0)
    .map(([label, chats]) => ({ label, chats }));
}

function DeleteChatButton({
  chatId,
  activeChatId,
  memberRole,
}: {
  chatId: string;
  activeChatId?: string;
  memberRole?: "owner" | "member";
}) {
  const { delete: deleteChat } = useMutationChat(chatId);
  const leave = useMutation(api.chats_mutations.leave);
  const [, setLocation] = useLocation();

  const handleDelete = async () => {
    // Owners delete the group; members leave the group.
    const success =
      memberRole === "owner"
        ? await deleteChat()
        : await leave({ chatId: chatId as Id<"chats"> })
            .then(() => true)
            .catch(() => false);

    if (success && chatId === activeChatId) {
      setLocation("/");
    }
  };

  return (
    <DeleteChatDialog
      onConfirm={handleDelete}
      mode={memberRole === "owner" ? "delete" : "leave"}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Delete group"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    />
  );
}

const ChatList: React.FC<ChatListProps> = ({
  activeChatId,
  searchQuery,
  sortOrder = "desc",
}) => {
  const { data: chats, loading } = useQueryChats();
  const [, setLocation] = useLocation();
  const [editingChat, setEditingChat] = useState<ChatType | null>(null);
  const { closeSidebar } = useSidebar();
  const normalizedSearch = searchQuery?.trim().toLowerCase() ?? "";
  const assistantChats = chats.filter(
    (chat) => chat.kind === AI_ASSISTANT_CHAT_KIND,
  );
  const regularChats = chats.filter(
    (chat) => chat.kind !== AI_ASSISTANT_CHAT_KIND,
  );

  const filtered = regularChats
    .filter((chat) =>
      normalizedSearch
        ? chat.title.toLowerCase().includes(normalizedSearch)
        : true,
    )
    .sort((a, b) =>
      sortOrder === "desc"
        ? (b.lastMessageAt ?? b._creationTime) -
          (a.lastMessageAt ?? a._creationTime)
        : (a.lastMessageAt ?? a._creationTime) -
          (b.lastMessageAt ?? b._creationTime),
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading groups...</p>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No groups yet. Create one to get started!
        </p>
      </div>
    );
  }

  if (filtered.length === 0 && assistantChats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No matching groups.</p>
      </div>
    );
  }

  const groups = groupByDate(filtered);
  const renderChatRow = (chat: ChatType) => {
    const isActive = chat._id === activeChatId;
    const isAssistantChat = chat.kind === AI_ASSISTANT_CHAT_KIND;

    return (
      <li key={chat._id} className="relative group">
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setLocation(`/groups/${chat._id}`);
            closeSidebar();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setLocation(`/groups/${chat._id}`);
              closeSidebar();
            }
          }}
          className={cn(
            "w-full text-left px-3 py-3 pr-20 flex items-start gap-3 transition-colors cursor-pointer",
            "hover:bg-accent",
            isActive && "bg-secondary border-l-2 border-l-primary",
          )}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-sm",
              isActive ? "border-primary/60 bg-primary/10" : "border-border",
            )}
            aria-hidden="true"
          >
            {isAssistantChat ? (
              <Bot className="h-4 w-4" />
            ) : (
              chat.icon?.trim() || "👥"
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm truncate",
                (chat.hasUnread || isActive) && "font-semibold",
              )}
            >
              {chat.title}
              {chat.hasUnread && (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-primary align-middle" />
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                isAssistantChat
                  ? "Assistant"
                  : chat.memberRole
                    ? chat.memberRole === "owner"
                      ? "Owner"
                      : "Member"
                    : null,
                formatRelativeTime(chat.lastMessageAt ?? chat._creationTime),
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </div>
        </div>
        {!isAssistantChat && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingChat(chat);
                    }}
                    aria-label="Edit group"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Edit group</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DeleteChatButton
                    chatId={chat._id}
                    activeChatId={activeChatId}
                    memberRole={chat.memberRole}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  {chat.memberRole === "owner" ? "Delete group" : "Leave group"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {assistantChats.length > 0 && (
        <div>
          <h3 className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pinned
          </h3>
          <ul role="list">{assistantChats.map(renderChatRow)}</ul>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group.label}
          </h3>
          <ul role="list">{group.chats.map(renderChatRow)}</ul>
        </div>
      ))}
      {editingChat && (
        <EditChatDialog
          chat={editingChat}
          open={!!editingChat}
          onOpenChange={(open) => {
            if (!open) setEditingChat(null);
          }}
        />
      )}
    </>
  );
};

export default ChatList;
