/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as availability from "../availability.js";
import type * as availability_action from "../availability_action.js";
import type * as chats_actions from "../chats_actions.js";
import type * as chats_constants from "../chats_constants.js";
import type * as chats_guards from "../chats_guards.js";
import type * as chats_helpers from "../chats_helpers.js";
import type * as chats_mutations from "../chats_mutations.js";
import type * as chats_queries from "../chats_queries.js";
import type * as chats_schema from "../chats_schema.js";
import type * as classify_preferences_action from "../classify_preferences_action.js";
import type * as crons from "../crons.js";
import type * as custom_events_mutations from "../custom_events_mutations.js";
import type * as email_notifications from "../email_notifications.js";
import type * as email_service from "../email_service.js";
import type * as email_templates from "../email_templates.js";
import type * as event_dedup from "../event_dedup.js";
import type * as event_polls_actions from "../event_polls_actions.js";
import type * as event_polls_helpers from "../event_polls_helpers.js";
import type * as event_polls_mutations from "../event_polls_mutations.js";
import type * as event_polls_queries from "../event_polls_queries.js";
import type * as event_polls_schema from "../event_polls_schema.js";
import type * as event_shortlists_mutations from "../event_shortlists_mutations.js";
import type * as event_shortlists_queries from "../event_shortlists_queries.js";
import type * as event_shortlists_schema from "../event_shortlists_schema.js";
import type * as event_types from "../event_types.js";
import type * as events from "../events.js";
import type * as events_actions from "../events_actions.js";
import type * as events_mutations from "../events_mutations.js";
import type * as events_queries from "../events_queries.js";
import type * as events_schema from "../events_schema.js";
import type * as feedback_action from "../feedback_action.js";
import type * as feedback_decision from "../feedback_decision.js";
import type * as feedback_mutations from "../feedback_mutations.js";
import type * as feedback_queries from "../feedback_queries.js";
import type * as feedback_regen_action from "../feedback_regen_action.js";
import type * as feedback_schema from "../feedback_schema.js";
import type * as friend_activity_mutations from "../friend_activity_mutations.js";
import type * as friend_activity_queries from "../friend_activity_queries.js";
import type * as friend_activity_schema from "../friend_activity_schema.js";
import type * as friends_mutations from "../friends_mutations.js";
import type * as friends_queries from "../friends_queries.js";
import type * as friends_schema from "../friends_schema.js";
import type * as google_calendar from "../google_calendar.js";
import type * as google_places from "../google_places.js";
import type * as group_preferences_mutations from "../group_preferences_mutations.js";
import type * as group_preferences_queries from "../group_preferences_queries.js";
import type * as group_preferences_schema from "../group_preferences_schema.js";
import type * as group_pulse_actions from "../group_pulse_actions.js";
import type * as http from "../http.js";
import type * as http_chat from "../http_chat.js";
import type * as lib from "../lib.js";
import type * as location_aliases from "../location_aliases.js";
import type * as location_types from "../location_types.js";
import type * as messages_guards from "../messages_guards.js";
import type * as messages_helpers from "../messages_helpers.js";
import type * as messages_internals from "../messages_internals.js";
import type * as messages_mutations from "../messages_mutations.js";
import type * as messages_queries from "../messages_queries.js";
import type * as messages_schema from "../messages_schema.js";
import type * as non_ticket_events_actions from "../non_ticket_events_actions.js";
import type * as non_ticket_events_mutations from "../non_ticket_events_mutations.js";
import type * as non_ticket_events_schema from "../non_ticket_events_schema.js";
import type * as notification_preferences_mutations from "../notification_preferences_mutations.js";
import type * as notification_preferences_queries from "../notification_preferences_queries.js";
import type * as passive_preference_extraction from "../passive_preference_extraction.js";
import type * as passive_preference_schema from "../passive_preference_schema.js";
import type * as ranking from "../ranking.js";
import type * as rate_limit from "../rate_limit.js";
import type * as recommendation_metrics_mutations from "../recommendation_metrics_mutations.js";
import type * as recommendation_metrics_queries from "../recommendation_metrics_queries.js";
import type * as recommendation_metrics_schema from "../recommendation_metrics_schema.js";
import type * as recurring_event_instances from "../recurring_event_instances.js";
import type * as recurring_event_mutations from "../recurring_event_mutations.js";
import type * as recurring_event_queries from "../recurring_event_queries.js";
import type * as recurring_events_schema from "../recurring_events_schema.js";
import type * as rsvp_actions from "../rsvp_actions.js";
import type * as rsvp_mutations from "../rsvp_mutations.js";
import type * as rsvp_queries from "../rsvp_queries.js";
import type * as rsvp_schema from "../rsvp_schema.js";
import type * as ticketmaster from "../ticketmaster.js";
import type * as user_allergy_preferences_mutations from "../user_allergy_preferences_mutations.js";
import type * as user_allergy_preferences_queries from "../user_allergy_preferences_queries.js";
import type * as user_appearance_actions from "../user_appearance_actions.js";
import type * as user_appearance_mutations from "../user_appearance_mutations.js";
import type * as user_appearance_queries from "../user_appearance_queries.js";
import type * as user_appearance_schema from "../user_appearance_schema.js";
import type * as user_hard_restrictions_mutations from "../user_hard_restrictions_mutations.js";
import type * as user_hard_restrictions_queries from "../user_hard_restrictions_queries.js";
import type * as user_history_queries from "../user_history_queries.js";
import type * as user_preferences_mutations from "../user_preferences_mutations.js";
import type * as user_preferences_queries from "../user_preferences_queries.js";
import type * as users_mutations from "../users_mutations.js";
import type * as users_queries from "../users_queries.js";
import type * as weather from "../weather.js";
import type * as yelp from "../yelp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  availability: typeof availability;
  availability_action: typeof availability_action;
  chats_actions: typeof chats_actions;
  chats_constants: typeof chats_constants;
  chats_guards: typeof chats_guards;
  chats_helpers: typeof chats_helpers;
  chats_mutations: typeof chats_mutations;
  chats_queries: typeof chats_queries;
  chats_schema: typeof chats_schema;
  classify_preferences_action: typeof classify_preferences_action;
  crons: typeof crons;
  custom_events_mutations: typeof custom_events_mutations;
  email_notifications: typeof email_notifications;
  email_service: typeof email_service;
  email_templates: typeof email_templates;
  event_dedup: typeof event_dedup;
  event_polls_actions: typeof event_polls_actions;
  event_polls_helpers: typeof event_polls_helpers;
  event_polls_mutations: typeof event_polls_mutations;
  event_polls_queries: typeof event_polls_queries;
  event_polls_schema: typeof event_polls_schema;
  event_shortlists_mutations: typeof event_shortlists_mutations;
  event_shortlists_queries: typeof event_shortlists_queries;
  event_shortlists_schema: typeof event_shortlists_schema;
  event_types: typeof event_types;
  events: typeof events;
  events_actions: typeof events_actions;
  events_mutations: typeof events_mutations;
  events_queries: typeof events_queries;
  events_schema: typeof events_schema;
  feedback_action: typeof feedback_action;
  feedback_decision: typeof feedback_decision;
  feedback_mutations: typeof feedback_mutations;
  feedback_queries: typeof feedback_queries;
  feedback_regen_action: typeof feedback_regen_action;
  feedback_schema: typeof feedback_schema;
  friend_activity_mutations: typeof friend_activity_mutations;
  friend_activity_queries: typeof friend_activity_queries;
  friend_activity_schema: typeof friend_activity_schema;
  friends_mutations: typeof friends_mutations;
  friends_queries: typeof friends_queries;
  friends_schema: typeof friends_schema;
  google_calendar: typeof google_calendar;
  google_places: typeof google_places;
  group_preferences_mutations: typeof group_preferences_mutations;
  group_preferences_queries: typeof group_preferences_queries;
  group_preferences_schema: typeof group_preferences_schema;
  group_pulse_actions: typeof group_pulse_actions;
  http: typeof http;
  http_chat: typeof http_chat;
  lib: typeof lib;
  location_aliases: typeof location_aliases;
  location_types: typeof location_types;
  messages_guards: typeof messages_guards;
  messages_helpers: typeof messages_helpers;
  messages_internals: typeof messages_internals;
  messages_mutations: typeof messages_mutations;
  messages_queries: typeof messages_queries;
  messages_schema: typeof messages_schema;
  non_ticket_events_actions: typeof non_ticket_events_actions;
  non_ticket_events_mutations: typeof non_ticket_events_mutations;
  non_ticket_events_schema: typeof non_ticket_events_schema;
  notification_preferences_mutations: typeof notification_preferences_mutations;
  notification_preferences_queries: typeof notification_preferences_queries;
  passive_preference_extraction: typeof passive_preference_extraction;
  passive_preference_schema: typeof passive_preference_schema;
  ranking: typeof ranking;
  rate_limit: typeof rate_limit;
  recommendation_metrics_mutations: typeof recommendation_metrics_mutations;
  recommendation_metrics_queries: typeof recommendation_metrics_queries;
  recommendation_metrics_schema: typeof recommendation_metrics_schema;
  recurring_event_instances: typeof recurring_event_instances;
  recurring_event_mutations: typeof recurring_event_mutations;
  recurring_event_queries: typeof recurring_event_queries;
  recurring_events_schema: typeof recurring_events_schema;
  rsvp_actions: typeof rsvp_actions;
  rsvp_mutations: typeof rsvp_mutations;
  rsvp_queries: typeof rsvp_queries;
  rsvp_schema: typeof rsvp_schema;
  ticketmaster: typeof ticketmaster;
  user_allergy_preferences_mutations: typeof user_allergy_preferences_mutations;
  user_allergy_preferences_queries: typeof user_allergy_preferences_queries;
  user_appearance_actions: typeof user_appearance_actions;
  user_appearance_mutations: typeof user_appearance_mutations;
  user_appearance_queries: typeof user_appearance_queries;
  user_appearance_schema: typeof user_appearance_schema;
  user_hard_restrictions_mutations: typeof user_hard_restrictions_mutations;
  user_hard_restrictions_queries: typeof user_hard_restrictions_queries;
  user_history_queries: typeof user_history_queries;
  user_preferences_mutations: typeof user_preferences_mutations;
  user_preferences_queries: typeof user_preferences_queries;
  users_mutations: typeof users_mutations;
  users_queries: typeof users_queries;
  weather: typeof weather;
  yelp: typeof yelp;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
