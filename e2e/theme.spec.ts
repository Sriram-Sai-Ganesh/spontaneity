import { test, expect } from "@playwright/test";
import {
  resetClientState,
  openThemeDialog,
  ensureAuthenticatedShell,
  htmlElement,
} from "./helpers/app";

test.describe.configure({ timeout: 60_000 });

test.describe("Theme dialog", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("theme dialog shows all mode options", async ({ page }) => {
    await openThemeDialog(page);

    // The ThemeSelectorRows render as role="button" with the label text
    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Light", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dark", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Random/ }),
    ).toBeVisible();
  });

  test("switch to light theme via dialog", async ({ page }) => {
    await openThemeDialog(page);

    await page
      .getByRole("button", { name: "Light", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(htmlElement(page)).toHaveClass(/\blight\b/);
    await expect(htmlElement(page)).not.toHaveClass(/\bdark\b/);
  });

  test("switch to dark theme via dialog", async ({ page }) => {
    await openThemeDialog(page);

    await page
      .getByRole("button", { name: "Dark", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(htmlElement(page)).toHaveClass(/\bdark\b/);
    await expect(htmlElement(page)).not.toHaveClass(/\blight\b/);
  });

  test("dialog closes after saving", async ({ page }) => {
    await openThemeDialog(page);

    await page
      .getByRole("button", { name: "Dark", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("dialog closes on Cancel without applying changes", async ({
    page,
  }) => {
    await openThemeDialog(page);

    await page
      .getByRole("button", { name: "Dark", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("dialog")).not.toBeVisible();
    // Default is system, so the class should NOT have forced dark
    const classes = await htmlElement(page).getAttribute("class");
    const hasBoth =
      /\blight\b/.test(classes ?? "") && /\bdark\b/.test(classes ?? "");
    expect(hasBoth).toBe(false);
  });
});

test.describe("Theme persistence", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("selected theme persists across page reload", async ({ page }) => {
    await openThemeDialog(page);

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Save" }).click();

    // Wait for the dialog to close and the dark class to be applied
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(htmlElement(page)).toHaveClass(/\bdark\b/, { timeout: 5_000 });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("theme")), {
        timeout: 5_000,
      })
      .toBe(JSON.stringify("dark"));

    await page.reload();
    await ensureAuthenticatedShell(page);

    await expect(htmlElement(page)).toHaveClass(/\bdark\b/, { timeout: 10_000 });
  });

  test("default theme is system when no preference is stored", async ({
    page,
  }) => {
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    if (stored !== null) {
      expect(stored).toBe(JSON.stringify("system"));
    }

    const classes = await htmlElement(page).getAttribute("class");
    const hasTheme = /\b(light|dark)\b/.test(classes ?? "");
    expect(hasTheme).toBe(true);
  });
});

test.describe("System theme preference", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("system theme follows emulated dark preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await ensureAuthenticatedShell(page);

    await expect(htmlElement(page)).toHaveClass(/\bdark\b/);
    await expect(htmlElement(page)).toHaveCSS("color-scheme", "dark");
  });

  test("system theme follows emulated light preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await ensureAuthenticatedShell(page);

    await expect(htmlElement(page)).toHaveClass(/\blight\b/);
    await expect(htmlElement(page)).toHaveCSS("color-scheme", "light");
  });

  test("explicit theme overrides system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await ensureAuthenticatedShell(page);

    await openThemeDialog(page);
    await page
      .getByRole("button", { name: "Light", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(htmlElement(page)).toHaveClass(/\blight\b/);
    await expect(htmlElement(page)).not.toHaveClass(/\bdark\b/);
  });
});

test.describe("Corrupted storage", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("invalid localStorage value falls back to system", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("theme", JSON.stringify("invalid-value")),
    );
    await page.reload();
    await ensureAuthenticatedShell(page);

    const classes = await htmlElement(page).getAttribute("class");
    const hasTheme = /\b(light|dark)\b/.test(classes ?? "");
    expect(hasTheme).toBe(true);
  });

  test("malformed JSON in localStorage falls back to system", async ({
    page,
  }) => {
    await page.evaluate(() =>
      localStorage.setItem("theme", "not-valid-json{{{"),
    );
    await page.reload();
    await ensureAuthenticatedShell(page);

    const classes = await htmlElement(page).getAttribute("class");
    const hasTheme = /\b(light|dark)\b/.test(classes ?? "");
    expect(hasTheme).toBe(true);
  });
});
