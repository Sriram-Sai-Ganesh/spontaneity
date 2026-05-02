import { expect, type Page } from "@playwright/test";

/** Vite `base` is `/team-05/` — use this prefix for `goto`. */
export const APP = "/team-05";

/**
 * Complete (or skip) the freeform preferences onboarding dialog.
 *
 * The dialog opens when `userEventPreferences` is null for the current user.
 * We fill in a city on step 0, then click the dialog X close button.
 * The close triggers `handleSkip` which saves the city and empty preferences
 * to Convex — no AI classification API call needed. This is fast and reliable.
 *
 * If the dialog is not visible within 8 s the function returns silently.
 */
export async function completeOnboardingIfPresent(page: Page) {
  const dialog = page
    .locator('[data-slot="dialog-content"]')
    .filter({ hasText: "Welcome to Spontaneity!" });

  const dialogVisible = await dialog
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (!dialogVisible) return;

  // Fill the city (required — handleSkip returns early if city is empty)
  await dialog.locator("#defaultCity").fill("New York");

  // Click the X close button on the dialog. This triggers handleOpenChange →
  // handleSkip which saves city + empty preferences, then calls onComplete.
  await dialog.locator('[data-slot="dialog-close"]').click();

  // Wait for the dialog to close (handleSkip is async — runs 2 mutations)
  await dialog.waitFor({ state: "hidden", timeout: 15_000 });
}

/**
 * Wait for the authenticated app shell (sidebar with "New Group" button).
 * Also completes the onboarding dialog if it appears.
 */
export async function ensureAuthenticatedShell(page: Page) {
  await completeOnboardingIfPresent(page);
  await expect(
    page
      .getByRole("complementary")
      .getByRole("button", { name: "New Group", exact: true }),
  ).toBeVisible({ timeout: 45_000 });
}

/**
 * Clear client-side storage and reload, then wait for the app shell.
 */
export async function resetClientState(page: Page) {
  await page.goto(`${APP}/`);
  await page.evaluate(() => {
    localStorage.clear();
    const request = indexedDB.deleteDatabase("chat-app");
    return new Promise<void>((resolve) => {
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await ensureAuthenticatedShell(page);
}

/**
 * Create a group through the sidebar "New Group" button and the AddChatDialog.
 * Returns after URL navigates to `/groups/<id>`.
 */
export async function createGroupViaSidebar(
  page: Page,
  opts: { name: string; location?: string } = { name: "Test Group" },
) {
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New Group", exact: true })
    .click();

  // AddChatDialog should open
  await expect(
    page.getByRole("heading", { name: "New Group" }),
  ).toBeVisible();

  await page.getByPlaceholder("Group name").fill(opts.name);

  if (opts.location) {
    await page.getByLabel("Group Location").fill(opts.location);
  }

  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/groups\/.+/, { timeout: 15_000 });
}

/** Open the settings dropdown menu via the header avatar. */
export async function openSettingsMenu(page: Page) {
  await page.getByRole("button", { name: "Open settings" }).click();
}

/** Open the Theme dialog (via settings menu → Theme menuitem). */
export async function openThemeDialog(page: Page) {
  await openSettingsMenu(page);
  await page.getByRole("menuitem", { name: "Theme" }).click();
  await expect(
    page.getByRole("heading", { name: "Theme", exact: true }),
  ).toBeVisible();
}

/** Navigate to the profile page via the settings menu. */
export async function openProfileFromSettingsMenu(page: Page) {
  await openSettingsMenu(page);
  await page.getByRole("menuitem", { name: "View profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Profile" }),
  ).toBeVisible();
}

/** Sidebar "New Group" button locator (scoped to `complementary`). */
export function newGroupButton(page: Page) {
  return page
    .getByRole("complementary")
    .getByRole("button", { name: "New Group", exact: true });
}

/** `<html>` element locator for theme assertions. */
export function htmlElement(page: Page) {
  return page.locator("html");
}

/**
 * Click "Find available events" once, then wait for event cards to appear.
 *
 * The component has reactive subscriptions (`nonTicketStats`, `venueCacheReady`)
 * that auto-fetch when the warm cache populates Google Places venues in the DB.
 * Clicking the button multiple times would cancel in-flight auto-fetches via
 * the `fetchSequence` counter, so we click once and let the reactive flow work.
 *
 * Returns `true` if at least one event card appeared, `false` otherwise.
 */
export async function searchEventsWithRetry(
  page: Page,
  { cardTimeoutMs = 120_000 } = {},
): Promise<boolean> {
  const findButton = page.getByRole("button", {
    name: "Find available events",
  });
  const cardLocator = page.getByTestId("event-card");

  await findButton.click();

  return cardLocator
    .first()
    .waitFor({ state: "visible", timeout: cardTimeoutMs })
    .then(() => true)
    .catch(() => false);
}

/**
 * Desktop content area locator.
 *
 * The layout renders content twice (mobile `md:hidden` + desktop `md:grid`).
 * Playwright picks the first DOM match by default, which is the hidden mobile
 * instance. Scope interactive locators through this helper to target the
 * visible desktop instance.
 */
export function desktopContent(page: Page) {
  return page.locator('[class*="md:grid"] main');
}
