import { Fragment, useEffect, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { MessageAvatar, MessageContent } from "@/components/prompt-kit/message";
import { Loader } from "@/components/prompt-kit/loader";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { Tool } from "@/components/prompt-kit/tool";
import type { MessageType } from "@/messages/types/message";
import type { ToolCallPart } from "@/messages/types/tool-call";
import type { MemberProfile } from "@/messages/types/member-profile";
import ChatEventCards, {
  getChatEventCardsPayload,
} from "./chat-event-cards";
import AcceptedEventNotification, {
  getAcceptedEventNotificationPayload,
} from "./accepted-event-notification";
import Message from "./message";
import { useRecommendationPool } from "@/availability/context/recommendation-context";

const SUGGESTIONS: string[] = [];
const EXPLICIT_EVENT_CARD_TOOLS = new Set([
  "displayEventCards",
  "createEventPoll",
]);

function isHiddenInlineTool(toolCall: ToolCallPart): boolean {
  return (
    toolCall.toolName === "setUserEventPreferences" ||
    toolCall.toolName === "getEventPreferences" ||
    toolCall.toolName === "setUserAppearancePreferences"
  );
}

function renderToolCallContent(
  toolCall: ToolCallPart,
  chatId: string,
  key: string,
) {
  const acceptedEventNotificationPayload =
    getAcceptedEventNotificationPayload(toolCall);
  if (acceptedEventNotificationPayload) {
    return (
      <AcceptedEventNotification
        key={key}
        payload={acceptedEventNotificationPayload}
        chatId={chatId}
      />
    );
  }

  const payload = getChatEventCardsPayload(toolCall);
  if (payload) {
    return <ChatEventCards key={key} payload={payload} chatId={chatId} />;
  }

  if (isHiddenInlineTool(toolCall)) {
    return null;
  }

  return (
    <div key={key} className="px-4">
      <Tool
        toolPart={{
          type: toolCall.toolName,
          state: toolCall.state,
          input: toolCall.args,
          output: toolCall.result,
          toolCallId: toolCall.toolCallId,
        }}
        defaultOpen={Boolean((toolCall.result as any)?.ics)}
      />
    </div>
  );
}

interface MessageListProps {
  messages: MessageType[];
  streamingContent?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallPart[];
  onInsertSuggestion?: (content: string) => void;
  members?: MemberProfile[];
  currentUserId?: string;
  chatId?: string;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingContent,
  isStreaming,
  toolCalls = [],
  onInsertSuggestion,
  members = [],
  currentUserId,
  chatId = "",
}) => {
  const isThinking = isStreaming && !streamingContent && toolCalls.length === 0;
  const isFindingGroupEvents = toolCalls.some(
    (tc) =>
      tc.toolName === "findGroupAvailableEvents" &&
      tc.state === "input-available",
  );
  const inFlightVenueType = toolCalls
    .find(tc => tc.toolName === "findGroupAvailableEvents" && tc.state === "input-available")
    ?.args?.venueTypeFilter as "food" | "activity" | undefined;
  const recommendationPool = useRecommendationPool();

  useEffect(() => {
    if (!recommendationPool) return;
    console.log(`[finding] isFindingGroupEvents=${isFindingGroupEvents} | venueTypeFilter=${inFlightVenueType ?? "none"}`);
    recommendationPool._setIsFindingGroupEvents(isFindingGroupEvents);
    if (isFindingGroupEvents) {
      // Clear shared pool immediately so both chat cards and panel don't render stale results.
      recommendationPool._setDisplayEvents([]);
    }
  }, [recommendationPool, isFindingGroupEvents, inFlightVenueType]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, MemberProfile>();

    members.forEach((member) => {
      map.set(member.userId, {
        userId: member.userId,
        nickname: member.nickname,
        role: member.role,
        name: member.name,
        image: member.image,
      });
    });

    return map;
  }, [members]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 gap-6">
        <div className="flex flex-col items-center gap-2">
          <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">
            How can I help you today?
          </h3>
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {SUGGESTIONS.map((suggestion) => (
            <PromptSuggestion
              key={suggestion}
              onClick={() => onInsertSuggestion?.(suggestion)}
            >
              {suggestion}
            </PromptSuggestion>
          ))}
        </div>
      </div>
    );
  }

  // Compute live tool calls early (before formattedMessages) so we can decide
  // whether to suppress persisted event cards when live results are incoming.
  const persistedToolCallIds = new Set(
    messages
      .map((message) => message.latestToolCall?.toolCallId)
      .filter((toolCallId): toolCallId is string => Boolean(toolCallId)),
  );

  const liveToolCalls = toolCalls.filter(
    (toolCall) => !persistedToolCallIds.has(toolCall.toolCallId),
  );

  const eventCardToolEntries = liveToolCalls
    .map((toolCall) => ({
      toolCall,
      payload: getChatEventCardsPayload(toolCall),
    }))
    .filter(
      (
        entry,
      ): entry is {
        toolCall: ToolCallPart;
        payload: NonNullable<ReturnType<typeof getChatEventCardsPayload>>;
      } => entry.payload !== null,
    );

  const hasExplicitCardHelper = eventCardToolEntries.some(
    (entry) => EXPLICIT_EVENT_CARD_TOOLS.has(entry.toolCall.toolName),
  );

  const visibleEventCardEntries = hasExplicitCardHelper
    ? eventCardToolEntries.filter(
        (entry) => EXPLICIT_EVENT_CARD_TOOLS.has(entry.toolCall.toolName),
      )
    : eventCardToolEntries;

  const hiddenToolCallIds = new Set(
    (hasExplicitCardHelper ? eventCardToolEntries : visibleEventCardEntries).map(
      (entry) => entry.toolCall.toolCallId,
    ),
  );

  // Find the last message with an event card tool call so older cards are suppressed.
  // When live event cards are already showing (new query result arrived but not yet
  // persisted), suppress ALL persisted event cards to avoid showing stale + new simultaneously.
  const lastEventCardMessageId =
    visibleEventCardEntries.length > 0
      ? null
      : ([...messages]
          .reverse()
          .find(
            (m) =>
              m.role === "assistant" &&
              m.latestToolCall &&
              (m.latestToolCall.toolName === "findGroupAvailableEvents" ||
                EXPLICIT_EVENT_CARD_TOOLS.has(m.latestToolCall.toolName)),
          )?._id ?? null);

  const formattedMessages = messages.map((message, index) => {
    const previous = messages[index - 1];
    const previousDate = previous
      ? new Date(previous._creationTime).toDateString()
      : null;
    const currentDate = new Date(message._creationTime).toDateString();

    const needsDateDivider = previousDate !== currentDate;
    const isEventCardTool =
      message.latestToolCall?.toolName === "findGroupAvailableEvents" ||
      EXPLICIT_EVENT_CARD_TOOLS.has(message.latestToolCall?.toolName ?? "");
    // Only render event cards for the most recent event card message; suppress older ones.
    const suppressEventCard = isEventCardTool && message._id !== lastEventCardMessageId;
    const persistedTool =
      message.role === "assistant" &&
      message.latestToolCall &&
      !suppressEventCard &&
      !(isFindingGroupEvents && isEventCardTool)
        ? renderToolCallContent(
            message.latestToolCall,
            chatId,
            `${message._id}-${message.latestToolCall.toolCallId}`,
          )
        : null;

    // When an assistant message has a persisted tool result (e.g. displayEventCards)
    // but no actual text content, skip the empty bubble so the summary shown
    // inside the card doesn't appear twice.
    // Also suppress the bubble when the event card itself is suppressed (older query).
    const hasTextContent = Boolean(message.content?.trim());
    const showMessageBubble =
      message.role !== "assistant" ||
      hasTextContent ||
      (!persistedTool && !suppressEventCard);

    return (
      <Fragment key={message._id}>
        {needsDateDivider && (
          <DateDivider timestamp={message._creationTime} />
        )}
        {showMessageBubble && (
          <Message
            message={message}
            author={
              message.role === "assistant"
                ? undefined
                : memberLookup.get(message.userId)
            }
            isCurrentUser={currentUserId === message.userId}
          />
        )}
        {persistedTool}
      </Fragment>
    );
  });

  return (
    <>
      {formattedMessages}
      {visibleEventCardEntries.map((entry) => (
        <ChatEventCards
          key={entry.toolCall.toolCallId}
          payload={entry.payload}
          chatId={chatId}
        />
      ))}
      {isThinking && (
        <div className="px-4 py-3">
          <Loader variant="text-shimmer" size="sm" text="Thinking" />
        </div>
      )}
      {liveToolCalls.length > 0 && (
        <div className="px-4">
          {liveToolCalls
            .filter(
              (tc) =>
                !isHiddenInlineTool(tc) &&
                !hiddenToolCallIds.has(tc.toolCallId),
            )
            .map((tc) => (
              <Tool
                key={tc.toolCallId}
                toolPart={{
                  type: tc.toolName,
                  state: tc.state,
                  input: tc.args,
                  output: tc.result,
                  toolCallId: tc.toolCallId,
                }}
                defaultOpen={Boolean((tc.result as any)?.ics)}
              />
            ))}
        </div>
      )}
      {streamingContent && (
        <div className="flex items-start gap-3 px-4 py-3">
          <MessageAvatar
            src=""
            alt="Assistant"
            fallback="AI"
            className="shadow-sm"
          />
          <MessageContent
            markdown
            className="bg-transparent p-0 rounded-none prose prose-neutral prose-sm dark:prose-invert max-w-full sm:max-w-[80%]"
          >
            {streamingContent}
          </MessageContent>
        </div>
      )}
    </>
  );
};

export default MessageList;

function DateDivider({ timestamp }: { timestamp: number }) {
  const label = new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
