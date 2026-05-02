import { test, expect } from "@playwright/test";
import {
  resetClientState,
  createGroupViaSidebar,
  searchEventsWithRetry,
} from "./helpers/app";

/**
 * Whether we require the real API to return at least one event card.
 * Default: false (soft pass if 0 events — structural-only check).
 * Set E2E_REQUIRE_REAL_RECOMMENDATIONS=1 for strict mode.
 */
const STRICT = process.env.E2E_REQUIRE_REAL_RECOMMENDATIONS === "1";

test.describe("Recommendation rendering", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("right-panel Find available events shows Suggested Events section", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(180_000);

    await createGroupViaSidebar(page, {
      name: "NYC Plans",
      location: "New York",
    });

    // The "Suggested Events" section should be in the right panel
    await expect(page.getByText("Suggested Events")).toBeVisible({
      timeout: 10_000,
    });

    // Search with retry — warm cache may need time to populate Google Places
    const gotCards = await searchEventsWithRetry(page);

    if (!gotCards) {
      test.info().annotations.push({
        type: "info",
        description:
          "No event cards rendered — API returned 0 results for New York. Structural check passed.",
      });
      if (STRICT) {
        expect(
          0,
          "E2E_REQUIRE_REAL_RECOMMENDATIONS=1 — expected at least 1 event card",
        ).toBeGreaterThan(0);
      }
    } else {
      const firstTitle = page.getByTestId("event-card").first().locator("p").first();
      await expect(firstTitle).not.toHaveText("");
    }
  });

  test("chat dropdown Find available events opens dialog", async ({
    page,
  }) => {
    await createGroupViaSidebar(page, {
      name: "Trip",
      location: "New York",
    });

    await page.getByRole("button", { name: "Group actions" }).click();
    await page
      .getByRole("menuitem", { name: "Find available events" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Find Available Events" }),
    ).toBeVisible();

    // The dialog should have the main action button
    await expect(
      page.getByRole("button", { name: /Find events for/ }),
    ).toBeVisible();
  });

  test("Find Events button appears in empty Suggested Events panel", async ({
    page,
  }) => {
    await createGroupViaSidebar(page, {
      name: "Fresh Group",
      location: "New York",
    });

    // The empty state should show the Find Events CTA
    const findEventsButton = page.getByRole("button", {
      name: "Find Events",
    });
    await expect(findEventsButton).toBeVisible({ timeout: 15_000 });
  });
});
