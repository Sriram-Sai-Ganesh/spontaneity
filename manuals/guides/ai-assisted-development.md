# AI-Assisted Development Guide

This guide walks you through using Claude Code and the frontend skills to build features. It complements the [AI-Assisted Workflow](ai-assisted-workflow.md) guide, which covers the project management lifecycle (planning, issues, branches, PRs). This one covers the actual coding.

## Prerequisites

- Claude Code installed and working
- The dev server runs: `pnpm run dev` (or `pnpm run dev:frontend` for frontend only)
- You've read [Claude Code](claude-code.md) to understand the `.claude/` directory

## How Skills Work

The `.claude/skills/` directory contains 9 frontend skills that teach Claude your project's conventions. You don't need to invoke them manually — Claude loads them automatically when it detects a relevant task.

For example, if you ask "add a mutation hook for deleting chats," Claude loads the `frontend-hooks` skill, reads the conventions, and generates code that follows the project's hook patterns. If you ask "create a new feature for bookmarks," it loads `frontend-features` and scaffolds the directory structure.

You _can_ invoke a skill explicitly with `/skill-name` if you want Claude to consult it:

```plaintext
> /frontend-design
> I'm building a settings page. What spacing and layout patterns should I follow?
```

## The Skills and When They Trigger

| Skill                 | Triggers when you...                                             |
| --------------------- | ---------------------------------------------------------------- |
| `frontend-features`   | Add a new feature, ask about project structure                   |
| `frontend-types`      | Define types, create Zod schemas, ask about the 3-schema pattern |
| `frontend-state`      | Create a store, work with observables, add persistence           |
| `frontend-hooks`      | Write query or mutation hooks                                    |
| `frontend-components` | Create components, use shadcn/ui, work with theming              |
| `frontend-routing`    | Add routes, implement navigation                                 |
| `frontend-design`     | Design UI, choose spacing/colors, work with dark mode            |
| `frontend-prompt-kit` | Add or customize AI chat UI components                           |
| `feature-spec`        | Write a SPEC.md for a new feature                                |

## Building a Feature: Step by Step

Here's a typical flow for adding a feature. You don't have to follow this rigidly — Claude adapts — but the pipeline order matters: types before stores, stores before hooks, hooks before components.

### 1. Start with a spec (optional but recommended)

```plaintext
> /feature-spec
> Write a spec for a "bookmarks" feature where users can bookmark favorite chats
```

Claude creates a `SPEC.md` in the feature directory (e.g., `src/bookmarks/SPEC.md`) with purpose, scope, key behaviors, and dependencies. Review and adjust before coding.

### 2. Scaffold the feature

```plaintext
> Create the bookmarks feature module with types, store, and hooks
```

Claude creates `src/bookmarks/` with the pipeline structure:

```plaintext
src/bookmarks/
├── types/bookmark.ts      # Zod schemas + TypeScript types
├── store/bookmark.ts      # Legend-State observable + CRUD functions
└── hooks/
    ├── use-query-bookmarks.ts
    └── use-mutation-bookmark.ts
```

### 3. Build the UI

```plaintext
> Add a BookmarkButton component that toggles bookmark state for a chat
```

Claude consults `frontend-components` for patterns, creates the component using hooks (never accessing the store directly), and follows the project's styling conventions.

### 4. Wire it into the app

```plaintext
> Add the BookmarkButton to the chat list items and create a /bookmarks page
```

Claude updates existing components, adds a route in `App.tsx`, and creates a page component.

### 5. Review your work

Just ask Claude to review:

```plaintext
> Review the changes I just made to the bookmarks feature
```

The code-review agent runs `pnpm validate`, categorizes changed files by skill domain, and reports issues by severity.

## The Pre-Commit Safety Net

A hook in `.claude/settings.json` runs `pnpm run validate` (type-check + lint + test) before every commit. If validation fails, the commit is blocked. You'll see the errors and can ask Claude to fix them:

```plaintext
> The pre-commit hook failed. Fix the type errors.
```

## Managing MCP Servers

This project configures MCP (Model Context Protocol) servers in `.mcp.json` that give Claude access to external documentation and tools. MCP servers consume tokens while active, so they are **disabled by default** in `.claude/settings.json`.

When you open Claude Code, it detects the configured MCP servers and may ask if you want to enable them. You can also manage them at any time:

```plaintext
> /mcp
```

This opens the MCP management panel where you can connect or disconnect servers.

**Recommendation:** Only enable the MCP servers you need for your current task, then disconnect them when you're done. MCP servers provide powerful tools, but they consume tokens, so use them strategically.

## Tips for Getting Good Results

**Be specific about what you want.** "Add a component" is vague. "Add a BookmarkButton that renders a star icon, toggles on click, and calls `useBookmarkMutation().toggle(chatId)`" gives Claude everything it needs.

**Let Claude follow the pipeline.** If you ask for a component that needs data from a store that doesn't exist yet, Claude will create the store, hooks, and component in the right order. Don't fight this.

**Review the generated code.** Claude follows the conventions, but you understand the requirements. Read what it produces. The skills make Claude consistent, not omniscient.

**Use `/commit` when you're ready.** Claude's built-in commit command follows the project's conventions (imperative mood, issue reference, no co-signing).

## What the Skills Don't Cover

Skills encode patterns and conventions. They don't replace your judgment about:

- **What to build** — The skills tell Claude _how_ to build a feature, not _whether_ it's the right feature
- **Business logic** — Edge cases specific to your domain need your input
- **UX decisions** — The design skill provides spacing and color guidance, but layout choices are yours
- **When to deviate** — Sometimes the pattern doesn't fit. Override it and explain why in a comment
