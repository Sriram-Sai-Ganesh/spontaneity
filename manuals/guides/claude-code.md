# Claude Code Guide

This project uses [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as its AI-assisted development tool. The `.claude/` directory configures how Claude Code behaves in this project.

## The `.claude/` Directory

```plaintext
.claude/
├── rules/        # Constraints Claude always follows
├── skills/       # Deep knowledge Claude consults for specific tasks
├── commands/     # Slash commands you invoke manually
├── agents/       # Specialist personas for complex tasks
├── hooks/        # Shell scripts that run automatically on events
├── settings.json # Project-level settings (shared, committed)
└── settings.local.json  # Your local settings (gitignored)
```

## Rules

Files in `rules/` are **always loaded** into Claude's context. They're short constraints — branch naming, commit format, PR conventions. You don't invoke them; Claude just follows them.

## Skills

Files in `skills/` are **loaded on demand** when Claude detects a relevant task. Each skill has a `SKILL.md` with frontmatter that describes when it should trigger, plus optional reference files with detailed patterns.

Skills are the most important part of this setup. They encode architectural decisions so Claude generates code that fits the project. For example, `frontend-hooks` teaches Claude how to write query and mutation hooks following our conventions.

You can also invoke a skill explicitly with `/skill-name` in the chat.

To see what skills are available, browse `.claude/skills/` or look at the skill list Claude shows at the start of a session.

## Commands

Files in `commands/` define **slash commands** you type manually. They're step-by-step instructions for Claude to follow.

| Command               | What it does                                  |
| --------------------- | --------------------------------------------- |
| `/review-pr <number>` | Reviews a PR for conventions and code quality |

## Agents

Files in `agents/` define **specialist personas** that Claude can delegate to. Each agent has a name, model, allowed tools, and detailed instructions. Claude auto-dispatches to the right agent based on the task, or you can ask explicitly (e.g., "use the playwright-test-healer agent").

| Agent                       | What it does                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `code-review`               | General-purpose code reviewer — runs validate, then reviews for correctness, architecture, and security |
| `playwright-test-planner`   | Reads source code and existing tests, writes a structured test plan in `playwright-specs/`              |
| `playwright-test-generator` | Takes a test plan and writes Playwright `.spec.ts` files, verifying they pass                           |
| `playwright-test-healer`    | Runs failing E2E tests, diagnoses errors, and fixes the test code                                       |
| `user-manual-writer`        | Explores source code, launches Playwright to capture screenshots, and writes manual pages in `manuals/` |

## Hooks

Scripts in `hooks/` **run automatically** in response to Claude Code events. They're configured in `settings.json`.

This project has one hook: `validate-before-commit.sh` runs `pnpm run validate` before any `git commit` command. If validation fails, the commit is blocked.

## Settings

- **`settings.json`** — Shared project settings, committed to the repo. Contains hook configuration and pre-approved permissions for common commands (lint, test, build).
- **`settings.local.json`** — Your personal settings, gitignored. Accumulates permissions you've approved during your sessions. You can edit this to pre-approve commands you use often.

## Tips

- **Read the skills** — Even if you never use Claude Code, the skill files document the project's conventions and patterns. They're teaching material.
- **Use `/commit`** — Claude's built-in commit command follows the project's commit conventions automatically.
- **Use `/review-pr`** — Run it on your own PR before requesting human review. It catches convention violations and code issues.
- **Check `settings.json`** — If Claude keeps asking permission for a command you always approve, add it to the `permissions.allow` array.
