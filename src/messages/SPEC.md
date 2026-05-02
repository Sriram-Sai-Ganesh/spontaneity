# Messages

## Purpose

Enables real-time conversational interaction between the user and an AI assistant within a chat. Handles composing, sending, streaming, displaying, and managing messages so users can have fluid back-and-forth conversations with visible typing feedback.

## Scope

**Does:**

- Display messages in a scrollable, auto-stick-to-bottom chat view
- Distinguish user messages (right-aligned) from assistant messages (left-aligned)
- Render assistant responses as markdown with syntax-highlighted code blocks
- Stream assistant responses in real-time with a "Thinking" shimmer indicator
- Allow the user to abort a streaming response mid-generation
- Copy any message's text to clipboard
- Persist all messages to Convex database with server-side ownership guards
- Show an empty state with suggested prompts when a chat has no messages
- Auto-generate a chat title after the first assistant response in a "New Chat"
- Validate authentication before sending (anonymous auth)
- Track request IDs to prevent race conditions from overlapping streams
- Clean up abort controllers and pending state on component unmount
- Support tool calls and tool results during streaming (weather tools)
- Display optimistic user messages immediately with clientId reconciliation
- Handle crash recovery via server-side DB flush during streaming

**Does NOT:**

- Manage chat CRUD (creating, renaming, deleting chats) -- owned by `chats` feature
- Store or manage the API key -- server-side env variable, not a frontend concern
- Handle routing or navigation -- owned by Wouter routes in `App.tsx`
- Implement model switching (placeholder only)
- Implement message editing, regeneration, or feedback (placeholders only)
- Implement file attachments, voice input, or read-aloud (placeholders only)
- Cache messages locally for offline access (relies on Convex for persistence)

## Key Behaviors

1. When a user types a message and presses Enter, the message appears immediately as an optimistic user bubble (via clientId) and streaming begins
2. When a user presses Shift+Enter, a newline is inserted instead of sending
3. When a response is streaming, a stop button replaces the send button; clicking it aborts generation
4. When streaming starts before any content arrives, a "Thinking" shimmer loader is shown
5. When streaming content arrives, it renders incrementally as markdown
6. When streaming completes, the server saves the assistant message (isComplete: true); the client waits for the persisted version via Convex subscription before clearing streaming state (seamless handoff)
7. If authentication fails, an error toast is shown and no request is sent
8. If the chat title is still "New Chat" after the first assistant response, a title is auto-generated server-side from conversation context
9. When a user hovers over a message on desktop, action buttons fade in; on mobile they are always visible
10. When the message list is empty, four suggested prompts are shown; clicking one populates the input
11. When tool calls occur during streaming, they are displayed inline with their results (e.g., weather lookups)
12. User messages use optimistic insertion: local-first write via Legend-State, Convex mutation for persistence, reconciliation when the persisted version arrives (matched by clientId)

## Dependencies

- `chats` -- `useQueryChat` hook to display the chat title in the page header
- `src/messages/store/messages.ts` -- Legend-State merge layer (persisted + streaming + optimistic state)
- `src/lib/sse.ts` -- SSE consumer for streaming AI responses from Convex HTTP endpoint
- External: `convex/react` -- `useQuery`/`useMutation` for reactive data access
- External: `@convex-dev/auth/react` -- auth token for HTTP endpoint requests
- External: `@legendapp/state` + `@legendapp/state/react` -- streaming and optimistic state management
- External: `wouter` -- `useLocation` for back-navigation on mobile
- External: `sonner` -- toast notifications
- External: `lucide-react` -- icons
- External: `react-markdown` + `shiki` -- markdown rendering with syntax highlighting

## Known Gaps

- Model selector is a static placeholder; switching models has no effect
- Message editing, regeneration, feedback (thumbs up/down), read-aloud, file attachment, voice input, and chat export are all unimplemented placeholders
- Query hooks always return `loading: false` and `error: false` (synchronous reads from Legend-State)
- Partial responses preserved server-side via periodic DB flush, but client streaming state is lost on error (no optimistic rollback)
- Suggested prompts in the empty state are hardcoded
- No client-side message cache; chat switch disposes Legend-State data and re-fetches from Convex
- No conversation context window cap; all messages sent to AI provider
- System prompt is hardcoded as a weather assistant; not configurable
- Model selection is session-only; not persisted per chat
- SSE stream does not resume on reconnect; client falls back to DB-granularity updates

## Files

| File                             | Purpose                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `types/message.ts`               | Zod schemas and TypeScript types for messages                       |
| `types/tool-call.ts`             | TypeScript types for tool call and tool result parts                |
| `store/messages.ts`              | Legend-State merge layer (persisted + streaming + optimistic state) |
| `hooks/use-chat.ts`              | Core streaming logic, abort handling, auto-titling handoff          |
| `hooks/use-query-messages.ts`    | Query messages filtered by chat ID                                  |
| `hooks/use-query-message.ts`     | Query a single message by ID                                        |
| `hooks/use-mutation-messages.ts` | Create a new message                                                |
| `hooks/use-mutation-message.ts`  | Edit or delete a single message                                     |
| `components/message.tsx`         | Individual message bubble with action buttons                       |
| `components/message-input.tsx`   | Prompt input with attachment/voice/send/stop actions                |
| `components/message-list.tsx`    | Message list with empty state, streaming, and loader                |
| `pages/messages-page.tsx`        | Full page composing header, message list, and input                 |
