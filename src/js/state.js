export const state = {
    view: { x: 0, y: 0, zoom: 1 },
    currentSpaceId: "root",
    spaces: { root: { nodes: [], links: [], fences: [] } },
    manifest: {
        schemaVersion: 2,
        rootSpaceId: "root",
        currentSpaceId: "root",
        spaceTrail: [],
        view: { x: 0, y: 0, zoom: 1 },
        waypoints: [],
        sync: { sha: null, lastSyncedAt: null },
        spaceMemory: { viewsBySpaceId: {} },
        spaces: {}
    },
    spaceIndexes: {},
    loadedSpaceIds: ["root"],
    dirtySpaces: [],
    repoMetaDirty: false,
    spaceTrail: [],
    waypoints: [],
    selectedIds: [],
    selectedFenceId: null,
    hoveredId: null,
    showPreview: false,
    showChrome: false,
    activeTagFilter: null,
    searchOpen: false,
    searchQuery: "",
    selectionBox: null,
    pinnedInspector: false,
    editorSplit: 0.5,
    dragging: null,
    panning: false,
    multiSelectMode: false,
    isLinking: null,
    lastMouse: { x: 0, y: 0 },
    sync: {
        state: "idle",
        message: "Connecting",
        detail: "Checking workspace state.",
        sha: null,
        lastSyncedAt: null
    },
    runtime: {
        mode: "unknown",
        protected: false,
        repo: null,
        branch: null
    }
};

export const emptySpace = () => ({ nodes: [], links: [], fences: [] });

export const currentSpace = () => state.spaces[state.currentSpaceId] || emptySpace();
export const currentNodes = () => currentSpace().nodes || [];
export const currentLinks = () => currentSpace().links || [];
export const currentFences = () => currentSpace().fences || [];

export function ensureSpace(spaceId) {
    if (!state.spaces[spaceId]) {
        state.spaces[spaceId] = emptySpace();
    }
    if (!state.loadedSpaceIds.includes(spaceId)) {
        state.loadedSpaceIds.push(spaceId);
    }
    return state.spaces[spaceId];
}

export function setSpace(spaceId, space) {
    state.spaces[spaceId] = {
        nodes: Array.isArray(space?.nodes) ? space.nodes : [],
        links: Array.isArray(space?.links) ? space.links : [],
        fences: Array.isArray(space?.fences) ? space.fences : []
    };
    if (!state.loadedSpaceIds.includes(spaceId)) {
        state.loadedSpaceIds.push(spaceId);
    }
}

export function setSpaceIndex(spaceId, index) {
    state.spaceIndexes[spaceId] = index;
}

export function markSpaceDirty(spaceId = state.currentSpaceId) {
    if (!state.dirtySpaces.includes(spaceId)) {
        state.dirtySpaces.push(spaceId);
    }
}

export function markRepoMetaDirty() {
    state.repoMetaDirty = true;
}

export function clearDirtyState() {
    state.dirtySpaces = [];
    state.repoMetaDirty = false;
}

export function hasKnownSpace(spaceId) {
    return Boolean(state.manifest.spaces?.[spaceId]) || Boolean(state.spaces[spaceId]);
}

export function getNodeInSpace(spaceId, nodeId) {
    const space = state.spaces[spaceId];
    return space?.nodes.find((node) => node.id === nodeId) || null;
}

export function getCurrentNode(nodeId) {
    return currentNodes().find((node) => node.id === nodeId) || null;
}

export function getSelectedNodes() {
    return state.selectedIds
        .map((id) => getCurrentNode(id))
        .filter(Boolean);
}

export function getTrailSegments() {
    const segments = [{ id: "root", label: "ROOT", spaceId: "root" }];
    let parentSpaceId = "root";

    for (const nodeId of state.spaceTrail) {
        const node = getNodeInSpace(parentSpaceId, nodeId);
        if (!node) break;
        segments.push({
            id: node.id,
            label: node.title?.trim() || "Untitled",
            spaceId: node.id
        });
        parentSpaceId = node.id;
    }

    return segments;
}

export function normalizeStateTree() {
    ensureSpace("root");

    for (const [spaceId, space] of Object.entries(state.spaces)) {
        setSpace(spaceId, space);
    }

    const sanitizedTrail = [];
    let parentSpaceId = "root";
    for (const nodeId of Array.isArray(state.spaceTrail) ? state.spaceTrail : []) {
        const node = getNodeInSpace(parentSpaceId, nodeId);
        if (!node) break;
        sanitizedTrail.push(nodeId);
        parentSpaceId = nodeId;
    }

    state.spaceTrail = sanitizedTrail;
    if (state.currentSpaceId === "root") {
        state.spaceTrail = [];
    } else if (!state.spaces[state.currentSpaceId]) {
        state.currentSpaceId = parentSpaceId;
    }

    ensureSpace(state.currentSpaceId);
}

export function collectDescendantSpaceIds(spaceId, acc = new Set()) {
    const key = String(spaceId);
    if (key === "root" || acc.has(key)) return acc;
    acc.add(key);

    const childSpace = state.spaces[key];
    if (childSpace?.nodes?.length) {
        childSpace.nodes.forEach((node) => collectDescendantSpaceIds(node.id, acc));
    }

    return acc;
}

export function removeSpaceTree(spaceId) {
    const removed = [...collectDescendantSpaceIds(spaceId)];
    if (!removed.length) return [];

    removed.forEach((id) => {
        delete state.spaces[id];
        delete state.spaceIndexes[id];
        if (state.manifest?.spaces) {
            delete state.manifest.spaces[id];
        }
        if (state.manifest?.spaceMemory?.viewsBySpaceId) {
            delete state.manifest.spaceMemory.viewsBySpaceId[id];
        }
    });

    state.loadedSpaceIds = state.loadedSpaceIds.filter((id) => !removed.includes(id));
    state.dirtySpaces = [...new Set([...state.dirtySpaces.filter((id) => !removed.includes(id)), ...removed])];

    const removedSet = new Set(removed);
    state.spaceTrail = state.spaceTrail.filter((id) => !removedSet.has(id));
    if (removedSet.has(state.currentSpaceId)) {
        state.currentSpaceId = state.spaceTrail.at(-1) || "root";
    }

    return removed;
}
