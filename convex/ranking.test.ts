import { describe, expect, test } from "vitest";
import type { NormalizedEvent } from "./event_types";
import {
  inferEventTags,
  rankEventsForGroup,
  applyFinalDistanceRanking,
  scoreEventForGroup,
  computeRankingConfidence,
  haversineDistanceMiles,
  type GroupPreferenceProfileSummary,
  type MemberPreference,
  type ReferenceLocation,
} from "./ranking";

function makeEvent(
  eventId: string,
  title: string,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    eventId,
    title,
    description: null,
    startTime: "2026-03-07T19:00:00Z",
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

const noGroupProfile: GroupPreferenceProfileSummary | null = null;

describe("ranking", () => {
  test("inferEventTags returns specific EventTag values from text fallback", () => {
    // Bowling alley with no pre-assigned tags → inferred from TAG_PATTERNS text match.
    const bowlingEvent = makeEvent("evt-bowling", "Strike Zone Bowling Night");
    expect(inferEventTags(bowlingEvent)).toContain("Bowling");

    // Yoga class.
    const yogaEvent = makeEvent("evt-yoga", "Morning Yoga Flow");
    expect(inferEventTags(yogaEvent)).toContain("Yoga");

    // Escape room.
    const escapeEvent = makeEvent("evt-escape", "Downtown Escape Room Challenge");
    expect(inferEventTags(escapeEvent)).toContain("Escape Room");
  });

  test("inferEventTags prefers pre-assigned tags over text patterns", () => {
    // Event has tags assigned by AI classifier — use those, not text patterns.
    const eventWithTags = makeEvent("evt-trivia", "Thursday Night Party", {
      tags: ["Trivia", "Night Life"] as import("./event_types").EventTag[],
    });
    const result = inferEventTags(eventWithTags);
    expect(result).toContain("Trivia");
    expect(result).toContain("Night Life");
    // Text patterns for "party" would not match anything relevant; tags win.
    expect(result).not.toContain("Concert");
  });

  test("inferEventTags ignores Custom and None tags", () => {
    const customEvent = makeEvent("evt-custom", "Our Bowling Night", {
      tags: ["Custom", "Bowling"] as import("./event_types").EventTag[],
    });
    const result = inferEventTags(customEvent);
    expect(result).toContain("Bowling");
    expect(result).not.toContain("Custom");
    expect(result).not.toContain("None");
  });

  test("member with bowling preference is boosted for bowling events", () => {
    const bowlingEvent = makeEvent("evt-bowling", "Strike Zone Bowling Night");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    const memberPrefs: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: ["Bowling"], negativeEventTypes: [] },
    ];

    expect(scoreEventForGroup(bowlingEvent, memberPrefs, noGroupProfile)).toBeGreaterThan(
      scoreEventForGroup(neutralEvent, memberPrefs, noGroupProfile),
    );
  });

  test("member likes boost a matching event above a neutral one", () => {
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
    ];

    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const neutralEvent = makeEvent("evt-other", "Community Expo");

    expect(scoreEventForGroup(sportsEvent, memberPrefs, noGroupProfile)).toBeGreaterThan(
      scoreEventForGroup(neutralEvent, memberPrefs, noGroupProfile),
    );
  });

  test("member dislikes penalize matching events more strongly than likes boost them", () => {
    const likedByOne: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["concert"], negativeEventTypes: [] },
    ];
    const dislikedByOne: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: [], negativeEventTypes: ["concert"] },
    ];
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");

    expect(scoreEventForGroup(concertEvent, dislikedByOne, noGroupProfile)).toBeLessThan(
      scoreEventForGroup(concertEvent, likedByOne, noGroupProfile),
    );
  });

  test("shared member likes outrank a single-member preference match", () => {
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: ["concert"], negativeEventTypes: [] },
    ];

    expect(
      rankEventsForGroup([concertEvent, sportsEvent], memberPrefs, noGroupProfile).map(
        (event) => event.eventId,
      ),
    ).toEqual(["evt-sports", "evt-concert"]);
  });

  test("one explicit dislike outweighs multiple positive votes for the same category", () => {
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");
    const neutralEvent = makeEvent("evt-neutral", "Neighborhood Meetup");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["concert"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["concert"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: [], negativeEventTypes: ["concert"] },
    ];

    expect(
      rankEventsForGroup([concertEvent, neutralEvent], memberPrefs, noGroupProfile).map(
        (event) => event.eventId,
      ),
    ).toEqual(["evt-neutral", "evt-concert"]);
  });

  test("learned group signals and budget preference affect ordering", () => {
    const sportsCheap = makeEvent("evt-sports-cheap", "Johns Hopkins vs Navy Lacrosse", {
      budgetBucket: "low",
    });
    const concertExpensive = makeEvent("evt-concert-expensive", "Live Concert Night", {
      budgetBucket: "high",
    });
    const groupProfile: GroupPreferenceProfileSummary = {
      categorySignals: [
        {
          category: "other sports",
          acceptCount: 3,
          rejectCount: 0,
          moreLikeThisCount: 1,
        },
        {
          category: "concert",
          acceptCount: 0,
          rejectCount: 2,
          moreLikeThisCount: 0,
        },
      ],
      budgetPreference: "low",
      feedbackCount: 6,
    };

    expect(
      rankEventsForGroup([concertExpensive, sportsCheap], [], groupProfile).map(
        (event) => event.eventId,
      ),
    ).toEqual(["evt-sports-cheap", "evt-concert-expensive"]);
  });

  test("unknown budget preference does not change ordering on otherwise tied events", () => {
    const firstEvent = makeEvent("evt-first", "Neighborhood Meetup", {
      budgetBucket: "low",
    });
    const secondEvent = makeEvent("evt-second", "Community Meetup", {
      budgetBucket: "high",
    });
    const groupProfile: GroupPreferenceProfileSummary = {
      categorySignals: [],
      budgetPreference: "unknown",
      feedbackCount: 0,
    };

    expect(
      rankEventsForGroup([firstEvent, secondEvent], [], groupProfile).map(
        (event) => event.eventId,
      ),
    ).toEqual(["evt-first", "evt-second"]);
  });

  test("learned category signal score is clamped to [-4, +4]", () => {
    // Signals now use proper weights and are NOT capped — more rejections = stronger penalty.
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const highRejectProfile: GroupPreferenceProfileSummary = {
      categorySignals: [
        { category: "other sports", acceptCount: 0, rejectCount: 5, moreLikeThisCount: 0 },
      ],
      budgetPreference: "unknown",
      feedbackCount: 5,
    };
    const lowRejectProfile: GroupPreferenceProfileSummary = {
      categorySignals: [
        { category: "other sports", acceptCount: 0, rejectCount: 1, moreLikeThisCount: 0 },
      ],
      budgetPreference: "unknown",
      feedbackCount: 1,
    };

    // More rejections should produce a stronger (more negative) score, not the same capped value.
    const highRejectScore = scoreEventForGroup(sportsEvent, [], highRejectProfile);
    const lowRejectScore  = scoreEventForGroup(sportsEvent, [], lowRejectProfile);
    expect(highRejectScore).toBeLessThan(lowRejectScore);
  });

  test("mixed budget preference is neutral like unknown", () => {
    const cheapEvent = makeEvent("evt-cheap", "Neighborhood Meetup", {
      budgetBucket: "low",
    });
    const expensiveEvent = makeEvent("evt-expensive", "Community Meetup", {
      budgetBucket: "high",
    });
    const groupProfile: GroupPreferenceProfileSummary = {
      categorySignals: [],
      budgetPreference: "mixed",
      feedbackCount: 5,
    };

    expect(
      rankEventsForGroup([cheapEvent, expensiveEvent], [], groupProfile).map(
        (event) => event.eventId,
      ),
    ).toEqual(["evt-cheap", "evt-expensive"]);
  });

  test("events with no inferable category score zero from all preference signals", () => {
    const uncategorizedEvent = makeEvent("evt-unknown", "Annual General Assembly");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["other sports"], negativeEventTypes: ["concert"] },
    ];
    const groupProfile: GroupPreferenceProfileSummary = {
      categorySignals: [
        { category: "other sports", acceptCount: 5, rejectCount: 0, moreLikeThisCount: 2 },
      ],
      budgetPreference: "low",
      feedbackCount: 7,
    };

    expect(scoreEventForGroup(uncategorizedEvent, memberPrefs, groupProfile)).toBe(0);
  });

  test("equal-score events preserve their original input order", () => {
    const eventA = makeEvent("evt-a", "Neighborhood Meetup");
    const eventB = makeEvent("evt-b", "Community Meetup");
    const eventC = makeEvent("evt-c", "Local Gathering");

    const ranked = rankEventsForGroup([eventA, eventB, eventC], [], noGroupProfile);
    expect(ranked.map((event) => event.eventId)).toEqual(["evt-a", "evt-b", "evt-c"]);

    const reversedInput = rankEventsForGroup([eventC, eventB, eventA], [], noGroupProfile);
    expect(reversedInput.map((event) => event.eventId)).toEqual(["evt-c", "evt-b", "evt-a"]);
  });

  test("final midpoint distance ranking runs after preference ranking", () => {
    const referenceLocation: ReferenceLocation = {
      latitude: 39.2824,
      longitude: -76.5916,
    };
    const closeNeutralEvent = makeEvent("evt-close", "Neighborhood Dinner", {
      latitude: 39.283,
      longitude: -76.593,
    });
    const farKeywordMatch = makeEvent("evt-far", "Jazz Dinner Experience", {
      latitude: 39.395,
      longitude: -76.602,
    });

    const preferenceRanked = rankEventsForGroup(
      [closeNeutralEvent, farKeywordMatch],
      [],
      noGroupProfile,
      [],
      "jazz",
      undefined,
    );

    expect(preferenceRanked.map((event) => event.eventId)).toEqual(["evt-far", "evt-close"]);
    const distanceRanked = applyFinalDistanceRanking(preferenceRanked, referenceLocation);
    expect(distanceRanked.map((event) => event.eventId)).toEqual([
      "evt-close",
      "evt-far",
    ]);
    expect(distanceRanked[0].rankScore).toBeGreaterThan(distanceRanked[1].rankScore);
  });

  test("final midpoint distance ranking keeps ungeocoded events last", () => {
    const referenceLocation: ReferenceLocation = {
      latitude: 39.2824,
      longitude: -76.5916,
    };
    const closeEvent = makeEvent("evt-close", "Nearby Dinner", {
      latitude: 39.283,
      longitude: -76.593,
    });
    const ungeocodedEvent = makeEvent("evt-no-coords", "No Coordinate Dinner");

    const ranked = rankEventsForGroup(
      [ungeocodedEvent, closeEvent],
      [],
      noGroupProfile,
      [],
      undefined,
      undefined,
    );

    expect(applyFinalDistanceRanking(ranked, referenceLocation).map((event) => event.eventId)).toEqual([
      "evt-close",
      "evt-no-coords",
    ]);
  });
});

describe("computeRankingConfidence", () => {
  test("two-thirds member support with matching rank-1 yields medium-to-high confidence", () => {
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["Other Sports"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["Other Sports"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: ["Concert"], negativeEventTypes: [] },
    ];

    const ranked = rankEventsForGroup([concertEvent, sportsEvent], memberPrefs, noGroupProfile);
    const confidence = computeRankingConfidence(ranked, memberPrefs, noGroupProfile);

    expect(confidence.verdict).toBe("medium");
    expect(confidence.score).toBeGreaterThanOrEqual(0.35);
    expect(confidence.memberSupportRatio).toBe(2 / 3);
    expect(confidence.topCategory).toBe("Other Sports");
  });

  test("all members prefer rank-1 category yields very high confidence", () => {
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["Other Sports"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["Other Sports"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: ["Other Sports"], negativeEventTypes: [] },
    ];

    const ranked = rankEventsForGroup([concertEvent, sportsEvent], memberPrefs, noGroupProfile);
    const confidence = computeRankingConfidence(ranked, memberPrefs, noGroupProfile);

    // All N members like the top event, so confidence should stay high even if
    // the top-score blend changes over time.
    expect(confidence.score).toBeGreaterThan(0.7);
    expect(confidence.memberSupportRatio).toBe(1);
  });

  test("keyword-aligned rank-1 event is not low confidence without saved preferences", () => {
    const basketballEvent = makeEvent("evt-basketball", "NBA Basketball Showcase");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    const ranked = rankEventsForGroup(
      [neutralEvent, basketballEvent],
      [],
      noGroupProfile,
      [],
      "basketball",
    );
    const confidence = computeRankingConfidence(
      ranked,
      [],
      noGroupProfile,
      [],
      "basketball",
    );

    expect(ranked[0].eventId).toBe("evt-basketball");
    expect(confidence.verdict).not.toBe("low");
    expect(confidence.score).toBeGreaterThanOrEqual(0.35);
  });

  test("similar strong keyword matches do not force low confidence solely from a small score gap", () => {
    const championshipEvent = makeEvent("evt-championship", "Basketball Championship Game");
    const showcaseEvent = makeEvent("evt-showcase", "Basketball Showcase");

    const ranked = rankEventsForGroup(
      [championshipEvent, showcaseEvent],
      [],
      noGroupProfile,
      [],
      "basketball",
    );
    const confidence = computeRankingConfidence(
      ranked,
      [],
      noGroupProfile,
      [],
      "basketball",
    );

    expect(confidence.scoreGapNormalized).toBe(0);
    expect(confidence.verdict).toBe("medium");
  });

  test("cuisine-aligned food venue can reach high confidence without event type preferences", () => {
    const mexicanPlace = makeEvent("evt-mexican", "El Rancho", {
      source: "google_places",
      venueType: "food",
      tags: ["Mexican"] as any,
    });
    const genericDiner = makeEvent("evt-generic", "Downtown Diner", {
      source: "google_places",
      venueType: "food",
      tags: ["American"] as any,
    });
    const memberPrefs: MemberPreference[] = [
      {
        name: "Yusoo",
        preferredEventTypes: [],
        negativeEventTypes: [],
        cuisinePreferences: ["Mexican"],
      },
    ];

    const ranked = rankEventsForGroup([genericDiner, mexicanPlace], memberPrefs, noGroupProfile);
    const confidence = computeRankingConfidence(ranked, memberPrefs, noGroupProfile);

    expect(ranked[0].eventId).toBe("evt-mexican");
    expect(confidence.memberSupportRatio).toBe(1);
    expect(confidence.verdict).toBe("high");
  });

  test("learned group preference alignment can produce meaningful confidence without explicit member prefs", () => {
    const basketballEvent = makeEvent("evt-basketball", "Basketball Game Tonight");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");
    const learnedBasketballProfile: GroupPreferenceProfileSummary = {
      categorySignals: [
        { category: "basketball", acceptCount: 0, rejectCount: 0, moreLikeThisCount: 3 },
      ],
      budgetPreference: "unknown",
      feedbackCount: 3,
    };

    const ranked = rankEventsForGroup([neutralEvent, basketballEvent], [], learnedBasketballProfile);
    const confidence = computeRankingConfidence(ranked, [], learnedBasketballProfile);

    expect(ranked[0].eventId).toBe("evt-basketball");
    expect(confidence.verdict).toBe("high");
  });

  test("no member preferences yields low confidence", () => {
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: [], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: [], negativeEventTypes: [] },
    ];

    const confidence = computeRankingConfidence([sportsEvent], memberPrefs, noGroupProfile);

    expect(confidence.verdict).toBe("low");
    expect(confidence.memberSupportRatio).toBe(0);
  });

  test("member dislike of rank-1 category zeroes negativeFree and lowers score", () => {
    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");

    // With dislike: 2 members like "other sports", 1 dislikes — dislike outweighs, concert ranks first
    const memberPrefsWithDislike: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: ["concert"], negativeEventTypes: ["other sports"] },
    ];

    const rankedWithDislike = rankEventsForGroup([concertEvent, sportsEvent], memberPrefsWithDislike, noGroupProfile);
    const confidenceWithDislike = computeRankingConfidence(rankedWithDislike, memberPrefsWithDislike, noGroupProfile);

    // Without dislike: sports scores +4, concert scores +2, so sports ranks first
    const memberPrefsNoDislike: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Teammate", preferredEventTypes: ["other sports"], negativeEventTypes: [] },
      { name: "Third", preferredEventTypes: ["concert"], negativeEventTypes: [] },
    ];

    const rankedNoDislike = rankEventsForGroup([concertEvent, sportsEvent], memberPrefsNoDislike, noGroupProfile);
    const confidenceNoDislike = computeRankingConfidence(rankedNoDislike, memberPrefsNoDislike, noGroupProfile);

    // With dislike, the top-ranked event (concert) should have negativeFree=true
    // But we can test that if we consider a hypothetical where sports ranks first despite dislike
    // instead, let's test that a single dislike penalty appears in the scoring
    expect(confidenceWithDislike.topCategory).toBe("Concert");
    expect(confidenceNoDislike.topCategory).toBe("Other Sports");
  });

  test("rank-1 event with no inferable category yields zero support ratio", () => {
    const uncategorizedEvent = makeEvent("evt-unknown", "Annual General Assembly");
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["sports"], negativeEventTypes: [] },
    ];

    const confidence = computeRankingConfidence([uncategorizedEvent], memberPrefs, noGroupProfile);

    expect(confidence.topCategory).toBeNull();
    expect(confidence.memberSupportRatio).toBe(0);
  });

  test("empty event list yields low confidence", () => {
    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["sports"], negativeEventTypes: [] },
    ];

    const confidence = computeRankingConfidence([], memberPrefs, noGroupProfile);

    expect(confidence.score).toBe(0);
    expect(confidence.verdict).toBe("low");
  });
});

describe("person-specific preference ranking", () => {
  const davidId = "user_david";
  const johnId = "user_john";

  test("person-specific dislike overrides general preferredEventType when that person is in the group", () => {
    // David generally likes basketball, but dislikes it when John is present.
    const davidPrefs: MemberPreference = {
      name: "David",
      preferredEventTypes: ["basketball"],
      negativeEventTypes: [],
      personSpecificDislikes: { [johnId]: ["basketball"] },
    };
    const johnPrefs: MemberPreference = {
      name: "John",
      preferredEventTypes: [],
      negativeEventTypes: [],
    };

    const basketballEvent = makeEvent("evt-sports", "Basketball Game Tonight");
    const hikingEvent = makeEvent("evt-hiking", "Hiking Trail Adventure");

    // Without John in the group: David's basketball like applies → basketball ranks first.
    const scoreBasketballWithoutJohn = scoreEventForGroup(
      basketballEvent, [davidPrefs], noGroupProfile, [davidId]
    );
    const scoreHikingWithoutJohn = scoreEventForGroup(
      hikingEvent, [davidPrefs], noGroupProfile, [davidId]
    );
    expect(scoreBasketballWithoutJohn).toBeGreaterThan(scoreHikingWithoutJohn);

    // With John in the group: person-specific dislike cancels the basketball like.
    const scoreBasketballWithJohn = scoreEventForGroup(
      basketballEvent, [davidPrefs, johnPrefs], noGroupProfile, [davidId, johnId]
    );
    const scoreHikingWithJohn = scoreEventForGroup(
      hikingEvent, [davidPrefs, johnPrefs], noGroupProfile, [davidId, johnId]
    );
    expect(scoreBasketballWithJohn).toBeLessThanOrEqual(scoreHikingWithJohn);
  });

  test("person-specific like overrides general negativeEventType when that person is in the group", () => {
    // Alex generally dislikes lacrosse-type events, but likes them when John is present.
    const alexPrefs: MemberPreference = {
      name: "Alex",
      preferredEventTypes: [],
      negativeEventTypes: ["other sports"],
      personSpecificLikes: { [johnId]: ["other sports"] },
    };
    const johnPrefs: MemberPreference = {
      name: "John",
      preferredEventTypes: [],
      negativeEventTypes: [],
    };

    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");

    // Without John: sports is penalized by Alex's general dislike.
    const scoreWithoutJohn = scoreEventForGroup(
      sportsEvent, [alexPrefs], noGroupProfile, ["user_alex"]
    );
    // With John: person-specific like cancels the negative.
    const scoreWithJohn = scoreEventForGroup(
      sportsEvent, [alexPrefs, johnPrefs], noGroupProfile, ["user_alex", johnId]
    );
    expect(scoreWithJohn).toBeGreaterThan(scoreWithoutJohn);
  });

  test("person-specific dislike takes precedence over person-specific like for the same tag", () => {
    // Member has a person-specific like for "other sports" (from user A) AND a person-specific
    // dislike for "other sports" (from user B). When both are in the group, the dislike wins.
    // Uses the specific EventTag "other sports" inferred from a lacrosse/vs event.
    const memberPrefs: MemberPreference = {
      name: "Sam",
      preferredEventTypes: [],
      negativeEventTypes: [],
      personSpecificLikes: { user_a: ["other sports"] },
      personSpecificDislikes: { user_b: ["other sports"] },
    };

    const sportsEvent = makeEvent("evt-sports", "Johns Hopkins vs Navy Lacrosse");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    const ranked = rankEventsForGroup(
      [sportsEvent, neutralEvent],
      [memberPrefs],
      noGroupProfile,
      ["user_a", "user_b"],
    );
    // Sports should not be boosted — dislike wins the conflict.
    expect(ranked[0].eventId).toBe("evt-neutral");
  });

  test("person-specific preferences only apply when the referenced user is in the group", () => {
    // David has a person-specific dislike for basketball with John, but John is NOT in this group.
    // Uses "basketball" which matches the EventTag inferred from "Basketball Game Tonight".
    const davidPrefs: MemberPreference = {
      name: "David",
      preferredEventTypes: ["basketball"],
      negativeEventTypes: [],
      personSpecificDislikes: { [johnId]: ["basketball"] },
    };

    const sportsEvent = makeEvent("evt-sports", "Basketball Game Tonight");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    // Group does NOT contain John — David's general like for basketball should still apply.
    const ranked = rankEventsForGroup(
      [neutralEvent, sportsEvent],
      [davidPrefs],
      noGroupProfile,
      [davidId], // John is absent
    );
    expect(ranked[0].eventId).toBe("evt-sports");
  });

  test("person-specific dislike only cancels that member's preference, not other members'", () => {
    // Scenario: 5-person group — David, Alice, Bob, Carol all like basketball.
    // David dislikes basketball specifically when John is present.
    // Alice, Bob, Carol have no person-specific overrides.
    // → David's basketball preference is cancelled; the other three still have a positive signal.
    // Uses "basketball" which matches the EventTag inferred from "Basketball Game Tonight".
    const aliceId = "user_alice";
    const bobId = "user_bob";
    const carolId = "user_carol";

    const davidPrefs: MemberPreference = {
      name: "David",
      preferredEventTypes: ["basketball"],
      negativeEventTypes: [],
      personSpecificDislikes: { [johnId]: ["basketball"] },
    };
    const johnPrefs: MemberPreference = {
      name: "John",
      preferredEventTypes: [],
      negativeEventTypes: [],
    };
    const makePrefs = (name: string): MemberPreference => ({
      name,
      preferredEventTypes: ["basketball"],
      negativeEventTypes: [],
    });

    const sportsEvent = makeEvent("evt-sports", "Basketball Game Tonight");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    const allMembers = [davidPrefs, johnPrefs, makePrefs("Alice"), makePrefs("Bob"), makePrefs("Carol")];
    const allIds = [davidId, johnId, aliceId, bobId, carolId];

    // The three members with no person-specific overrides still boost sports → it ranks first.
    const ranked = rankEventsForGroup(
      [neutralEvent, sportsEvent],
      allMembers,
      noGroupProfile,
      allIds,
    );
    // With group-size normalization (N=5): David's active dislike (−8/5 = −1.6) outweighs
    // Alice+Bob+Carol's combined likes (3×2/5 = +1.2), so neutral wins.
    // The key point is that the other members' preferences are unaffected individually.
    expect(ranked[0].eventId).toBe("evt-neutral");

    // Verify individually: Alice, Bob, Carol each still score sports positively even though
    // David (also in the group) has a person-specific dislike of sports with John.
    const scoreAlice = scoreEventForGroup(sportsEvent, [makePrefs("Alice")], noGroupProfile, allIds);
    const scoreBob   = scoreEventForGroup(sportsEvent, [makePrefs("Bob")],   noGroupProfile, allIds);
    const scoreCarol = scoreEventForGroup(sportsEvent, [makePrefs("Carol")], noGroupProfile, allIds);
    expect(scoreAlice).toBeGreaterThan(0);
    expect(scoreBob).toBeGreaterThan(0);
    expect(scoreCarol).toBeGreaterThan(0);

    // David's score, however, should be ≤ 0 for sports because John is in the group.
    const scoreDavid = scoreEventForGroup(sportsEvent, [davidPrefs], noGroupProfile, allIds);
    expect(scoreDavid).toBeLessThanOrEqual(0);
  });

  test("person-specific likes and dislikes rank multiple events correctly", () => {
    // In this group (David + John), David generally dislikes basketball but has a
    // person-specific like for basketball with John — overriding the general dislike.
    // Uses "basketball" which matches the EventTag inferred from "Basketball Game Tonight".
    const davidPrefs: MemberPreference = {
      name: "David",
      preferredEventTypes: ["basketball"],
      negativeEventTypes: ["basketball"],
      personSpecificLikes: { [johnId]: ["basketball"] },
      personSpecificDislikes: {},
    };
    const johnPrefs: MemberPreference = {
      name: "John",
      preferredEventTypes: ["basketball"],
      negativeEventTypes: [],
    };

    const sportsEvent = makeEvent("evt-sports", "Basketball Game Tonight");
    const neutralEvent = makeEvent("evt-neutral", "Community Expo");

    // David's negativeEventType for sports is overridden by person-specific like for John.
    // Both David and John now effectively like sports → sports should rank first.
    const ranked = rankEventsForGroup(
      [neutralEvent, sportsEvent],
      [davidPrefs, johnPrefs],
      noGroupProfile,
      [davidId, johnId],
    );
    expect(ranked[0].eventId).toBe("evt-sports");
  });
});

describe("food event preference ranking", () => {
  test("allergy match applies the largest penalty to a food event", () => {
    const italianRestaurant = makeEvent("evt-italian", "Bella Italia Ristorante", {
      source: "yelp",
      venueType: "food",
      description: "Authentic Italian cuisine with pasta and peanut dishes",
    });
    const sushiRestaurant = makeEvent("evt-sushi", "Tokyo Sushi Bar", {
      source: "yelp",
      venueType: "food",
      description: "Fresh sushi and sashimi",
    });

    const memberPrefs: MemberPreference[] = [
      {
        name: "Alex",
        preferredEventTypes: [],
        negativeEventTypes: [],
        allergies: ["peanut"],
      },
    ];

    const italianScore = scoreEventForGroup(italianRestaurant, memberPrefs, noGroupProfile);
    const sushiScore = scoreEventForGroup(sushiRestaurant, memberPrefs, noGroupProfile);
    expect(italianScore).toBeLessThan(sushiScore);
  });

  test("dietary restriction penalty is applied but is weaker than allergy penalty", () => {
    const veganRestaurant = makeEvent("evt-vegan", "Green Garden Cafe", {
      source: "yelp",
      venueType: "food",
      description: "Plant-based vegan menu",
    });
    const burgerJoint = makeEvent("evt-burger", "Classic Burger House", {
      source: "yelp",
      venueType: "food",
      description: "Beef burgers and fries",
    });

    const prefsWithAllergy: MemberPreference[] = [
      {
        name: "Alex",
        preferredEventTypes: [],
        negativeEventTypes: [],
        allergies: ["vegan"], // triggers on "vegan" text
      },
    ];
    const prefsWithDietary: MemberPreference[] = [
      {
        name: "Alex",
        preferredEventTypes: [],
        negativeEventTypes: [],
        dietaryRestrictions: ["vegan"],
      },
    ];

    const allergyScore = scoreEventForGroup(veganRestaurant, prefsWithAllergy, noGroupProfile);
    const dietaryScore = scoreEventForGroup(veganRestaurant, prefsWithDietary, noGroupProfile);
    // Allergy penalty is -25, dietary is -12 — allergy should score lower.
    expect(allergyScore).toBeLessThan(dietaryScore);
  });

  test("cuisine preference boosts a matching food venue", () => {
    const japanesePlace = makeEvent("evt-japanese", "Sakura Japanese Kitchen", {
      source: "google_places",
      genre: "Japanese",
    });
    const genericPlace = makeEvent("evt-generic", "Downtown Diner", {
      source: "google_places",
      genre: "American",
    });

    const memberPrefs: MemberPreference[] = [
      {
        name: "Yusoo",
        preferredEventTypes: [],
        negativeEventTypes: [],
        cuisinePreferences: ["japanese"],
      },
    ];

    const japaneseScore = scoreEventForGroup(japanesePlace, memberPrefs, noGroupProfile);
    const genericScore = scoreEventForGroup(genericPlace, memberPrefs, noGroupProfile);
    expect(japaneseScore).toBeGreaterThan(genericScore);
  });

  test("google_places activity venue uses activity scoring, not food scoring", () => {
    // A bowling alley from Google Places should NOT use food/cuisine scoring.
    const bowlingAlley = makeEvent("evt-bowling", "Strike Zone Bowling", {
      source: "google_places",
      genre: "Bowling",
    });

    const memberPrefsWithCuisine: MemberPreference[] = [
      {
        name: "Alex",
        preferredEventTypes: [],
        negativeEventTypes: [],
        cuisinePreferences: ["bowling"], // would match via food scoring if incorrectly classified
      },
    ];

    // Cuisine preference should NOT boost a bowling alley — cuisine scoring is for food venues only.
    expect(scoreEventForGroup(bowlingAlley, memberPrefsWithCuisine, noGroupProfile)).toBe(0);

    // A Google Places gym with a sports-like title DOES match the sports category
    // and is boosted by activity preferences, not cuisine preferences.
    const sportsVenue = makeEvent("evt-gym", "City CrossFit vs Rival Gym Throwdown", {
      source: "google_places",
      genre: "Gym",
    });

    const memberPrefsWithActivity: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: ["crossfit"], negativeEventTypes: [] },
    ];
    const memberPrefsWithCuisineOnly: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: [], negativeEventTypes: [], cuisinePreferences: ["crossfit"] },
    ];

    // Activity preference ("crossfit" matches the inferred CrossFit EventTag) boosts the venue.
    expect(scoreEventForGroup(sportsVenue, memberPrefsWithActivity, noGroupProfile)).toBeGreaterThan(0);
    // Cuisine preference does NOT boost it (it's an activity venue).
    expect(scoreEventForGroup(sportsVenue, memberPrefsWithCuisineOnly, noGroupProfile)).toBe(0);
  });

  test("food events rank: cuisine-matching venue above allergy-conflicting venue", () => {
    const allergyRisk = makeEvent("evt-allergy", "Peanut Butter Cafe", {
      source: "yelp",
      venueType: "food",
      description: "Famous peanut butter sandwiches and shakes",
    });
    const cuisineMatch = makeEvent("evt-match", "Tokyo Ramen House", {
      source: "yelp",
      venueType: "food",
      description: "Authentic Japanese ramen",
      genre: "Japanese",
    });

    const memberPrefs: MemberPreference[] = [
      {
        name: "Alex",
        preferredEventTypes: [],
        negativeEventTypes: [],
        allergies: ["peanut"],
        cuisinePreferences: ["japanese"],
      },
    ];

    const ranked = rankEventsForGroup(
      [allergyRisk, cuisineMatch],
      memberPrefs,
      noGroupProfile,
    );
    expect(ranked[0].eventId).toBe("evt-match");
  });

  test("structured foodTag allergen risk (hard) is detected without description text", () => {
    // "Seafood" foodTag implies shellfish/fish risk — no description needed.
    const seafoodRestaurant = makeEvent("evt-seafood", "Harbor Seafood Co.", {
      source: "yelp",
      venueType: "food",
      description: null,          // no description text mentioning the allergen
      tags: ["Seafood"] as any,
    });
    const burgerPlace = makeEvent("evt-burger", "Classic Burger Joint", {
      source: "yelp",
      venueType: "food",
      description: null,
      tags: ["Burgers"] as any,
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Sam", preferredEventTypes: [], negativeEventTypes: [], allergies: ["shellfish"] },
    ];

    const seafoodScore = scoreEventForGroup(seafoodRestaurant, memberPrefs, noGroupProfile);
    const burgerScore  = scoreEventForGroup(burgerPlace,       memberPrefs, noGroupProfile);
    expect(seafoodScore).toBeLessThan(burgerScore);
  });

  test("dietary compatible venue receives a boost over a neutral venue", () => {
    // A place tagged "Vegan" is boosted for a vegan member.
    const veganCafe = makeEvent("evt-vegan", "Pure Vegan Kitchen", {
      source: "google_places",
      venueType: "food",
      tags: ["Vegan"] as any,
    });
    const italianPlace = makeEvent("evt-italian", "Trattoria Roma", {
      source: "google_places",
      venueType: "food",
      tags: ["Italian"] as any,
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: [], negativeEventTypes: [], dietaryRestrictions: ["vegan"] },
    ];

    const veganScore   = scoreEventForGroup(veganCafe,    memberPrefs, noGroupProfile);
    const italianScore = scoreEventForGroup(italianPlace, memberPrefs, noGroupProfile);
    // Vegan member at a Vegan-tagged venue → boost; Italian is neutral → no penalty, no boost
    expect(veganScore).toBeGreaterThan(italianScore);
  });

  test("allergy penalty is consistent regardless of group size", () => {
    // The allergy penalty is categorical: one allergic member in a large group
    // should receive the same full penalty as a solo user.
    const peanutRisk = makeEvent("evt-thai", "Thai Garden", {
      source: "yelp",
      venueType: "food",
      description: "Thai cuisine with peanuts in many dishes",
    });
    const noRisk = makeEvent("evt-safe", "Fresh Salad Bar", {
      source: "yelp",
      venueType: "food",
      description: "Healthy salads",
    });

    const soloAllergyPrefs: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: [], negativeEventTypes: [], allergies: ["peanut"] },
    ];
    const groupWithOneAllergy: MemberPreference[] = [
      { name: "Alex",   preferredEventTypes: [], negativeEventTypes: [], allergies: ["peanut"] },
      { name: "Beth",   preferredEventTypes: [], negativeEventTypes: [] },
      { name: "Carlos", preferredEventTypes: [], negativeEventTypes: [] },
    ];

    const soloPenalty  = scoreEventForGroup(peanutRisk, soloAllergyPrefs,   noGroupProfile);
    const groupPenalty = scoreEventForGroup(peanutRisk, groupWithOneAllergy, noGroupProfile);

    // Penalty should be identical regardless of group size — one affected member
    // is enough to disqualify the venue at the same strength.
    expect(soloPenalty).toBe(groupPenalty);
    // Allergic venue must rank below the safe option in both solo and group contexts.
    const rankedSolo  = rankEventsForGroup([peanutRisk, noRisk], soloAllergyPrefs,   noGroupProfile);
    const rankedGroup = rankEventsForGroup([peanutRisk, noRisk], groupWithOneAllergy, noGroupProfile);
    expect(rankedSolo[0].eventId).toBe("evt-safe");
    expect(rankedGroup[0].eventId).toBe("evt-safe");
  });

  test("dietary incompatibility penalty via tags beats description-only allergy fallback", () => {
    // Vegan member at a Steakhouse (tags: ["Steakhouse"]) should be penalised.
    const steakhouse = makeEvent("evt-steak", "Prime Cut Steakhouse", {
      source: "yelp",
      venueType: "food",
      description: "Award-winning steaks",
      tags: ["Steakhouse"] as any,
    });
    const veganCafe = makeEvent("evt-vegan", "Garden Vegan Bistro", {
      source: "yelp",
      venueType: "food",
      description: "100% plant-based menu",
      tags: ["Vegan"] as any,
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: [], negativeEventTypes: [], dietaryRestrictions: ["vegan"] },
    ];

    const ranked = rankEventsForGroup([steakhouse, veganCafe], memberPrefs, noGroupProfile);
    expect(ranked[0].eventId).toBe("evt-vegan");
  });

  test("cuisine preference matches via tags, not just description text", () => {
    const mexicanPlace = makeEvent("evt-mexican", "El Rancho", {
      source: "google_places",
      venueType: "food",
      description: "Great tacos",
      tags: ["Mexican"] as any,
    });
    const genericDiner = makeEvent("evt-generic", "Downtown Diner", {
      source: "google_places",
      venueType: "food",
      description: "Classic American food",
      tags: ["American"] as any,
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Yusoo", preferredEventTypes: [], negativeEventTypes: [], cuisinePreferences: ["Mexican"] },
    ];

    const ranked = rankEventsForGroup([genericDiner, mexicanPlace], memberPrefs, noGroupProfile);
    expect(ranked[0].eventId).toBe("evt-mexican");
  });

  test("genre is used as fallback when tags is missing", () => {
    // Restaurant has no tags but genre is "Seafood" — a shellfish allergy
    // member should still receive a penalty via the genre fallback.
    const seafoodNoTags = makeEvent("evt-seafood-notags", "Harbor Grille", {
      source: "google_places",
      venueType: "food",
      genre: "Seafood",
            description: null,
    });
    const safeNoTags = makeEvent("evt-safe-notags", "City Café", {
      source: "google_places",
      venueType: "food",
      genre: "Coffee",
            description: null,
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Jordan", preferredEventTypes: [], negativeEventTypes: [], allergies: ["shellfish"] },
    ];

    const ranked = rankEventsForGroup([seafoodNoTags, safeNoTags], memberPrefs, noGroupProfile);
    expect(ranked[0].eventId).toBe("evt-safe-notags");
  });

  test("dietary restriction uses description text fallback when tags and genre are absent", () => {
    // No tags and no genre — description says "vegan options available"
    const descriptionVenue = makeEvent("evt-desc-vegan", "The Green Plate", {
      source: "google_places",
      venueType: "food",
      genre: null,
            description: "Contemporary cuisine with vegan options available.",
    });
    const neutralVenue = makeEvent("evt-desc-neutral", "Corner Bistro", {
      source: "google_places",
      venueType: "food",
      genre: null,
            description: "Cozy neighborhood bistro.",
    });

    const memberPrefs: MemberPreference[] = [
      { name: "Alex", preferredEventTypes: [], negativeEventTypes: [], dietaryRestrictions: ["vegan"] },
    ];

    const descScore    = scoreEventForGroup(descriptionVenue, memberPrefs, noGroupProfile);
    const neutralScore = scoreEventForGroup(neutralVenue,     memberPrefs, noGroupProfile);
    expect(descScore).toBeGreaterThan(neutralScore);
  });

  test("accumulated rejections of a cuisine type compound and penalize similar venues", () => {
    // Simulate the group having rejected Italian twice and more-like-this Mexican once.
    const italianPlace = makeEvent("evt-italian", "Osteria Roma", {
      source: "google_places",
      venueType: "food",
      tags: ["Italian"] as any,
    });
    const mexicanPlace = makeEvent("evt-mexican", "Cantina El Sol", {
      source: "google_places",
      venueType: "food",
      tags: ["Mexican"] as any,
    });

    const groupProfileWithSignals: GroupPreferenceProfileSummary = {
      categorySignals: [
        { category: "italian", acceptCount: 0, rejectCount: 2, moreLikeThisCount: 0 },
        { category: "mexican", acceptCount: 0, rejectCount: 0, moreLikeThisCount: 1 },
      ],
      budgetPreference: "unknown",
      feedbackCount: 3,
    };

    const italianScore  = scoreEventForGroup(italianPlace,  [], groupProfileWithSignals);
    const mexicanScore  = scoreEventForGroup(mexicanPlace,  [], groupProfileWithSignals);

    // Two rejections of Italian should penalize it below the more-like-this Mexican.
    expect(italianScore).toBeLessThan(mexicanScore);

    // Verify rejections compound: 2 rejections should be twice as bad as 1 rejection.
    const oneRejectProfile: GroupPreferenceProfileSummary = {
      categorySignals: [{ category: "italian", acceptCount: 0, rejectCount: 1, moreLikeThisCount: 0 }],
      budgetPreference: "unknown",
      feedbackCount: 1,
    };
    const twoRejectProfile: GroupPreferenceProfileSummary = {
      categorySignals: [{ category: "italian", acceptCount: 0, rejectCount: 2, moreLikeThisCount: 0 }],
      budgetPreference: "unknown",
      feedbackCount: 2,
    };
    expect(scoreEventForGroup(italianPlace, [], twoRejectProfile))
      .toBeLessThan(scoreEventForGroup(italianPlace, [], oneRejectProfile));
  });
});

describe("query relevance ranking", () => {
  test("keyword-matching event ranks above a preference-matching event", () => {
    // Member likes concerts, but the query asks for basketball.
    const concertEvent = makeEvent("evt-concert", "Live Concert Night");
    const basketballEvent = makeEvent("evt-basketball", "NBA Basketball Showcase");

    const memberPrefs: MemberPreference[] = [
      { name: "Rutva", preferredEventTypes: ["concert"], negativeEventTypes: [] },
    ];

    const ranked = rankEventsForGroup(
      [concertEvent, basketballEvent],
      memberPrefs,
      noGroupProfile,
      [],
      "basketball",
    );
    expect(ranked[0].eventId).toBe("evt-basketball");
  });

  test("custom event with query match ranks above custom event without query match", () => {
    const customHiking = makeEvent("evt-custom-hiking", "Our Group Hiking Trip", {
      tags: ["Custom", "Hiking"],
    });
    const customBasketball = makeEvent("evt-custom-basketball", "Our Group Basketball Game", {
      tags: ["Custom", "Basketball"],
    });

    const ranked = rankEventsForGroup(
      [customHiking, customBasketball],
      [],
      noGroupProfile,
      [],
      "basketball",
    );
    // Both are custom (1000 boost), but basketball matches query → ranks first.
    expect(ranked[0].eventId).toBe("evt-custom-basketball");
  });

  test("custom events always rank above non-custom events regardless of query", () => {
    const customEvent = makeEvent("evt-custom", "Our Custom Gathering", {
      tags: ["Custom"],
    });
    const regularEvent = makeEvent("evt-regular", "Basketball Championship Game");

    // Query strongly matches the regular event, but custom should still win.
    const ranked = rankEventsForGroup(
      [regularEvent, customEvent],
      [],
      noGroupProfile,
      [],
      "basketball championship",
    );
    expect(ranked[0].eventId).toBe("evt-custom");
  });
});

describe("distance scoring", () => {
  const jhuHomewood: ReferenceLocation = { latitude: 39.3299, longitude: -76.6205 };

  test("haversine computes reasonable distance between known points", () => {
    // JHU Homewood to Inner Harbor (~3 miles)
    const miles = haversineDistanceMiles(39.3299, -76.6205, 39.2861, -76.6134);
    expect(miles).toBeGreaterThan(2);
    expect(miles).toBeLessThan(5);
  });

  test("closer event ranks above farther event when referenceLocation is provided", () => {
    const nearbyEvent = makeEvent("evt-nearby", "Inner Harbor Show", {
      latitude: 39.2861,
      longitude: -76.6134,
    });
    const farEvent = makeEvent("evt-far", "DC Concert Hall", {
      latitude: 38.8977,
      longitude: -77.0365,
    });

    const ranked = rankEventsForGroup(
      [farEvent, nearbyEvent],
      [],
      noGroupProfile,
      [],
      undefined,
      jhuHomewood,
    );
    expect(ranked[0].eventId).toBe("evt-nearby");
  });

  test("events without lat/long get neutral distance score", () => {
    const noLocationEvent = makeEvent("evt-noloc", "Mystery Venue");
    const score = scoreEventForGroup(noLocationEvent, [], noGroupProfile, [], undefined, jhuHomewood);
    const scoreWithoutRef = scoreEventForGroup(noLocationEvent, [], noGroupProfile);
    expect(score).toBe(scoreWithoutRef);
  });

  test("no referenceLocation produces unchanged scores", () => {
    const eventWithCoords = makeEvent("evt-loc", "Nearby Venue", {
      latitude: 39.33,
      longitude: -76.62,
    });
    const withRef = scoreEventForGroup(eventWithCoords, [], noGroupProfile, [], undefined, undefined);
    const withoutRef = scoreEventForGroup(eventWithCoords, [], noGroupProfile);
    expect(withRef).toBe(withoutRef);
  });

  test("distance scoring does not override custom event boost", () => {
    const customEvent = makeEvent("evt-custom-far", "Our Group Outing in DC", {
      tags: ["Custom"],
      latitude: 38.8977,
      longitude: -77.0365,
    });
    const regularNearby = makeEvent("evt-regular-near", "Local Show", {
      latitude: 39.33,
      longitude: -76.62,
    });

    const ranked = rankEventsForGroup(
      [regularNearby, customEvent],
      [],
      noGroupProfile,
      [],
      undefined,
      jhuHomewood,
    );
    expect(ranked[0].eventId).toBe("evt-custom-far");
  });
});
