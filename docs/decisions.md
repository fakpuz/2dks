# Architectural Decisions

This document records the key decisions behind how 2DKS is built, and the reasoning for each one. These are not rules; they are explanations that give future contributors (or AI assistants) the context needed to make consistent changes.

---

## Decision 1: Separate Data Branch

**What**: Graph data (`index.json` and space files) lives on a dedicated `data` branch of the app repo (`fakpuz/2dks`). It is an orphan branch that shares no history with `main`; `main` contains only code. The Worker reads and writes `public/graph/...` on the `data` branch via the GitHub API.

**Why**:

The most obvious alternatives would be to bundle the graph data alongside the app code on `main`, store it in a database, or keep it in an entirely separate repository. Each has downsides for a personal, single-user tool:

- **Bundled on `main`** would mix personal notes with code history, making `main` messy and awkward to open-source. Every sync commit would trigger CI on the code branch. The deployed SPA bundle would contain private data.

- **A database** (e.g. PlanetScale, Supabase, D1) adds operational complexity: migrations, backups, connection pooling, pricing tiers. For a personal tool it is overkill.

- **A second repository** (the project's earlier design) gives clean separation but means two repos to clone, fork, and grant access to, and two places to keep tokens and permissions straight.

An orphan branch in the same repo keeps the best of the separate-repo approach while collapsing it to one repo: it is free, gives a clean commit history of every knowledge-graph edit kept apart from code history, and lets the data be versioned and rolled back independently of code. The `data` branch is a self-describing archive — only JSON — so the notes can be read without the app, and there is a single repo to manage.

---

## Decision 2: Cloudflare Access for Authentication

**What**: The Worker domain is protected by Cloudflare Access. No auth logic exists inside the Worker itself.

**Why**:

The Worker holds a GitHub token with write access to a private repository. Without authentication, anyone who discovered the Worker URL could trigger arbitrary commits to the `data` branch.

Options considered:

- **Roll a custom auth scheme** (cookie-based sessions, JWT, OAuth callback in the Worker) — requires managing token storage, expiry, refresh logic, and security review. High complexity for a personal tool.
- **HTTP Basic Auth via Workers** — simple but credentials would need to be embedded somewhere accessible to the browser, which creates a leak vector.
- **Cloudflare Access** — zero code in the Worker. CF Access is configured at the Cloudflare dashboard level, runs before the request reaches the Worker, and enforces strong identity (email OTP, SSO, or OAuth providers). It is free for up to 50 users. The Worker never sees unauthenticated requests.

The tradeoff is that Cloudflare Access only works in production. In `npm run dev:worker`, Access is not enforced and any machine with the Worker URL and the local Wrangler port can reach the Worker. This is acceptable for a local dev server.

The SPA has a safety net: if it receives an HTML page (the Cloudflare Access login redirect) instead of JSON at `/graph/index.json`, it detects the pattern ("cloudflare access", "access denied", "login" text), clears the local session, and shows a clear warning. This prevents confusing errors if a session expires.

---

## Decision 3: Vanilla JavaScript (No Framework)

**What**: The frontend uses no JavaScript framework. All DOM manipulation, event handling, and rendering are written in plain JavaScript.

**Why**:

The rendering surface is an HTML Canvas element, not the DOM. Node layout, link drawing, hit testing, zoom transforms, and animation all go through Canvas 2D API calls. A virtual DOM framework (React, Vue, Svelte) would not help here because the canvas is a single `<canvas>` element — there is nothing for a VDOM to diff.

The UI panels (editor, style panel, search palette) are relatively simple and small. Writing them in vanilla JS avoids:
- Build-time complexity (JSX transforms, reactive compilers)
- Runtime overhead (reconciliation, reactive dependency tracking)
- Tight coupling to a framework's mental model

The codebase is already minimal: 11 source files, no external runtime dependencies. A framework would add more code than it saves.

The cost is that DOM bindings are manual (`document.getElementById`, `addEventListener`, `oninput`). For this project, that is acceptable because the UI surface is intentionally small and keyboard-driven. Most user-facing complexity lives in the canvas, not in the DOM.

---

## Decision 4: GitHub as the Data Store

**What**: Sync uses the GitHub Git Data API to write commits directly, rather than using a traditional database or cloud storage.

**Why**:

Using GitHub as a storage backend gives several things for free:
- **Version history** — every sync is a commit. You can browse what your graph looked like on any date.
- **Rollback** — if you delete something accidentally and sync, you can restore from a previous commit.
- **Portable format** — the `data` branch is plain JSON. It can be checked out, browsed on GitHub, or processed by scripts without the app.
- **No database infrastructure** — no Postgres, no Redis, no migrations, no connection strings, no backup jobs.
- **Private by default** — a private GitHub repo is as private as any cloud storage, with good access control.

The low-level Git Data API (blobs → tree → commit → ref update) rather than the simpler Content API (PUT `/contents/:path`) is used because it allows atomic multi-file commits. A single sync operation updates `index.json` and any number of space files in one commit, which keeps the history clean.

The drawback is that GitHub has API rate limits (5000 requests/hour for authenticated personal access tokens). Each sync uses roughly 4 + (2 × number of changed spaces) API calls. For a single user this limit is almost impossible to hit. If the project were to be shared among many concurrent users, a different storage approach would be needed.

---

## Decision 5: Lazy Space Loading

**What**: Only the root space and the currently active space are fetched on boot. Other spaces are loaded on demand when the user navigates into them.

**Why**:

A knowledge graph can grow to hundreds of spaces. Fetching all of them on every page load would be slow and would hit the GitHub API many times. The manifest's `spaces` map contains node/link/fence counts for every space, so the app can show meaningful information (the breadcrumb trail, space count in the HUD) without loading every file.

The tradeoff is that navigating into a space for the first time requires a fetch. In practice this is fast (GitHub's CDN caches file content). The space is kept in `state.spaces` for the rest of the session, so subsequent navigations are instant.

Search currently only searches loaded spaces. If you need to search a space you have not visited in the current session, navigate into it first. A future improvement could index all spaces on boot (fetching them in the background) to enable cross-space search.

---

## Decision 6: IDs as Space Identifiers

**What**: Every node's ID is also the ID of that node's sub-space. The space file path is deterministic: `spaces/<url-encoded-node-id>.json`.

**Why**:

The alternative would be to generate a separate space ID when a node is first entered. This requires storing a `spaceId` field on the node and a mapping in the manifest.

Using the node ID as the space ID:
- Eliminates a level of indirection. Entering node `abc` always loads `spaces/abc.json`.
- Keeps the data model simpler. There is no `spaceId` field on nodes.
- Makes the file layout self-documenting. Looking at the spaces directory tells you which nodes have sub-spaces.

The consequence is that renaming a node (changing its title) does not affect the space file path. The space is tied to the node's ID, not its title. This is intentional: node titles can change freely; sub-space contents should not move.

---

## Decision 7: Local-First with Manual Sync

**What**: Every change is saved to `localStorage` immediately. GitHub sync is manual (`S` key), not automatic.

**Why**:

Automatic background sync introduces complexity:
- Debouncing: how long to wait before syncing after the last change?
- Conflict detection: what if two writes happen simultaneously?
- Error recovery: if auto-sync fails silently, the user may not notice.

Manual sync keeps the mental model simple: your data is saved locally always, and you push to GitHub when you are ready. The `S` key is a deliberate commit gesture.

The `localStorage` cache also serves as an offline buffer. If you make changes without internet access, the dirty-space tracking (`state.dirtySpaces`) ensures those changes are included in the next sync whenever it happens.

The one risk is user error: if the user forgets to sync on Device A, edits on Device B, and syncs from B, then syncs from A, Device A's changes will create a new commit that overwrites B's changes (since the Worker always fast-forwards without merge). A future improvement could detect diverged state (by comparing the local `sync.sha` with the remote HEAD) and warn before overwriting.

---

## Decision 8: Custom Markdown Renderer

**What**: Markdown is rendered by a custom function in `markdown.js`, not by an external library like `marked` or `remark`.

**Why**:

The rendered Markdown never leaves the app's UI. It does not need to handle every edge case in the CommonMark specification. What it does need:

- No external dependencies (keeping the bundle zero-dependency at runtime)
- Wikilink rendering (`[[target]]` → clickable span)
- Embed resolution (`![[target]]` → inline content from another node)
- Highlight marks (`==text==`)

These custom extensions would require a plugin in any standard library, adding configuration and code anyway. The custom renderer handles all of them natively and is ~136 lines. It covers the subset of Markdown that a knowledge-graph note-taking tool actually needs: headings, bold, italic, inline code, code blocks, lists, task lists, blockquotes, external links, and the custom extensions.

The tradeoff is that nested lists, tables, footnotes, and HTML passthrough are not supported. These can be added incrementally to `markdown.js` as needed.

---

## Decision 9: Single Mutable State Object

**What**: All application state lives in a single exported object (`state` in `state.js`) that is mutated in place.

**Why**:

The canvas is re-rendered on every animation frame (`requestAnimationFrame`). The renderer reads directly from `state` without any subscription mechanism. An immutable/reactive state approach (like Redux or Zustand) would require either re-rendering the whole canvas on every state update or building a diff-and-patch system for canvas elements — neither of which is straightforward.

Mutable shared state with a clear module boundary is the simplest approach for this kind of canvas application. The `state.js` module is the only place the state object is defined. All other modules import from it. Mutation happens in `graph.js` (node/link/fence changes) and `input.js` (selection, pan, zoom). The `state.js` module exports helper functions to keep logic close to the data it operates on.

The tradeoff is that state mutations are not tracked or auditable (no undo/redo). A future undo stack would need to snapshot `state.spaces[currentSpaceId]` before mutations.
