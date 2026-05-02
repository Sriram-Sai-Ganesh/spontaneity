export type FeedbackType = "accept" | "reject" | "cancel" | "more-like-this";

export interface FeedbackConstraints {
  /** Whether all chat members have Google Calendar connected. */
  allMembersHaveCalendar: boolean;
  /** Whether a city or keyword is available to guide the search. */
  hasCityOrKeyword: boolean;
  /** Whether at least one member has set event type preferences. */
  hasGroupPreferences: boolean;
  /**
   * Title of the event the feedback was submitted on.
   * Used as a search hint for more-like-this regeneration.
   */
  eventTitle?: string;
}

export type FeedbackDecision =
  | { action: "noop" }
  /**
   * Re-run the event search.
   * - mode "exclude": user rejected this event — find something different.
   * - mode "similar": user wants more like this — use eventTitle as a hint.
   */
  | { action: "regenerate"; mode: "exclude" | "similar"; hint?: string }
  | { action: "clarify"; question: string };

/**
 * Pure decision function: given a feedback type and current constraint context,
 * returns what action to take next.
 *
 * Rules:
 * - cancel  → noop
 * - accept  → noop (record preference signal, no new search)
 * - reject:
 *   1. No calendar → clarify (reconnect)
 *   2. No constraints at all → clarify (ask what they want)
 *   3. Otherwise → regenerate (mode: exclude); clarify only if list is empty after filtering
 * - more-like-this:
 *   1. No calendar → clarify (reconnect)
 *   2. Otherwise → regenerate (mode: similar, hint = eventTitle if available)
 */
export function decideFeedbackAction(
  feedbackType: FeedbackType,
  constraints: FeedbackConstraints,
): FeedbackDecision {
  if (feedbackType === "cancel") {
    return { action: "noop" };
  }

  if (feedbackType === "accept") {
    return { action: "noop" };
  }

  if (feedbackType === "more-like-this") {
    return {
      action: "regenerate",
      mode: "similar",
      hint: constraints.eventTitle,
    };
  }

  // reject and cancel both need calendar access for finding new time windows
  if (!constraints.allMembersHaveCalendar) {
    return {
      action: "clarify",
      question:
        "Some members haven't connected Google Calendar. Ask everyone to reconnect so we can find times that work for the whole group.",
    };
  }

  // reject from here
  if (!constraints.hasCityOrKeyword && !constraints.hasGroupPreferences) {
    return {
      action: "clarify",
      question:
        "What type of event or city are you looking for? For example: sports in Chicago, concerts, dinner, or comedy shows.",
    };
  }

  return { action: "regenerate", mode: "exclude" };
}
