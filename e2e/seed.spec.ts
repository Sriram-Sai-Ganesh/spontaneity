import { test, expect } from "@playwright/test";
import { APP, ensureAuthenticatedShell, newGroupButton } from "./helpers/app";

test.describe("Seed", () => {
  test("app loads with clean state", async ({ page }) => {
    await page.goto(`${APP}/`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ensureAuthenticatedShell(page);

    await expect(newGroupButton(page)).toBeVisible();
  });
});
