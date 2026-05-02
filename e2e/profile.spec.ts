import { test, expect } from "@playwright/test";
import {
  resetClientState,
  openProfileFromSettingsMenu,
  ensureAuthenticatedShell,
  desktopContent,
} from "./helpers/app";

test.describe("Profile / Settings flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("open profile from settings menu", async ({ page }) => {
    await openProfileFromSettingsMenu(page);

    const content = desktopContent(page);
    await expect(content.getByRole("heading", { name: "Profile" })).toBeVisible();
    const nicknameInput = content.locator("#nickname");
    await expect(nicknameInput).toBeVisible({ timeout: 10_000 });
  });

  test("update display name", async ({ page }) => {
    await openProfileFromSettingsMenu(page);

    const content = desktopContent(page);
    const nicknameInput = content.locator("#nickname");
    await expect(nicknameInput).toBeVisible({ timeout: 10_000 });
    await nicknameInput.fill("Test User");
    await content.getByRole("button", { name: "Save nickname" }).click();

    await expect(nicknameInput).toHaveValue("Test User");
  });

  test("nickname persists after reload", async ({ page }) => {
    await openProfileFromSettingsMenu(page);

    const content = desktopContent(page);
    const nicknameInput = content.locator("#nickname");
    await expect(nicknameInput).toBeVisible({ timeout: 10_000 });
    await nicknameInput.fill("Persistent User");
    await content.getByRole("button", { name: "Save nickname" }).click();

    await page.reload();
    await ensureAuthenticatedShell(page);
    await openProfileFromSettingsMenu(page);

    const nicknameInput2 = desktopContent(page).locator("#nickname");
    await expect(nicknameInput2).toBeVisible({ timeout: 10_000 });
    await expect(nicknameInput2).toHaveValue("Persistent User");
  });
});
