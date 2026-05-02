# AI-Assisted Testing Guide

This guide walks you through using Claude Code to write and maintain tests. It complements the [Testing](testing.md) guide, which explains how the test infrastructure works. This one covers the AI-assisted workflow for creating tests.

## Prerequisites

- Claude Code installed and working
- The dev server runs: `pnpm run dev` (or `pnpm run dev:frontend` for frontend only)
- Playwright browsers installed: `npx playwright install chromium`
- You've read [Testing](testing.md) to understand the test layers

## Two Kinds of AI-Assisted Testing

**Unit and integration tests** — Ask Claude directly. It uses the `frontend-testing` skill to generate Vitest tests that follow the project's patterns.

**E2E tests** — Use the Playwright agents. Three specialist agents plan, generate, and fix browser tests.

## Writing Unit and Integration Tests

For stores, hooks, and components, just ask Claude:

```plaintext
> Write tests for the bookmarks store
```

Claude loads the `frontend-testing` skill, reads the store implementation, and generates a test file at `src/bookmarks/store/__tests__/bookmark.test.ts` following the project's patterns — store reset in `beforeEach`, test helpers for data, observable behavior assertions.

The same works for hooks and components:

```plaintext
> Write tests for the useQueryBookmarks hook
> Write tests for the BookmarkButton component
```

Claude picks the right test pattern (store test, `renderHook`, or `render` + `userEvent`) based on what you're testing.

## The Playwright Agent Pipeline

Three agents in `.claude/agents/` handle E2E test creation and maintenance. Claude auto-dispatches to the right agent based on what you ask, or you can request one explicitly.

| Agent         | What it does                                                   |
| ------------- | -------------------------------------------------------------- |
| **Planner**   | Reads source code and existing tests, writes a structured plan |
| **Generator** | Takes a test plan, writes `.spec.ts` files, verifies they pass |
| **Healer**    | Runs failing tests, diagnoses errors, fixes the code           |

### Step 1: Plan

```plaintext
> Plan E2E tests for the theme toggle feature
```

Claude dispatches to the planner agent, which:

1. Reads the relevant source files (components, hooks, pages)
2. Reads existing E2E tests to understand what's already covered
3. Reads the seed file (`e2e/seed.spec.ts`) for the setup pattern
4. Writes a structured test plan to `playwright-specs/` (e.g., `playwright-specs/theme-toggle.plan.md`)

Review the plan before generating tests. Remove scenarios you don't need, add ones the agent missed, and adjust expected behaviors.

### Step 2: Generate

```plaintext
> Generate E2E tests from playwright-specs/theme-toggle.plan.md
```

Claude dispatches to the generator agent, which:

1. Reads the test plan and the seed file
2. Reads existing test files to match the project's style
3. Writes the test file (e.g., `e2e/theme-toggle.spec.ts`)
4. Runs the test with `npx playwright test` to verify it passes
5. Iterates if the test fails — reads errors, fixes code, reruns

### Step 3: Heal

```plaintext
> Fix the failing E2E tests
```

Claude dispatches to the healer agent, which:

1. Runs all E2E tests with `npx playwright test`
2. For each failure, reads the error output and the test file
3. Diagnoses the root cause (selector changed, timing issue, app behavior changed)
4. Fixes the test code and reruns to verify
5. If a test can't be fixed, marks it `test.fixme()` with a comment

### The Full Pipeline

For a new feature with no existing E2E tests, you can ask for all three steps:

```plaintext
> Plan and generate E2E tests for the theme toggle feature, then fix any failures
```

## Hand-Written vs Agent-Generated Tests

The project has both:

- **Hand-written**: `e2e/chat-flow.spec.ts`, `e2e/message-flow.spec.ts`, `e2e/settings-flow.spec.ts` — maintained manually
- **Agent-generated**: Created by the generator agent, healed by the healer agent

Both run together with `pnpm run test:e2e`. The agents don't touch hand-written tests.

## When to Use What

| Situation                           | Approach                                    |
| ----------------------------------- | ------------------------------------------- |
| New store or hook                   | Ask Claude directly for unit tests          |
| New component                       | Ask Claude for component tests with RTL     |
| New feature needs E2E coverage      | Ask Claude to plan and generate E2E tests   |
| Specific user journey to test       | Ask Claude to plan, then generate from plan |
| E2E tests broke after a code change | Ask Claude to fix the failing E2E tests     |
| Quick smoke test for a small change | Write a focused test manually or ask Claude |

## Tips

**Review generated test plans.** The planner reads source code thoroughly, but it doesn't know your requirements. Cut scenarios that test the obvious, add ones that test your edge cases.

**Generate one feature at a time.** The generator works best with a focused test plan. Don't ask it to cover the entire app in one go.

**Run tests locally before pushing.** `pnpm run test:e2e` runs all E2E tests headless. Use `pnpm run test:e2e:ui` to watch them run in a browser if something looks wrong.

**The healer is not magic.** It fixes selector changes, timing issues, and assertion mismatches. It won't fix tests that are fundamentally testing the wrong thing. If the healer marks a test `test.fixme()`, read the comment — it might reveal a real bug.
