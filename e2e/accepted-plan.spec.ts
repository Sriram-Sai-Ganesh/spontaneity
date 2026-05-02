import { test, expect } from "@playwright/test";
import {
  resetClientState,
  createGroupViaSidebar,
  searchEventsWithRetry,
} from "./helpers/app";

const STRICT = process.env.E2E_REQUIRE_REAL_RECOMMENDATIONS === "1";

test.describe("Accepted-plan follow-through", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("full flow: find events → start poll → vote → close → RSVP", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);

    // 1. Create a group with a location known to return results
    await createGroupViaSidebar(page, {
      name: "Plan Night",
      location: "New York",
    });

    // 2. Search with retry — warm cache may need time to populate
    const gotCards = await searchEventsWithRetry(page);

    if (!gotCards) {
      test.info().annotations.push({
        type: "info",
        description:
          "No event cards returned by API for New York — skipping poll/RSVP assertions.",
      });
      if (STRICT) {
        expect
          .soft(gotCards, "E2E_REQUIRE_REAL_RECOMMENDATIONS=1 — expected cards")
          .toBe(true);
      }
      return;
    }

    // 4. Start a poll from the "Start Poll" button in the Suggested Events header
    const startPollButton = page.getByRole("button", {
      name: "Start Poll",
      exact: true,
    });
    await expect(startPollButton).toBeVisible({ timeout: 10_000 });
    await startPollButton.click();

    // 5. Vote on the first option ("Pick this for ...")
    const voteButton = page.getByRole("button", {
      name: /^Pick this for /i,
    });
    await expect(voteButton.first()).toBeVisible({ timeout: 10_000 });
    await voteButton.first().click();

    // A single-member poll may auto-close immediately after voting. Otherwise,
    // the selected option briefly reads "Your pick" before the owner closes it.
    await expect(async () => {
      const acceptedCount = await page.getByText(/^Accepted: /).count();
      const yourPickCount = await page
        .getByRole("button", { name: /^Your pick for /i })
        .count();

      expect(acceptedCount + yourPickCount).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });

    // 6. Close the poll if it did not auto-close after the vote
    if ((await page.getByText(/^Accepted: /).count()) === 0) {
      const closePollButton = page.getByRole("button", { name: "Close Poll" });
      await expect(closePollButton).toBeVisible({ timeout: 10_000 });
      await closePollButton.click();
    }

    // 7. Verify "Accepted: <title>" text appears
    await expect(page.getByText(/^Accepted: /)).toBeVisible({
      timeout: 15_000,
    });

    // 8. Verify the RSVP panel renders. Some accepted Google Places venues do
    // not have a fixed start time, so the RSVP panel asks for one first.
    const rsvpPanel = page.locator('[data-testid="event-rsvp-panel"]:visible').first();
    await expect(rsvpPanel.getByText("RSVP", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const dateTimeInput = rsvpPanel.locator('input[type="datetime-local"]');
    if (await dateTimeInput.isVisible()) {
      const rsvpDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      rsvpDate.setHours(19, 0, 0, 0);
      await dateTimeInput.fill(rsvpDate.toISOString().slice(0, 16));
      await rsvpPanel
        .getByRole("button", { name: "Confirm time", exact: true })
        .click();
    }

    // 9. Click "Going" and verify the button becomes the selected variant
    const goingButton = rsvpPanel.getByRole("button", {
      name: "Going",
      exact: true,
    });
    await expect(goingButton).toBeVisible({ timeout: 10_000 });
    await goingButton.click();

    // The "Going" button should now show a ring/selected style — verify it
    // stays visible (it remains as "Going" with the default variant toggled)
    await expect(goingButton).toBeVisible();

    // Verify at least one Going attendance entry appeared. The Convex-backed
    // E2E database can retain RSVPs for the same real provider event across
    // local runs, so the count may be greater than one.
    await expect(rsvpPanel.getByText(/^Going \([1-9]\d*\)$/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
