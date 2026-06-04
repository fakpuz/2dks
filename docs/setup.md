# Local Development Setup

This guide covers how to run 2DKS locally for development — both the frontend-only mode and the full Worker-backed mode with GitHub sync.

---

## Prerequisites

- **Node.js** 18 or later (20+ recommended)
- **npm** 9 or later (ships with Node.js)
- A GitHub account and a personal access token if you want sync to work

---

## 1. Install Dependencies

From the project root:

```bash
npm install
```

This installs two dev dependencies: `vite` and `wrangler`. There are no runtime npm packages.

---

## 2. Choose a Dev Mode

There are two ways to run locally:

### Mode A: Frontend Only (`npm run dev`)

```bash
npm run dev
```

- Starts the Vite dev server on `http://localhost:3000`.
- Hot module replacement is active; save a JS or CSS file and the browser updates immediately.
- The app tries to load `/graph/index.json` on boot. Vite does not serve that route, so the fetch fails.
- The app falls back to any previously cached session in `localStorage`.
- If there is no cached session, the canvas starts empty.
- Pressing `S` (sync) will always fail because the `/data` endpoint does not exist.

**Use this mode** when you are working on UI code, styling, or canvas rendering and do not need live graph data or sync.

### Mode B: Full Worker (`npm run dev:worker`)

```bash
export GITHUB_TOKEN=ghp_your_token_here
npm run dev:worker
```

- Wrangler builds the Vite frontend and starts the Cloudflare Worker runtime locally.
- The Worker intercepts `/graph/...` requests and fetches the corresponding files from the configured GitHub repo and branch (the `data` branch).
- Pressing `S` creates a real commit on the `data` branch.
- The Worker listens on a local port (Wrangler prints the URL when it starts, typically `http://localhost:8787`).

**Use this mode** when you are working on Worker logic, sync behaviour, or you need the full end-to-end experience with real graph data.

---

## 3. Environment Variables

### `GITHUB_TOKEN`

Required for `npm run dev:worker`. Set it in your shell before running Wrangler:

```bash
export GITHUB_TOKEN=ghp_your_personal_access_token
```

The token needs the `repo` scope (read and write access to the repository, including the `data` branch). If the repo is public you could get away with less, but private repos require `repo`.

To generate a token: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. Select the `repo` checkbox.

### `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`

These are configured in `wrangler.jsonc` and point to the `data` branch of this repo:

```jsonc
"vars": {
  "GITHUB_OWNER": "fakpuz",
  "GITHUB_REPO": "2dks",
  "GITHUB_BRANCH": "data"
}
```

Change these to point at your own fork or a different branch. They are plain text vars; only `GITHUB_TOKEN` is a secret.

---

## 4. Build for Production

```bash
npm run build
```

Vite compiles and bundles the frontend into `dist/`. Wrangler uses this directory as the static asset bundle when deploying.

---

## 5. Preview the Production Build

```bash
npm run preview
```

Starts Vite's built-in preview server to serve the contents of `dist/` locally. Useful for checking that the build output looks correct before deploying. Sync and Worker features do not work in this mode.

---

## 6. Project Scripts Summary

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Frontend dev server, port 3000 |
| `dev:worker` | `wrangler dev` | Full Worker + assets; requires GITHUB_TOKEN |
| `build` | `vite build` | Compile frontend to `dist/` |
| `preview` | `vite preview` | Serve built `dist/` locally |
| `deploy` | `wrangler deploy` | Build + deploy Worker to Cloudflare |

---

## 7. Data Files (Local Graph Editing)

If you want to develop against a local copy of graph data without hitting GitHub at all, the cleanest path is:

1. Create `public/graph/index.json` and `public/graph/spaces/root.json` manually (see the [data model](data-model.md) for the schemas).
2. Run `npm run dev` (Vite only).
3. Vite will serve the files from `public/` at the correct paths.

The app will load these files on boot. Changes you make in the app will be saved to `localStorage` but will not update the files in `public/`; that directory is not a writeable target for the frontend.

---

## 8. Migration Scripts

If you have legacy graph data (the old monolithic format before the split-space schema), run the migration scripts from the project root:

```bash
# Converts monolithic JSON to split-space format
node scripts/migrate-legacy-data.mjs

# Converts numeric/legacy IDs to timestamp IDs
node scripts/migrate-ids-to-timestamp.mjs
```

Both scripts read from and write to `public/graph/` in the project root. To run them against the live graph truth, check out the `data` branch (where those files live) first, or copy the script onto that working tree.

---

## Common Issues

### "Failed to fetch /graph/index.json"

In `npm run dev` mode, this is expected and harmless. The app falls back to `localStorage`. If you want the fetch to succeed locally, either switch to `npm run dev:worker` or place graph JSON files in `public/graph/`.

### Wrangler complains about missing GITHUB_TOKEN

You forgot to export the variable before running `wrangler dev`. Set it in your shell:

```bash
export GITHUB_TOKEN=ghp_...
npm run dev:worker
```

### The Worker URL is not `localhost:3000`

Wrangler picks its own port (usually `8787`). The Vite dev server runs on `3000`. In `dev:worker` mode, use the URL Wrangler prints — not `localhost:3000`.

### Changes are not showing after refresh in `dev` mode

The app loaded from `localStorage` cache. If you have modified graph files in `public/graph/` and want the app to pick them up, clear `localStorage` or run in `dev:worker` mode and let the Worker serve fresh files.

To clear the session from the browser console:

```js
localStorage.removeItem('2dks-session-v4');
location.reload();
```
