# Iteration 4 Frontend Verification

This document tracks reusable regression coverage for the key Iteration 4 frontend paths and the manual checks still worth rerunning during QA.

## Automated Coverage

| Flow                           | Coverage                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New-group empty state          | `src/availability/components/__tests__/suggested-events.test.tsx` verifies a brand-new group stays on the empty placeholder until the user explicitly clicks `Find Events`.          |
| Assistant preference updates   | `src/messages/hooks/__tests__/use-chat.test.ts` verifies assistant-only chat requests stream without `@ai` and that saved appearance preference tool results are applied locally.    |
| Message edit and delete flows  | `src/messages/components/__tests__/message.test.tsx` verifies current users can save trimmed message edits and must confirm deletion before the delete mutation runs.                |
| Personal availability calendar | `src/availability/components/__tests__/availability-heatmap.test.tsx` verifies accepted plans from other groups render distinctly on `My Availability` with group and venue context. |

Run the targeted frontend checks with:

```bash
pnpm vitest run --project frontend \
  src/availability/components/__tests__/suggested-events.test.tsx \
  src/messages/hooks/__tests__/use-chat.test.ts \
  src/messages/components/__tests__/message.test.tsx \
  src/availability/components/__tests__/availability-heatmap.test.tsx
```

## Manual QA Checklist

### 1. New-group empty state

1. Create a brand-new group with no prior recommendations.
2. Open the right-panel `Suggested Events` section.
3. Confirm the panel shows the empty-state copy and does not reuse stale recommendations from another group.
4. Click `Find Events` and confirm the loading state appears before results render.

### 2. Assistant preference updates

1. Open the assistant-only chat.
2. Send a request that updates a user-scoped preference or setting, such as appearance or event preferences.
3. Confirm the update does not post into the shared group planning chat.
4. Refresh or reopen the affected surface and confirm the updated preference persists.

### 3. Message edit and delete

1. Send a user-authored message in a supported chat surface.
2. Edit the message, save it, and confirm the updated text appears in-place without duplicate entries or broken ordering.
3. Delete a different user-authored message and confirm the confirmation dialog appears before removal.
4. Confirm the deleted message disappears from the rendered history and does not reappear after reload.

### 4. Personal availability calendar

1. Ensure the current user has accepted events in more than one group.
2. Open `My Availability` from one group view.
3. Confirm accepted events from other groups appear on the calendar with identifiable source-group context.
4. Confirm those accepted events occupy busy time in the calendar view and remain readable alongside the rest of the scheduling UI.
