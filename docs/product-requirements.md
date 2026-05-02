# Product Requirement Document

## Overview

### Problem Statement

Coordinating a good outing for a group of friends is harder than it should be.
For students especially, it usually means digging through event listings, arguing over what sounds fun, and then trying to align the schedules of 6-10 busy people -- often through long text threads that end in confusion or a "good enough" plan.
Spontaneity is an AI-enabled event-planning assistant that removes the back-and-forth.
It (1) scrapes local events from reputed websites, (2) learns each person's event preferences and schedule availabilities, and (3) cross-references everyone's calendars to surface options the whole group can actually make. Then, Spontaneity proposes concrete plans that fit both shared interests and shared time.

### Proposed Solution

Spontaneity is an AI-powered social planning system that automatically analyses users preferences (event type, geographic location, event time) and agentically finds suitable activities to recommend.

Users create a friend group, connect their calendars, and enter preferences such as cuisines, hobbies, time, and budget. Spontaneity learns from this data and recommends social event preferences, such as previously visited favorites and ongoing local events.

The system identifies optimal meeting times and generates activity suggestions along with backup options, eliminating the hassle of finding something that everyone will enjoy, and at a suitable time. The solution integrates preferential learning and intelligent planning into one simple workflow, Spontaneity removes the stress of coordination and makes it easier for users to plan social activities together.

### Target Users

- Friend groups (of at least 2) who want to find activities and events to do in their area that satisfy everyone's preferences and constraints.
- JHU students are a good populace to test-run Spontaneity; we can scrape events from local website like the Baltimore Magazine or Eventbrite Baltimore

### AI Component

Spontaneity almost exclusively uses AI capabilities to interface with the user:

1. A user-facing agent allows users to enter preferences/constraints in natural language (category, budget, distance, "not too late" etc.) and translates these into search parameters
2. A re-ranker prioritizes events based on multiple parameters entered by the user, and returns results as a ranked list
3. An LLM asks clarifying questions when search parameters are too vague/return too many results
4. Extraction: OpenAI extracts structured data from emails and pasted job postings, including company names, job titles, application status (applied, OA, interview, rejected, offer), and deadlines.

Without AI, users would have to translate conversational preferences into filters/keywords by hand, and keep tweaking searches across multiple event sites, such as https://baltimore.org/events/, https://events.baltimoremagazine.com/, and https://www.eventbrite.com/d/md--baltimore/events/. This is especially difficult for a human event coordinator, who has to keep multiple users' constraints, schedules and preferences in mind. Spontaneity replaces all this manual work.

### Similar Existing Solutions

- Eventbrite.com: handles event hosting, ticketing, and discovery, but planning remains manual and fragmented across users. While events can be shared, there is no built-in intelligence for aligning calendars or ranking group preferences. Spontaneity shifts Eventbrite's static discovery model into an automated, AI-assisted group decision engine.
- AllEvents.com: focuses on discovering nearby events based on location and categories, but it does not analyze user calendars or group availability. Users browse events individually rather than planning collaboratively with schedule overlap in mind. Compared to Spontaneity, AllEvents lacks AI-driven coordination, preference ranking, and automated decision-making for groups.
- Feverup.com: curates and recommends events using personalization and popularity signals, but recommendations are still user-centric rather than group-aware. It does not integrate calendars or detect mutual free time across multiple participants. Spontaneity goes further by combining contextual AI recommendations with real-time schedule compatibility, which Fever does not address.
- Unation.com: blends local event discovery with community engagement, but planning still depends on users coordinating externally. It does not offer calendar syncing, availability comparison, or AI-driven recommendations based on group context. Spontaneity differentiates itself by actively solving the coordination problem rather than just surfacing events.

## Requirements

### Functional Requirements

#### Essential (Must-Have)

- Users can sign up and log in using their Google account, and create a friend group (minimum 2, maximum 10 members for MVP).
- Users can connect their Google Calendar via OAuth 2.0 (read-only scope by default).
- The system fetches each user's busy blocks for a specified date range (7, 14, or 30 days).
- Users can set availability preferences limited to: time-of-day bounds (start time, end time), weekdays and/or weekends.
- The system computes common available time windows across all group members for a given duration (60, 90, or 120 minutes).
- All recommended events fall fully within at least one computed shared time window.
- Users can specify event preferences and constraints in natural language (e.g., budget range, indoor/outdoor, cuisine type, maximum distance in miles, preferred days/times).
- The system parses natural language preferences into structured constraints (budget, category, distance, time-of-day, group size) for filtering and ranking.
- The system retrieves event listings from allowlisted sources for MVP. Current verified source:
  - Ticketmaster (working API verified)
- If multiple sources are used, the system deduplicates events based on title, venue, date/time, and location similarity.
- Users can view consistent event details including: title, venue name, full address, start time, end time (if available), price (or price range), category, source name, and direct URL.
- The system ranks candidate events using a transparent scoring function that considers:
  - Preference match score (budget, category, distance, time-of-day)
  - Group-wide compatibility
  - Historical group interactions (previously accepted or rejected categories)
- The system returns the top 3 ranked event options per request, plus up to 3 backup options if the top results are declined.
- Users can provide explicit feedback on recommendations using:
  - Accept / Reject / “More like this”
- The system generates short explanations (<75 words) per final recommendation, explicitly stating:
  - How it fits the group’s availability
  - How it matches budget and category preferences
  - Whether it differs from recently selected activities
- The system stores a group preference profile updated from feedback, including:
  - Weighted preferred categories
  - Budget range
  - Distance tolerance
  - Accepted category counts
  - Rejected category counts
- A shared group chat interface allows members to submit natural language requests. The system prioritizes the most recent group-level request and updates all members accordingly.
- The system can create a Google Calendar event (downloadable `.ics` file if access not granted).
- The system can generate a shareable invite link (who, when, where, link, notes) independent of any specific provider API.

#### AI-Specific Essentials

- NL-to-constraints parser (LLM into JSON Schema): GPT-4o-mini / GPT-4.1-mini parses chat into strict JSON (budget/category/distance/time window). JSON Schema validation + rule-based normalizers (units, times) with fallback to deterministic parsing on low confidence.
- Clarifying-question gate (LLM/heuristics): Same LLM asks 1–3 targeted questions only when required fields are missing or results are empty/too broad. Triggered by a coverage score + retrieval hit thresholds so it doesn’t pester users unnecessarily.
- Hybrid retrieval (BM25 + embeddings): Keyword filtering from constraints + vector search over event text using (potentially) VectorDB.
- Learning-to-rank re-ranker (LightGBM): LightGBM LambdaMART (or logistic regression) re-ranks using price fit, distance, category match, time fit, and group history. Updated online based on Accept/Reject/More-like-this feedback.
- Grounded explanations (template + constrained LLM): Deterministic templates cite availability overlap + budget/category/distance facts, always <75 words (optional SLM for polish).

#### Non-Essential (Nice-to-Have)

- Users can indicate person-specific preferences that act as blocking or strongly weighted constraints.
- Push/email notifications when new suitable events appear for an upcoming computed free slot.
- Map link for event results with distance and transit time estimates.
- Filters panel with quick toggles (budget, indoors, distance, category).
- Integration with non-Google calendars (e.g., Outlook, Apple Calendar).

#### Out of Scope (Won't Have)

- Automated ticket purchasing or reservations on behalf of users.
- Direct integration with deprecated, unsupported, or partner-gated event search APIs (for example, Eventbrite public event search or OpenTable without approved partner access).
- Scraping arbitrary websites without an explicit allowlist and ToS compliance.
- Full social network features (public profiles, feeds, messaging outside planning context).
- Native mobile applications (web-only MVP).

### Non-Functional Requirements

#### Performance

- Calendar availability computation completes within 10 seconds for up to 10 users over a 14-day window.
- Event retrieval, deduplication, ranking, and explanation generation complete within:
  - 5 seconds for 3 returned results
  - 8 seconds for up to 6 total results (including backups)
- Main dashboard loads within 2 seconds on broadband and within 5 seconds on mobile networks.

#### Security

- Users authenticate via Google OAuth 2.0.
- OAuth tokens are encrypted at rest and never exposed to the client.
- Least-privilege scopes are used by default (read-only calendar scope for MVP; write scope only when explicitly granted).
- Server-side rate limiting and abuse protections exist for event-source queries and AI endpoints.

#### Privacy

- The system stores only derived busy blocks or availability windows, not full personal calendar event details.
- Users can disconnect Google Calendar and delete their account and all associated group/preference data.
- The AI provider used (OpenAI API) does not use API-submitted data for model training, per OpenAI’s API data usage policy.

#### Usability

- New users can connect Google Calendar and receive event recommendations within 5 minutes of account creation.
- The system provides clear explanations for both time-slot feasibility and event ranking logic.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Wouter, Legend-State, Tailwind CSS, shadcn/ui
- **Backend:** Hono, TypeScript
- **Database:** Convex
- **Auth:** @convex-dev/auth (Google OAuth 2.0)
- **External APIs:**
  - Google Calendar API (FreeBusy)
  - Ticketmaster (working API verified)
- **AI Services:** Vercel AI SDK, @openrouter/ai-sdk-provider, prompt-kit
- **Testing:** Vitest (unit), Playwright (E2E)

## Product Roadmap

<!-- For each iteration, define a goal and split features into must-have vs nice-to-have. -->

### Iteration 1

**Dates:** Week 6-7

**Goal:** Event scraping, OAuth, AI foundation

**Must-Have Features:**

- Google OAuth login & `freebusy` calendar API access
- Automated event scraping (EventBrite, VisitBaltimore, within ToS) and normalization
- Natural language -> user preferences and constraints
- Multi-feature event/location ranking (based on user preferences, budget, location, time)
- Downloadable final event recommendations (.ics event files)

  **Nice-to-Have Features:**

- "Event detail" expanded view for candidate events on the webpage
- Working calendar view on the frontend

### Iteration 2

**Dates:** Week 7–8  
**Goal:** User-Model Interaction Setup

**Must-have features**

- Must provide AI-generated summaries, top-3 recommendations
- Must accept user feedback (cancel event, suggest other place/type of event) to regenerate content in point above
- Improve recommendation engine to include feedback from Iteration 1 to provide more precise recommendations, accounting for factors like current recommendation accuracy, user preference alignment and any other failures we account during Iteration 1 to complete the AI-aspect of the project

**Nice-to-have features**

- Get started on UI (setup more polished interaction setup between users and AI to accept/reject event recommendations that we would want to present in the final demo)

### Iteration 3

**Dates:** Week 9-10  
**Goal:** Hybrid Retrieval + Reranking

**Must-have features**

- Implement hybrid search to match events against group constraints
- Deploy an event re-ranker that learns from user feedback (Accept/Reject)
- Generate short AI explanations detailing why each event fits the group
- Finalize end-to-end testing and meet search latency targets

**Nice-to-have features**

- Add quick-toggle UI filters (budget, distance, category)
- Include map links for event locations

### Iteration 4

**Dates:** Week 12–13  
**Goal:** Expansion and polish

**Must-have features**

- The system can generate a shareable invite link.
- Person-specific constraints (blocking/strong weights) within group
- System deduplicates events based on title, venue, date/time similarities
- Shared group chat interface allows members to send natural language requests and system prioritizes most recent requests.
- System stores group preference profile updated from feedback.

**Nice-to-have features**

- Push/email notifications for upcoming free slot + matching events
- Non-Google calendar integrations (Outlook/Apple)
