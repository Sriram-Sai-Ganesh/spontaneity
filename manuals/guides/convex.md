# Convex Guide

Convex is the backend for this project. It replaces what was previously a frontend-only data layer (Legend-State + IndexedDB) with a real server: a reactive database, server-side functions, authentication, and HTTP endpoints — all managed as code in the `convex/` directory.

## What Convex Does

Think of Convex as a backend-as-a-service that speaks WebSocket. Instead of REST endpoints that you poll, Convex **pushes** data to the client in real time. When a chat message is saved to the database, every connected client viewing that chat sees it instantly — no refetching.

The key pieces:

- **Schema** (`convex/schema.ts`) — defines tables and indexes, like a database migration
- **Queries** (`*_queries.ts`) — read-only functions that subscribe to data changes
- **Mutations** (`*_mutations.ts`) — write functions that modify the database
- **Actions** (`*_actions.ts`) — side-effect functions that can call external APIs
- **HTTP actions** (`convex/http.ts`) — traditional HTTP endpoints (we use these for SSE streaming)
- **Auth** (`convex/auth.ts`) — anonymous authentication via `@convex-dev/auth`

All of these are TypeScript files in `convex/`. When you run `npx convex dev`, Convex watches this directory and hot-deploys changes automatically.

## Cloud vs. Local Development

Convex offers two modes for development:

- **Cloud deployment** — your dev backend runs on Convex's servers. Data lives in the cloud, and you access the dashboard at [dashboard.convex.dev](https://dashboard.convex.dev/). Requires a Convex account.
- **Local deployment** (BETA) — your dev backend runs entirely on your machine. Data lives in a `.convex/` folder in your project directory. No account needed, no network round-trips, faster iteration. You manage environment variables via the CLI (`npx convex env set`) instead of the web dashboard.

Both modes use the same `npx convex dev` command. The choice is stored in `.env.local`, and all subsequent `npx convex dev` runs use whatever mode is configured there. Here's what `.env.local` looks like for each:

**Cloud** — URLs point to Convex's servers:

```plaintext
CONVEX_DEPLOYMENT=dev:<your-project-slug>
VITE_CONVEX_URL=https://<your-project-slug>.convex.cloud
VITE_CONVEX_SITE_URL=https://<your-project-slug>.convex.site
```

**Local** — URLs point to localhost:

```plaintext
CONVEX_DEPLOYMENT=local:<your-local-slug>
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

Similarly, `npx convex dashboard` opens the appropriate dashboard based on `.env.local` — the cloud dashboard for cloud deployments, or a local dashboard for local deployments.

**Switching between modes:** Delete `.env.local` and run `npx convex dev` again. You'll be prompted to create a new project or choose an existing one (including any you've created before, local or cloud).

## First-Time Dev Setup

### 1. Install Dependencies

```bash
pnpm install
```

This installs both frontend and Convex dependencies (they share a single `package.json`).

### 2. Initialize Convex

```bash
npx convex dev
```

The first time you run this, Convex walks you through setup:

1. **Create or choose a project** — you'll be asked whether to create a new project or choose an existing one. If creating new, pick a name (the repo name works fine).
2. **Cloud or local** — you'll be asked to choose between a cloud deployment and a local deployment (BETA). See [Cloud vs. Local Development](#cloud-vs-local-development) above for the differences.
3. **Log in** (cloud only) — if you chose cloud, Convex opens a browser tab to authenticate with your Convex account (create one at [convex.dev](https://www.convex.dev/) if you don't have one). Local deployments skip this step entirely.
4. **Generate `.env.local`** — Convex writes `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL` to `.env.local`.

> **Shortcut:** If you want to skip the cloud/local prompt and go straight to a local deployment (without creating an account), run `npx convex dev --local` instead.

After setup, the dev server watches `convex/` for changes and deploys them automatically. It also generates the `convex/_generated/` directory containing typed API references.

### 3. Generate Auth Keys

`@convex-dev/auth` needs a JWT key pair to sign session tokens. Open another terminal and run:

```bash
npx @convex-dev/auth
```

This generates `JWT_PRIVATE_KEY` and `JWKS` and automatically stores them on your Convex deployment (whether cloud or local).

### 4. Set Environment Variables

In addition to `JWT_PRIVATE_KEY` and `JWKS` (set by Step 3), you need to set `OPENROUTER_API_KEY` and `SITE_URL`. You can set them through the dashboard UI or the CLI — both work the same way for cloud and local deployments (they target whichever deployment is configured in `.env.local`).

**Via the dashboard:**

```bash
npx convex dashboard
```

This opens the dashboard for your current deployment (cloud or local). Go to **Settings** > **Environment Variables** and add the variables listed below.

**Via the CLI:**

```bash
npx convex env set SITE_URL http://localhost:5173
npx convex env set OPENROUTER_API_KEY your-openrouter-api-key
```

**You need these four variables set on your Convex deployment:**

| Variable             | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `JWT_PRIVATE_KEY`    | The private key from Step 3                              |
| `JWKS`               | The public key JSON from Step 3                          |
| `OPENROUTER_API_KEY` | Your OpenRouter API key (for server-side AI calls)       |
| `SITE_URL`           | `http://localhost:5173` (required by `@convex-dev/auth`) |

You can verify all variables are set with `npx convex env list`.

### 5. Start the Dev Servers

Run both servers together:

```bash
pnpm run dev
```

This uses `concurrently` to start the Convex backend and Vite frontend in one terminal. You can also run them separately:

```bash
pnpm run dev:backend    # starts Convex dev server
pnpm run dev:frontend   # starts Vite dev server (in another terminal)
```

To inspect data and run functions, open the dashboard:

```bash
npx convex dashboard
```

The app should load, auto-sign-in anonymously, and you can start chatting.

### 6. Run Backend Tests

```bash
pnpm run test:convex
```

These tests use `convex-test` which simulates the Convex runtime locally — no deployed project needed.

## How the Code Is Organized

Each domain (chats, messages) follows the same file pattern:

```plaintext
convex/
├── schema.ts              # Aggregates all table definitions
├── lib.ts                 # Auth-wrapped function builders (queryWithAuth, etc.)
├── auth.ts                # Anonymous auth config
├── auth.config.ts         # Auth provider configuration
├── http.ts                # HTTP router (CORS, auth middleware)
├── http_chat.ts           # SSE streaming endpoint
│
├── chats_schema.ts        # Table definition + validators
├── chats_guards.ts        # Ownership checks (throws 403/404)
├── chats_helpers.ts       # Pure DB operations (no auth logic)
├── chats_queries.ts       # Public read functions
├── chats_mutations.ts     # Public write functions
├── chats_actions.ts       # Side-effect functions (AI title suggestion)
│
├── messages_schema.ts     # Same pattern for messages
├── messages_guards.ts
├── messages_helpers.ts
├── messages_queries.ts
├── messages_mutations.ts
├── messages_internals.ts  # Internal functions (used by HTTP actions)
│
├── test.setup.ts          # Test helpers + module glob for convex-test
├── chats.test.ts          # Backend tests
└── messages.test.ts
```

The layering is: **guards** check authorization, **helpers** do the DB work, **queries/mutations** wire them together with auth. This separation means guards are reusable and helpers are testable without auth.

## Going to Production

### 1. Create a Production Convex Deployment

```bash
npx convex deploy
```

This creates a production deployment (separate from your dev deployment) and deploys all functions and schema to it. The first time, it will prompt you to choose between creating a new production deployment or using an existing one.

### 2. Set Production Environment Variables

On the Convex dashboard, switch to your **production** deployment and set:

| Variable             | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `JWT_PRIVATE_KEY`    | Same private key (or generate a new pair for production) |
| `JWKS`               | Matching public key JSON                                 |
| `OPENROUTER_API_KEY` | Your production OpenRouter API key                       |
| `SITE_URL`           | Your production URL (e.g., `https://myapp.netlify.app`)  |

### 3. Get Your Deploy Key

For CI/CD (GitHub Actions), you need a deploy key:

1. Go to [dashboard.convex.dev](https://dashboard.convex.dev/)
2. Select your project > **Settings** > **Deploy Key**
3. Copy the key

### 4. Add the Deploy Key to GitHub Secrets

1. Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**
2. Add a new repository secret:

| Secret name         | Value                      |
| ------------------- | -------------------------- |
| `CONVEX_DEPLOY_KEY` | The deploy key from Step 3 |

### 5. How CI/CD Deploys

The CD workflow (`.github/workflows/cd.yml`) uses a single command that deploys Convex functions **and** builds the frontend:

```bash
npx convex deploy --cmd 'pnpm run build'
```

This does two things in order:

1. Deploys all Convex functions and schema to the production deployment
2. Runs `pnpm run build` which builds the Vite app with the production `VITE_CONVEX_URL` (injected by Convex)

The `CONVEX_DEPLOY_KEY` environment variable authenticates the deploy without interactive login.

## Common Issues

**"VITE_CONVEX_URL is not set"** — You haven't run `npx convex dev` yet, or `.env.local` is missing. Run `npx convex dev` to generate it.

**"Not authenticated" errors in the app** — The anonymous auth provider may not be configured. Check that `convex/auth.ts` exports the anonymous provider and that `SITE_URL` is set. For cloud deployments, check the dashboard. For local deployments, verify with `npx convex env list`.

**Functions not updating** — Make sure `npx convex dev` is running. It watches `convex/` and auto-deploys. If it crashed, restart it.

**Backend tests fail with "module not found"** — Run `npx convex dev` once to generate `convex/_generated/`. The test runner needs these generated files.

**"Schema mismatch" on deploy** — Your local schema differs from what's deployed. This usually means someone else deployed a different schema. Run `npx convex dev` to sync, resolve any conflicts, then redeploy.

**Want to switch between cloud and local?** — Delete `.env.local` and run `npx convex dev` again. You'll be prompted to create a new project or choose an existing one (you can pick a project you created before in either mode).
