import { buildSpaceIndex, buildSpaceMetadata, convertLegacyData, createEmptyManifest, deserializeSpaceDocument, GRAPH_BASE_PATH, normalizeManifest, SCHEMA_VERSION, searchSpace, serializeSpaceDocument, validateSpace } from './repo-data.js';
import { getRememberedSpaceView, normalizeViewState, rememberSpaceView } from './space-memory.js';
import { clearDirtyState, hasKnownSpace, markRepoMetaDirty, markSpaceDirty, normalizeStateTree, setSpace, setSpaceIndex, state } from './state.js';
import { refreshHUD, updateBreadcrumbs, updateWaypointUI } from './ui.js';

const STORAGE_KEY = "2dks-session-v4";
const LEGACY_STORAGE_KEY = "2dks-data";
const CLOUD_URL = "/data";
const MANIFEST_URL = `${GRAPH_BASE_PATH}/index.json`;
let toastTimer = null;
let bootWarningMessage = "";

function isAuthenticationFailure(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return /authentication required|authentication page|cloudflare access|access denied|login/.test(message);
}

function showToast(message, tone = "info", duration = 2600) {
    let toast = document.getElementById("sync-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "sync-toast";
        Object.assign(toast.style, {
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translate(-50%, 14px)",
            opacity: "0",
            pointerEvents: "none",
            zIndex: "200",
            maxWidth: "min(420px, calc(100vw - 32px))",
            padding: "12px 16px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(10, 15, 26, 0.9)",
            color: "#e6eefc",
            boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
            backdropFilter: "blur(18px)",
            transition: "opacity 180ms ease, transform 180ms ease",
            whiteSpace: "pre-wrap",
            lineHeight: "1.45",
            fontSize: "13px"
        });
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.borderColor = tone === "error" ? "rgba(255, 118, 118, 0.35)" : "rgba(0, 240, 255, 0.25)";
    toast.style.color = tone === "error" ? "#ffd1d1" : "#e6eefc";
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, 14px)";
    }, duration);
}

export function notifyToast(message, tone = "info", duration = 2600) {
    showToast(message, tone, duration);
}

function setBootWarning(message = "") {
    bootWarningMessage = String(message || "").trim();
}

function renderRuntimeWarning() {
    const banner = document.getElementById("runtime-warning");
    if (!banner) return;

    if (bootWarningMessage) {
        banner.textContent = bootWarningMessage;
        banner.hidden = false;
        return;
    }

    banner.hidden = true;
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function localUiState() {
    return {
        activeTagFilter: state.activeTagFilter,
        pinnedInspector: state.pinnedInspector,
        editorSplit: state.editorSplit
    };
}

function applyLocalUi(ui = {}) {
    state.activeTagFilter = ui.activeTagFilter || null;
    state.pinnedInspector = Boolean(ui.pinnedInspector);
    state.editorSplit = typeof ui.editorSplit === "number" ? ui.editorSplit : 0.5;
}

function rebuildSpaceIndex(spaceId) {
    const space = state.spaces[spaceId];
    if (!space) return;
    const normalized = validateSpace(space);
    setSpace(spaceId, normalized);
    setSpaceIndex(spaceId, buildSpaceIndex(normalized));
    state.manifest.spaces[spaceId] = buildSpaceMetadata(spaceId, normalized, state.manifest.spaces?.[spaceId]?.updatedAt || new Date().toISOString(), {
        spacesById: state.spaces,
        fallbackPath: state.manifest.spaces?.[spaceId]?.path
    });
}

function rebuildLoadedSpaceIndexes() {
    state.loadedSpaceIds.forEach((spaceId) => rebuildSpaceIndex(spaceId));
}

function syncManifestFromState() {
    const spaceMemory = rememberSpaceView(state.manifest, state.currentSpaceId, state.view);
    const manifest = normalizeManifest({
        ...state.manifest,
        currentSpaceId: state.currentSpaceId,
        spaceTrail: state.spaceTrail,
        view: normalizeViewState(state.view),
        waypoints: state.waypoints,
        sync: {
            sha: state.sync.sha,
            lastSyncedAt: state.sync.lastSyncedAt
        },
        spaceMemory,
        spaces: {
            ...state.manifest.spaces
        }
    });

    Object.entries(state.spaces).forEach(([spaceId, space]) => {
        manifest.spaces[spaceId] = buildSpaceMetadata(spaceId, space, state.manifest.spaces?.[spaceId]?.updatedAt || null, {
            spacesById: state.spaces,
            fallbackPath: state.manifest.spaces?.[spaceId]?.path
        });
    });

    state.manifest = normalizeManifest(manifest);
    state.currentSpaceId = state.manifest.currentSpaceId;
    state.spaceTrail = [...state.manifest.spaceTrail];
    state.view = { ...state.manifest.view };
    state.waypoints = cloneJson(state.manifest.waypoints);
}

function applyManifest(manifest) {
    state.manifest = normalizeManifest(manifest || createEmptyManifest());
    state.currentSpaceId = state.manifest.currentSpaceId;
    state.spaceTrail = [...state.manifest.spaceTrail];
    state.view = getRememberedSpaceView(state.manifest, state.currentSpaceId, state.manifest.view);
    state.waypoints = cloneJson(state.manifest.waypoints);
    state.sync.sha = state.manifest.sync?.sha || null;
    state.sync.lastSyncedAt = state.manifest.sync?.lastSyncedAt || null;
}

function buildLocalSession() {
    syncManifestFromState();
    const spaces = Object.fromEntries(state.loadedSpaceIds.map((spaceId) => [spaceId, cloneJson(state.spaces[spaceId])]));

    return {
        schemaVersion: SCHEMA_VERSION,
        manifest: state.manifest,
        spaces,
        loadedSpaceIds: state.loadedSpaceIds,
        dirtySpaces: state.dirtySpaces,
        repoMetaDirty: state.repoMetaDirty,
        ui: localUiState()
    };
}

function persistLocalSession() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildLocalSession()));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function markSync(nextState, message, detail, extra = {}) {
    state.sync = {
        ...state.sync,
        state: nextState,
        message,
        detail,
        ...extra
    };
    refreshHUD();
}

async function fetchJson(path) {
    const response = await fetch(path, {
        headers: { Accept: "application/json" },
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${path} (${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        const text = await response.text();
        const accessHint = /cloudflare access|access denied|login/i.test(text);
        throw new Error(accessHint
            ? `Expected JSON from ${path}, but got an authentication page instead.`
            : `Expected JSON from ${path}, but got ${contentType || "an unknown content type"}.`);
    }
    return response.json();
}

async function loadSpaceDocument(spaceId) {
    if (state.loadedSpaceIds.includes(spaceId) && state.spaces[spaceId] && state.spaceIndexes[spaceId]) {
        return state.spaces[spaceId];
    }
    const meta = state.manifest.spaces?.[spaceId];
    if (!meta?.path) {
        setSpace(spaceId, { nodes: [], links: [], fences: [] });
        rebuildSpaceIndex(spaceId);
        return state.spaces[spaceId];
    }
    const document = await fetchJson(`${GRAPH_BASE_PATH}/${meta.path}`);
    const space = deserializeSpaceDocument(document);
    setSpace(spaceId, space);
    rebuildSpaceIndex(spaceId);
    return state.spaces[spaceId];
}

function applyRepoBundle(bundle, { ui = null, dirtySpaces = [], repoMetaDirty = false, loadedSpaceIds = [] } = {}) {
    const converted = bundle.manifest ? bundle : convertLegacyData(bundle);
    applyManifest(converted.manifest);
    state.spaces = {};
    state.spaceIndexes = {};
    state.loadedSpaceIds = [];

    Object.entries(converted.spaces || {}).forEach(([spaceId, space]) => {
        setSpace(spaceId, space);
        rebuildSpaceIndex(spaceId);
    });

    if (!state.loadedSpaceIds.includes("root")) {
        setSpace("root", state.spaces.root || { nodes: [], links: [], fences: [] });
        rebuildSpaceIndex("root");
    }

    state.dirtySpaces = [...new Set(dirtySpaces)];
    state.repoMetaDirty = Boolean(repoMetaDirty);
    if (loadedSpaceIds.length) {
        state.loadedSpaceIds = [...new Set([...state.loadedSpaceIds, ...loadedSpaceIds])];
    }
    applyLocalUi(ui || {});
    normalizeStateTree();
}

function normalizeSession(session) {
    if (!session || session.schemaVersion !== SCHEMA_VERSION || !session.manifest) return null;
    return {
        manifest: session.manifest,
        spaces: session.spaces || {},
        ui: session.ui || {},
        dirtySpaces: Array.isArray(session.dirtySpaces) ? session.dirtySpaces.map(String) : [],
        repoMetaDirty: Boolean(session.repoMetaDirty),
        loadedSpaceIds: Array.isArray(session.loadedSpaceIds) ? session.loadedSpaceIds.map(String) : []
    };
}

async function loadRepoData() {
    const manifest = normalizeManifest(await fetchJson(MANIFEST_URL));
    applyManifest(manifest);

    await loadSpaceDocument("root");

    if (state.currentSpaceId !== "root") {
        try {
            await loadSpaceDocument(state.currentSpaceId);
        } catch (error) {
            console.warn(`Failed to load current space ${state.currentSpaceId}. Falling back to root.`, error);
            state.currentSpaceId = "root";
            state.spaceTrail = [];
            state.manifest.currentSpaceId = "root";
            state.manifest.spaceTrail = [];
            state.view = getRememberedSpaceView(state.manifest, "root", normalizeViewState());
        }
    }

    normalizeStateTree();
    state.runtime.mode = "worker";
    state.runtime.protected = true;
    state.runtime.repo = null;
    state.runtime.branch = null;
}

export async function ensureSpaceLoaded(spaceId) {
    if (!hasKnownSpace(spaceId)) return null;
    await loadSpaceDocument(spaceId);
    normalizeStateTree();
    return state.spaces[spaceId] || null;
}

export function searchNodes(query, spaceId = state.currentSpaceId) {
    const space = state.spaces[spaceId];
    if (!space) return [];
    return searchSpace(space, state.spaceIndexes[spaceId], query);
}

function syncPayload() {
    syncManifestFromState();
    const changedSpaceIds = [...new Set(state.dirtySpaces)].filter((spaceId) => Boolean(state.spaces[spaceId]));
    const deletedSpaceIds = [...new Set(state.dirtySpaces)].filter((spaceId) => !state.spaces[spaceId]);
    const spaces = Object.fromEntries(changedSpaceIds.map((spaceId) => {
        const updatedAt = new Date().toISOString();
        state.manifest.spaces[spaceId] = buildSpaceMetadata(spaceId, state.spaces[spaceId], updatedAt, {
            spacesById: state.spaces,
            fallbackPath: state.manifest.spaces?.[spaceId]?.path
        });
        return [spaceId, serializeSpaceDocument(spaceId, state.spaces[spaceId], updatedAt)];
    }));

    return {
        schemaVersion: SCHEMA_VERSION,
        manifest: state.manifest,
        spaces,
        changedSpaceIds,
        deletedSpaceIds
    };
}

export async function saveToCloud() {
    if (state.sync.state === "syncing") return;

    try {
        rebuildLoadedSpaceIndexes();
        const payload = syncPayload();
        markSync("syncing", "Syncing to GitHub", "Submitting changes to the Worker.");
        const response = await fetch(CLOUD_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            const text = await response.text();
            if (/cloudflare access|access denied|login/i.test(text)) {
                throw new Error("Cloudflare Access authentication required.");
            }
            throw new Error(`Unexpected response format (${response.status}).`);
        }

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Sync failed with status ${response.status}`);
        }

        const shortSha = result.sha.slice(0, 7);
        const syncedAt = new Date().toISOString();
        state.sync.sha = result.sha;
        state.sync.lastSyncedAt = syncedAt;
        state.manifest.sync = {
            sha: result.sha,
            lastSyncedAt: syncedAt
        };
        clearDirtyState();
        markSync("success", "GitHub sync complete", `SHA ${shortSha}`, {
            sha: result.sha,
            lastSyncedAt: syncedAt
        });
        persistLocalSession();
        showToast(`Synced\nSHA: ${shortSha}`, "info", 2600);
    } catch (error) {
        markSync("error", "Sync failed", error.message);
        console.error("Sync error:", error);
        showToast(`Sync failed\n${error.message}`, "error", 3200);
    }
}

export function saveToStorage(options = {}) {
    const {
        spaceIds = [state.currentSpaceId],
        repoMeta = false,
        uiOnly = false
    } = options;

    if (!uiOnly) {
        spaceIds.filter(Boolean).forEach((spaceId) => {
            rebuildSpaceIndex(spaceId);
            markSpaceDirty(spaceId);
        });
        if (repoMeta) {
            markRepoMetaDirty();
        }
    }

    syncManifestFromState();
    persistLocalSession();
}

export async function loadFromStorage() {
    let shouldPersistSession = true;

    const local = localStorage.getItem(STORAGE_KEY);
    const legacyLocal = localStorage.getItem(LEGACY_STORAGE_KEY);
    let parsedSession = null;

    if (local) {
        try {
            parsedSession = normalizeSession(JSON.parse(local));
        } catch (error) {
            console.warn("Failed to parse local 2DKS session.", error);
        }
    }

    try {
        await loadRepoData();
        setBootWarning("");
        renderRuntimeWarning();
        applyLocalUi(parsedSession?.ui || {});
        persistLocalSession();
        updateBreadcrumbs();
        updateWaypointUI();
        refreshHUD();
        return;
    } catch (error) {
        console.warn("Failed to load graph JSON.", error);
        if (isAuthenticationFailure(error)) {
            shouldPersistSession = false;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            setBootWarning("Cloudflare Access authentication required. Refresh after signing in.");
            renderRuntimeWarning();
            markSync("error", "Authentication required", "Cloudflare Access login is required before graph data can load.");
            updateBreadcrumbs();
            updateWaypointUI();
            refreshHUD();
            return;
        }

        if (parsedSession) {
            setBootWarning("");
            renderRuntimeWarning();
            applyRepoBundle({ manifest: parsedSession.manifest, spaces: parsedSession.spaces }, parsedSession);
            if (!state.loadedSpaceIds.includes(state.currentSpaceId) && hasKnownSpace(state.currentSpaceId)) {
                await ensureSpaceLoaded(state.currentSpaceId);
            }
            updateBreadcrumbs();
            updateWaypointUI();
            refreshHUD();
            return;
        }

        if (legacyLocal) {
            try {
                applyRepoBundle(convertLegacyData(JSON.parse(legacyLocal)));
                renderRuntimeWarning();
                persistLocalSession();
                updateBreadcrumbs();
                updateWaypointUI();
                refreshHUD();
                return;
            } catch (legacyError) {
                console.warn("Failed to parse legacy local 2DKS state.", legacyError);
            }
        }

        shouldPersistSession = false;
        setBootWarning(`Graph data failed to load. ${error.message}`);
        renderRuntimeWarning();
        applyRepoBundle({ manifest: createEmptyManifest(), spaces: { root: { nodes: [], links: [], fences: [] } } });
    }

    updateBreadcrumbs();
    updateWaypointUI();
    refreshHUD();
    renderRuntimeWarning();
    if (shouldPersistSession) {
        persistLocalSession();
    }
}
