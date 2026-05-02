import { describe, expect, test } from "vitest";
import { decideFeedbackAction, type FeedbackConstraints } from "./feedback_decision";

const FULL_CONSTRAINTS: FeedbackConstraints = {
  allMembersHaveCalendar: true,
  hasCityOrKeyword: true,
  hasGroupPreferences: true,
  eventTitle: "Baltimore Orioles vs Red Sox",
};

describe("decideFeedbackAction", () => {
  describe("cancel → noop", () => {
    test("cancel returns noop regardless of constraints", () => {
      expect(decideFeedbackAction("cancel", FULL_CONSTRAINTS)).toEqual({ action: "noop" });
    });

    test("cancel returns noop with no constraints", () => {
      expect(
        decideFeedbackAction("cancel", {
          allMembersHaveCalendar: false,
          hasCityOrKeyword: false,
          hasGroupPreferences: false,
        }),
      ).toEqual({ action: "noop" });
    });
  });

  describe("accept → noop", () => {
    test("accept returns noop regardless of constraints", () => {
      expect(decideFeedbackAction("accept", FULL_CONSTRAINTS)).toEqual({ action: "noop" });
    });

    test("accept returns noop even with no calendar connected", () => {
      expect(
        decideFeedbackAction("accept", {
          allMembersHaveCalendar: false,
          hasCityOrKeyword: false,
          hasGroupPreferences: false,
        }),
      ).toEqual({ action: "noop" });
    });
  });

  describe("reject → regenerate (mode: exclude)", () => {
    test("returns regenerate with mode exclude when all constraints are met", () => {
      expect(decideFeedbackAction("reject", FULL_CONSTRAINTS)).toEqual({
        action: "regenerate",
        mode: "exclude",
      });
    });

    test("returns regenerate when calendar connected and has city", () => {
      expect(
        decideFeedbackAction("reject", {
          allMembersHaveCalendar: true,
          hasCityOrKeyword: true,
          hasGroupPreferences: false,
        }),
      ).toEqual({ action: "regenerate", mode: "exclude" });
    });

    test("returns regenerate when calendar connected and has preferences (no city)", () => {
      expect(
        decideFeedbackAction("reject", {
          allMembersHaveCalendar: true,
          hasCityOrKeyword: false,
          hasGroupPreferences: true,
        }),
      ).toEqual({ action: "regenerate", mode: "exclude" });
    });
  });

  describe("reject → clarify when calendar missing", () => {
    test("returns clarify mentioning Google Calendar", () => {
      const result = decideFeedbackAction("reject", {
        allMembersHaveCalendar: false,
        hasCityOrKeyword: true,
        hasGroupPreferences: true,
      });
      expect(result.action).toBe("clarify");
      expect((result as { action: "clarify"; question: string }).question).toContain(
        "Google Calendar",
      );
    });

    test("calendar check takes priority over missing city/preferences", () => {
      const result = decideFeedbackAction("reject", {
        allMembersHaveCalendar: false,
        hasCityOrKeyword: false,
        hasGroupPreferences: false,
      });
      expect(result.action).toBe("clarify");
      expect((result as { action: "clarify"; question: string }).question).toContain(
        "Google Calendar",
      );
    });
  });

  describe("reject → clarify when no city/keyword and no preferences", () => {
    test("returns clarify asking for event type or city", () => {
      const result = decideFeedbackAction("reject", {
        allMembersHaveCalendar: true,
        hasCityOrKeyword: false,
        hasGroupPreferences: false,
      });
      expect(result.action).toBe("clarify");
      expect((result as { action: "clarify"; question: string }).question).toContain("city");
    });
  });

  describe("reject → always regenerates (pool exhaustion handled downstream)", () => {
    test("regenerates when all constraints met", () => {
      const result = decideFeedbackAction("reject", {
        allMembersHaveCalendar: true,
        hasCityOrKeyword: true,
        hasGroupPreferences: false,
      });
      expect(result.action).toBe("regenerate");
    });
  });

  describe("more-like-this → regenerate (mode: similar)", () => {
    test("returns regenerate with mode similar and event title as hint", () => {
      const result = decideFeedbackAction("more-like-this", FULL_CONSTRAINTS);
      expect(result).toEqual({
        action: "regenerate",
        mode: "similar",
        hint: "Baltimore Orioles vs Red Sox",
      });
    });

    test("returns regenerate with mode similar and undefined hint when no event title", () => {
      const result = decideFeedbackAction("more-like-this", {
        allMembersHaveCalendar: true,
        hasCityOrKeyword: true,
        hasGroupPreferences: false,
      });
      expect(result).toEqual({
        action: "regenerate",
        mode: "similar",
        hint: undefined,
      });
    });

    test("regenerates even when calendar missing (more-like-this is never blocked by calendar)", () => {
      const result = decideFeedbackAction("more-like-this", {
        allMembersHaveCalendar: false,
        hasCityOrKeyword: true,
        hasGroupPreferences: true,
      });
      expect(result.action).toBe("regenerate");
    });

    test("regenerates even with no city/keyword (event title guides the search)", () => {
      const result = decideFeedbackAction("more-like-this", {
        allMembersHaveCalendar: true,
        hasCityOrKeyword: false,
        hasGroupPreferences: false,
        eventTitle: "Comedy Night",
      });
      expect(result).toEqual({
        action: "regenerate",
        mode: "similar",
        hint: "Comedy Night",
      });
    });
  });
});
