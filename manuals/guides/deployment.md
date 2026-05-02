# Deployment Guide

This project deploys to [Netlify](https://www.netlify.com/) via GitHub Actions. When code is merged to `master`, the CD workflow builds the app and pushes the `dist/` folder to Netlify automatically.

## Prerequisites

- A [Netlify](https://www.netlify.com/) account (free tier works)
- Admin access to your GitHub repository (to add secrets)

## Step 1 — Create a Netlify Site

1. Log in to [Netlify](https://app.netlify.com/)
2. Click **Add new project** > **Import an existing project**
3. Choose **Deploy manually** (we handle builds in GitHub Actions, not Netlify)
   - Build your project with `pnpm run build` locally
   - Drag and drop the `dist` folder to the Netlify build step in the UI
4. Note your **Site ID** — you'll find it under **Project configuration** > **General** > **Project ID**

## Step 2 — Generate a Netlify Personal Access Token

1. Go to [User settings > Applications](https://app.netlify.com/user/applications)
2. Under **Personal access tokens**, click **New access token**
3. Give it a descriptive name (e.g., `github-actions-deploy`)
   - Set "No expiration" for the expiration date of the token.
4. Copy the token — you won't see it again

## Step 3 — Add Secrets to GitHub

1. Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**
2. Add three repository secrets:

| Secret name          | Value                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `NETLIFY_AUTH_TOKEN` | The personal access token from Step 2                                        |
| `NETLIFY_SITE_ID`    | The site ID from Step 1                                                      |
| `CONVEX_DEPLOY_KEY`  | Your Convex deploy key (see [Convex guide](./convex.md#going-to-production)) |

## Step 4 — Deploy

Push or merge to `master`. The CD workflow will:

1. Check out the code
2. Install dependencies with `pnpm install`
3. Build the project with `pnpm run build`
4. Deploy the `dist/` folder to Netlify

You can monitor the deploy in the **Actions** tab of your GitHub repo.

## How It Works

### CI (Pull Requests)

Every PR against `master` triggers the CI workflow (`.github/workflows/ci.yml`), which runs type-checking, linting, and tests. PRs must pass CI before merging.

### CD (Merge to Master)

Every push to the deploy branch triggers the CD workflow (`.github/workflows/cd.yml`), which deploys Convex functions, builds the frontend, and deploys to Netlify. The build step uses `npx convex deploy --cmd 'pnpm run build'` to deploy backend and frontend in a single command.

### SPA Routing

The `public/_redirects` file tells Netlify to serve `index.html` for all routes. This is required for client-side routing (Wouter) to work — without it, refreshing on `/settings` would return a 404.

## Troubleshooting

**Build fails with "missing dependencies"** — Make sure `pnpm-lock.yaml` is committed. The CI/CD workflows use `pnpm install` (not `pnpm install --frozen-lockfile`), but a missing lockfile can still cause version mismatches.

**Deploy succeeds but site shows blank page** — Check the browser console for errors. Common causes: missing environment variables or a build that didn't include all assets.

**Routes return 404 on refresh** — Make sure `public/_redirects` exists and contains the SPA fallback rule. Vite copies everything in `public/` to `dist/` at build time.
