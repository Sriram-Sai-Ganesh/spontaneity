# Iteration 1 Plan

**General Goal:** “Walking skeleton” MVP for every component (each usable in <5 minutes)

## Requirements & Acceptance Criteria

### Requirement 1: Identity & Groups

**Description:** Google OAuth login, group creation (2–10 members) with invite links, and a basic group dashboard.

- **Acceptance Criteria:**
  - [x] User can log in via Google OAuth.
  - [x] User can create a group and generate an invite link.
  - [x] Group supports 2–10 members.
  - [ ] Group dashboard displays members and their connected status.

### Requirement 2: Calendar Availability

**Description:** Google Calendar integration to fetch FreeBusy blocks, set availability preferences, and compute shared windows.

- **Acceptance Criteria:**
  - [x] User can connect Google Calendar via OAuth 2.0 (read-only).
  - [x] System fetches FreeBusy blocks for 7, 14, or 30 days.
  - [x] User can set availability preferences (start/end time, weekdays/weekends).
  - [x] System computes shared windows for 60, 90, or 120 minutes.
  - [x] System stores only derived busy/availability windows.

### Requirement 3: Event Retrieval

**Description:** Ticketmaster API integration, event normalization, and filtering based on shared availability windows.

- **Acceptance Criteria:**
  - [x] System integrates with Ticketmaster API.
  - [x] Event details are normalized into a consistent schema.
  - [x] Events are filtered to those fully inside at least one shared window.

### Requirement 4: Chat + AI Parsing

**Description:** Shared group chat interface and LLM-based parsing of natural language into structured JSON constraints.

- **Acceptance Criteria:**
  - [x] Users can interact in a shared group chat (most recent request is canonical).
  - [x] LLM parses natural language into structured JSON (budget, category, distance, time-of-day, group size).
  - [x] System performs minimal schema validation and unit/time normalization.

### Requirement 5: Ranking + Feedback

**Description:** Baseline scorer to rank events, returning the top 3 results, and storing accept/reject feedback.

- **Acceptance Criteria:**
  - [ ] System scores events using a weighted sum (category, time, budget, distance).
  - [x] System returns the top 3 results.
  - [ ] Users can accept or reject results, and feedback is stored in group history.

### Requirement 6: Scheduling Outputs

**Description:** Generation of shareable invite links and downloadable `.ics` files for selected events.

- **Acceptance Criteria:**
  - [x] System generates a shareable invite page/link with event details (who, when, where, URL, notes).
  - [x] System provides a downloadable `.ics` file for the selected event.

### Requirement 7: Quality

**Description:** Contract tests, rate limiting, and guardrails to prevent fabricated events.

- **Acceptance Criteria:**
  - [x] Contract tests are implemented for Ticketmaster and mocked Calendar FreeBusy.
  - [x] Basic rate limiting is applied to event search and AI endpoints.
  - [ ] System enforces "no fabrication" by requiring source fields for display.

## Coordination & Design Decisions

- **Architecture Choices:** Next.js UI for frontend components (chat, results, feedback); Postgres + APIs for backend data model and auth. (Handled by: @Ram, @Nicholas)
- **API Contracts:** Ticketmaster API for event ingestion; Google Calendar API for FreeBusy data. (Handled by: @Rutva, @Dhanav, @Nicholas, @Ram)
- **Shared Interfaces:** Normalized event schema (title, venue, address, time, price, category, source, URL) and structured JSON schema for AI constraints. (Handled by: @Rutva, @Dhanav, @Yusoo, @Arijit)
- **Dependencies:** Event Retrieval depends on Calendar Availability for shared windows. Ranking depends on Event Retrieval and AI Parsing. (Handled by: @Rutva, @Dhanav, @Nicholas, @Ram, @Arijit, @Yusoo)
- **Data Privacy:** Store only derived busy/availability windows, not raw calendar data. (Handled by: @Nicholas, @Ram)

## Task Breakdown

- [x] Task: Implement Google OAuth login
  - Type: feature
  - Assignee(s): @Ram, @Nicholas
  - Requirement Number: #1
- [x] Task: Create group and invite link flow
  - Type: feature
  - Assignee(s): @Ram, @Nicholas
  - Requirement Number: #1
- [x] Task: Build basic group dashboard
  - Type: feature
  - Assignee(s): @Ram, @Nicholas
  - Requirement Number: #1
- [x] Task: Integrate Google Calendar OAuth (read-only)
  - Type: feature
  - Assignee(s): @Nicholas, @Ram
  - Requirement Number: #2
- [x] Task: Fetch FreeBusy blocks and compute shared windows
  - Type: feature
  - Assignee(s): @Nicholas, @Ram
  - Requirement Number: #2
- [x] Task: Integrate Ticketmaster API and normalize schema
  - Type: feature
  - Assignee(s): @Rutva, @Dhanav
  - Requirement Number: #3
- [x] Task: Filter events by shared availability windows
  - Type: feature
  - Assignee(s): @Rutva, @Dhanav
  - Requirement Number: #3
- [x] Task: Implement shared group chat interface
  - Type: feature
  - Assignee(s): @Yusoo, @Arijit
  - Requirement Number: #4
- [x] Task: Build NL to JSON constraints parser using LLM
  - Type: feature
  - Assignee(s): @Yusoo, @Arijit
  - Requirement Number: #4
- [x] Task: Implement baseline scorer and return top 3 results
  - Type: feature
  - Assignee(s): @Arijit, @Yusoo
  - Requirement Number: #5
- [x] Task: Build accept/reject feedback storage
  - Type: feature
  - Assignee(s): @Arijit, @Yusoo
  - Requirement Number: #5
- [x] Task: Generate shareable invite link and .ics download
  - Type: feature
  - Assignee(s): @Ram, @Dhanav
  - Requirement Number: #6
- [x] Task: Write contract tests for Ticketmaster and Calendar
  - Type: task
  - Assignee(s): @Dhanav, @Rutva
  - Requirement Number: #7
- [x] Task: Implement rate limiting and guardrails
  - Type: task
  - Assignee(s): @Dhanav, @Rutva
  - Requirement Number: #7
