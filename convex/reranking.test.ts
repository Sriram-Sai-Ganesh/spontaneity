import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";
import { rankEventsForGroup, type GroupPreferenceProfileSummary } from "./ranking";
import type { NormalizedEvent } from "./event_types";

/**
 * Integration tests for the feedback-driven reranking pipeline.
 *
 * The new flow is:
 *   submitFeedback → applyFeedbackToProfileInternal (looks up event tags from events/non_ticket_events)
 *   findAvailableEventsForMembers → rankEventsForGroup (reads profile)
 *
 * Snapshots are no longer needed — the profile is updated directly from event tag data.
 */

function makeEvent(eventId: string, title: string, overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId,
    title,
    description: null,
    startTime: "2026-06-01T19:00:00Z",
    venueName: "Test Venue",
    venueCity: "Baltimore",
    venueCountry: "United States Of America",
    source: "ticketmaster",
    url: `https://example.com/${eventId}`,
    image: null,
    status: "onsale",
    budgetBucket: null,
    genre: null,
    ...overrides,
  };
}

/** Helper: insert an event into the events table with explicit tags. */
async function seedEvent(
  t: ReturnType<typeof createTestConvex>,
  eventId: string,
  title: string,
  tags: string[],
) {
  await t.mutation(internal.events_mutations.storeEvents, {
    events: [
      {
        eventId,
        title,
        source: "ticketmaster",
        url: `https://example.com/${eventId}`,
        // Use eventId-derived startTime and venueName to avoid dedup collisions
        startTime: `2026-06-01T${eventId.charCodeAt(eventId.length - 1) % 24}:00:00Z`,
        venueName: `Venue-${eventId}`,
        venueCity: "Baltimore",
        venueCountry: "United States Of America",
        tags: tags as import("./event_types").EventTag[],
        tagsConfirmed: true,
      },
    ],
  });
}

describe("feedback-driven reranking", () => {
  test("accepting a concert event builds a profile that ranks concert events higher", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Reranking Chat");

    // Insert the event with tags so applyFeedbackToProfileInternal can learn from it
    await seedEvent(t, "evt-concert-1", "Live Concert Night", ["Concert"]);

    // User submits accept feedback
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      eventId: "evt-concert-1",
      chatId,
      feedbackType: "accept",
    });

    // Profile should now have concert signal
    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();
    expect(profile!.categorySignals).toContainEqual(
      expect.objectContaining({ category: "concert", acceptCount: 1, rejectCount: 0 }),
    );

    // rankEventsForGroup uses the profile to rank concerts above neutral events
    const concertEvent = makeEvent("evt-concert-1", "Live Concert Night");
    const neutralEvent = makeEvent("evt-neutral-1", "Annual General Assembly");
    const ranked = rankEventsForGroup(
      [neutralEvent, concertEvent],
      [],
      profile as GroupPreferenceProfileSummary,
    );

    expect(ranked[0].eventId).toBe("evt-concert-1");
  });

  test("rejecting a sports event builds a profile that ranks sports events lower", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Reranking Chat 2");

    await seedEvent(t, "evt-sports-1", "Johns Hopkins vs Navy Lacrosse", ["Other Sports"]);

    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      eventId: "evt-sports-1",
      chatId,
      feedbackType: "reject",
    });

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();
    expect(profile!.categorySignals).toContainEqual(
      expect.objectContaining({ category: "other sports", acceptCount: 0, rejectCount: 1 }),
    );

    const sportsEvent = makeEvent("evt-sports-1", "Johns Hopkins vs Navy Lacrosse");
    const neutralEvent = makeEvent("evt-neutral-1", "Annual General Assembly");
    const ranked = rankEventsForGroup(
      [sportsEvent, neutralEvent],
      [],
      profile as GroupPreferenceProfileSummary,
    );

    expect(ranked[0].eventId).toBe("evt-neutral-1");
  });

  test("mixed feedback across two categories ranks accepted category above rejected", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Reranking Chat 3");

    await seedEvent(t, "evt-concert-2", "Live Concert Night", ["Concert"]);
    await seedEvent(t, "evt-sports-2", "Baltimore Ravens vs Eagles", ["Other Sports"]);

    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      eventId: "evt-concert-2",
      chatId,
      feedbackType: "accept",
    });
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      eventId: "evt-sports-2",
      chatId,
      feedbackType: "reject",
    });

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).not.toBeNull();

    const concertEvent = makeEvent("evt-concert-2", "Live Concert Night");
    const sportsEvent = makeEvent("evt-sports-2", "Baltimore Ravens vs Eagles");
    const ranked = rankEventsForGroup(
      [sportsEvent, concertEvent],
      [],
      profile as GroupPreferenceProfileSummary,
    );

    expect(ranked.map((e) => e.eventId)).toEqual(["evt-concert-2", "evt-sports-2"]);
  });

  test("feedback on event not in DB does not build a profile", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "No Event Chat");

    // Submit feedback for an event that doesn't exist in events or non_ticket_events
    await t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, {
      eventId: "evt-not-in-db",
      chatId,
      feedbackType: "accept",
    });

    const profile = await t.query(
      internal.group_preferences_queries.getGroupPreferenceProfileForChatId,
      { chatId },
    );

    expect(profile).toBeNull();
  });
});
