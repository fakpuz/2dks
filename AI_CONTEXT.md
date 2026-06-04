# 2DKS — AI Context

This file is intended as a high-density reference for language models working on this codebase. It covers purpose, architecture, data contracts, runtime model, current status, and known gaps.

---

## Purpose

2DKS is a personal knowledge graph that lives on an infinite visual canvas. The user builds a graph of nodes, writes Markdown notes inside each node, connects nodes with typed links, and organises groups of nodes into "spaces" (nested sub-graphs). Think of it as a wiki where pages are circles on a zoomable canvas and links are literal drawn lines.

The app syncs to a private GitHub repository via a Cloudflare Worker so that edits made on one device appear on another after pressing `S`.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend build | Vite 8 (`vite.config.js`), target `esnext` |
| Frontend runtime | Vanilla JavaScript — no framework |
| Canvas rendering | HTML5 Canvas 2D API (`render.js`) |
| Markdown | Custom renderer (`markdown.js`) — no external parser |
| Worker | Cloudflare Worker (`worker/src/index.js`) |
| Worker tooling | Wrangler 4 (`wrangler.jsonc`) |
| Data store | GitHub repository via REST API |
| Auth gate | Cloudflare Access (sits in front of the Worker URL) |

There are no runtime npm dependencies. `vite` and `wrangler` are dev-only.

---

## Repository Layout

```
2dks/
├── index.html                  Single-page shell; all DOM ids live here
├── vite.config.js              Vite config: outDir=dist, port=3000
├── wrangler.jsonc              CF Worker config; GITHUB_* vars; assets=./dist
├── package.json                Scripts: dev, dev:worker, build, deploy
├── src/
│   ├── css/style.css           All styles (single file)
│   └── js/
│       ├── main.js             Entry point; wires init(), search, style panel
│       ├── state.js            Single mutable state object + pure helpers
│       ├── graph.js            Node/fence/link mutation; layout algorithms
│       ├── render.js           Canvas paint loop; toScreen/toWorld/hitNode
│       ├── input.js            Mouse + keyboard event handlers
│       ├── ui.js               DOM panel bindings; breadcrumbs; HUD refresh
│       ├── storage.js          loadFromStorage, saveToStorage, saveToCloud
│       ├── repo-data.js        Schema constants; serialize/deserialize; index
│       ├── space-memory.js     Per-space pan/zoom persistence helpers
│       └── markdown.js         Markdown-to-HTML renderer; wikilink spans
├── worker/src/index.js         Cloudflare Worker: serves graph JSON, writes commits
├── scripts/
│   ├── migrate-legacy-data.mjs Converts legacy monolithic JSON to split-space format
│   └── migrate-ids-to-timestamp.mjs Converts numeric IDs to timestamp IDs
└── docs/
    └── data-branch-setup.md  Steps to put graph truth on a separate branch
```

---

## Module Responsibilities

### `state.js`
Single source of truth for in-memory application state. Exports the `state` object and pure helper functions (`currentNodes`, `currentLinks`, `currentFences`, `getCurrentNode`, `getSelectedNodes`, `getTrailSegments`, `normalizeStateTree`, `collectDescendantSpaceIds`, `removeSpaceTree`). No side effects.

### `graph.js`
All mutations to nodes, links, and fences. Exports `createNodeAt`, `resolveOrCreateWikilink`, `applyLayout` (grid/circle/radial/force), fence geometry helpers, `findNodeByTitle`, `visibleNodes`, `collectSpaceTags`, `getBacklinks`, `NODE_TEMPLATES`.

### `render.js`
HTML Canvas paint loop. Exports `resize`, `toScreen`, `toWorld`, `hitNode`, and the `render` function (called via `requestAnimationFrame`). Draws grid, fences, links (with arrowheads and labels), nodes (circle/square/triangle shapes), selection box, hover preview, and minimap.

### `input.js`
All event listeners: `mousedown`, `mousemove`, `mouseup`, `dblclick`, `contextmenu`, `wheel`, `keydown`. Keyboard shortcuts are handled in `handleKeyDown`. All interactions call `saveToStorage` or `saveToCloud` as appropriate.

### `ui.js`
DOM panel objects (editor, groupEditor, waypointEditor, styleUI, searchUI). Functions for opening/closing panels, updating breadcrumbs, waypoint bar, HUD, tag filter bar, and entering a sub-space (`enterSpace`).

### `storage.js`
- `loadFromStorage()` — async boot sequence: attempts Worker fetch, falls back to `localStorage`, then legacy format.
- `saveToStorage(options)` — marks spaces dirty, syncs manifest, persists to `localStorage`.
- `saveToCloud()` — POSTs a sync payload to `/data` (the Worker endpoint). Handles CF Access auth errors.
- `notifyToast(message, tone)` — shows a dismissing toast notification.

### `repo-data.js`
Pure data functions. `SCHEMA_VERSION = 2`. `generateTimestampId()` produces `YY-MM-DD_HH-MM-SS_mmm` IDs. `serializeSpaceDocument` / `deserializeSpaceDocument` convert between normalized space objects and the on-disk JSON format. `buildSpaceIndex` builds per-space Maps (nodeById, titleToId, tagIndex, backlinks, searchIndex). `normalizeManifest`, `normalizeNode`, `normalizeLink`, `normalizeFence`, `normalizeSpace`. `convertLegacyData` handles pre-v2 migration.

### `space-memory.js`
Pure helpers for remembering and restoring per-space pan/zoom state. `rememberSpaceView`, `getRememberedSpaceView`, `normalizeViewState`.

### `markdown.js`
Custom Markdown renderer. Supports: h1-h6, bold, italic, strikethrough, highlight (`==text==`), inline code, code blocks, unordered lists, ordered lists, task lists, blockquotes, horizontal rules, `[text](url)` links, `[[wikilinks]]`, `[[wikilink|alias]]`, and `![[embeds]]` (resolved by caller via `options.resolveEmbed`).

### `worker/src/index.js`
Cloudflare Worker with two routes:

- `GET /graph/index.json` — fetches `public/graph/index.json` from the `data` branch of the GitHub repo.
- `GET /graph/spaces/:spaceId.json` — fetches the corresponding space file.
- `POST /data` — receives a sync payload (`manifest` + changed `spaces` map), creates GitHub blobs for each file, builds a new Git tree, creates a commit, and fast-forward-updates the branch ref. Retries on non-fast-forward and BadObjectState errors (up to 3 attempts).
- All other requests — proxied to static assets (`env.ASSETS.fetch`).

---

## Data Architecture

### Separation of code branch and data branch

There is one repo (`fakpuz/2dks`) with two branches. The `main` branch contains only code. Graph data lives on a dedicated `data` branch — an orphan branch that shares no history with `main`. The Worker is configured (via `GITHUB_BRANCH=data`) to read from and write to that branch over the GitHub API. This means:

- The deployed SPA bundle does not contain any graph truth.
- The `data` branch has a clean commit history showing every sync event, kept separate from code history.
- Code and data can be versioned independently while living in a single repo.

### File layout on the `data` branch

```
public/graph/
├── index.json
└── spaces/
    ├── root.json
    └── <spaceId>.json
```

### `index.json` (manifest)

```json
{
  "schemaVersion": 2,
  "rootSpaceId": "root",
  "currentSpaceId": "root",
  "spaceTrail": [],
  "view": { "x": 0, "y": 0, "zoom": 1 },
  "waypoints": [
    { "id": "waypoint-1", "name": "Overview", "view": { "x": -120, "y": -80, "zoom": 0.8 } }
  ],
  "sync": {
    "sha": "abc1234...",
    "lastSyncedAt": "2025-01-15T10:30:00.000Z"
  },
  "spaceMemory": {
    "viewsBySpaceId": {
      "root": { "x": 0, "y": 0, "zoom": 1 },
      "26-01-10_14-32-00_001": { "x": -400, "y": 200, "zoom": 1.5 }
    }
  },
  "spaces": {
    "root": {
      "path": "spaces/root.json",
      "nodeCount": 12,
      "linkCount": 8,
      "fenceCount": 2,
      "updatedAt": "2025-01-15T10:30:00.000Z"
    },
    "26-01-10_14-32-00_001": {
      "path": "spaces/26-01-10_14-32-00_001.json",
      "nodeCount": 5,
      "linkCount": 3,
      "fenceCount": 0,
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

### Space document (`spaces/*.json`)

```json
{
  "schemaVersion": 2,
  "spaceId": "root",
  "updatedAt": "2025-01-15T10:30:00.000Z",
  "nodeIds": ["26-01-10_14-32-00_001", "26-01-10_14-33-00_002"],
  "nodesById": {
    "26-01-10_14-32-00_001": {
      "id": "26-01-10_14-32-00_001",
      "title": "My Topic",
      "content": "## Notes\n\n[[Related Topic]]",
      "x": 120,
      "y": -80,
      "size": 40,
      "color": "rgba(255, 255, 255, 0.05)",
      "shape": "circle"
    }
  },
  "linkIds": ["node:26-01-10_14-32-00_001->node:26-01-10_14-33-00_002::true"],
  "linksById": {
    "node:26-01-10_14-32-00_001->node:26-01-10_14-33-00_002::true": {
      "id": "node:26-01-10_14-32-00_001->node:26-01-10_14-33-00_002::true",
      "from": "26-01-10_14-32-00_001",
      "fromType": "node",
      "to": "26-01-10_14-33-00_002",
      "toType": "node",
      "label": "",
      "note": "",
      "directed": true
    }
  },
  "fenceIds": [],
  "fencesById": {}
}
```

### Node schema (fields on each node object)

| Field | Type | Description |
|---|---|---|
| `id` | string | Timestamp ID (`YY-MM-DD_HH-MM-SS_mmm`) |
| `title` | string | Displayed title; also the wikilink target name |
| `content` | string | Markdown body |
| `x` | number | World-space X coordinate |
| `y` | number | World-space Y coordinate |
| `size` | number | Radius in world units (default 40) |
| `color` | string | CSS color string |
| `shape` | string | `"circle"` \| `"square"` \| `"triangle"` |
| `template` | string? | Optional template name used at creation |

### Link schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Derived key: `fromType:from->toType:to:label:directed` |
| `from` | string | Source node or fence ID |
| `fromType` | string | `"node"` \| `"fence"` |
| `to` | string | Target node or fence ID |
| `toType` | string | `"node"` \| `"fence"` |
| `label` | string | Optional display label on the edge |
| `note` | string | Optional tooltip/note |
| `directed` | boolean | Whether to draw an arrowhead |

### Fence (group box) schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Timestamp ID |
| `name` | string | Display label |
| `x` | number | World-space left edge |
| `y` | number | World-space top edge |
| `w` | number | Width |
| `h` | number | Height |
| `collapsed` | boolean | If true, renders as a compact pill and hides member nodes |

---

## Runtime Model

### `npm run dev` (Vite only)
- Starts Vite dev server on port 3000.
- The app tries to fetch `/graph/index.json` from the same origin.
- Vite does not serve those files by default; the fetch fails.
- The app falls back to any cached `localStorage` session (`2dks-session-v4`).
- No Cloudflare Access enforcement. Sync (`S` key) will fail because `/data` is not handled.
- Use this mode for UI-only development where you do not need live graph data.

### `npm run dev:worker` (Wrangler)
- Wrangler runs the Worker locally and serves `dist/` as static assets.
- The Worker intercepts `/graph/...` requests and proxies them to the GitHub API.
- Requires `GITHUB_TOKEN` in the environment (`export GITHUB_TOKEN=...` before running).
- Sync works end-to-end: pressing `S` creates a real GitHub commit.
- Cloudflare Access is not enforced locally.

### Production (deployed)
- `npm run build` produces `dist/`.
- `npm run deploy` runs `wrangler deploy` which builds and pushes Worker + assets.
- Cloudflare Access sits in front of the Worker domain; unauthenticated requests are redirected to the CF login page.
- The Worker reads graph JSON from the `data` branch and POSTs sync commits back to it.

### Boot sequence (`loadFromStorage`)
1. Attempt to fetch `/graph/index.json` from the Worker.
2. If successful: apply manifest, lazy-load `root` space and current space.
3. If CF Access redirects (HTML response): show auth warning, clear local session.
4. If fetch fails for any other reason: fall back to `localStorage` session.
5. If no local session: fall back to legacy `localStorage` key.
6. If nothing works: start with empty graph.

### Local persistence
- Key: `2dks-session-v4` in `localStorage`.
- Stores: manifest, all loaded spaces, dirty tracking, UI preferences.
- Legacy key: `2dks-data` (auto-migrated on load).
- UI-only state (tag filter, pinned inspector, editor split ratio) is stored locally and never committed to GitHub.

---

## Space Model

Every node can be "entered" with a double-click, which creates a child space identified by the node's ID. The root space is always `"root"`. The navigation trail (`spaceTrail`) is an ordered array of node IDs from root down to the current space. The `B` key goes back one level.

Spaces are lazy-loaded: on boot only `root` and the current space are fetched. Other spaces are fetched on demand when the user enters them. The manifest's `spaces` map tells the Worker the file path for each space.

When a node is deleted, all descendant spaces are recursively collected (`collectDescendantSpaceIds`) and their IDs are added to `dirtySpaces` with a `null` entry in `state.spaces`, signalling to the Worker that those files should be deleted from the `data` branch on next sync.

---

## Sync Flow

1. User presses `S` (or sync is triggered programmatically).
2. `saveToCloud()` in `storage.js` calls `syncPayload()`.
3. `syncPayload()` serializes all dirty spaces and the current manifest.
4. A `POST /data` request is sent to the Worker with `{ manifest, spaces, changedSpaceIds, deletedSpaceIds }`.
5. The Worker (`worker/src/index.js`):
   a. Fetches the current branch ref to get the latest commit SHA.
   b. Fetches the existing manifest from the `data` branch to compute deleted space paths.
   c. Creates a GitHub blob for each changed file.
   d. Builds a new Git tree on top of the existing base tree, adding changed blobs and nulling out deleted space paths.
   e. Creates a new commit with message `Sync 2DKS graph at <ISO timestamp>`.
   f. Updates the branch ref (fast-forward). Retries on 422 errors.
6. On success: the returned `sha` is stored in `state.sync` and `state.manifest.sync`. `dirtySpaces` is cleared.
7. On failure: `state.sync.state = "error"`, toast notification shown.

---

## Space Index (In-Memory)

Each loaded space has an associated index (`state.spaceIndexes[spaceId]`) built by `buildSpaceIndex` in `repo-data.js`. The index contains:

- `nodeById` — Map from ID to node object.
- `titleToId` — Map from normalized title (lowercase, trimmed) to node ID. Used for wikilink resolution.
- `tagIndex` — Map from tag string to sorted array of node IDs.
- `backlinks` — Map from node ID to sorted array of node IDs that link to it via `[[wikilink]]`.
- `searchIndex` — Array of `{ id, text }` objects for full-text search.

The index is rebuilt on every `saveToStorage` call and on space load. It is never persisted; it is always derived from the space data.

---

## ID Format

Node, fence, and space IDs use a timestamp-based format:

```
YY-MM-DD_HH-MM-SS_mmm
```

Example: `26-01-10_14-32-00_001` (year 2026, January 10, 14:32:00.001).

The generator (`generateTimestampId` in `repo-data.js`) ensures monotonic uniqueness by tracking the last generated millisecond. IDs are also used as sub-space identifiers, which is why the node ID doubles as the space file name.

---

## Current Status

All features listed in `README.md` are implemented and working:
- Infinite canvas (zoom 0.1–5x), pan, drag nodes, drag groups
- Shapes: circle, square, triangle
- Per-space lazy loading
- Per-space pan/zoom memory across refresh and sync
- Local autosave to `localStorage`
- GitHub sync via Cloudflare Worker
- Markdown notes with custom renderer
- `[[wikilinks]]` with auto-create on click
- `![[embeds]]` in hover previews
- Hover preview cards
- Backlinks panel
- Search palette (`Ctrl/Cmd+K`)
- Waypoints (save with `K`, jump with `1–9`)
- Tag filtering (`#tag` parsed from title and content)
- Multi-select and drag-select box
- Manual links with labels, notes, and direction
- Group boxes with collapse/expand
- Layout tools: grid, circle, radial, force
- Minimap
- Pinned inspector panel
- Minimal chrome mode (`H` to toggle)
- Cloudflare Access protection in production

---

## Known Gaps and Improvement Areas

1. **No conflict resolution** — if two devices sync concurrently, one commit will fail with a non-fast-forward error and the Worker will retry. The local session is not updated after a successful sync; the user must manually refresh to see changes made elsewhere.

2. **No offline-first queuing** — if sync fails, `dirtySpaces` retains the unpushed IDs, so the next manual sync will retry. But if the page is closed before syncing, the local session in `localStorage` preserves the dirty state and the user can sync on next load.

3. **No undo/redo** — mutations are applied immediately to `state`. There is no action history.

4. **No multi-user collaboration** — the Worker is single-tenant; there is no presence, locking, or operational transform.

5. **Single CSS file** — `src/css/style.css` contains all styles. Large but navigable.

6. **Markdown renderer limitations** — no nested lists, no table support, no footnotes. Sufficient for note-taking but not a full CommonMark implementation.

7. **Worker has no rate-limit handling** — GitHub API rate limits (5000 req/hr for authenticated requests) are not surfaced to the user.

8. **No test suite** — the codebase has no automated tests. The migration scripts are the only standalone executable code.

---

## Environment Variables

### Worker (set in `wrangler.jsonc` vars or CF dashboard)

| Variable | Description |
|---|---|
| `GITHUB_OWNER` | GitHub username or org owning the repo (e.g. `fakpuz`) |
| `GITHUB_REPO` | Repo name (the app repo itself, e.g. `2dks`) |
| `GITHUB_BRANCH` | Branch holding graph truth, read from and written to (e.g. `data`) |
| `GITHUB_TOKEN` | Personal access token with `repo` scope; set as CF secret |

### Local dev (shell environment)

```bash
export GITHUB_TOKEN=ghp_...
npm run dev:worker
```

---

## Next Steps

Priority order based on impact vs. effort:

1. **Post-sync refresh** — after a successful sync, re-fetch the manifest so `sync.sha` and `spaceMemory` reflect the committed state without requiring a full page reload.
2. **Undo stack** — implement a bounded action history (20–50 steps) for node moves, creates, and deletes.
3. **Markdown tables** — add table rendering to `markdown.js`.
4. **Worker rate-limit surfacing** — catch GitHub 403/429 responses in the Worker and return a structured error with a `retryAfter` field.
5. **Test coverage** — unit tests for `repo-data.js` (serialize/deserialize roundtrip, index correctness) and integration tests for the Worker sync flow.
6. **Export** — add a `GET /export` route to the Worker that returns a single JSON bundle of all graph data for backup or migration.
