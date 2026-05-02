import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mockSend } };
  }),
}));

beforeEach(() => {
  mockSend.mockReset();
});

function buildShortlistEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-shortlist-1",
    title: "Jazz Night",
    description: "A good candidate",
    startTime: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(),
    venueName: "Union Hall",
    venueCity: "Baltimore",
    venueNeighborhood: null,
    venueCountry: "US",
    formattedAddress: null,
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    source: "ticketmaster",
    url: "https://example.com/jazz-night",
    image: null,
    tags: ["Concert" as const],
    status: "onsale" as const,
    budgetBucket: "medium" as const,
    genre: "Jazz",
    venueType: "activity" as const,
    openHours: null,
    ...overrides,
  };
}

async function addMember(
  t: ReturnType<typeof createTestConvex>,
  ownerIdentity: { subject: string; tokenIdentifier: string },
  memberIdentity: { subject: string; tokenIdentifier: string },
  chatId: Id<"chats">,
) {
  const invite = await t
    .withIdentity(ownerIdentity)
    .mutation(api.chats_mutations.createInvite, { chatId });
  await t
    .withIdentity(memberIdentity)
    .mutation(api.chats_mutations.joinWithInvite, { token: invite.token });
}

describe("event shortlists", () => {
  test("shortlists and removes a recommendation candidate", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);
    const chatId = await createTestChat(t, identity, "Shortlist Chat");

    const shortlistId = await t
      .withIdentity(identity)
      .mutation(api.event_shortlists_mutations.shortlistEvent, {
        chatId,
        event: buildShortlistEvent(),
      });

    const listed = await t
      .withIdentity(identity)
      .query(api.event_shortlists_queries.listForChat, { chatId });
    expect(listed).toHaveLength(1);
    expect(listed[0]._id).toBe(shortlistId);
    expect(listed[0].event.title).toBe("Jazz Night");

    await t.withIdentity(identity).mutation(api.event_shortlists_mutations.removeShortlist, {
      chatId,
      eventId: "evt-shortlist-1",
    });

    const afterRemove = await t
      .withIdentity(identity)
      .query(api.event_shortlists_queries.listForChat, { chatId });
    expect(afterRemove).toEqual([]);
  });

  test("sends shortlist reminder emails to chat members", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-shortlist" }, error: null });

    const t = createTestConvex();
    const { userId: ownerId, identity: ownerIdentity } = await createTestUser(t);
    const { userId: memberId, identity: memberIdentity } = await createTestUser(t);
    const chatId = await createTestChat(t, ownerIdentity, "Shortlist Chat");
    await addMember(t, ownerIdentity, memberIdentity, chatId);

    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { email: "owner@example.com" });
      await ctx.db.patch(memberId, { email: "member@example.com" });
    });

    const shortlistId = await t
      .withIdentity(ownerIdentity)
      .mutation(api.event_shortlists_mutations.shortlistEvent, {
        chatId,
        event: buildShortlistEvent(),
      });

    await t.action(internal.email_notifications.sendShortlistReminderEmails, {
      shortlistId,
    });

    const logs = await t.run(async (ctx) => ctx.db.query("emailLogs").collect());
    const reminderLogs = logs.filter((log) => log.notificationType === "shortlist_reminder");
    expect(reminderLogs).toHaveLength(2);
    expect(reminderLogs.some((log) => log.userId === ownerId)).toBe(true);
    expect(reminderLogs.some((log) => log.userId === memberId)).toBe(true);

    const row = await t.query(internal.event_shortlists_queries.getByIdInternal, {
      shortlistId,
    });
    expect(row?.reminderSentAt).toBeGreaterThan(0);
  });
});
