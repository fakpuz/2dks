# Deployment

This guide covers everything needed to deploy 2DKS to Cloudflare: the Worker, the static assets, Cloudflare Access authentication, the GitHub token secret, and the data branch setup.

---

## Overview

The production setup uses one GitHub repository (two branches) and one Cloudflare Worker:

| Branch of `fakpuz/2dks` | Purpose |
|---|---|
| `main` | All code: frontend, Worker, build config |
| `data` | Graph JSON files only; written by the Worker on every sync |

The `data` branch is an orphan branch that shares no history with `main` — see [`data-branch-setup.md`](./data-branch-setup.md). The Worker runs on Cloudflare's edge network. Cloudflare Access sits in front of the Worker domain and requires authentication before any request reaches the Worker.

> **Important — build the `main` branch only.** If you connect Cloudflare's Git integration (Workers Builds) to this repo, configure it to build `main` **only**. The `data` branch has no `package.json` and is not buildable, so a build against it fails immediately (`npm error enoent ... package.json`). More importantly, the Worker commits to `data` on **every sync** — so a builder that runs on every push would produce a failing build on every save. In the Cloudflare dashboard: **Settings → Build → Branch control** → set the production branch to `main` and disable builds for non-production branches (or exclude `data`).

---

## Prerequisites

- A Cloudflare account (free tier is sufficient)
- Wrangler CLI installed: `npm install` in the project root installs it
- A GitHub personal access token with `repo` scope for the repository

---

## Step 1: Set Up the Data Branch

Graph JSON lives on a dedicated `data` branch of this same repo. That branch must exist and have at least one commit before the Worker can write to it. Full steps (including migrating from the old `2dks-data` repo) are in [`data-branch-setup.md`](./data-branch-setup.md); the short version:

```bash
# from a clean checkout of fakpuz/2dks
git switch --orphan data
git rm -rf . >/dev/null 2>&1 || true
mkdir -p public/graph/spaces
echo "# 2DKS data branch" > public/graph/README.md
git add -A
git commit -m "Seed graph truth on data branch"
git push -u origin data
git switch main
```

The `--orphan` branch shares no history with `main`, so it carries none of the app code. If you are starting fresh, the Worker bootstraps an empty manifest on first load and an empty root space on first sync.

---

## Step 2: Configure `wrangler.jsonc`

Open `wrangler.jsonc` in the project root and point the `vars` section at the `data` branch of this repo:

```jsonc
"vars": {
  "GITHUB_OWNER": "your-github-username",
  "GITHUB_REPO": "2dks",
  "GITHUB_BRANCH": "data"
}
```

The `name` field sets the Cloudflare Worker name:

```jsonc
"name": "2dks"
```

The `assets` section tells Wrangler to bundle the built frontend:

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "run_worker_first": true
}
```

Do not change `run_worker_first`. Without it, Cloudflare would try to serve static assets before routing to the Worker, breaking the `/graph/...` and `/data` routes.

---

## Step 3: Add the GITHUB_TOKEN Secret

The `GITHUB_TOKEN` must be stored as a Cloudflare secret. It is never committed to source control.

Log in to Wrangler:

```bash
npx wrangler login
```

Add the secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Wrangler will prompt for the value. Paste your GitHub personal access token and press Enter.

The token needs:
- `repo` scope if the repo is private
- `public_repo` scope if the repo is public

To verify the secret was set:

```bash
npx wrangler secret list
```

---

## Step 4: Deploy

```bash
npm run deploy
```

This runs `wrangler deploy`, which:
1. Runs `npm run build` to compile the Vite frontend into `dist/`
2. Uploads the Worker script (`worker/src/index.js`)
3. Uploads the static asset bundle from `dist/`
4. Creates or updates the Worker at the configured name

Wrangler prints the deployment URL when it succeeds. It looks like:
```
https://2dks.<your-account>.workers.dev
```

---

## Step 5: Set Up Cloudflare Access

Cloudflare Access protects your Worker URL so that only you (or people you authorise) can reach it.

### Create an Access Application

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → your account → **Zero Trust** → **Access** → **Applications**.
2. Click **Add an application** → **Self-hosted**.
3. Configure:
   - **Application name**: `2DKS` (or any name you like)
   - **Session duration**: your preference (e.g. 30 days)
   - **Application domain**: the Workers.dev URL or your custom domain, e.g. `2dks.your-account.workers.dev`
   - **Path**: leave blank (protect the whole domain)
4. Click **Next** and create an Access Policy:
   - **Policy name**: `Owner`
   - **Action**: Allow
   - **Include**: **Emails** → add your email address
   (Or use **GitHub** identity if you prefer OAuth login.)
5. Save the policy and the application.

From this point on, visiting the Worker URL will redirect to a Cloudflare login page. After authenticating, Cloudflare issues a signed cookie (`CF_Authorization`) and passes requests through to the Worker.

### Verify the Gate Works

1. Open your Worker URL in a private/incognito window.
2. You should be redirected to a Cloudflare login page.
3. Authenticate with the email or identity provider you configured.
4. You should land on the 2DKS app and the graph should load.

---

## Step 6: Custom Domain (Optional)

If you want a custom domain instead of `*.workers.dev`:

1. Add the domain to Cloudflare (DNS must be managed by Cloudflare).
2. In the Worker settings → **Triggers** → **Custom Domains**, add your domain.
3. Update the Cloudflare Access application domain to match.

---

## Step 7: Verify End-to-End Sync

After deploying with Access configured:

1. Open the app URL.
2. Sign in via Cloudflare Access.
3. Create a node and add some text.
4. Press `S`.
5. Check the `data` branch on GitHub. A new commit named `Sync 2DKS graph at <timestamp>` should appear.
6. The commit should contain updated files under `public/graph/`.

---

## Updating the Deployment

After changing code:

```bash
npm run deploy
```

Wrangler re-builds and re-deploys. The Worker update is instant; no DNS or cache flush needed.

Environment variable changes (`GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`) can be made either in `wrangler.jsonc` (then redeploy) or in the Cloudflare dashboard (Workers → your Worker → Settings → Variables, then click **Save and Deploy**).

To rotate the `GITHUB_TOKEN`:

```bash
npx wrangler secret put GITHUB_TOKEN
# Enter the new token value
```

The new secret takes effect immediately without a redeploy.

---

## Removing the Deployment

To delete the Worker:

```bash
npx wrangler delete
```

This removes the Worker and all its secrets. It does not touch the `data` branch.

---

## CI/CD (Optional)

If you want to auto-deploy on every push to `main`:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

You will need a Cloudflare API token with `Workers Scripts:Edit` permission, added as a GitHub secret named `CLOUDFLARE_API_TOKEN`.

The `GITHUB_TOKEN` for the `data` branch does **not** go in the GitHub Actions workflow. It lives in Cloudflare's secret store and is only accessed by the deployed Worker.
