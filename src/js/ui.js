import { applyLayout, collectSpaceTags, fitFenceToNodes, getBacklinks, getFenceById, getNodeTags, getNodesInFence, resolveOrCreateWikilink } from './graph.js';
import { getRememberedSpaceView, rememberSpaceView } from './space-memory.js';
import { currentFences, currentLinks, ensureSpace, getCurrentNode, getSelectedNodes, getTrailSegments, state } from './state.js';
import { ensureSpaceLoaded, saveToStorage } from './storage.js';

export const editor = {
    panel: document.getElementById("node-editor"),
    fieldTitle: document.getElementById("node-title-field"),
    fieldContent: document.getElementById("node-content-field"),
    backlinks: document.getElementById("backlinks-panel"),
    templatePicker: document.getElementById("node-template-picker"),
    pin: document.getElementById("pin-editor")
};

export const groupEditor = {
    panel: document.getElementById("group-editor"),
    fieldName: document.getElementById("group-name-field"),
    summary: document.getElementById("group-meta-summary"),
    fit: document.getElementById("group-fit-btn"),
    collapse: document.getElementById("group-collapse-btn"),
    delete: document.getElementById("group-delete-btn"),
    close: document.getElementById("close-group-editor")
};

export const waypointEditor = {
    panel: document.getElementById("waypoint-editor"),
    fieldName: document.getElementById("waypoint-name-field"),
    summary: document.getElementById("waypoint-meta-summary"),
    update: document.getElementById("waypoint-update-btn"),
    delete: document.getElementById("waypoint-delete-btn"),
    close: document.getElementById("close-waypoint-editor")
};

export const styleUI = {
    size: document.getElementById("node-size-slider"),
    colors: document.querySelectorAll(".color-btn"),
    shapes: document.querySelectorAll(".shape-btn"),
    layouts: document.querySelectorAll(".layout-btn")
};

export const searchUI = {
    palette: document.getElementById("search-palette"),
    input: document.getElementById("search-input"),
    results: document.getElementById("search-results")
};

const syncIndicator = document.getElementById("sync-indicator");
const modeIndicator = document.getElementById("mode-indicator");
const selectionIndicator = document.getElementById("selection-indicator");
const statusDock = document.querySelector(".status-dock");
const waypointBar = document.getElementById("waypoint-bar");
const breadcrumbs = document.getElementById("breadcrumbs");
const overlayHint = document.getElementById("overlay-hint");
const minimap = document.getElementById("minimap");
const tagFilterBar = document.getElementById("tag-filter-bar");

function currentEditedFence() {
    return getFenceById(groupEditor.panel.dataset.fenceId);
}

export function closeAllPanels() {
    if (state.pinnedInspector) return;
    editor.panel.hidden = true;
    groupEditor.panel.hidden = true;
    waypointEditor.panel.hidden = true;
}

export function openGroupEditor(fence) {
    groupEditor.panel.hidden = false;
    groupEditor.panel.dataset.fenceId = String(fence.id);
    groupEditor.fieldName.value = fence.name || "";
    const members = getNodesInFence(fence);
    groupEditor.summary.innerHTML = `<p>${members.length} node${members.length === 1 ? "" : "s"} inside</p><p>${fence.collapsed ? "Collapsed" : "Expanded"}</p>`;
    groupEditor.collapse.textContent = fence.collapsed ? "Expand" : "Collapse";
    setTimeout(() => groupEditor.fieldName.focus(), 50);
}

export function openWaypointEditor(waypoint, index) {
    waypointEditor.panel.hidden = false;
    waypointEditor.fieldName.value = waypoint.name || "";
    waypointEditor.summary.innerHTML = `<p>Waypoint ${index + 1}</p><p>x: ${Math.round(waypoint.view.x)}, y: ${Math.round(waypoint.view.y)}, zoom: ${waypoint.view.zoom.toFixed(2)}</p>`;
    setTimeout(() => waypointEditor.fieldName.focus(), 50);
}

export function syncEditorToSelection() {
    if (editor.panel.hidden && !state.pinnedInspector) return;
    const node = getSelectedNodes()[0];
    if (!node) {
        if (!state.pinnedInspector) closeAllPanels();
        return;
    }

    editor.fieldTitle.value = node.title || "";
    editor.fieldContent.value = node.content || "";
    styleUI.size.value = node.size || 40;
    updateBacklinksPanel(node);
}

export function updateBacklinksPanel(node = getSelectedNodes()[0]) {
    if (!editor.backlinks) return;
    const links = getBacklinks(node);
    if (!node || links.length === 0) {
        editor.backlinks.innerHTML = `<div class="markdown-body"><p>No backlinks yet.</p></div>`;
        return;
    }

    editor.backlinks.innerHTML = links.map((link) => `
        <div class="backlink-item">
            <button type="button" data-node-id="${link.id}">${link.title || "Untitled"}</button>
        </div>
    `).join("");

    editor.backlinks.querySelectorAll("button").forEach((button) => {
        button.onclick = () => {
            const target = getCurrentNode(button.dataset.nodeId);
            if (!target) return;
            state.selectedIds = [target.id];
            openEditor(target);
            refreshHUD();
            saveToStorage({ uiOnly: true });
        };
    });
}

export function updateTagFilterBar() {
    if (!tagFilterBar) return;
    const tags = collectSpaceTags();
    if (tags.length === 0) {
        tagFilterBar.innerHTML = "";
        return;
    }

    const chips = [
        `<button type="button" class="tag-chip" data-tag="" data-active="${state.activeTagFilter ? "false" : "true"}">All</button>`,
        ...tags.map((tag) => `<button type="button" class="tag-chip" data-tag="${tag}" data-active="${state.activeTagFilter === tag ? "true" : "false"}">#${tag}</button>`)
    ];

    tagFilterBar.innerHTML = chips.join("");
    tagFilterBar.querySelectorAll(".tag-chip").forEach((chip) => {
        chip.onclick = () => {
            state.activeTagFilter = chip.dataset.tag || null;
            updateTagFilterBar();
            refreshHUD();
            saveToStorage({ uiOnly: true });
        };
    });
}

export function openEditor(node) {
    editor.panel.hidden = false;
    editor.panel.style.setProperty("--editor-split", String(state.editorSplit));
    editor.pin.textContent = state.pinnedInspector ? "Unpin" : "Pin";
    editor.fieldTitle.value = node.title || "";
    editor.fieldContent.value = node.content || "";
    styleUI.size.value = node.size || 40;
    editor.templatePicker.value = node.template || "note";
    updateBacklinksPanel(node);
    updateSelectionIndicator();
    updateTagFilterBar();
    setTimeout(() => editor.fieldTitle.focus(), 50);
}

export function updateSyncIndicator() {
    if (!syncIndicator) return;
    const { sync } = state;
    syncIndicator.dataset.state = sync.state;
    syncIndicator.innerHTML = `<strong>${sync.message}</strong><span>${sync.detail || ""}</span>`;
}

export function updateModeIndicator() {
    if (!modeIndicator) return;
    const parts = [];
    if (state.runtime.mode === "worker") parts.push("Cloudflare Access");
    else if (state.runtime.mode === "static") parts.push("Vite/local mode");
    else parts.push("Runtime unknown");
    if (state.multiSelectMode) parts.push("Multi-select");
    if (state.activeTagFilter) parts.push(`#${state.activeTagFilter}`);
    if (state.isLinking) parts.push("Linking");
    modeIndicator.textContent = parts.join(" • ");
}

export function updateSelectionIndicator() {
    if (!selectionIndicator) return;
    const count = state.selectedIds.length;
    if (state.selectedFenceId && count === 0) {
        const fence = state.spaces[state.currentSpaceId]?.fences.find((item) => item.id === state.selectedFenceId);
        const memberCount = fence ? getNodesInFence(fence).length : 0;
        selectionIndicator.textContent = `Group: ${fence?.name || "Untitled"}${memberCount ? ` • ${memberCount} nodes` : ""}`;
        return;
    }
    if (count === 0) {
        selectionIndicator.textContent = "No selection";
        return;
    }
    if (count === 1) {
        const node = getSelectedNodes()[0];
        const tags = getNodeTags(node);
        selectionIndicator.textContent = `Selected: ${node?.title?.trim() || "Untitled"}${tags.length ? ` • ${tags.map((tag) => `#${tag}`).join(" ")}` : ""}`;
        return;
    }
    selectionIndicator.textContent = `${count} nodes selected`;
}

export function refreshHUD() {
    updateSyncIndicator();
    updateModeIndicator();
    updateSelectionIndicator();
    updateChromeVisibility();
    updateTagFilterBar();
}

export function updateChromeVisibility() {
    const isVisible = state.showChrome;
    statusDock?.classList.toggle("is-hidden", !isVisible);
    waypointBar?.classList.toggle("is-hidden", !isVisible);
    breadcrumbs?.classList.toggle("is-hidden", !isVisible);
    overlayHint?.classList.toggle("is-hidden", !isVisible);
    minimap?.classList.toggle("is-hidden", !isVisible);
}

export function updateBreadcrumbs() {
    if (!breadcrumbs) return;
    breadcrumbs.innerHTML = "";
    const segments = getTrailSegments();

    segments.forEach((segment, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = segment.label;
        button.dataset.active = segment.spaceId === state.currentSpaceId ? "true" : "false";
        button.onclick = async () => {
            state.manifest.spaceMemory = rememberSpaceView(state.manifest, state.currentSpaceId, state.view);
            await ensureSpaceLoaded(segment.spaceId);
            state.currentSpaceId = segment.spaceId;
            state.spaceTrail = segment.spaceId === "root" ? [] : state.spaceTrail.slice(0, index);
            state.view = getRememberedSpaceView(state.manifest, segment.spaceId);
            state.selectedIds = [];
            state.isLinking = null;
            closeAllPanels();
            updateBreadcrumbs();
            updateTagFilterBar();
            refreshHUD();
            saveToStorage({ repoMeta: true, spaceIds: [] });
        };
        breadcrumbs.appendChild(button);
        if (index < segments.length - 1) {
            const separator = document.createElement("span");
            separator.textContent = "/";
            breadcrumbs.appendChild(separator);
        }
    });
}

export function updateWaypointUI() {
    if (!waypointBar) return;
    waypointBar.innerHTML = "";
    state.waypoints.forEach((wp, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `${index + 1}: ${wp.name}`;
        btn.onclick = () => {
            state.view = { ...wp.view };
            saveToStorage({ repoMeta: true, spaceIds: [] });
        };
        btn.oncontextmenu = (event) => {
            event.preventDefault();
            openWaypointEditor(wp, index);
            waypointEditor.fieldName.oninput = (e) => {
                wp.name = e.target.value;
                updateWaypointUI();
                saveToStorage({ repoMeta: true, spaceIds: [] });
            };
            waypointEditor.update.onclick = () => {
                wp.view = { ...state.view };
                openWaypointEditor(wp, index);
                saveToStorage({ repoMeta: true, spaceIds: [] });
            };
            waypointEditor.delete.onclick = () => {
                state.waypoints.splice(index, 1);
                waypointEditor.panel.hidden = true;
                updateWaypointUI();
                saveToStorage({ repoMeta: true, spaceIds: [] });
            };
        };
        waypointBar.appendChild(btn);
    });
}

export async function enterSpace(nodeId) {
    state.manifest.spaceMemory = rememberSpaceView(state.manifest, state.currentSpaceId, state.view);
    const targetSpaceId = String(nodeId);
    const loadedSpace = await ensureSpaceLoaded(targetSpaceId);
    if (!loadedSpace) {
        ensureSpace(targetSpaceId);
    }
    state.currentSpaceId = targetSpaceId;
    state.spaceTrail = [...state.spaceTrail, targetSpaceId];
    state.view = getRememberedSpaceView(state.manifest, targetSpaceId);
    state.selectedIds = [];
    state.isLinking = null;
    closeAllPanels();
    updateBreadcrumbs();
    updateTagFilterBar();
    refreshHUD();
    saveToStorage({ repoMeta: true, spaceIds: [] });
}

export function bindWikilinkClicks(container) {
    container.addEventListener("click", (event) => {
        const link = event.target.closest(".md-wikilink");
        if (!link) return;
        const node = resolveOrCreateWikilink(link.dataset.target || link.textContent || "");
        state.selectedIds = [node.id];
        openEditor(node);
        refreshHUD();
        saveToStorage();
    });
}

export function bindEditorChrome() {
    bindWikilinkClicks(editor.backlinks);

    editor.pin.onclick = () => {
        state.pinnedInspector = !state.pinnedInspector;
        editor.pin.textContent = state.pinnedInspector ? "Unpin" : "Pin";
        saveToStorage({ uiOnly: true });
    };

    groupEditor.close.onclick = () => {
        groupEditor.panel.hidden = true;
        delete groupEditor.panel.dataset.fenceId;
    };

    waypointEditor.close.onclick = () => {
        waypointEditor.panel.hidden = true;
    };

    groupEditor.fieldName.oninput = (event) => {
        const fence = currentEditedFence();
        if (!fence) return;
        fence.name = event.target.value;
        refreshHUD();
        saveToStorage();
    };

    groupEditor.fit.onclick = () => {
        const fence = currentEditedFence();
        if (!fence) return;
        const changed = fitFenceToNodes(fence);
        if (!changed) return;
        openGroupEditor(fence);
        refreshHUD();
        saveToStorage();
    };

    groupEditor.collapse.onclick = () => {
        const fence = currentEditedFence();
        if (!fence) return;
        fence.collapsed = !fence.collapsed;
        state.selectedFenceId = fence.id;
        state.selectedIds = [];
        openGroupEditor(fence);
        refreshHUD();
        saveToStorage();
    };

    groupEditor.delete.onclick = () => {
        const fence = currentEditedFence();
        if (!fence) return;
        state.spaces[state.currentSpaceId].fences = currentFences().filter((item) => item.id !== fence.id);
        state.spaces[state.currentSpaceId].links = currentLinks().filter((link) => {
            const fromMatches = (link.fromType || "node") === "fence" && link.from === fence.id;
            const toMatches = (link.toType || "node") === "fence" && link.to === fence.id;
            return !fromMatches && !toMatches;
        });
        if (state.selectedFenceId === fence.id) {
            state.selectedFenceId = null;
        }
        state.selectedIds = [];
        groupEditor.panel.hidden = true;
        delete groupEditor.panel.dataset.fenceId;
        refreshHUD();
        saveToStorage();
    };

    editor.templatePicker.onchange = () => {
        const node = getSelectedNodes()[0];
        if (!node) return;
        node.template = editor.templatePicker.value;
        saveToStorage();
    };

    styleUI.layouts.forEach((button) => {
        button.onclick = () => {
            applyLayout(button.dataset.layout, state.selectedIds.length ? state.selectedIds : state.spaces[state.currentSpaceId].nodes.map((node) => node.id));
            syncEditorToSelection();
            saveToStorage();
        };
    });

}
