import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createTestChat, createTestConvex, createTestUser } from "./test.setup";

async function connectGoogleCalendar(
  t: ReturnType<typeof createTestConvex>,
  userId: Id<"users">,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, {
      googleAccessToken: "test-google-access-token",
      googleRefreshToken: "test-google-refresh-token",
      googleTokenExpiry: 4_102_444_800,
    });
  });
}

describe("feedback_action.resolveFeedbackDecision", () => {
  test("treats the user's saved city as valid location context for reject regeneration", async () => {
    const t = createTestConvex();
    const { identity, userId } = await createTestUser(t);
    await connectGoogleCalendar(t, userId);
    const chatId = await createTestChat(t, identity, "Feedback Chat");

    await t.withIdentity(identity).mutation(api.users_mutations.updateMyProfile, {
      city: "Chicago, IL",
    });

    await expect(
      t.action(internal.feedback_action.resolveFeedbackDecision, {
        chatId,
        userId,
        feedbackType: "reject",
      }),
    ).resolves.toEqual({
      action: "regenerate",
      mode: "exclude",
    });
  });
});
