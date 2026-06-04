# Data Model

This document provides a complete reference for every JSON field in the 2DKS data format (schema version 2).

---

## Overview

Graph data lives in a separate GitHub repository in two kinds of files:

```
public/graph/
├── index.json           Manifest: global settings, space registry, waypoints, sync state
└── spaces/
    ├── root.json        The root (top-level) space
    └── <spaceId>.json   One file per sub-space
```

The split-space format means each space is fetched independently. On boot, only `index.json` and the current space are loaded. Other spaces are loaded on demand when the user navigates into them.

---

## `index.json` — Manifest

The manifest is the single source of truth for everything that is not inside a specific space: navigation state, waypoints, sync history, known spaces, and per-space pan/zoom memory.

### Full schema

```json
{
  "schemaVersion": 2,
  "rootSpaceId": "root",
  "currentSpaceId": "root",
  "spaceTrail": [],
  "view": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "waypoints": [],
  "sync": {
    "sha": null,
    "lastSyncedAt": null
  },
  "spaceMemory": {
    "viewsBySpaceId": {}
  },
  "spaces": {
    "root": {
      "path": "spaces/root.json",
      "nodeCount": 0,
      "linkCount": 0,
      "fenceCount": 0,
      "updatedAt": null
    }
  }
}
```

### Field reference

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Always `2` in the current format. |
| `rootSpaceId` | string | Always `"root"`. The top-level space. |
| `currentSpaceId` | string | The space the user was in at last sync. On load, the app opens this space. |
| `spaceTrail` | string[] | Ordered list of node IDs from root down to the current space. Empty when at root. |
| `view` | ViewState | The canvas pan/zoom at the time of last save. |
| `waypoints` | Waypoint[] | Named views the user has saved (up to 9 usable with `1`–`9` keys). |
| `sync.sha` | string \| null | The git commit SHA from the last successful sync. |
| `sync.lastSyncedAt` | string \| null | ISO 8601 timestamp of the last sync. |
| `spaceMemory.viewsBySpaceId` | object | Map from space ID to ViewState. Remembers where each space was last viewed. |
| `spaces` | object | Map from space ID to SpaceMeta. Every known space has an entry here. |

### ViewState

```json
{ "x": -120.5, "y": 80.0, "zoom": 1.4 }
```

| Field | Type | Description |
|---|---|---|
| `x` | float | Horizontal pan offset in world coordinates. Positive = pan right. |
| `y` | float | Vertical pan offset in world coordinates. Positive = pan down. |
| `zoom` | float | Zoom level. `1.0` = 100%. Range: `0.1` – `5.0`. |

The canvas centre is always the world origin `(0, 0)` before pan is applied. A node at world position `(0, 0)` appears in the centre of the screen at `zoom=1` and `x=0, y=0`.

### Waypoint

```json
{
  "id": "waypoint-1693920000000",
  "name": "Overview",
  "view": { "x": -120.5, "y": 80.0, "zoom": 0.8 }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID, typically `waypoint-<timestamp>`. |
| `name` | string | Human-readable label shown in the waypoint bar. |
| `view` | ViewState | The pan/zoom to restore when jumping to this waypoint. |

### SpaceMeta

```json
{
  "path": "spaces/26-01-10_14-32-00_001.json",
  "nodeCount": 7,
  "linkCount": 3,
  "fenceCount": 1,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `path` | string | Relative path within `public/graph/` to the space file. |
| `nodeCount` | integer | Number of nodes at last sync (informational). |
| `linkCount` | integer | Number of links at last sync (informational). |
| `fenceCount` | integer | Number of groups at last sync (informational). |
| `updatedAt` | string \| null | ISO 8601 timestamp of the last update to this space. |

For the root space, `path` is always `"spaces/root.json"`. For sub-spaces, `path` is `"spaces/<url-encoded-spaceId>.json"`.

---

## Space Document (`spaces/*.json`)

Each space document is a self-contained graph: a set of nodes, links between them, and rectangular group boxes (fences).

### Full schema

```json
{
  "schemaVersion": 2,
  "spaceId": "root",
  "updatedAt": "2025-01-15T10:30:00.000Z",
  "nodeIds": ["26-01-10_14-32-00_001"],
  "nodesById": {
    "26-01-10_14-32-00_001": {
      "id": "26-01-10_14-32-00_001",
      "title": "Example Node",
      "content": "## Notes\n\nSome content here.\n\n[[Another Node]]",
      "x": 120.0,
      "y": -80.0,
      "size": 40,
      "color": "rgba(255, 255, 255, 0.05)",
      "shape": "circle"
    }
  },
  "linkIds": [],
  "linksById": {},
  "fenceIds": [],
  "fencesById": {}
}
```

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Always `2`. |
| `spaceId` | string | The ID of this space. Matches the key in `index.json`'s `spaces` map. |
| `updatedAt` | string | ISO 8601 timestamp of the last commit that touched this file. |
| `nodeIds` | string[] | Ordered list of node IDs. Defines display order. |
| `nodesById` | object | Map from node ID to Node object. |
| `linkIds` | string[] | Ordered list of link IDs. |
| `linksById` | object | Map from link ID to Link object. |
| `fenceIds` | string[] | Ordered list of fence (group box) IDs. |
| `fencesById` | object | Map from fence ID to Fence object. |

The `*Ids` arrays define iteration order. The `*ById` maps provide O(1) lookup. When deserialising, always use the `*Ids` arrays to determine order; do not rely on object key order.

---

## Node

```json
{
  "id": "26-01-10_14-32-00_001",
  "title": "My Note",
  "content": "## Section\n\nBody text with **bold** and [[wikilinks]].\n\n#project #research",
  "x": 250.0,
  "y": -120.0,
  "size": 40,
  "color": "rgba(100, 200, 255, 0.15)",
  "shape": "circle",
  "template": "note"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Timestamp ID. Format: `YY-MM-DD_HH-MM-SS_mmm`. Also used as the space ID if this node has been entered. |
| `title` | string | yes | Short display name shown on the canvas. Used as the wikilink target name (case-insensitive). |
| `content` | string | yes | Markdown body. Supports headings, lists, code blocks, wikilinks (`[[Title]]`), embeds (`![[Title]]`), and tags (`#tag`). |
| `x` | float | yes | World-space X position. Canvas centre is `x=0`. Increasing X moves right. |
| `y` | float | yes | World-space Y position. Canvas centre is `y=0`. Increasing Y moves down. |
| `size` | float | yes | Node radius in world units. Default `40`. Affects both hit area and visual size. |
| `color` | string | yes | CSS color string. Default `"rgba(255, 255, 255, 0.05)"`. |
| `shape` | string | yes | `"circle"` \| `"square"` \| `"triangle"`. Default `"circle"`. |
| `template` | string | no | Optional. Records which template was used at node creation (e.g. `"note"`, `"idea"`, `"task"`). Not currently displayed; informational. |

### Tags

Tags are parsed from both `title` and `content` using the pattern `(^|\s)#([a-zA-Z0-9/_-]+)`. They are not stored as a separate field; they are extracted at runtime. Tags appear in the tag filter bar and drive the active tag filter.

### Wikilinks

The pattern `[[Target Title]]` in `content` creates an implicit link to a node with that title in the same space. The alias form `[[Target Title|Display Text]]` is also supported. Embeds use `![[Target Title]]` and render the target node's content inline in hover previews.

### Coordinate System

All positions are in world space. The canvas origin `(0, 0)` is the centre of the viewport at zoom 1 with no pan. Coordinates are not clamped; the canvas is infinite in all directions. Zoom and pan are stored in the manifest's `view` and `spaceMemory`, not in the node itself.

---

## Link

```json
{
  "id": "node:26-01-10_14-32-00_001->node:26-01-10_14-33-00_002::true",
  "from": "26-01-10_14-32-00_001",
  "fromType": "node",
  "to": "26-01-10_14-33-00_002",
  "toType": "node",
  "label": "leads to",
  "note": "Follow-up required",
  "directed": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Derived key. Format: `<fromType>:<from>-><toType>:<to>:<label>:<note>:<directed>`. Do not hand-craft this; let the app generate it. |
| `from` | string | yes | ID of the source node or fence. |
| `fromType` | string | yes | `"node"` \| `"fence"`. |
| `to` | string | yes | ID of the target node or fence. |
| `toType` | string | yes | `"node"` \| `"fence"`. |
| `label` | string | yes | Display label drawn on the edge. Empty string if no label. |
| `note` | string | yes | Additional note. Not currently displayed on the canvas (reserved). |
| `directed` | boolean | yes | If `true`, draws an arrowhead pointing toward the target. |

Links between nodes created via the `L` key are manual links. Wikilinks in `content` create implicit connections that appear in the backlinks panel but are not represented as Link objects in the space document.

Links can connect nodes to fences and fences to nodes. When `fromType` or `toType` is `"fence"`, the endpoint is the centre of the fence rectangle.

---

## Fence (Group Box)

```json
{
  "id": "26-01-10_15-00-00_000",
  "name": "Phase 1",
  "x": 80.0,
  "y": 120.0,
  "w": 480.0,
  "h": 320.0,
  "collapsed": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Timestamp ID. |
| `name` | string | yes | Display label shown at the top of the fence. Default `"Group"`. |
| `x` | float | yes | World-space left edge of the rectangle. |
| `y` | float | yes | World-space top edge of the rectangle. |
| `w` | float | yes | Width in world units. Minimum `0`. |
| `h` | float | yes | Height in world units. Minimum `0`. |
| `collapsed` | boolean | yes | If `true`, the fence renders as a compact pill (`180 × 44`) and any nodes within the original bounds are hidden. |

Node membership in a fence is determined geometrically at render time: a node is "inside" a fence if its `(x, y)` position falls within `[fence.x, fence.x + fence.w] × [fence.y, fence.y + fence.h]`. There is no explicit membership list.

---

## ID Format

All entity IDs use a timestamp-based format generated by `generateTimestampId` in `repo-data.js`:

```
YY-MM-DD_HH-MM-SS_mmm
```

Where:
- `YY` = 2-digit year
- `MM` = month (01–12)
- `DD` = day (01–31)
- `HH` = hour (00–23)
- `MM` = minute (00–59)
- `SS` = second (00–59)
- `mmm` = millisecond (000–999)

Example: `26-01-10_14-32-00_001` was created at 2026-01-10 14:32:00.001.

The generator is monotonic: if two IDs are generated within the same millisecond, the second gets `lastMs + 1`.

Because node IDs double as space IDs, the space file path for a node is deterministic: `spaces/<url-encoded-id>.json`. For the root space it is always `spaces/root.json`.

---

## Schema Evolution

The `schemaVersion` field in both the manifest and space documents is `2` for all current files.

**Schema 1** (legacy): graph data was stored as a single monolithic JSON blob in `localStorage`, keyed by `2dks-data`. A `convertLegacyData` function in `repo-data.js` handles automatic migration from the legacy format when the app boots.

**Schema 2** (current): split-space format with a separate manifest and per-space files. Node IDs use the timestamp format. The manifest includes `spaceMemory` for per-space view persistence.

A migration from numeric/legacy IDs to timestamp IDs is available via `scripts/migrate-ids-to-timestamp.mjs`.

---

## Editing Graph Data Manually

The JSON files on the `data` branch are plain JSON and can be edited with any text editor. Guidelines:

- Always maintain the `nodeIds`, `linkIds`, and `fenceIds` arrays in sync with the corresponding `*ById` maps.
- Node titles must be unique within a space for wikilinks to resolve correctly.
- Do not reuse node IDs across spaces.
- After manually editing files, push to the `data` branch. The app will pick up the changes on next load or after a manual refresh.
- The `updatedAt` field in space documents is informational; the app does not gate loading on it.
- Do not add fields not defined in the schema. Unknown fields are silently discarded by the normalisation functions.
