import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser, createTestChat } from "./test.setup";

const EVENT_ID = "tm-event-reject-1";
const EVENT_ID_2 = "tm-event-reject-2";
const FIXED_NOW_ISO = "2026-03-06T12:00:00Z";


function ticketmasterEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-default",
    name: "Default Event",
    url: "https://ticketmaster.com/event/default",
    dates: { start: { dateTime: "2026-03-07T19:00:00Z" } },
    _embedded: {
      venues: [
        { name: "Test Venue", city: { name: "Baltimore" }, country: { name: "United States Of America" } },
      ],
    },
    ...overrides,
  };
}

function setFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = vi.fn(async (input, init) => handler(input, init)) as typeof globalThis.fetch;
}

async function connectGoogleCalendar(
  t: ReturnType<typeof createTestConvex>,
  userId: import("./_generated/dataModel").Id<"users">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, {
      googleAccessToken: "test-google-access-token",
      googleRefreshToken: "test-google-refresh-token",
      googleTokenExpiry: 4_102_444_800,
    });
  });
}

async function submitFeedback(
  t: ReturnType<typeof createTestConvex>,
  identity: { tokenIdentifier: string },
  args: {
    eventId: string;
    chatId: import("./_generated/dataModel").Id<"chats">;
    feedbackType: "accept" | "reject" | "cancel" | "more-like-this";
  },
) {
  return t.withIdentity(identity).mutation(api.feedback_mutations.submitFeedback, args);
}

describe("triggerRegeneration", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalApiKey = process.env.TICKETMASTER_API_KEY;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TICKETMASTER_API_KEY;
    else process.env.TICKETMASTER_API_KEY = originalApiKey;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("rejects unauthenticated requests", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Chat");

    await expect(
      t.action(api.feedback_regen_action.triggerRegeneration, {
        chatId,
        feedbackType: "reject",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  describe("noop decisions (cancel and accept)", () => {
    test("cancel returns noop without running search", async () => {
      const t = createTestConvex();
      const { identity, userId } = await createTestUser(t);
      await connectGoogleCalendar(t, userId);
      const chatId = await createTestChat(t, identity, "Chat");

      await submitFeedback(t, identity, { eventId: EVENT_ID, chatId, feedbackType: "cancel" });

      const result = await t.withIdentity(identity).action(
        api.feedback_regen_action.triggerRegeneration,
        { chatId, feedbackType: "cancel", eventId: EVENT_ID, city: "Baltimore" },
      );

      expect(result.decision.action).toBe("noop");
      expect(result.rankedEvents).toBeUndefined();
    });

    test("accept returns noop without running search", async () => {
      const t = createTestConvex();
      const { identity, userId } = await createTestUser(t);
      await connectGoogleCalendar(t, userId);
      const chatId = await createTestChat(t, identity, "Chat");

      await submitFeedback(t, identity, { eventId: EVENT_ID, chatId, feedbackType: "accept" });

      const result = await t.withIdentity(identity).action(
        api.feedback_regen_action.triggerRegeneration,
        { chatId, feedbackType: "accept", eventId: EVENT_ID, city: "Baltimore" },
      );

      expect(result.decision.action).toBe("noop");
      expect(result.rankedEvents).toBeUndefined();
    });
  });

  describe("clarify decision (missing calendar)", () => {
    test("returns clarify when no members have Google Calendar connected", async () => {
      const t = createTestConvex();
      const { identity } = await createTestUser(t);
      const chatId = await createTestChat(t, identity, "Chat");

      // No Google Calendar connected → should clarify
      await submitFeedback(t, identity, { eventId: EVENT_ID, chatId, feedbackType: "reject" });

      const result = await t.withIdentity(identity).action(
        api.feedback_regen_action.triggerRegeneration,
        { chatId, feedbackType: "reject", eventId: EVENT_ID, city: "Baltimore" },
      );

      expect(result.decision.action).toBe("clarify");
      expect(result.rankedEvents).toBeUndefined();
    });
  });

  describe("regenerate (exclude mode)", () => {
    test("uses the chat planning location when city is omitted", async () => {
      process.env.TICKETMASTER_API_KEY = "test-key";
      setFetchMock((input) => {
        const url = String(input);
        if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
          return new Response(
            JSON.stringify({ calendars: { primary: { busy: [] } } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.startsWith("https://app.ticketmaster.com/discovery/v2/events.json")) {
          expect(new URL(url).searchParams.get("city")).toBe("Washington, DC");
          return new Response(
            JSON.stringify({
              _embedded: {
                events: [
                  ticketmasterEvent({ id: EVENT_ID, name: "Rejected Event" }),
                  ticketmasterEvent({
                    id: EVENT_ID_2,
                    name: "Fresh Event",
                    dates: { start: { dateTime: "2026-03-08T19:00:00Z" } },
                  }),
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const t = createTestConvex();
      const { identity, userId } = await createTestUser(t);
      await connectGoogleCalendar(t, userId);
      const chatId = await createTestChat(t, identity, "Planning Location Chat");
      await t.withIdentity(identity).mutation(api.chats_mutations.update, {
        chatId,
        planningLocation: "Washington, DC",
      });

      await submitFeedback(t, identity, { eventId: EVENT_ID, chatId, feedbackType: "reject" });

      const result = await t.withIdentity(identity).action(
        api.feedback_regen_action.triggerRegeneration,
        {
          chatId,
          feedbackType: "reject",
          eventId: EVENT_ID,
          keyword: "sports",
          totalEventsInLastSearch: 2,
        },
      );

      expect(result.error).toBeUndefined();
    });
  });

});
