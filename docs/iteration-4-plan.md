# Iteration 4 Plan

**General Goal:** "Expansion, Coordination Controls, and Product Polish" (Week 12-13)

## Requirements & Acceptance Criteria

### Core Requirements

#### Requirement 1: Assistant Preferences Chat & Message Controls

Assignee: @Ram

**Description:** Add a dedicated AI assistant chat for user-specific preference and settings updates, and support retrospective editing and deletion of user messages.

- **Acceptance Criteria:**
  - [x] Users can open a separate assistant-only chat that is distinct from the shared group planning chat.
  - [x] The assistant can update persisted user preferences or settings from natural-language requests without posting those changes into the group chat.
  - [x] Users can edit and delete their own previously sent messages in supported chat surfaces.
  - [x] Message edits and deletions propagate to stored chat history and rendered UI state without broken ordering, duplicate messages, or stale content.

#### Requirement 2: My Availability Calendar & Cross-Group Scheduling Context

Assignee: @Ram

**Description:** Update right pane calendar to show accepted events from all of a user's groups, and helps them understand cross-group conflicts.

- **Acceptance Criteria:**
  - [x] Users can view a personal "My Availability" calendar that surfaces accepted events from all of their groups in a single aggregated view.
  - [x] Accepted events from other groups appear on the calendar with enough context to identify the event and source group.
  - [x] Accepted events from any group are treated as busy time when reviewing future availability.
  - [x] The calendar remains readable and responsive alongside existing scheduling and planning UI.

#### Requirement 3: Explore, Friend Activity, and User History

Assignee: @Nicholas

**Description:** Expand the product with lightweight discovery and profile surfaces so users can explore activities, see what connected friends are doing, and review their own planning history.

- **Acceptance Criteria:**
  - [ ] Users can browse an Explore page with discoverable activities or events outside of an active group chat.
  - [ ] Users can view lightweight in-product friend activity or recent plans for connected friends within the app's privacy boundaries.
  - [ ] Users can open a profile/history view that shows prior accepted events and relevant planning activity.

#### Requirement 4: RSVP, Attendance Changes, and Recurring Events

Assignee: @Dhanav

**Description:** Let groups track who is attending accepted plans, allow people to change their response later, and support recurring group activities.

- **Acceptance Criteria:**
  - [ ] Group members can RSVP to accepted events, and the UI shows current attendance state per member.
  - [ ] Users can change their RSVP or back out of an event after responding, and the updated attendance state is reflected for the group.
  - [ ] Recurring events can be configured with a repeat cadence and create future occurrences in the scheduling flow.
  - [ ] Recurring accepted events trigger the same calendar and notification flows as one-off accepted events.

#### Requirement 5: Location-Aware Discovery, Shortlisting, and Multi-Region Support

Assignee: @Rutva

**Description:** Make recommendations more location-aware by letting groups define where they are planning, shortlist candidates, and search beyond the current Baltimore-only experience.

- **Acceptance Criteria:**
  - [ ] A planning location can be captured during group creation or updated later and reused for future searches.
  - [ ] Recommendation retrieval and filtering respect the selected planning location.
  - [ ] Users can shortlist candidate events and filter or search recommendations by location.
  - [ ] Supported recommendation flows are no longer limited to Baltimore when valid location data is provided.

#### Requirement 6: Person-Specific Constraints & More Robust Ranking

Assignee: @Yusoo

**Description:** Improve recommendation quality by supporting person-specific hard restrictions and strong weights inside a group, while making ranking behavior more dependable.

- **Acceptance Criteria:**
  - [ ] Users can define person-specific hard restrictions and strong-weight preferences within a group context.
  - [ ] Hard restrictions block incompatible recommendations before final ranking.
  - [ ] Strong-weight preferences materially influence reranking without overriding explicit hard restrictions from other users.
  - [ ] Group history of accepted events can influence future recommendations as a soft signal in the ranking flow.

#### Requirement 7: Open-Ended Activities & Maps-Enriched Recommendations

Assignee: @Arijit

**Description:** Expand recommendations beyond ticketed events by supporting evergreen activities such as restaurants or climbing venues and enriching them with place data.

- **Acceptance Criteria:**
  - [x] The retrieval pipeline can surface non-ticketed activities such as dinners, restaurants, or rock-climbing venues alongside existing event sources.
  - [x] Open-ended activity results are normalized into the shared event schema with source attribution, place details, and direct links where available.
  - [x] Google Maps place data can enrich supported candidates with location context useful for ranking or display.

### Non-Functional Updates

#### NF1: Frontend Polish & Interaction Quality

Assignee: @Ram, @Rutva

**Description:** Tighten up planning interactions and visual consistency so the expanded product still feels reliable and polished.

- **Acceptance Criteria:**
  - [x] Right-panel resize and open/close interactions remain smooth and do not hide essential planning content.
  - [x] Invite or calendar-link actions appear consistently across both recommendation card variants.
  - [x] Assistant chat, shared chat, scheduling views, and planning panels pass UI QA across major desktop and mobile breakpoints.
  - [x] Visual polish changes preserve readability and do not regress existing planning workflows.

#### NF2: Recommendation Data Consistency & Evaluation

Assignee: @Yusoo

**Description:** Standardize event metadata across the system and add clearer measurement around ranking quality.

- **Acceptance Criteria:**
  - [ ] Event tags and category labels are standardized across ingestion, storage, ranking, and UI presentation.
  - [ ] Historical learning, deduplication, and ranking logic operate on the same normalized event vocabulary.

#### NF3: Reliability, Empty States, and End-to-End Testing

Assignee: @Arijit

**Description:** Improve first-load reliability and expand automated or repeatable validation for major user flows.

- **Acceptance Criteria:**
  - [x] A repeatable end-to-end testing framework exists for core flows, including group creation, recommendation rendering, and accepted-plan follow-through.
  - [x] Newly created groups show placeholder or loading states instead of stale cached events while first recommendations are being generated.
  - [x] Iteration 4 changes include regression coverage or documented manual verification for the affected flows.

## Coordination & Design Decisions

- **Assistant vs. Group Chat:** The assistant-only chat should be user-scoped and write through the same underlying preference/settings storage used by onboarding and profile flows, without leaking those edits into the shared group chat. (Handled by: @Ram, @Nicholas)
- **Message Revision Semantics:** Editing or deleting a message must update stored history and rendered chat state consistently; any downstream planning recomputation should be explicit rather than triggered by accidental stale state. (Handled by: @Ram)
- **Cross-Group Calendar Contract:** Accepted events from any group should feed a single personal availability view so the rest of the scheduling system can treat those commitments as busy time. (Handled by: @Ram, @Dhanav)
- **Social Surface Scope:** Explore, friend activity, and profile/history views should stay focused on planning context and lightweight social signals rather than becoming a full public social network. (Handled by: @Nicholas)
- **Location Model:** Group-level planning location should be captured in a shared field that can be reused by retrieval, shortlist/filter UI, and any future map integrations. (Handled by: @Rutva, @Arijit)
- **Constraint Precedence:** Person-specific hard restrictions should filter candidates before ranking; strong weights and accepted-history signals should operate later as softer ranking signals. (Handled by: @Yusoo, @Arijit)
- **Open-Ended Activity Schema:** Non-ticketed activities should normalize into the same shared event model as sourced events so ranking, shortlisting, cards, notifications, and calendar actions can reuse existing interfaces. (Handled by: @Arijit, @Yusoo)
- **Testing Focus:** E2E and UI validation should prioritize new-group empty states, message edit/delete flows, assistant preference updates, cross-group calendar rendering, and accepted-event attendance flows. (Handled by: @Arijit, @Ram, @Dhanav)

## Task Breakdown

- [x] Implement a separate assistant-only chat surface for editing user preferences and settings
  - Type: feature
  - Assignee(s): @Ram
  - Requirement Number: #1

- [x] Wire assistant chat actions to persisted preference and settings updates with user-scoped state handling
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #1

- [x] Add edit and delete controls for user-authored messages in supported chat views
  - Type: feature
  - Assignee(s): @Ram
  - Requirement Number: #1

- [x] Ensure retrospective message edits and deletions synchronize correctly with stored history and downstream UI state
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #1

- [x] Update calendar to show personal "My Availability" that aggregates accepted events across all groups
  - Type: feature
  - Assignee(s): @Ram
  - Requirement Number: #2

- [x] Surface cross-group event metadata in the personal calendar and treat accepted events as busy time in scheduling views
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #2

- [x] Normalize invite and calendar-link actions across both recommendation card variants
  - Type: bug
  - Assignee(s): @Ram
  - Requirement Number: #NF1

- [x] Perform UI QA and polish for assistant chat, message controls, and calendar or planning views across major breakpoints
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #NF1

- [x] Add regression coverage or documented test runs for Iteration 4 frontend flows, including new-group empty states
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #NF3

- [ ] Implement RSVP system for accepted events
  - Type: feature
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Design and persist attendance data model (event_id, user_id, RSVP status, timestamps)
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Build API endpoints to create, update, and fetch RSVP responses
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Ensure each user has a single RSVP state per event with overwrite support
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Enable users to update or withdraw their RSVP after responding
  - Type: feature
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Synchronize RSVP changes with UI state and attendance counts without stale or duplicate data
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Integrate RSVP state with calendar availability (accepted = busy, declined = free)
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Design and implement recurring event configuration (cadence, interval, end conditions)
  - Type: feature
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Generate future instances of recurring events within the scheduling system
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [ ] Ensure recurring events integrate with RSVP, notifications, and calendar flows
  - Type: task
  - Assignee(s): @Dhanav
  - Requirement Number: #4

- [x] Integrate open-ended activity retrieval (e.g., restaurants, climbing gyms, evergreen venues) into the recommendation pipeline
  - Type: feature
  - Assignee(s): @Arijit
  - Requirement Number: #7

- [x] Normalize non-ticketed activity results into the shared event schema with source attribution and direct links
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #7

- [x] Add Google Maps place-data enrichment for supported candidates (coordinates, address, place metadata)
  - Type: feature
  - Assignee(s): @Arijit
  - Requirement Number: #7

- [x] Wire maps-enriched fields into ranking/display inputs without breaking existing event-card contracts
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #7

- [x] Implement new-group first-load placeholder/loading behavior to prevent stale cached recommendation states
  - Type: bug
  - Assignee(s): @Arijit
  - Requirement Number: #NF3

- [ ] Expand repeatable E2E coverage for core flows: group creation, recommendation render, accepted-plan follow-through
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #NF3

- [x] Add regression verification for Iteration 4 recommendation changes (open-ended ingestion + maps enrichment)
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #NF3

- [x] Define shared group planning-location schema and API contract for retrieval, filtering, and future map integrations
  - Type: task
  - Assignee(s): @Rutva, @Arijit
  - Requirement Number: #5

- [ ] Add planning location capture during group creation
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Allow groups to update planning location after creation from the planning UI
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Update recommendation retrieval to respect the selected planning location
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Add shortlist actions for candidate events in the recommendation flow
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Add location-based filter and search controls to recommendation results
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Remove Baltimore-only assumptions when valid planning location data is provided
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [ ] Polish and QA shortlist and location interactions across desktop and mobile planning views
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #NF1

- [ ] Ensure hard-restriction filtering runs before ranking for maps/open-ended candidates
  - Type: task
  - Assignee(s): @Arijit, @Yusoo
  - Requirement Number: #6

- [ ] Users can define person-specific hard restrictions and strong-weight preferences within a group context
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number #6

- [ ] Strong-weight preferences materially influence reranking without overriding explicit hard restrictions from other users.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number #6

- [ ] Users can define person-specific hard restrictions and strong-weight preferences within a group context
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number #6

- [ ] Group history of accepted events can influence future recommendations as a soft signal in the ranking flow.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number #6
