import { describe, expect, test } from "vitest";
import {
  newRecommendationsTemplate,
  planAcceptedTemplate,
  eventReminderTemplate,
  shortlistReminderTemplate,
  buildEmail,
} from "./email_templates";

const SITE_URL = "https://example.com";

const baseCtx = {
  groupName: "Weekend Crew",
  eventTitle: "Jazz Night",
  eventDate: "Friday, April 18",
  planUrl: "https://spontaneity.app/plan/123",
};

describe("email_templates", () => {
  describe("newRecommendationsTemplate", () => {
    test("subject includes group name", () => {
      const { subject } = newRecommendationsTemplate(baseCtx, SITE_URL);
      expect(subject).toContain("Weekend Crew");
    });

    test("html includes group name", () => {
      const { html } = newRecommendationsTemplate(baseCtx, SITE_URL);
      expect(html).toContain("Weekend Crew");
    });

    test("html includes CTA link when planUrl provided", () => {
      const { html } = newRecommendationsTemplate(baseCtx, SITE_URL);
      expect(html).toContain("https://spontaneity.app/plan/123");
      expect(html).toContain("View Recommendations");
    });

    test("html omits CTA when no planUrl", () => {
      const { html } = newRecommendationsTemplate({ groupName: "Crew" }, SITE_URL);
      expect(html).not.toContain("View Recommendations");
    });

    test("html includes shared structure (header and footer)", () => {
      const { html } = newRecommendationsTemplate(baseCtx, SITE_URL);
      expect(html).toContain("Spontaneity");
      expect(html).toContain("profile settings");
    });
  });

  describe("planAcceptedTemplate", () => {
    test("subject includes event title", () => {
      const { subject } = planAcceptedTemplate(baseCtx, SITE_URL);
      expect(subject).toContain("Jazz Night");
    });

    test("subject falls back when no event title", () => {
      const { subject } = planAcceptedTemplate({ groupName: "Crew" }, SITE_URL);
      expect(subject).toContain("an event");
    });

    test("html includes group name", () => {
      const { html } = planAcceptedTemplate(baseCtx, SITE_URL);
      expect(html).toContain("Weekend Crew");
    });

    test("html includes event title and date", () => {
      const { html } = planAcceptedTemplate(baseCtx, SITE_URL);
      expect(html).toContain("Jazz Night");
      expect(html).toContain("Friday, April 18");
    });

    test("html includes CTA link", () => {
      const { html } = planAcceptedTemplate(baseCtx, SITE_URL);
      expect(html).toContain("View Plan Details");
      expect(html).toContain("https://spontaneity.app/plan/123");
    });
  });

  describe("eventReminderTemplate", () => {
    test("subject includes event title", () => {
      const { subject } = eventReminderTemplate(baseCtx, SITE_URL);
      expect(subject).toContain("Jazz Night");
    });

    test("subject falls back when no event title", () => {
      const { subject } = eventReminderTemplate({ groupName: "Crew" }, SITE_URL);
      expect(subject).toContain("Your event");
    });

    test("html includes group name, event title and date", () => {
      const { html } = eventReminderTemplate(baseCtx, SITE_URL);
      expect(html).toContain("Weekend Crew");
      expect(html).toContain("Jazz Night");
      expect(html).toContain("Friday, April 18");
    });

    test("html includes CTA link", () => {
      const { html } = eventReminderTemplate(baseCtx, SITE_URL);
      expect(html).toContain("View Event Details");
      expect(html).toContain("https://spontaneity.app/plan/123");
    });
  });

  describe("shortlistReminderTemplate", () => {
    test("uses the still-thinking reminder copy", () => {
      const { subject, html } = shortlistReminderTemplate(baseCtx, SITE_URL);
      expect(subject).toContain("Still thinking");
      expect(html).toContain("Still thinking about this?");
      expect(html).toContain("Review Shortlist");
    });
  });

  describe("buildEmail", () => {
    test("routes new_recommendations correctly", () => {
      const { subject } = buildEmail("new_recommendations", baseCtx, SITE_URL);
      expect(subject).toContain("Weekend Crew");
    });

    test("routes plan_accepted correctly", () => {
      const { subject } = buildEmail("plan_accepted", baseCtx, SITE_URL);
      expect(subject).toContain("Jazz Night");
    });

    test("routes event_reminder correctly", () => {
      const { subject } = buildEmail("event_reminder", baseCtx, SITE_URL);
      expect(subject).toContain("Reminder");
    });

    test("routes shortlist_reminder correctly", () => {
      const { subject } = buildEmail("shortlist_reminder", baseCtx, SITE_URL);
      expect(subject).toContain("Still thinking");
    });
  });
});
