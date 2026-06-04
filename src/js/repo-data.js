import { createEmptySpaceMemory, normalizeSpaceMemory, normalizeViewState, rememberSpaceView } from './space-memory.js';

export const SCHEMA_VERSION = 2;
export const GRAPH_BASE_PATH = "/graph";
let lastGeneratedMs = 0;

function numberOr(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function sortObjectKeys(object) {
    return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function linkId(link) {
    return String(link.id || `${link.fromType || "node"}:${link.from}->${link.toType || "node"}:${link.to}:${link.label || ""}:${link.note || ""}:${link.directed !== false}`);
}

export function normalizeTitle(value = "") {
    return String(value).trim().toLowerCase();
}

function pad(value, length = 2) {
    return String(value).padStart(length, "0");
}

function timestampIdFromDate(date) {
    return `${pad(date.getFullYear() % 100)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}

export function generateTimestampId() {
    const now = Date.now();
    const ms = now <= lastGeneratedMs ? lastGeneratedMs + 1 : now;
    lastGeneratedMs = ms;
    return timestampIdFromDate(new Date(ms));
}

export function normalizeId(value, fallback = null) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    if (Number.isFinite(Number(value)) && Number(value) > 0) {
        return String(value);
    }
    return fallback || generateTimestampId();
}

export function resolveSpacePath(spaceId, spacesById = {}, fallbackPath = null) {
    void spacesById;
    void fallbackPath;
    if (String(spaceId) === "root") return "spaces/root.json";
    return `spaces/${encodeURIComponent(String(spaceId))}.json`;
}

export function extractWikilinks(text = "") {
    const matches = [];
    const pattern = /!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match = pattern.exec(text);
    while (match) {
        matches.push(match[1].trim());
        match = pattern.exec(text);
    }
    return matches;
}

export function extractTags(text = "") {
    return [...new Set((String(text).match(/(^|\s)#([a-zA-Z0-9/_-]+)/g) || [])
        .map((token) => token.trim().replace(/^#/, "").replace(/\s+#/, "")))];
}

export function getNodeTags(node) {
    return [...new Set([
        ...extractTags(node?.title || ""),
        ...extractTags(node?.content || "")
    ])].sort();
}

export function normalizeNode(node = {}) {
    return {
        id: normalizeId(node.id),
        title: String(node.title || ""),
        content: String(node.content || ""),
        x: numberOr(node.x, 0),
        y: numberOr(node.y, 0),
        size: numberOr(node.size, 40),
        color: String(node.color || "rgba(255, 255, 255, 0.05)"),
        shape: String(node.shape || "circle"),
        ...(node.template ? { template: String(node.template) } : {})
    };
}

export function normalizeLink(link = {}) {
    return {
        id: linkId(link),
        from: normalizeId(link.from, "0"),
        fromType: link.fromType === "fence" ? "fence" : "node",
        to: normalizeId(link.to, "0"),
        toType: link.toType === "fence" ? "fence" : "node",
        label: String(link.label || ""),
        note: String(link.note || ""),
        directed: link.directed !== false
    };
}

export function normalizeFence(fence = {}) {
    return {
        id: normalizeId(fence.id),
        name: String(fence.name || "Group"),
        x: numberOr(fence.x, 0),
        y: numberOr(fence.y, 0),
        w: Math.max(0, numberOr(fence.w, 240)),
        h: Math.max(0, numberOr(fence.h, 180)),
        collapsed: Boolean(fence.collapsed)
    };
}

export function normalizeSpace(space = {}) {
    return {
        nodes: asArray(space.nodes).map(normalizeNode),
        links: asArray(space.links).map(normalizeLink),
        fences: asArray(space.fences).map(normalizeFence)
    };
}

export function createEmptyManifest() {
    return {
        schemaVersion: SCHEMA_VERSION,
        rootSpaceId: "root",
        currentSpaceId: "root",
        spaceTrail: [],
        view: normalizeViewState(),
        waypoints: [],
        sync: { sha: null, lastSyncedAt: null },
        spaceMemory: createEmptySpaceMemory(),
        spaces: {}
    };
}

export function normalizeManifest(manifest = {}) {
    const normalized = createEmptyManifest();
    normalized.currentSpaceId = String(manifest.currentSpaceId || normalized.currentSpaceId);
    normalized.spaceTrail = asArray(manifest.spaceTrail).map(String);
    normalized.view = normalizeViewState(manifest.view);
    normalized.waypoints = asArray(manifest.waypoints).map((waypoint, index) => ({
        id: String(waypoint.id || `waypoint-${index + 1}`),
        name: String(waypoint.name || `View ${index + 1}`),
        view: normalizeViewState(waypoint.view)
    }));
    normalized.sync = {
        sha: manifest.sync?.sha || null,
        lastSyncedAt: manifest.sync?.lastSyncedAt || null
    };
    normalized.spaceMemory = normalizeSpaceMemory(manifest.spaceMemory);
    if (manifest.currentSpaceId || manifest.view) {
        normalized.spaceMemory = rememberSpaceView(normalized, normalized.currentSpaceId, normalized.view);
    }
    normalized.spaces = sortObjectKeys(Object.fromEntries(Object.entries(manifest.spaces || {}).map(([spaceId, meta]) => [
        String(spaceId),
        {
            path: String(meta?.path || resolveSpacePath(spaceId)),
            nodeCount: numberOr(meta?.nodeCount, 0),
            linkCount: numberOr(meta?.linkCount, 0),
            fenceCount: numberOr(meta?.fenceCount, 0),
            updatedAt: meta?.updatedAt || null
        }
    ])));
    if (!normalized.spaces.root) {
        normalized.spaces.root = {
            path: "spaces/root.json",
            nodeCount: 0,
            linkCount: 0,
            fenceCount: 0,
            updatedAt: null
        };
    }
    return normalized;
}

export function serializeSpaceDocument(spaceId, space, updatedAt = new Date().toISOString()) {
    const normalized = normalizeSpace(space);
    const nodeIds = normalized.nodes.map((node) => String(node.id));
    const linkIds = normalized.links.map((link) => link.id);
    const fenceIds = normalized.fences.map((fence) => String(fence.id));

    return {
        schemaVersion: SCHEMA_VERSION,
        spaceId: String(spaceId),
        updatedAt,
        nodeIds,
        nodesById: sortObjectKeys(Object.fromEntries(normalized.nodes.map((node) => [String(node.id), node]))),
        linkIds,
        linksById: sortObjectKeys(Object.fromEntries(normalized.links.map((link) => [link.id, link]))),
        fenceIds,
        fencesById: sortObjectKeys(Object.fromEntries(normalized.fences.map((fence) => [String(fence.id), fence])))
    };
}

export function deserializeSpaceDocument(document = {}) {
    const nodeIds = asArray(document.nodeIds).map(String);
    const linkIds = asArray(document.linkIds).map(String);
    const fenceIds = asArray(document.fenceIds).map(String);
    return normalizeSpace({
        nodes: nodeIds.map((id) => document.nodesById?.[id]).filter(Boolean),
        links: linkIds.map((id) => document.linksById?.[id]).filter(Boolean),
        fences: fenceIds.map((id) => document.fencesById?.[id]).filter(Boolean)
    });
}

export function buildSpaceMetadata(spaceId, space, updatedAt = new Date().toISOString(), options = {}) {
    const normalized = normalizeSpace(space);
    const path = options.path || resolveSpacePath(spaceId, options.spacesById || {}, options.fallbackPath || null);
    return {
        path,
        nodeCount: normalized.nodes.length,
        linkCount: normalized.links.length,
        fenceCount: normalized.fences.length,
        updatedAt
    };
}

export function validateSpace(space) {
    const normalized = normalizeSpace(space);
    const nodeIds = new Set(normalized.nodes.map((node) => node.id));
    const fenceIds = new Set(normalized.fences.map((fence) => fence.id));
    const duplicateNodes = nodeIds.size !== normalized.nodes.length;
    const duplicateFences = fenceIds.size !== normalized.fences.length;
    if (duplicateNodes) throw new Error("Duplicate node ids in space.");
    if (duplicateFences) throw new Error("Duplicate group ids in space.");
    for (const link of normalized.links) {
        const fromValid = link.fromType === "fence" ? fenceIds.has(link.from) : nodeIds.has(link.from);
        const toValid = link.toType === "fence" ? fenceIds.has(link.to) : nodeIds.has(link.to);
        if (!fromValid || !toValid) {
            throw new Error(`Invalid link endpoint in space: ${link.id}`);
        }
    }
    return normalized;
}

export function buildSpaceIndex(space) {
    const normalized = normalizeSpace(space);
    const nodeById = new Map();
    const titleToId = new Map();
    const tagIndex = new Map();
    const backlinks = new Map();
    const searchIndex = [];

    normalized.nodes.forEach((node) => {
        nodeById.set(node.id, node);
        const normalizedTitle = normalizeTitle(node.title);
        if (normalizedTitle && !titleToId.has(normalizedTitle)) {
            titleToId.set(normalizedTitle, node.id);
        }
    });

    normalized.nodes.forEach((node) => {
        const tags = getNodeTags(node);
        tags.forEach((tag) => {
            const list = tagIndex.get(tag) || [];
            list.push(node.id);
            tagIndex.set(tag, list);
        });

        searchIndex.push({
            id: node.id,
            text: `${node.title || ""}\n${node.content || ""}\n${tags.join(" ")}`.toLowerCase()
        });

        extractWikilinks(node.content).forEach((targetTitle) => {
            const targetId = titleToId.get(normalizeTitle(targetTitle));
            if (!targetId || targetId === node.id) return;
            const list = backlinks.get(targetId) || [];
            list.push(node.id);
            backlinks.set(targetId, list);
        });
    });

    for (const [tag, ids] of tagIndex.entries()) {
        tagIndex.set(tag, [...new Set(ids)].sort((a, b) => String(a).localeCompare(String(b), "en")));
    }
    for (const [targetId, ids] of backlinks.entries()) {
        backlinks.set(targetId, [...new Set(ids)].sort((a, b) => String(a).localeCompare(String(b), "en")));
    }

    return { nodeById, titleToId, tagIndex, backlinks, searchIndex };
}

export function searchSpace(space, index, query = "") {
    const normalizedQuery = String(query).trim().toLowerCase();
    const nodes = Array.isArray(space?.nodes) ? space.nodes : Array.from(index?.nodeById?.values?.() || []);
    if (!normalizedQuery) {
        return nodes.slice(0, 12);
    }

    return (index?.searchIndex || [])
        .filter((entry) => entry.text.includes(normalizedQuery))
        .sort((a, b) => {
            const aNode = index.nodeById.get(a.id);
            const bNode = index.nodeById.get(b.id);
            const aTitle = (aNode?.title || "").toLowerCase();
            const bTitle = (bNode?.title || "").toLowerCase();
            const aStarts = aTitle.startsWith(normalizedQuery) ? 0 : 1;
            const bStarts = bTitle.startsWith(normalizedQuery) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return aTitle.localeCompare(bTitle, "en");
        })
        .slice(0, 20)
        .map((entry) => index.nodeById.get(entry.id))
        .filter(Boolean);
}

export function convertLegacyData(legacy = {}) {
    const manifest = createEmptyManifest();
    const spaces = {};

    if (legacy.nodes && !legacy.spaces) {
        spaces.root = normalizeSpace({
            nodes: legacy.nodes,
            links: legacy.links,
            fences: legacy.fences
        });
    } else {
        for (const [spaceId, space] of Object.entries(legacy.spaces || { root: { nodes: [], links: [], fences: [] } })) {
            spaces[spaceId] = normalizeSpace(space);
        }
    }

    manifest.currentSpaceId = String(legacy.currentSpaceId || "root");
    manifest.spaceTrail = asArray(legacy.spaceTrail).map(String);
    manifest.view = normalizeViewState(legacy.view);
    manifest.waypoints = asArray(legacy.waypoints).map((waypoint, index) => ({
        id: String(waypoint.id || `waypoint-${index + 1}`),
        name: String(waypoint.name || `View ${index + 1}`),
        view: normalizeViewState(waypoint.view)
    }));
    manifest.sync = {
        sha: legacy.sync?.sha || null,
        lastSyncedAt: legacy.sync?.lastSyncedAt || null
    };
    manifest.spaceMemory = rememberSpaceView({ spaceMemory: createEmptySpaceMemory() }, manifest.currentSpaceId, manifest.view);

    for (const [spaceId, space] of Object.entries(spaces)) {
        manifest.spaces[spaceId] = buildSpaceMetadata(spaceId, space, legacy.sync?.lastSyncedAt || null);
    }

    return {
        manifest: normalizeManifest(manifest),
        spaces
    };
}
