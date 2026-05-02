import { describe, expect, it, vi } from "vitest";
import {
  buildCalendarIcsPayload,
  buildMultiEventCalendarIcs,
  downloadCalendarIcs,
} from "./calendar-ics";

describe("calendar ics helpers", () => {
  it("builds a valid ics payload for an event with a start time", () => {
    const payload = buildCalendarIcsPayload({
      eventId: "evt-1",
      title: "Late Night Jazz",
      startTime: "2026-05-01T19:00:00.000Z",
      description: "A good fit for the group",
      venueName: "Union Hall",
      venueCity: "Baltimore",
      venueCountry: "US",
      url: "https://example.com/jazz",
      source: "ticketmaster",
    });

    expect(payload).not.toBeNull();
    expect(payload!.filename).toBe("late-night-jazz.ics");
    expect(payload!.ics).toContain("BEGIN:VCALENDAR");
    expect(payload!.ics).toContain("SUMMARY:Late Night Jazz");
    expect(payload!.ics).toContain("LOCATION:Union Hall\\, Baltimore\\, US");
    expect(payload!.ics).toContain("DESCRIPTION:A good fit for the group");
    expect(payload!.ics).toContain("URL:https://example.com/jazz");
  });

  it("returns null when an event is missing a valid start time", () => {
    expect(
      buildCalendarIcsPayload({
        eventId: "evt-1",
        title: "Late Night Jazz",
        startTime: null,
      }),
    ).toBeNull();

    expect(
      buildCalendarIcsPayload({
        eventId: "evt-1",
        title: "Late Night Jazz",
        startTime: "not-a-date",
      }),
    ).toBeNull();
  });

  it("builds a valid ics payload with multiple events", () => {
    const events = [
      {
        eventId: "evt-1",
        title: "Weekly Trivia",
        startTime: "2026-05-01T19:00:00.000Z",
        description: "Week 1",
      },
      {
        eventId: "evt-2",
        title: "Weekly Trivia",
        startTime: "2026-05-08T19:00:00.000Z",
        description: "Week 2",
      },
    ];

    const payload = buildMultiEventCalendarIcs(events, "Weekly Trivia");

    expect(payload).not.toBeNull();
    expect(payload!.filename).toBe("weekly-trivia.ics");
    expect(payload!.ics).toContain("BEGIN:VCALENDAR");
    expect(payload!.ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(payload!.ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(payload!.ics).toContain("UID:evt-1@spontaneity.ai");
    expect(payload!.ics).toContain("UID:evt-2@spontaneity.ai");
    expect(payload!.ics).toContain("END:VCALENDAR");
  });

  it("returns null when all events have no valid start time", () => {
    const payload = buildMultiEventCalendarIcs(
      [{ eventId: "evt-1", title: "No Time", startTime: null }],
      "No Time",
    );
    expect(payload).toBeNull();
  });

  it("skips events with invalid start times and includes valid ones", () => {
    const payload = buildMultiEventCalendarIcs(
      [
        { eventId: "evt-1", title: "Good", startTime: "2026-05-01T19:00:00.000Z" },
        { eventId: "evt-2", title: "Bad", startTime: null },
      ],
      "Mixed",
    );

    expect(payload).not.toBeNull();
    expect(payload!.ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(payload!.ics).toContain("UID:evt-1@spontaneity.ai");
  });

  it("downloads the generated ics payload", () => {
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test");
    const revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCalendarIcs({
      ics: "BEGIN:VCALENDAR",
      filename: "event.ics",
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test");

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
