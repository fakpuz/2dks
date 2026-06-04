# User Guide

This guide explains every feature of 2DKS with enough detail for someone who has never used a visual knowledge map before. You do not need to know how to code.

---

## The Canvas

When you open 2DKS you see a dark canvas with a faint grid. This is your infinite workspace. There is no edge, no scroll bar, and no page boundary. You can put things anywhere.

**Zoom** — Scroll the mouse wheel to zoom in and out. The canvas goes from 10% to 500% zoom. You can zoom right in to read fine text or zoom out to see the whole picture.

**Pan** — Click and drag on empty space to slide the canvas around.

**Origin** — There is a faint cross-hair marking the world centre (0, 0). This is just a reference point. Your notes can go anywhere relative to it.

---

## Nodes

A node is a circle (or square, or triangle) that holds a note. Every piece of information you add becomes a node.

### Creating Nodes

**Press `N`** — Creates a new note at the current cursor position. The editor panel opens automatically.

**Double-click empty canvas** — Creates a new note at that spot and opens the editor.

### The Editor Panel

The editor slides in from the right. It has two fields:

- **Title** — The short label shown on the canvas. This is also the name used in wikilinks. Press `Enter` to jump to the body.
- **Body** — A Markdown note. Supports headings, bold, italic, bullet lists, numbered lists, code blocks, checkboxes, and more. Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) to close the editor.

**Open the editor**: click a node to select it, then press `E`. Or right-click a node.

**Close the editor**: press `E` again, press `Escape`, or press `Ctrl+Enter` inside the body.

### Selecting Nodes

**Click a node** — selects it. A selection ring appears around it.

**Shift-click** — adds to (or removes from) the selection.

**`M` key** — toggles Multi-Select Mode. In this mode, clicking nodes adds them to the selection without needing to hold Shift.

**Drag-select** — in Multi-Select Mode, click and drag on empty canvas to draw a selection rectangle. All nodes inside the box become selected.

### Moving Nodes

**Drag a selected node** — moves it. If multiple nodes are selected, they all move together.

### Deleting Nodes

Select one or more nodes, then press **`Delete`** or **`Backspace`**.

If a deleted node has a sub-space (you have previously double-clicked into it), that sub-space and all its descendants are removed on the next GitHub sync.

### Styling Nodes

With a node selected, the **Style Panel** appears at the bottom of the editor. Use it to:

- Change the **size** (drag the slider)
- Change the **color** (click a color swatch)
- Change the **shape** (circle, square, or triangle)

---

## Links

Links are the lines drawn between nodes. They represent relationships.

### Creating a Link

1. Select a node.
2. Press **`L`**. The cursor changes to show you are in link mode.
3. Click another node. A line appears between them.

When linking two regular notes, 2DKS automatically adds a wikilink (`[[Note Title]]`) to the source note's body, which also shows up in the target's backlinks panel.

When linking a note to a group box (or a group to a group), a dialog appears asking for a **label** and an optional **note**. Fill these in or leave them blank.

### Link Direction

Links have an arrowhead showing direction. The source is the node you selected before pressing `L`; the target is the node you clicked.

### Deleting a Link

Links disappear automatically when either endpoint node is deleted. There is currently no direct UI to delete a specific link without deleting a node; to remove a link between two notes, delete the `[[wikilink]]` from the source note's body and the line will disappear on next render.

---

## Markdown Notes

The body of every node is a Markdown document. Markdown is a simple way of writing formatted text using plain characters.

### Supported Formatting

| What you type | What it looks like |
|---|---|
| `# Heading 1` | Large heading |
| `## Heading 2` | Medium heading |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strike~~` | ~~strike~~ |
| `` `code` `` | inline code |
| ` ```code block``` ` | fenced code block |
| `- item` | Bullet list item |
| `1. item` | Numbered list item |
| `- [ ] task` | Unchecked task |
| `- [x] task` | Checked task |
| `> quote` | Block quote |
| `[text](https://url)` | Clickable link |
| `---` | Horizontal rule |
| `==highlight==` | Highlighted text |

### Wikilinks

Type `[[Note Title]]` anywhere in the body to create a wikilink. When you hover over the note in preview mode (see below), or when the editor is open, the link is clickable. Clicking it jumps to that note, or creates it if it does not exist yet.

You can use an alias: `[[Actual Title|Display Text]]` shows "Display Text" but links to "Actual Title".

### Embeds

Type `![[Note Title]]` to embed another note's body inline. This is visible in hover previews and in the backlinks panel.

### Tags

Type `#tag` anywhere in the title or body to tag a note. Tags can contain letters, numbers, hyphens, slashes, and underscores. Example: `#project/research`, `#idea`, `#todo`.

Tags appear in the **Tag Filter Bar** (visible when the chrome is shown with `H`). Click a tag to filter the canvas to show only tagged notes.

---

## Hover Previews

When **`V`** is toggled on, hovering over a node shows a floating card with the note's title and rendered Markdown body (including any embedded notes).

Press **`V`** again to turn previews off.

---

## Sub-Spaces

Every node can contain its own nested canvas. Double-click a node to "enter" it. The canvas clears and you see a fresh space dedicated to that node's sub-topics.

### Navigating Spaces

**Breadcrumb trail** (visible when chrome is shown with `H`) — shows the path from root to the current space: `ROOT > Project > Sub-topic`. Click any breadcrumb segment to jump back to that level.

**`B` key** — goes back one level to the parent space.

**`Escape`** — resets the view to the origin and deselects everything (but does not go back).

The last view position (pan and zoom) of every space is remembered. When you return to a space, the canvas is restored to where you left it.

---

## Groups (Fences)

A Group is a labelled rectangle that contains a cluster of nodes. Use groups to visually organise related nodes on the same canvas.

### Creating a Group

Press **`G`** — a new group appears at the cursor. Drag it to position it. Drag the edges to resize (not yet implemented; resize by re-creating the group or using "Fit to nodes").

### Group Editor

Right-click a group to open its editor. You can:
- Change the **name**
- Click **Fit to nodes** — resizes the group to snugly contain all nodes inside it
- Click **Collapse/Expand** — toggles the compact view

### Collapsing a Group

A collapsed group renders as a small pill showing just the group name. All nodes inside disappear from view. This is useful for tidying up areas you are not currently working on.

Double-click a group to toggle collapse.

---

## Waypoints

A waypoint saves your current pan/zoom position so you can jump back to it later.

**`K`** — saves the current view as a new waypoint. The waypoint editor opens so you can name it.

**`1`–`9`** — jumps to the 1st through 9th waypoint.

Right-click a waypoint marker (visible in the waypoint bar when chrome is shown) to rename it, update it to the current view, or delete it.

Waypoints are saved to GitHub on sync and restored across devices.

---

## Backlinks Panel

The backlinks panel, inside the editor, shows every note in the current space that links to the selected note (either via a wikilink in its body or a manual link). This helps you see where a note is referenced without having to search.

---

## Search

**`Ctrl+K`** (or `Cmd+K` on Mac) — opens the Search Palette.

Start typing to search by title or body text. Results update as you type.

Click a result to jump to that note (the canvas pans to centre it and the editor opens).

If no results are found, the palette shows a **Create** option. Click it to create a new note with your search text as the title.

Press `Escape` to close the search without navigating.

---

## Layout Tools

With one or more nodes selected, the **Layout** buttons in the editor allow you to automatically arrange them:

| Layout | Behaviour |
|---|---|
| Grid | Arranges nodes in a rectangular grid centred on their collective midpoint |
| Circle | Places nodes evenly around a circle |
| Radial | Similar to circle but with slight radius variation for visual depth |
| Force | Runs a repulsion simulation to spread nodes out while keeping them close to the centre |

You can apply a layout to just the selected nodes (select several, then choose a layout), or to all nodes on the current canvas (deselect everything, then choose a layout).

---

## Sync to GitHub

**`S`** — syncs all pending changes to the `data` branch on GitHub.

A sync creates a git commit containing the updated `index.json` and any changed space files. The commit message includes the current timestamp.

A toast notification at the bottom of the screen shows:
- **Synced SHA: abc1234** — success
- **Sync failed: [error message]** — failure (see the Troubleshooting guide)

Your data is saved locally (in the browser) on every change, even without syncing. Sync is needed to back up to GitHub and to see changes on other devices.

---

## Minimal Chrome Mode

**`H`** — toggles the visibility of the status bar, waypoint bar, breadcrumbs, hint overlay, and minimap.

By default, chrome is hidden to keep the canvas clean. Press `H` to see the navigation elements.

---

## Minimap

When chrome is visible (`H`), the minimap appears in the corner. It shows a bird's-eye view of all nodes and groups on the current canvas. Your current viewport is shown as a rectangle on the minimap.

---

## Fullscreen

**`F`** — toggles browser fullscreen mode for a distraction-free editing experience.

---

## Templates

When creating a node with `N`, the default template is a blank note. The app includes additional templates accessible from the Template Picker in the editor:

| Template | Pre-filled content |
|---|---|
| Note | Blank |
| Idea | Idea section with "Why it matters" and "Next step" |
| Question | "What do we still need to understand?" prompt |
| Task | Checklist with Next action, Owner, Deadline |
| Reference | Source, Summary, Key quote |

---

## Complete Keyboard Reference

### Navigation

| Key | Action |
|---|---|
| Scroll wheel | Zoom in/out |
| Drag empty canvas | Pan |
| `1`–`9` | Jump to waypoint 1–9 |
| `B` | Go back one sub-space level |
| `F` | Toggle fullscreen |
| `Escape` | Reset view to origin; deselect all; close panels |

### Nodes and Editing

| Key | Action |
|---|---|
| `N` | Create a new node at the cursor |
| `E` | Open or close the editor for the selected node |
| `Delete` / `Backspace` | Delete selected nodes |
| `Ctrl+Enter` / `Cmd+Enter` (in editor) | Close the editor |

### Canvas Tools

| Key | Action |
|---|---|
| `L` | Start a link from the selected node or group |
| `G` | Create a new group at the cursor |
| `K` | Save the current view as a waypoint |
| `M` | Toggle multi-select mode |
| `J` | Apply grid layout to selection (or all nodes) |

### Display Toggles

| Key | Action |
|---|---|
| `H` | Show or hide the status bar, breadcrumbs, waypoints, minimap, and hint overlay |
| `V` | Toggle hover preview cards |

### Global

| Key | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Open the search palette |
| `S` | Sync changes to GitHub |

### Mouse Actions

| Action | Result |
|---|---|
| Click node | Select node |
| Shift+click node | Add to / remove from selection |
| Click empty canvas | Deselect all; start pan |
| Drag node | Move node (and all selected nodes) |
| Drag group | Move group (and nodes inside it) |
| Double-click node | Enter node's sub-space |
| Double-click empty canvas | Create a node at that location |
| Double-click group | Collapse or expand group |
| Right-click node | Open node editor |
| Right-click group | Open group editor |
| Right-click waypoint | Open waypoint editor |
| Scroll wheel | Zoom |
