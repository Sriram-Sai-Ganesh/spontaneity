# Iteration 2 Plan

**General Goal:** “User-Model Interaction Setup” (Week 7–8)

## Requirements & Acceptance Criteria

### Requirement 1: Recommendation Delivery & Summaries
Assignee: Ram

**Description:** Return the top 3 event recommendations and AI-generated summaries that explain fit.

- **Acceptance Criteria:**
  - [x] System returns (if available) 3 primary recommendations per request.
  - [x] Each recommendation includes a <75-word AI-generated summary that cites availability, budget/category match, and source link.
  - [x] Summaries and events are filtered to windows that fit the group’s computed availability.


### Requirement 2: Feedback Capture & Interaction
Assignee: Dhanav

**Description**
Enable users to provide structured feedback (accept, reject, cancel, more-like-this) on recommendations, and trigger appropriate system responses.

**Acceptance Criteria:**
- [x] UI and API record:accept, reject, cancel, more-like-this for each recommendation
- [x] Feedback is stored with: recommendation ID, user/group context,timestamp
- [x] Submitting feedback triggers:
 either regenerated recommendations or clarifying questions if constraints are insufficient
- [x] Feedback events are reflected in the chat/response stream

### Requirement 3: Feedback-Driven Ranking & Personalization
Assignee: Rutva

**Description:**
Use captured feedback signals to refine the ranking engine and personalize future recommendations across sessions.

**Acceptance Criteria:**
- [x] Ranking model updates weights using: accept/reject signals, category preferences, distance/budget fit
- [x] System maintains a persistent group preference profile
- [x] Stored preferences influence: future ranking, recommendation summaries
- [x] System tracks and surfaces: accept rate, fallback usage
- [x] Regenerated recommendations: reflect updated ranking logic, include updated summaries and timestamps


### Requirement 4: Account setup - configure preferences
Assignee: Nicholas

**Description:** Provide users with an account where they can set a global list of preferences that is applied to all groupchats.

- **Acceptance Criteria:**
- [x] user profiles with preset preferences
- [x] users can navigate to an account/profile window where they can add preferences
- [x] upon signing up you are asked to choose from a list of preferences (allergies, cuisine, activity type)


### Requirement 5: Heatmap Calendar & Event Cards
Assignee: Arijit

**Description:** Display shared availability windows in a when2meet-style heatmap calendar viewport, with recommendation cards showing key event details and inline feedback controls below.

- **Acceptance Criteria:**
  - [x] Calendar viewport displays shared availability windows (when2meet-style heatmap).
  - [x] Recommendation cards show key fields (title, venue, time, price, source) with inline feedback controls.
  - [x] Loading/empty/error states are defined for recommendation fetch and regeneration flows.


### Requirement 6: event tags 
Assignee: Yusoo

**Description:** Update event data to include tags for easier search and rank retrieval for events. 

- **Acceptance Criteria:**
  - [X] New Convex Table for event data created
  - [X] Each event has at least one tag related to possible user preferences.
  - [X] LLM can utilize the tools for ranking


### Requirement 7: Scheduling Outputs Completion (Carryover)
Assignee: Ram

**Description:** Finish invite/export flows from Iteration 1 so accepted recommendations produce reliable shareable links and `.ics` files.

- **Acceptance Criteria:**
  - [x] Shareable invite link/page includes who/when/where/URL/notes and persists in Convex.
  - [x] Downloadable `.ics` file is generated with correct timezone and updates when recommendations are regenerated and accepted.
  - [x] Chat/UI surface shows the invite link and `.ics` for any accepted recommendation.


### Requirement 8: Quality & Guardrails (Carryover)
Assignee: Everyone

**Description:** Shore up reliability gaps from Iteration 1 with tests, rate limits, and source integrity checks.

- **Acceptance Criteria:**
  - [x] Contract tests pass for Ticketmaster normalization plus mocked FreeBusy responses in CI. Eventbrite integration is not implemented.
  - [x] Rate limiting is enforced on event search and AI endpoints with configurable thresholds.
  - [x] Displayed events always include required source fields (title, venue, address, time, source URL); no fabricated entries render.
  - [x] Smoke tests cover recommendation → feedback → invite link flow.
  - [x] Responsibility shared across team members to ensure quality and guardrails are in place before iteration end.


## Coordination & Design Decisions

- **LLM & Summaries:** Use the existing Vercel AI SDK pipeline; add a constrained template for <75-word summaries referencing availability and preference matches. (Handled by: @Arijit, @Yusoo)
- **Feedback Schema:** Extend the shared event schema with feedback state and timestamps; store in Convex alongside group preference profile. (Handled by: @Dhanav, @Rutva)
- **Ranking Updates:** Reuse the baseline scorer; add feedback-derived weights and simple accuracy logging. Regeneration reuses retrieval + ranking pipeline. (Handled by: @Arijit, @Dhanav)
- **Frontend Interaction:** Chat remains the primary surface; recommendation cards with inline feedback buttons and regenerated responses appear in stream order. (Handled by: @Ram, @Nicholas)
- **Dependencies:** Feedback capture feeds preference profile → ranking weights → regenerated recommendations. Summaries depend on ranked results. UI polish is optional but should not block must-haves.

## Task Breakdown

- [x] Task: Implement composite group preference profile  
  - Type: feature  
  - Assignee(s): @Nicholas  
  - Requirement Number: #2  

- [x] Task: Allow negative preferences and integrate into current ranking system  
  - Type: feature  
  - Assignee(s): @Nicholas  
  - Requirement Number: #2

- [x] Task: Prompt user for preferences upon sign-up or initial login  
  - Type: feature  
  - Assignee(s): @Nicholas  
  - Requirement Number: #2

- [x] Task: Implement feedback handler to process accept/reject/cancel/more-like-this actions  
  - Type: feature  
  - Assignee(s): @Dhanav  
  - Requirement Number: #2  

- [x] Task: Implement regeneration decision logic (regenerate vs ask clarifying questions)  
  - Type: feature  
  - Assignee(s): @Dhanav  
  - Requirement Number: #2  

- [x] Task: Implement inline regeneration flow (re-run search + ranking on feedback submission)  
  - Type: feature  
  - Assignee(s): @Dhanav
  - Requirement Number: #2  

- [x] Task: Ensure regenerated results are injected into chat/response stream with proper state handling  
  - Type: task  
  - Assignee(s): @Dhanav
  - Requirement Number: #2
     
- [x] Task: Integrate feedback signals into ranking pipeline (accept/reject/category/distance/budget)  
  - Type: feature  
  - Assignee(s): @Rutva
  - Requirement Number: #3  

- [x] Task: Implement logic to update ranking weights based on feedback signals  
  - Type: feature  
  - Assignee(s): @Rutva
  - Requirement Number: #3   

- [x] Task: Integrate persistent group preference profile into ranking computation  
  - Type: feature  
  - Assignee(s):@Rutva
  - Requirement Number: #3  

- [x] Task: Ensure recommendation summaries reflect learned preferences (personalization layer)  
  - Type: task  
  - Assignee(s): @Rutva
  - Requirement Number: #3  

- [x] Task: Ensure regenerated recommendations use updated ranking logic and include timestamps  
  - Type: task  
  - Assignee(s): @Rutva
  - Requirement Number: #3  

- [X] Task: Add tags to event data.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number: #6

- [X] Task: Create Convex Table for event data.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number: #6

- [x] Task: Implement constrained summary generator (<75 words) for top-3 results  
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #1

- [x] Surface event recommendation results inline in groupchat.  
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #7

- [x] Log accuracy of recommendations and feedback signals for future analysis.
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #3

- [X] Event tags -- the first time we see an event, we should tag it with a fine-grained categories (budget, category, location, age) & cache these on Covex.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number: #6

- [x] On first login -- survey users for hard restrictions (e.g. no events after 10pm, max distance, budget cap) and store these in the group profile to inform initial recommendations before feedback is available.
  - Type: task
  - Assignee(s): @Nicholas
  - Requirement Number: #4

- [x] Harden `.ics` generator with timezone support, hook to accepted recommendation flow.
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #7

- [x] Switch backend build from Convex's `dev` to GitHub Actions on the `master` branch.
  - Type: task
  - Assignee(s): @Ram, @Dhanav
  - Requirement Number: #6

- [x] UI for calendar viewport -- display shared availability windows in the UI (when2meet style heatmap?)
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #6
