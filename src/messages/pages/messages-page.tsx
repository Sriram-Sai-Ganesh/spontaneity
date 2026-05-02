import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  CalendarSearch,
  ChevronDown,
  DoorOpen,
  Link2,
  PencilLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { useQueryChat } from "@/chats/hooks/use-query-chat";
import { useQueryMessages } from "@/messages/hooks/use-query-messages";
import { useChat } from "@/messages/hooks/use-chat";
import MessageList from "@/messages/components/message-list";
import MessageInput from "@/messages/components/message-input";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/config/models";
import { useInviteLink } from "@/chats/hooks/use-invite-link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import FindEventsDialog from "@/groups/components/find-events-dialog";
import EditChatDialog from "@/chats/components/edit-chat-dialog";
import { PreferenceSuggestionBanner } from "@/messages/components/preference-suggestion-banner";
import { usePassivePreferenceExtraction } from "@/messages/hooks/use-passive-preference-extraction";
import { AI_ASSISTANT_CHAT_KIND } from "@/chats/constants";

interface MessagesPageProps {
  chatId: string;
}

const MessagesPage: React.FC<MessagesPageProps> = ({ chatId }) => {
  const { data: chat, loading: chatLoading } = useQueryChat(chatId);
  const hasValidChat = Boolean(chat);
  const { data: messages } = useQueryMessages(chatId, hasValidChat);
  const isAssistantChat = chat?.kind === AI_ASSISTANT_CHAT_KIND;
  const { sendMessage, isStreaming, streamingContent, abort, toolCalls } =
    useChat(chatId, { alwaysUseAi: isAssistantChat });
  const memberProfiles =
    useQuery(
      api.chats_queries.getMemberProfiles,
      hasValidChat
        ? {
            chatId: chatId as Id<"chats">,
          }
        : "skip",
    ) ?? [];
  const viewer = useQuery(api.users_queries.me);
  const membersForMessages = memberProfiles.map((member) => ({
    userId: member.userId,
    nickname: member.nickname ?? undefined,
    role: member.role ?? undefined,
    name: member.user?.name ?? undefined,
    image: member.user?.image ?? undefined,
  }));
  const [model, setModel] =
    useState<(typeof AVAILABLE_MODELS)[number]["id"]>(DEFAULT_MODEL);
  const [inputValue, setInputValue] = useState("");
  const [, setLocation] = useLocation();
  const { copyInviteLink } = useInviteLink(chatId);
  const leaveMutation = useMutation(api.chats_mutations.leave);
  const setNicknameMutation = useMutation(api.chats_mutations.setNickname);
  const markReadMutation = useMutation(api.chats_mutations.markRead);
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [findEventsOpen, setFindEventsOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const viewerId = viewer?._id ?? "local-user";
  const { signalsToShow, handleAccept, handleReject } =
    usePassivePreferenceExtraction(chatId, messages ?? [], viewerId, hasValidChat);

  const activeModel = AVAILABLE_MODELS.find((m) => m.id === model);

  useEffect(() => {
    if (chat) {
      setNicknameValue(chat.nickname ?? "");
    }
  }, [chat]);

  // Mark chat as read when we load or receive new messages
  useEffect(() => {
    if (!messages?.length) return;
    const latest = messages[messages.length - 1]?._creationTime;
    if (!latest) return;
    void markReadMutation({
      chatId: chatId as Id<"chats">,
      at: latest,
    });
  }, [messages?.length, chatId, markReadMutation, messages]);

  const handleSend = async (content: string) => {
    const accepted = await sendMessage(content, model);
    if (accepted) {
      setInputValue("");
    }
  };

  if (chatLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Group not found.</div>
    );
  }

  const handleCopyInvite = async () => {
    await copyInviteLink();
  };

  const handleLeaveGroup = async () => {
    setLeaving(true);
    try {
      await leaveMutation({ chatId: chatId as Id<"chats"> });
      toast.success("Left group");
      setLocation("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to leave group";
      toast.error("Could not leave group", { description: message });
    } finally {
      setLeaving(false);
    }
  };

  const handleSaveNickname = async () => {
    setSavingNickname(true);
    try {
      await setNicknameMutation({
        chatId: chatId as Id<"chats">,
        nickname: nicknameValue || null,
      });
      toast.success("Nickname saved");
      setNicknameDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save nickname";
      toast.error("Could not save nickname", { description: message });
    } finally {
      setSavingNickname(false);
    }
  };

  const currentNickname = chat.nickname ?? "";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 flex-shrink-0"
            onClick={() => setLocation("/")}
            aria-label="Back to groups"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border bg-secondary text-base">
            {isAssistantChat ? (
              <Bot className="h-4 w-4" />
            ) : (
              chat.icon?.trim() || "👥"
            )}
          </span>
          <div className="flex flex-col min-w-0">
            {isAssistantChat ? (
              <h1 className="text-left text-lg font-semibold truncate">
                {chat.title}
              </h1>
            ) : (
              <button
                type="button"
                onClick={() => setEditDialogOpen(true)}
                className="text-left text-lg font-semibold truncate hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                aria-label="Edit group"
              >
                {chat.title}
              </button>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {isAssistantChat ? (
                "You and Spontaneity AI"
              ) : (
                <>
                  {chat.memberRole === "owner" ? "Owner" : "Member"}
                  {currentNickname ? ` • “${currentNickname}”` : ""}
                  {memberProfiles.length
                    ? ` • ${memberProfiles.length} members`
                    : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2">
                <span className="max-w-[6.5rem] truncate text-xs sm:max-w-none sm:text-sm">
                  {activeModel?.label ?? model}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {AVAILABLE_MODELS.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => setModel(m.id)}>
                  {m.label}
                  {m.id === model && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      active
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!isAssistantChat && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Group actions">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFindEventsOpen(true)}>
                  <CalendarSearch className="mr-2 h-4 w-4" />
                  Find available events
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleCopyInvite()}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Copy invite link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNicknameDialogOpen(true)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Set my nickname
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    setLeaveDialogOpen(true);
                  }}
                >
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Leave group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ChatContainerRoot className="relative flex-1" aria-label="Chat messages">
        <ChatContainerContent className="mx-auto w-full max-w-3xl py-3">
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            toolCalls={toolCalls}
            members={membersForMessages}
            currentUserId={viewerId}
            onInsertSuggestion={setInputValue}
            chatId={chatId}
          />
        </ChatContainerContent>
        <ChatContainerScrollAnchor />
        <div className="absolute bottom-0 left-0 z-10 flex w-full justify-center pointer-events-none">
          <ScrollButton className="mb-2 pointer-events-auto" />
        </div>
      </ChatContainerRoot>
      {signalsToShow.length > 0 && (
        <PreferenceSuggestionBanner
          signal={signalsToShow[0]}
          onAccept={handleAccept}
          onDismiss={handleReject}
        />
      )}
      <MessageInput
        value={inputValue}
        onValueChange={setInputValue}
        onSend={handleSend}
        isLoading={isStreaming}
        onAbort={abort}
        assistantChat={isAssistantChat}
      />
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this group?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this chat. You can rejoin with a new
              invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleLeaveGroup()}
              disabled={leaving}
            >
              {leaving ? "Leaving..." : "Leave group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={nicknameDialogOpen} onOpenChange={setNicknameDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Set nickname</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={nicknameValue}
              onChange={(e) => setNicknameValue(e.target.value)}
              placeholder="How should others see you?"
            />
            <p className="text-xs text-muted-foreground">
              Nickname is visible to this group only.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setNicknameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveNickname()}
              disabled={savingNickname}
            >
              {savingNickname ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editDialogOpen && !isAssistantChat && (
        <EditChatDialog
          chat={chat}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}
      {!isAssistantChat && (
        <FindEventsDialog
          chatId={chatId}
          memberCount={memberProfiles.length}
          open={findEventsOpen}
          onOpenChange={setFindEventsOpen}
        />
      )}
    </div>
  );
};

export default MessagesPage;
