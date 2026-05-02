# Chats (Groups UI)

## Purpose

Lets users manage multiple groups (each with a shared conversation) so they can organize planning contexts, revisit past discussions, and start fresh threads without losing history. Serves as the primary navigation surface for the application. The UI is presented as a "group chat" interface: the sidebar lists groups rather than individual chats.

## Scope

**Does:**

- Create new groups with a default "New Group" title (stored as a chat in Convex)
- List all groups in a sidebar grouped by date (Today, Yesterday, Previous 7 days, Older)
- Filter groups by title with case-insensitive search
- Toggle sort order between newest-first and oldest-first
- Edit group titles manually via a dialog
- Suggest AI-generated titles from conversation history (server-side Convex action, requires at least one message)
- Delete groups with a confirmation dialog, cascading to remove all associated messages (server-side atomic delete)
- Navigate to a group's message view on selection
- Highlight the currently active group in the sidebar
- Show relative timestamps (just now, 2m ago, 3h ago, 2d ago, then short date)
- Display contextual empty states for no groups and no search results
- Persist all chat data to Convex database with server-side ownership guards
- Close the sidebar on mobile after group selection

**Does NOT:**

- Store or display message content (owned by `messages` feature)
- Handle message sending, streaming, or AI responses
- Manage API keys or settings (owned by `settings` feature)
- Provide sidebar layout or toggle behavior (owned by `layout` feature)
- Cache chat data locally for offline access
- Paginate the chat list

## Key Behaviors

1. When user clicks "New Group", a group (chat) titled "New Group" is created and the app navigates to its message view
2. When user searches, the group list filters to titles containing the query (case-insensitive substring match)
3. When user toggles sort order, groups re-sort by creation time in the selected direction
4. When user clicks a group, the app navigates to `/groups/:id` and the sidebar closes on mobile
5. When user edits a group title, the title trims whitespace and rejects empty strings
6. When user clicks "Suggest Title" in the edit dialog, the server generates a title via a Convex action using the chat's messages
7. The "Suggest Title" button is disabled when the group has no messages
8. When user confirms group deletion, the group (chat) and all its messages are removed atomically server-side and a success toast appears
9. If the deleted group was the active group, the app navigates to the home route
10. When Convex queries fail, hooks return error state and components display appropriate feedback

## Dependencies

- `layout` -- `useSidebar` for closing the sidebar on mobile navigation
- External: `convex/react` -- `useQuery`/`useMutation` for reactive data access
- External: `wouter` -- `useLocation` for navigation between routes
- External: `sonner` -- toast notifications for mutation feedback
- External: `lucide-react` -- icons (MessageSquare, Pencil, Trash2, PlusCircle, ArrowDownUp, Sparkles)

## Known Gaps

- No pagination; all chats load at once, which may degrade performance at scale
- Search only matches titles, not message content
- Delete is permanent with no undo, soft-delete, or trash
- No bulk operations (select multiple, delete all, export)
- No archive or pin functionality
- Query hooks use `as ChatType` casts instead of runtime validation on read
- No client-side cache; switching chats requires a network round-trip to Convex
- No conversation context window cap; all messages sent to AI provider
- System prompt is hardcoded; not configurable per chat
- Model selection is session-only; not persisted per chat

## Files

| File                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `types/chat.ts`                     | Zod schemas and TypeScript types for chat entity  |
| `hooks/use-query-chats.ts`          | Read hook for all chats                           |
| `hooks/use-query-chat.ts`           | Read hook for a single chat by ID                 |
| `hooks/use-mutation-chats.ts`       | Write hook for creating chats                     |
| `hooks/use-mutation-chat.ts`        | Write hook for editing and deleting a single chat |
| `pages/list-chats-page.tsx`         | Chat list page with search, sort, and new chat    |
| `components/chat-list.tsx`          | Grouped chat list with date sections and actions  |
| `components/add-chat-dialog.tsx`    | Dialog for creating a new chat                    |
| `components/edit-chat-dialog.tsx`   | Dialog for renaming with AI title suggestion      |
| `components/delete-chat-dialog.tsx` | Confirmation dialog for chat deletion             |
