# What Is 2DKS?

2DKS is a personal knowledge map. Instead of storing your notes as a list of files in folders, 2DKS puts each note on an infinite canvas — a space you can zoom and pan around freely, like a digital whiteboard that never runs out of room.

Each note is a circle (or square, or triangle) on the canvas. You click one to read it, drag it to move it, and draw lines between notes to show how ideas connect. The whole thing looks a bit like a mind map, but with the full power of a proper note-taking app inside each node.

---

## What Can I Use It For?

**Personal knowledge base** — Keep everything you know about a topic in one visual space. Connect related ideas with lines. See the shape of your thinking at a glance.

**Project planning** — Create a node for each task or idea. Group related nodes together. Draw arrows to show dependencies. Use the force layout to automatically spread things out.

**Research notes** — Write long Markdown notes inside each node. Link between notes using `[[double brackets]]`, just like in Obsidian or Roam. Click a link to jump to the target note, or auto-create it if it does not exist yet.

**Decision trees** — Build a graph that walks through a decision. Use labelled arrows to show options. Nest sub-topics inside nodes with a double-click to "zoom in" to a new space.

**Reference library** — Tag your notes with `#tags`. Filter the canvas to show only notes with a given tag. Search everything with `Ctrl+K`.

---

## Key Ideas

### The Canvas

The canvas is infinite. You can zoom in to read fine detail or zoom out to see the whole picture. Pan by clicking and dragging on empty space. Zoom with the scroll wheel. Nothing is ever cut off or hidden behind a scroll bar.

### Nodes

Every piece of information lives in a node. A node has:
- A **title** — the short name you see on the canvas
- A **body** — a longer Markdown note you open in the editor panel

Nodes can be styled with different colours and shapes. Their size can be adjusted.

### Links

Draw a line between two nodes by pressing `L` while a node is selected, then clicking the target node. Lines can have labels (for example "leads to", "depends on", "contradicts"). Arrows show direction.

Wikilinks inside the note body (`[[Note Title]]`) also create implicit connections and appear in the backlinks panel.

### Spaces

Every node can contain its own sub-graph. Double-click a node to "enter" it and see its private canvas. This lets you nest topics inside topics without cluttering the top level. Navigate back with `B`.

The breadcrumb trail at the top shows where you are: `ROOT > Project > Sub-topic`.

### Groups

Draw a rectangle around a cluster of nodes to create a Group. Groups can be labelled, moved as a unit, and collapsed into a small pill to reduce visual clutter.

---

## How Is My Data Saved?

Your data is saved in two places:

1. **Your browser** — Every change you make is saved automatically to your browser's local storage within a second. If you close the tab and reopen it, your work is right where you left it.

2. **GitHub** — When you press `S`, the app syncs all your changes to a private GitHub repository. This creates a permanent, versioned backup of your knowledge graph. Every sync is a git commit, so you can browse the history or roll back if something goes wrong.

The GitHub sync goes through a Cloudflare Worker — a small server-side piece that handles authentication and writes to GitHub on your behalf. The app itself (the code you run in your browser) never stores your data; it just displays it.

### What if I am offline?

You can use 2DKS without an internet connection as long as you have previously loaded it in that browser. Your changes accumulate locally. When you come back online and press `S`, everything syncs.

### Is my data private?

The GitHub repository that holds your graph data can be a **private** repo. Only people with access to that repo (and the Cloudflare Worker's GitHub token) can read your graph. The worker itself is protected by Cloudflare Access, which requires authentication before anyone can reach it.

---

## Keyboard-First

2DKS is designed to be fast. Most actions have a single-letter shortcut. You rarely need to reach for a menu. A quick reference is printed on the canvas hint bar (press `H` to show it).

The most important ones:
- `N` — new note at the cursor
- `E` — open or close the editor for the selected note
- `S` — sync to GitHub
- `Ctrl+K` — search everything
- `1`–`9` — jump to a saved view (waypoint)

---

## What 2DKS Is Not

2DKS is not a team collaboration tool. It is designed for a single person (or a single household) using a private GitHub repo. There is no real-time multiplayer editing.

It is also not a replacement for a full document editor. The Markdown support covers everyday note-taking (headings, bullets, code blocks, links) but does not implement every edge case of the CommonMark specification.
