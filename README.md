# 2DKS

2DKS is a canvas-based 2D knowledge map with nested spaces, markdown notes, wikilinks, lightweight graph editing, and GitHub sync through a Cloudflare Worker.

The intended production setup is a single repo with two branches:

- `main` branch: frontend and Worker code
- `data` branch: graph truth only — `public/graph/index.json` plus `public/graph/spaces/*.json`

The Worker serves graph reads from the configured branch and writes sync commits back to that same branch.
The `main` branch never stores graph truth files; they live only on the `data` branch.

## Run

Install dependencies:

```bash
npm install
```

Frontend only:

```bash
npm run dev
```

Cloudflare Access-protected Worker runtime with sync:

```bash
export GITHUB_TOKEN=your_token_here
npm run dev:worker
```

Build:

```bash
npm run build
```

Deploy:

```bash
npm run deploy
```

## Runtime model

- `npm run dev` starts Vite only.
  It does not enforce Cloudflare Access and cannot sync to GitHub.
- `npm run dev:worker` runs the Worker and static assets together.
  This is the real app path for Access-gated graph reads and sync.
- In Worker mode, the app reads graph JSON through `/graph/...`, and the Worker fetches those files from the configured GitHub repo and branch (`data`).
- Sync writes to the `data` branch by committing files in `public/graph/`.
  It does not update your local clone automatically.

## Worker config

Configured in [`wrangler.jsonc`](./wrangler.jsonc):

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`

Set these in Cloudflare for production:

- `GITHUB_TOKEN`

`GITHUB_REPO` points at this same repo, and `GITHUB_BRANCH` selects the `data` branch that holds graph truth. `GITHUB_TOKEN` must have write access to the repo locally and in deployment.

## Current features

- Infinite canvas with zoom and pan
- Draggable nodes with color, size, and shape styling
- Per-space graph storage with lazy loading
- Per-space canvas location memory across refresh and sync
- Local autosave
- Cloudflare Access-protected Worker deployment
- GitHub sync
- Markdown notes
- Clickable `[[wikilinks]]`
- Auto-create missing wikilink targets
- `![[embeds]]` in markdown previews
- Hover preview cards with markdown rendering and embed support
- Backlinks panel
- Search palette with `Ctrl/Cmd+K`
- Waypoints with `1-9` jump
- Tag parsing and tag filters
- Multi-select and drag-select
- Manual links with labels and direction
- Group boxes with collapse/expand
- Layout tools: grid, circle, radial, force
- Minimap
- Pinned inspector
- Minimal chrome toggled by `H`

## Controls

- `N`: create a node at cursor
- `E`: open or close the selected node editor
- `L`: start linking from selected node
- `G`: create a group
- `K`: save current view as waypoint
- `1-9`: jump to a waypoint
- `M`: toggle multi-select mode
- `B`: go back one subspace level
- `F`: toggle fullscreen
- `V`: toggle hover preview cards
- `S`: sync to GitHub
- `H`: show or hide app chrome
- `Ctrl/Cmd+K`: open search palette
- `Delete` or `Backspace`: delete selected nodes
- `Double-click node`: enter that node's space
- `Double-click empty canvas`: create a node and open its editor
- `Right-click node`: open the node editor
- `Double-click group`: collapse or expand group
- `Right-click group`: open the group editor
- `Right-click waypoint`: open the waypoint editor

## Notes

- The app is intentionally compact and keyboard-driven.
- Chrome like status, waypoints, breadcrumbs, hint bar, and minimap are hidden by default behind `H`.
- The editor supports backlinks, templates, layout actions, and tag filtering in the current space.
- Search, backlinks, tags, hover previews, embeds, wikilink lookup, and remembered space locations use in-memory indexes plus manifest state from the current graph data.

## Data shape

The synced graph now uses:

```text
public/graph/index.json
public/graph/spaces/root.json
public/graph/spaces/<spaceId>.json
```

- `index.json` stores schema version, current view, current space, waypoints, sync info, and known spaces.
- `index.json` also stores per-space remembered view state so each space restores its own pan/zoom on refresh and after sync on another device.
- Each space file stores normalized `nodesById`, `linksById`, `fencesById`, plus ordered id lists.
- UI-only state such as filters and pinned panels stays local in browser storage and is not committed to the repo.

These files live on the `data` branch of this repo. The Worker reads and writes them there; the deployed app bundle is not the source of truth.

## Migration

- Legacy monolithic graph data can be converted with [`scripts/migrate-legacy-data.mjs`](./scripts/migrate-legacy-data.mjs).
- The Worker now commits `public/graph/index.json` and only the changed files under `public/graph/spaces/`.
- Data branch setup is documented in [`docs/data-branch-setup.md`](./docs/data-branch-setup.md).
