# Testing Guide

This project has two separate testing systems: Vitest for unit/integration tests and Playwright for end-to-end (E2E) tests.

## Vitest (Unit and Integration Tests)

These are the fast tests. They run without a real browser — Vitest uses **jsdom**, a JavaScript simulation of a browser DOM. It's enough for React to render into, but nothing actually displays on screen.

### How it works

1. You run `pnpm run test`
2. Vitest reads `vitest.config.ts`, which merges the existing Vite config (so path aliases like `@/` just work) and sets jsdom as the environment
3. Before any test runs, `src/test/setup.ts` patches the fake environment:
   - Stubs localStorage with a full Storage implementation (jsdom's proxy-based version doesn't support all methods)
   - Stubs `ResizeObserver` (jsdom doesn't have it, but Radix UI needs it)
   - Makes `crypto.randomUUID()` return predictable values like `test-uuid-1`, `test-uuid-2`
4. After each test, setup cleans up — clears React, empties storage, resets UUIDs. Every test starts fresh.

### The three layers

**Store tests** (e.g., `chat.test.ts`) don't need React at all. They import store functions (`addChat`, `removeChat`), call them, and check the store's value. Pure input/output.

**Hook tests** (e.g., `use-query-chats.test.ts`) use `renderHook` from React Testing Library. This creates a tiny invisible React component that runs the hook, so you can check `result.current.data` without any UI.

**Component tests** (e.g., `chat-list.test.tsx`) use `render` to mount a real React component into jsdom, then `screen.getByText("...")` to check what's "visible." They mock external dependencies (router, toast) so the component runs in isolation.

### Helper factories

`src/test/helpers.ts` provides `createTestChat()` and `createTestMessage()`. These produce valid test data with sensible defaults — tests only override the fields they care about:

```ts
const chat = createTestChat({ title: "My Chat" });
// _id, _creationTime are auto-generated
```

## Playwright (End-to-End Tests)

These are the slow tests. Playwright opens a real Chromium browser and clicks around the running app like an actual user would.

### What happens when you run `pnpm run test:e2e`

1. Playwright reads `playwright.config.ts`
2. It sees the `webServer` block and starts `pnpm run dev:frontend` automatically, waiting until `http://127.0.0.1:5173` responds
3. It launches headless Chromium (no visible window)
4. It runs each test file in `e2e/`
5. When done, it kills the dev server and the browser

You don't need to start the app yourself.

### How tests are structured

Every test file starts with a `beforeEach` that navigates to `/`, clears localStorage, and reloads. This means every test starts with a blank app.

```ts
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
```

That `page` object is a real browser tab.

### How tests find elements

Tests use accessibility queries, not CSS selectors:

- `page.getByRole("button", { name: "New Chat" })` — find a button by its label
- `page.getByPlaceholder("Ask anything...")` — find an input by its placeholder
- `page.getByLabel("Gemini API Key")` — find an input by its associated label
- `page.getByText("No chats yet...")` — find any element by text content

This means if you change a button's color, CSS class, or position on the page, the test still passes. It only breaks if the actual behavior changes.

Playwright also auto-waits. If a URL takes 500ms to change after a click, it waits. No `setTimeout` hacks.

### The seed file

`seed.spec.ts` is the simplest test — it just checks the app loads with clean state. It exists mainly as a reference for the AI agents. When Claude Code writes new E2E tests, the planner agent reads this file to understand the app's starting state.

### The test files

- `chat-flow.spec.ts` — create, rename, delete, and search chats
- `message-flow.spec.ts` — send messages, verify persistence after reload
- `settings-flow.spec.ts` — open settings, update fields, verify persistence

## AI-Assisted Testing

Three Claude Code agents in `.claude/agents/` use Playwright's MCP server to help write and maintain E2E tests:

- **playwright-test-planner** — you describe what you want to test, it opens the app in a real browser, explores it, and writes a test plan
- **playwright-test-generator** — takes a plan and writes the actual Playwright test code, using the seed file for setup context
- **playwright-test-healer** — when a test fails, it runs the test, reads the error, inspects the page, and fixes the code

The MCP server (configured in `.mcp.json`) is the bridge between Claude Code and Playwright's browser.

## Quick Reference

| Command                  | What it runs                |
| ------------------------ | --------------------------- |
| `pnpm run test`          | All Vitest tests once       |
| `pnpm run test:watch`    | Vitest in watch mode        |
| `pnpm run test:ui`       | Vitest browser UI           |
| `pnpm run test:coverage` | Vitest with coverage report |
| `pnpm run test:team`     | Iteration 2 team test flow  |
| `pnpm run test:e2e`      | Playwright E2E tests        |
| `pnpm run test:e2e:ui`   | Playwright interactive UI   |
