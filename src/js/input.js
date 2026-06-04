import { applyLayout, createNodeAt, findFenceAt, getNodesInFence, NODE_TEMPLATES } from './graph.js';
import { generateTimestampId } from './repo-data.js';
import { getRememberedSpaceView, rememberSpaceView } from './space-memory.js';
import { currentFences, currentLinks, currentNodes, ensureSpace, getCurrentNode, removeSpaceTree, state } from './state.js';
import { hitNode, toWorld } from './render.js';
import { ensureSpaceLoaded, notifyToast, saveToCloud, saveToStorage } from './storage.js';
import { closeAllPanels, editor, enterSpace, openEditor, openGroupEditor, openWaypointEditor, refreshHUD, searchUI, syncEditorToSelection, updateBreadcrumbs, updateTagFilterBar, updateWaypointUI, waypointEditor } from './ui.js';

function ensureNodeLinkInContent(sourceNode, targetNode) {
    if (!sourceNode || !targetNode) return false;
    const targetTitle = (targetNode.title || "Untitled").trim() || "Untitled";
    const escapedTitle = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingPattern = new RegExp(`\\[\\[${escapedTitle}(?:\\|[^\\]]+)?\\]\\]`, "i");
    if (existingPattern.test(sourceNode.content || "")) {
        return false;
    }

    const content = (sourceNode.content || "").trimEnd();
    sourceNode.content = content ? `${content}\n\n[[${targetTitle}]]` : `[[${targetTitle}]]`;
    return true;
}

function removeInvalidLinks() {
    const validIds = new Set(currentNodes().map((node) => node.id));
    const validFenceIds = new Set(currentFences().map((fence) => fence.id));
    state.spaces[state.currentSpaceId].links = currentLinks().filter((link) => {
        const fromValid = (link.fromType || "node") === "fence" ? validFenceIds.has(link.from) : validIds.has(link.from);
        const toValid = (link.toType || "node") === "fence" ? validFenceIds.has(link.to) : validIds.has(link.to);
        return fromValid && toValid;
    });
}

function dedupeLinks() {
    const seen = new Set();
    state.spaces[state.currentSpaceId].links = currentLinks().filter((link) => {
        const key = `${link.fromType || "node"}:${link.from}:${link.toType || "node"}:${link.to}:${link.label || ""}:${link.directed !== false}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function selectSingle(nodeId) {
    state.selectedIds = [nodeId];
    state.selectedFenceId = null;
    refreshHUD();
    syncEditorToSelection();
}

function selectFence(fence, selectMembers = false) {
    state.selectedFenceId = fence.id;
    state.selectedIds = selectMembers ? getNodesInFence(fence).map((node) => node.id) : [];
    refreshHUD();
}

function addNewNode(worldX, worldY) {
    const template = "note";
    const node = createNodeAt(worldX ?? -state.view.x, worldY ?? -state.view.y, template);
    node.template = template;
    selectSingle(node.id);
    openEditor(node);
    saveToStorage();
}

async function loadDescendantSpaces(spaceId, visited = new Set()) {
    const key = String(spaceId);
    if (key === "root" || visited.has(key) || !state.manifest.spaces?.[key]) return visited;

    visited.add(key);

    try {
        await ensureSpaceLoaded(key);
    } catch {
        return visited;
    }

    const childNodes = state.spaces[key]?.nodes || [];
    for (const node of childNodes) {
        if (state.manifest.spaces?.[node.id]) {
            await loadDescendantSpaces(node.id, visited);
        }
    }

    return visited;
}

async function deleteSelected() {
    if (state.selectedIds.length === 0) return;
    const removed = new Set(state.selectedIds);
    let removedSpaceCount = 0;
    for (const nodeId of state.selectedIds) {
        if (state.manifest.spaces?.[nodeId]) {
            await loadDescendantSpaces(nodeId);
        }
        const removedSpaces = removeSpaceTree(nodeId);
        removedSpaceCount += Math.max(0, removedSpaces.length - 1);
    }
    state.spaces[state.currentSpaceId].nodes = currentNodes().filter((node) => !removed.has(node.id));
    state.spaces[state.currentSpaceId].links = currentLinks().filter((link) => !removed.has(link.from) && !removed.has(link.to));
    state.selectedIds = [];
    state.selectedFenceId = null;
    state.isLinking = null;
    closeAllPanels();
    refreshHUD();
    saveToStorage({ repoMeta: true });
    if (removedSpaceCount > 0) {
        notifyToast(`Deleted node${removed.size > 1 ? "s" : ""}. ${removedSpaceCount} child space${removedSpaceCount === 1 ? "" : "s"} removed from next sync.`, "info", 2600);
    }
}

function openSelectedEditor() {
    const node = getCurrentNode(state.selectedIds[0]);
    if (!node) return;
    if (editor.panel.hidden) openEditor(node);
    else closeAllPanels();
}

async function syncNow() {
    await saveToCloud();
    refreshHUD();
}

function openSearch() {
    state.searchOpen = true;
    if (searchUI.palette) searchUI.palette.hidden = false;
    if (searchUI.input) {
        searchUI.input.value = state.searchQuery;
        searchUI.input.focus();
        searchUI.input.select();
        searchUI.input.dispatchEvent(new Event("input"));
    }
}

function closeSearch() {
    state.searchOpen = false;
    if (searchUI.palette) searchUI.palette.hidden = true;
}

function bindWaypointPanel(waypoint, index) {
    openWaypointEditor(waypoint, index);
    waypointEditor.fieldName.oninput = (e) => {
        waypoint.name = e.target.value;
        updateWaypointUI();
        saveToStorage({ repoMeta: true, spaceIds: [] });
    };
    waypointEditor.update.onclick = () => {
        waypoint.view = { ...state.view };
        openWaypointEditor(waypoint, index);
        updateWaypointUI();
        saveToStorage({ repoMeta: true, spaceIds: [] });
    };
    waypointEditor.delete.onclick = () => {
        state.waypoints.splice(index, 1);
        waypointEditor.panel.hidden = true;
        updateWaypointUI();
        saveToStorage({ repoMeta: true, spaceIds: [] });
    };
}

function startSelectionBox(event) {
    state.selectionBox = {
        startX: event.clientX,
        startY: event.clientY,
        endX: event.clientX,
        endY: event.clientY
    };
}

function applySelectionBox() {
    if (!state.selectionBox) return;
    const { startX, startY, endX, endY } = state.selectionBox;
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    state.selectedIds = currentNodes().filter((node) => {
        const world = { x: node.x, y: node.y };
        const screen = {
            x: (world.x + state.view.x) * state.view.zoom + window.innerWidth / 2,
            y: (world.y + state.view.y) * state.view.zoom + window.innerHeight / 2
        };
        return screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom;
    }).map((node) => node.id);
    refreshHUD();
}

function handleKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
        return;
    }

    if (state.searchOpen) {
        if (event.key === "Escape") closeSearch();
        return;
    }

    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.tagName === "SELECT") {
        if (event.key === "Escape") {
            event.target.blur();
            closeAllPanels();
        }
        return;
    }

    const key = event.key.toLowerCase();

    if (key >= "1" && key <= "9") {
        const waypoint = state.waypoints[parseInt(key, 10) - 1];
        if (waypoint) {
            state.view = { ...waypoint.view };
            saveToStorage({ repoMeta: true, spaceIds: [] });
        }
    }

    if (key === "f") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
    }
    if (key === "l") {
        const node = getCurrentNode(state.selectedIds[0]);
        if (node) {
            state.isLinking = { type: "node", id: node.id };
            refreshHUD();
        } else if (state.selectedFenceId) {
            state.isLinking = { type: "fence", id: state.selectedFenceId };
            refreshHUD();
        }
    }
    if (key === "k") {
        const waypoint = { id: `waypoint-${Date.now()}`, name: `View ${state.waypoints.length + 1}`, view: { ...state.view } };
        state.waypoints.push(waypoint);
        updateWaypointUI();
        bindWaypointPanel(waypoint, state.waypoints.length - 1);
        saveToStorage({ repoMeta: true, spaceIds: [] });
    }
    if (key === "g") {
        const world = toWorld(state.lastMouse.x, state.lastMouse.y);
        currentFences().push({ id: generateTimestampId(), name: "New Group", x: world.x, y: world.y, w: 240, h: 180, collapsed: false });
        saveToStorage();
    }
    if (key === "m") {
        state.multiSelectMode = !state.multiSelectMode;
        refreshHUD();
    }
    if (key === "v") state.showPreview = !state.showPreview;
    if (key === "n") {
        const world = toWorld(state.lastMouse.x, state.lastMouse.y);
        addNewNode(world.x, world.y);
    }
    if (key === "e") openSelectedEditor();
    if (key === "h") {
        state.showChrome = !state.showChrome;
        refreshHUD();
    }
    if (key === "s") syncNow();
    if (key === "b" && state.currentSpaceId !== "root") {
        state.manifest.spaceMemory = rememberSpaceView(state.manifest, state.currentSpaceId, state.view);
        state.currentSpaceId = state.spaceTrail.at(-2) || "root";
        state.spaceTrail = state.currentSpaceId === "root" ? [] : state.spaceTrail.slice(0, -1);
        state.view = getRememberedSpaceView(state.manifest, state.currentSpaceId);
        state.selectedIds = [];
        state.selectedFenceId = null;
        state.isLinking = null;
        closeAllPanels();
        updateBreadcrumbs();
        refreshHUD();
        saveToStorage({ repoMeta: true, spaceIds: [] });
    }
    if (key === "j") {
        applyLayout("grid", state.selectedIds.length ? state.selectedIds : currentNodes().map((node) => node.id));
        saveToStorage();
    }

    if (event.key === "Delete" || event.key === "Backspace") void deleteSelected();

    if (event.key === "Escape") {
        state.view = { x: 0, y: 0, zoom: 1 };
        state.selectedIds = [];
        state.selectedFenceId = null;
        state.isLinking = null;
        closeSearch();
        closeAllPanels();
        refreshHUD();
    }
}

export function initInput() {
    const canvas = document.getElementById("main-canvas");
    ensureSpace("root");

    canvas.addEventListener("dblclick", (event) => {
        const world = toWorld(event.clientX, event.clientY);
        const hit = hitNode(world.x, world.y);
        if (hit) {
            selectSingle(hit.id);
            enterSpace(hit.id);
            return;
        }

        const fence = findFenceAt(world.x, world.y);
        if (fence) {
            fence.collapsed = !fence.collapsed;
            selectFence(fence, false);
            saveToStorage();
            return;
        }

        addNewNode(world.x, world.y);
    });

    canvas.addEventListener("mousedown", (event) => {
        state.lastMouse = { x: event.clientX, y: event.clientY };
        const world = toWorld(event.clientX, event.clientY);
        const hit = hitNode(world.x, world.y);

        const fenceTarget = !hit ? findFenceAt(world.x, world.y) : null;

        if (state.isLinking && (hit || fenceTarget)) {
            const target = hit ? { type: "node", id: hit.id } : { type: "fence", id: fenceTarget.id };
            if (state.isLinking.id !== target.id || state.isLinking.type !== target.type) {
                if (state.isLinking.type === "node" && target.type === "node") {
                    const sourceNode = getCurrentNode(state.isLinking.id);
                    const targetNode = getCurrentNode(target.id);
                    if (ensureNodeLinkInContent(sourceNode, targetNode)) {
                        if (state.selectedIds.includes(sourceNode.id)) {
                            syncEditorToSelection();
                        }
                        saveToStorage();
                    }
                } else {
                    const label = prompt("Link label (optional):", "") || "";
                    const note = prompt("Link note (optional):", "") || "";
                    currentLinks().push({
                        from: state.isLinking.id,
                        fromType: state.isLinking.type,
                        to: target.id,
                        toType: target.type,
                        label,
                        note,
                        directed: true
                    });
                    dedupeLinks();
                    saveToStorage();
                }
            }
            state.isLinking = null;
            refreshHUD();
            return;
        }

        if (hit) {
            if (state.multiSelectMode || event.shiftKey) {
                if (state.selectedIds.includes(hit.id)) state.selectedIds = state.selectedIds.filter((id) => id !== hit.id);
                else state.selectedIds = [...state.selectedIds, hit.id];
            } else {
                selectSingle(hit.id);
            }
            state.dragging = { type: "node", id: hit.id };
            return;
        }

        const fence = fenceTarget || findFenceAt(world.x, world.y);
        if (fence) {
            const memberIds = getNodesInFence(fence).map((node) => node.id);
            selectFence(fence, false);
            state.dragging = { type: "fence", id: fence.id, memberIds };
            return;
        }

        if (state.multiSelectMode) {
            startSelectionBox(event);
            return;
        }

        state.panning = true;
        state.selectedIds = [];
        state.selectedFenceId = null;
        state.isLinking = null;
        closeAllPanels();
        refreshHUD();
    });

    canvas.addEventListener("contextmenu", (event) => {
        const world = toWorld(event.clientX, event.clientY);
        const hit = hitNode(world.x, world.y);
        if (hit) {
            event.preventDefault();
            selectSingle(hit.id);
            openEditor(hit);
            return;
        }
        const fence = findFenceAt(world.x, world.y);
        if (!fence) return;
        event.preventDefault();
        selectFence(fence, false);
        openGroupEditor(fence);
    });

    window.addEventListener("mousemove", (event) => {
        const previousMouse = { ...state.lastMouse };
        const world = toWorld(event.clientX, event.clientY);
        state.hoveredId = hitNode(world.x, world.y)?.id || null;

        if (state.selectionBox) {
            state.selectionBox.endX = event.clientX;
            state.selectionBox.endY = event.clientY;
            applySelectionBox();
        }

        const dx = (event.clientX - previousMouse.x) / state.view.zoom;
        const dy = (event.clientY - previousMouse.y) / state.view.zoom;

        if (state.panning) {
            state.view.x += dx;
            state.view.y += dy;
        } else if (state.dragging?.type === "node") {
            const ids = state.selectedIds.includes(state.dragging.id) ? state.selectedIds : [state.dragging.id];
            ids.forEach((id) => {
                const node = getCurrentNode(id);
                if (node) {
                    node.x += dx;
                    node.y += dy;
                }
            });
            syncEditorToSelection();
        } else if (state.dragging?.type === "fence") {
            const fence = currentFences().find((item) => item.id === state.dragging.id);
            if (fence) {
                fence.x += dx;
                fence.y += dy;
                state.dragging.memberIds?.forEach((id) => {
                    const node = getCurrentNode(id);
                    if (node) {
                        node.x += dx;
                        node.y += dy;
                    }
                });
            }
        }

        state.lastMouse = { x: event.clientX, y: event.clientY };
    });

    window.addEventListener("mouseup", () => {
        if (state.panning || state.dragging || state.selectionBox) {
            removeInvalidLinks();
            if (state.dragging?.type === "node" || state.dragging?.type === "fence") {
                saveToStorage();
            } else if (state.panning) {
                saveToStorage({ repoMeta: true, spaceIds: [] });
            } else {
                saveToStorage({ uiOnly: true });
            }
        }
        state.panning = false;
        state.dragging = null;
        state.selectionBox = null;
    });

    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        state.view.zoom = Math.min(Math.max(0.1, state.view.zoom - event.deltaY * 0.001), 5);
        saveToStorage({ repoMeta: true, spaceIds: [] });
    }, { passive: false });

    window.addEventListener("keydown", handleKeyDown);
}
