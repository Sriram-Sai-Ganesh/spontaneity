import { test, expect } from "@playwright/test";
import {
  resetClientState,
  newGroupButton,
  createGroupViaSidebar,
  ensureAuthenticatedShell,
  APP,
} from "./helpers/app";

test.describe("Group flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test("home page loads with empty state", async ({ page }) => {
    await expect(newGroupButton(page)).toBeVisible();
  });

  test("create group via New Group button", async ({ page }) => {
    await newGroupButton(page).click();

    // The AddChatDialog opens — fill in a name and create
    await page.getByPlaceholder("Group name").fill("My Group");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/groups\/.+/);
  });

  test("group appears in sidebar after creation", async ({ page }) => {
    await createGroupViaSidebar(page, { name: "Sidebar Test" });

    await expect(
      page
        .getByRole("complementary")
        .getByRole("listitem")
        .filter({ hasText: "Sidebar Test" }),
    ).toBeVisible();
  });

  test("groups persist after reload", async ({ page }) => {
    await createGroupViaSidebar(page, { name: "Persistent Group" });

    await expect(
      page
        .getByRole("complementary")
        .getByRole("listitem")
        .filter({ hasText: "Persistent Group" }),
    ).toBeVisible();

    await page.reload();
    await ensureAuthenticatedShell(page);

    await expect(
      page
        .getByRole("complementary")
        .getByRole("listitem")
        .filter({ hasText: "Persistent Group" }),
    ).toBeVisible();
  });

  test("edit group title", async ({ page }) => {
    await createGroupViaSidebar(page, { name: "Original Name" });

    // Scope to the sidebar listitem to avoid duplicate "Edit group" buttons
    await page
      .getByRole("complementary")
      .getByRole("listitem")
      .filter({ hasText: "Original Name" })
      .getByLabel("Edit group")
      .click();

    await expect(
      page.getByRole("heading", { name: "Edit Group" }),
    ).toBeVisible();

    const input = page.getByPlaceholder("Group name");
    await input.clear();
    await input.fill("Renamed Group");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByRole("complementary").getByText("Renamed Group"),
    ).toBeVisible();
  });

  test("delete group with confirmation", async ({ page }) => {
    await createGroupViaSidebar(page, { name: "Doomed Group" });

    await page
      .getByRole("complementary")
      .getByRole("listitem")
      .filter({ hasText: "Doomed Group" })
      .getByLabel("Delete group")
      .click();

    await expect(
      page.getByText("Delete this group?"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();

    await expect(
      page
        .getByRole("complementary")
        .getByRole("listitem")
        .filter({ hasText: "Doomed Group" }),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("search groups", async ({ page }) => {
    // Create first group
    await createGroupViaSidebar(page, { name: "React Help" });

    // Navigate home and create second group
    await page.goto(`${APP}/`);
    await ensureAuthenticatedShell(page);
    await createGroupViaSidebar(page, { name: "Python Tips" });

    // Wait for both to appear in sidebar
    await expect(
      page.getByRole("complementary").getByText("React Help"),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Python Tips"),
    ).toBeVisible();

    // Search for "React"
    await page.getByPlaceholder("Search groups...").fill("React");

    await expect(
      page.getByRole("complementary").getByText("React Help"),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Python Tips"),
    ).not.toBeVisible();
  });
});
