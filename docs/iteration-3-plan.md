# Iteration 3 Plan

**General Goal:** "Personalization, Custom Events, and Collaboration Polish" (Week 9-10)

## Requirements & Acceptance Criteria

### Core Requirements

#### Requirement 1: Custom Events & AI Event Creation
Assignee: @Yusoo

**Description:** Allow groups to create their own events, including AI-assisted event creation from natural language, while keeping custom events private to the group that created them.

- **Acceptance Criteria:**
  - [x] Users can create a custom event that is visible only to members of the group that created it.
  - [x] Custom events use the shared event schema and tagging system so they can be displayed and ranked consistently with sourced events.
  - [x] Users can create a custom event from natural language input, and the system extracts at least the event title/activity, time, location, and category before saving.
  - [x] Only the creator of a custom event can delete it, and deletion removes the event for all members of that group.

#### Requirement 2: Personalized UI Theming
Assignee: @Ram

**Description:** Let users personalize the look and feel of the app with theme settings such as background colors and fonts.

- **Acceptance Criteria:**
  - [x] Users can choose from supported background/theme options and font presets in the UI.
  - [x] Theme preferences are saved per user and restored on subsequent visits.
  - [x] Theme changes apply consistently across the major planning surfaces without breaking readability or responsiveness.

#### Requirement 3: Right Pane Visualization Improvements
Assignee: @Ram

**Description:** Improve the right pane so it acts as a clearer planning dashboard for recommendations, decisions, and supporting event context.

- **Acceptance Criteria:**
  - [x] The right pane displays structured information for the current planning state, including selected recommendation details and decision status.
  - [x] The right pane updates when recommendations, feedback, or group decision state changes.
  - [x] The right pane remains readable and responsive alongside the shared chat interface.
  - [x] The right pane displays status when the group formally accepts an event.

#### Requirement 4: Email Notifications & Opt-Out Settings
Assignee: @Dhanav

**Description:** Notify users by email about important planning events while giving them control over whether they receive those messages.

- **Acceptance Criteria:**
  - [X] The system can send email notifications for upcoming events, new recommendations, and group-agreed plans.
  - [X] Users can opt out of email notifications from settings, and opt-out preferences are honored before messages are sent.
  - [X] Notifications include enough context to identify the relevant group and link users back to the associated plan or recommendation.

#### Requirement 5: Event Voting, Acceptance & iCal Integration
Assignee: @Rutva

**Description:** Enable users to vote on and formally accept recommended events, propagate accepted events to the calendar heatmap with notifications, and allow users to download `.ics` files to add events to their personal calendars.

- **Acceptance Criteria:**
  - [x] Users can vote on recommended events and the UI shows current vote tallies per event.
  - [x] An event can be formally accepted once voting criteria are met, and the accepted state is persisted and shown to the group.
  - [x] Once an event is accepted, the calendar heatmap updates to reflect the scheduled event alongside shared availability windows.
  - [x] Group members are notified when an event is accepted.
  - [x] Event cards expose a download `.ics` action that generates a valid iCalendar file users can import into their personal calendars.

#### Requirement 6: Expanded External Data Sources
Assignee: @Arijit

**Description:** Expand the recommendation pipeline to support more external sources so users can discover a broader range of events and activities.

**Scope Note:** Eventbrite public event search is descoped for Iteration 3 because the public API is deprecated and not feasible to rely on for this project (#173). OpenTable is also descoped because its API requires approved partner access, which is not feasible for this project.

- **Acceptance Criteria:**
  - [x] The system integrates Yelp into the retrieval pipeline.
  - [x] Results from all supported sources are normalized into the shared event schema with source attribution and direct links.
  - [x] Mixed-source results can be deduplicated and ranked together in the existing recommendation flow.

#### Requirement 7: Group Pulse & Passive Preference Learning
Assignee: @Nicholas

**Description:** Improve the group pulse experience by summarizing current preferences and learning lightweight signals from the conversation itself.

- **Acceptance Criteria:**
  - [ ] The system generates an AI summary of recent event choices and the group's current vibe/preferences.
  - [ ] The system can derive passive preference signals from chat messages and store them separately from explicit feedback.
  - [ ] Group pulse summaries and passive signals can influence future recommendations as soft preferences without overriding explicit constraints.

### Non-Functional Updates

#### NF1: Frontend Polish & Interaction Reliability
Assignee: @Rutva, @Ram

**Description:** Clean up distracting UI elements and ensure planning actions render reliably on the frontend.

- **Acceptance Criteria:**
  - [x] Unused chat controls such as attachment and voice-message buttons are removed from the shared chat UI.
  - [x] Event cards expose a working `.ics` action in the frontend.
  - [x] Tool-call messages persist and rehydrate correctly on the frontend after refresh or navigation.

#### NF2: Event Data Quality & Ranking Consistency
Assignee: @Yusoo, @Dhanav, @Arijit

**Description:** Improve event quality across the system by making tags more consistent, deduplicating overlapping items, and fixing ranking/order issues.

- **Acceptance Criteria:**
  - [ ] Event tags are standardized and connected to user preferences across storage, retrieval, and ranking.
  - [ ] Duplicate events from overlapping sources are removed before they reach the final recommendation UI.
  - [X] Reranking and suggested-event ordering reflect the latest ranking logic and feedback positivity.

#### NF3: Cost & Query Efficiency
Assignee: @Ram

**Description:** Reduce unnecessary Convex usage and redundant data fetching so the app is cheaper to run without breaking shared state correctness. (note: pushed to iteration 4; see #188 for details.)

- **Acceptance Criteria:**
  - [ ] Main planning flows reduce redundant Convex reads and writes through query consolidation, caching, batching, or equivalent improvements.
  - [ ] Chat, recommendation, and right-pane flows avoid repeated fetches when the underlying state has not changed.
  - [ ] Efficiency improvements preserve correctness for shared planning state and live updates.

## Coordination & Design Decisions

- **Shared Event Model:** External events and custom events should converge on one normalized schema with source metadata, creator/group ownership, schedule fields, and tag fields so ranking and display logic can reuse the same interfaces. (Handled by: @Yusoo, @Arijit)
- **Custom Event Permissions:** Group scoping and creator-only deletion should be enforced server-side, not just in the UI, so custom events remain private and secure. (Handled by: @Yusoo, @Dhanav)
- **AI Event Extraction:** Natural-language custom event creation should reuse the existing structured extraction approach and validate required fields before persistence. (Handled by: @Yusoo)
- **Right Pane Contract:** The right pane should consume a unified planning-state payload that includes recommendation details, agreement status, and supporting context so UI work can stay decoupled from chat rendering. (Handled by: @Ram, @Rutva)
- **Notification Pipeline:** Email notifications should be triggered from recommendation creation, upcoming accepted plans, and agreement events, with opt-out settings checked before enqueueing or sending any email. (Handled by: @Dhanav)
- **Source Expansion & Deduplication:** The Yelp adapter should normalize into the existing event schema, and deduplication should run before ranking so mixed-source results do not double-count similar options. Eventbrite is explicitly descoped because its public search API is deprecated, and OpenTable is descoped because it requires partner access. (Handled by: @Arijit, @Yusoo)
- **Group Pulse Signals:** Explicit feedback remains the strongest signal; passive preferences inferred from chat should be stored as softer weights and summarized in the group pulse rather than treated as hard constraints. (Handled by: @Nicholas, @Dhanav)

## Task Breakdown

- [x] Remove unused attachment and voice-message controls from the shared chat UI
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #NF1

- [x] Implement persisted theme settings for background colors and font presets
  - Type: feature
  - Assignee(s): @Ram
  - Requirement Number: #2

- [x] Apply user-selected theme tokens consistently across chat, right pane, and key planning views
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #2

- [x] Redesign the right pane to surface recommendation details, planning context, and decision state
  - Type: feature
  - Assignee(s): @Ram
  - Requirement Number: #3

- [x] Wire right-pane state updates to recommendation, feedback, and agreement-state changes
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #3

- [x] Refactor message persistence so tool calls survive reload and render correctly on the frontend (#144)
  - Type: bug
  - Assignee(s): @Ram
  - Requirement Number: #NF1

- [x] Optimize Convex query patterns for chat, recommendation, and right-pane flows (note: closed with comment; see #185 for details)
  - Type: task
  - Assignee(s): @Ram
  - Requirement Number: #NF3

- [x] Task: Add more metrics to group pulse
  - Type: task
  - Assignee(s): @Nicholas
  - Requirement Number: #7

- [ ] Task: Implement AI preference learning from chat messages 
  - Type: task
  - Assignee(s): @Nicholas
  - Requirement Number: #7

- [x] Task: Summarize group preferences and sentiment with AI and add to group pulse
  - Type: task
  - Assignee(s): @Nicholas
  - Requirement Number: #7

- [x] Task: Add dedicated profile page for changing user settings
  - Type: feature
  - Assignee(s): @Nicholas
  - Requirement Number: #NF

- [x] Task: Implement event voting UI and backend logic for recommended events
  - Type: feature
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [x] Task: Add poll resolution flow for accepted and no-consensus outcomes
  - Type: feature
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [x] Task: Update calendar heatmap to display accepted/scheduled events
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [x] Task: Notify group members when an event is accepted
  - Type: task
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [x] Task: Add .ics file download action to event cards
  - Type: feature
  - Assignee(s): @Rutva
  - Requirement Number: #5

- [x] Close Eventbrite adapter scope because the public search API is deprecated and not feasible (#173)
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #6

- [x] Close OpenTable adapter scope because the API requires partner access and is not feasible for this project
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #6

- [ ] Implement Yelp API adapter and normalize results into the shared event schema
  - Type: feature
  - Assignee(s): @Arijit
  - Requirement Number: #6

- [ ] Integrate the Yelp adapter into the retrieval pipeline with source attribution and direct links
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #6

- [ ] Fix reranking logic so recommendations reorder correctly based on feedback positivity (#156)
  - Type: bug
  - Assignee(s): @Arijit
  - Requirement Number: #NF2

- [ ] Implement cross-source deduplication before ranking for mixed-source results
  - Type: task
  - Assignee(s): @Arijit
  - Requirement Number: #NF2

- [X] Implement email notification system with opt-out support  
  - Type: feature  
  - Assignee(s): @Dhanav  
  - Requirement Number: #4  

- [X] Send notifications for upcoming events, new recommendations, and accepted plans with context and links  
  - Type: task  
  - Assignee(s): @Dhanav  
  - Requirement Number: #4  

- [X] Implement and enforce user opt-out preferences for email notifications  
  - Type: task  
  - Assignee(s): @Dhanav  
  - Requirement Number: #4  

- [X] Trigger notifications from recommendation, agreement, and reminder events  
  - Type: task  
  - Assignee(s): @Dhanav  
  - Requirement Number: #4  

- [X] Fix reranking logic to reflect feedback and ensure correct event ordering  
  - Type: bug  
  - Assignee(s): @Dhanav  
  - Requirement Number: #NF2  

- [X] Incorporate feedback signals and ensure consistent ordering across UI surfaces  
  - Type: task  
  - Assignee(s): @Dhanav  
  - Requirement Number: #NF2  

- [x] Users can create a custom event that is visible only to members of the group that created it.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number : 1
- [x] Custom events use the shared event schema and tagging system so they can be displayed and ranked consistently with sourced events.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number : 1
- [x] Users can create a custom event from natural language input, and the system extracts at least the event title/activity, time, location, and category before saving.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number : 1
- [x] Only the creator of a custom event can delete it, and deletion removes the event for all members of that group.
  - Type: task
  - Assignee(s): @Yusoo
  - Requirement Number : 1
