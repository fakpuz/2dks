import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const graphRoot = path.join(root, "public/graph");
const spacesDir = path.join(graphRoot, "spaces");
const manifestPath = path.join(graphRoot, "index.json");
const TIMESTAMP_ID_RE = /^\d{2}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_\d{3}$/;

function pad(value, length = 2) {
    return String(value).padStart(length, "0");
}

function idFromMs(ms) {
    const date = new Date(ms);
    return `${pad(date.getFullYear() % 100)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}

function buildIdFactory() {
    const used = new Set();
    let fallbackMs = Date.now();
    return (value) => {
        const stringValue = String(value ?? "").trim();
        if (TIMESTAMP_ID_RE.test(stringValue) && !used.has(stringValue)) {
            used.add(stringValue);
            return stringValue;
        }

        let ms = Number(stringValue);
        if (!Number.isFinite(ms) || ms <= 0) {
            ms = fallbackMs;
        }

        let candidate = idFromMs(ms);
        while (used.has(candidate)) {
            ms += 1;
            candidate = idFromMs(ms);
        }
        used.add(candidate);
        fallbackMs = Math.max(fallbackMs, ms + 1);
        return candidate;
    };
}

function resolvePath(spaceId, spacesById) {
    void spacesById;
    if (spaceId === "root") return "spaces/root.json";
    return `spaces/${encodeURIComponent(spaceId)}.json`;
}

async function readGraph() {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const docs = {};
    for (const [spaceId, meta] of Object.entries(manifest.spaces || {})) {
        const filePath = path.join(graphRoot, meta.path);
        let document;
        try {
            document = JSON.parse(await fs.readFile(filePath, "utf8"));
        } catch {
            document = {
                schemaVersion: 2,
                spaceId: String(spaceId),
                updatedAt: meta.updatedAt || null,
                nodeIds: [],
                nodesById: {},
                linkIds: [],
                linksById: {},
                fenceIds: [],
                fencesById: {}
            };
        }
        docs[spaceId] = document;
    }
    return { manifest, docs };
}

function convertGraph(manifest, docs) {
    const makeId = buildIdFactory();
    const nodeIdMap = new Map();
    const fenceIdMap = new Map();

    for (const [spaceId, document] of Object.entries(docs)) {
        if (spaceId !== "root") {
            nodeIdMap.set(spaceId, makeId(spaceId));
        }
        for (const nodeId of document.nodeIds || []) {
            if (!nodeIdMap.has(String(nodeId))) {
                nodeIdMap.set(String(nodeId), makeId(nodeId));
            }
        }
        for (const fenceId of document.fenceIds || []) {
            if (!fenceIdMap.has(String(fenceId))) {
                fenceIdMap.set(String(fenceId), makeId(fenceId));
            }
        }
    }

    const spacesById = {};
    const convertedDocs = {};
    for (const [spaceId, document] of Object.entries(docs)) {
        const nextSpaceId = spaceId === "root" ? "root" : nodeIdMap.get(spaceId);
        const nodes = (document.nodeIds || []).map((nodeId) => {
            const node = document.nodesById?.[nodeId];
            return node ? { ...node, id: nodeIdMap.get(String(node.id)) } : null;
        }).filter(Boolean);
        const fences = (document.fenceIds || []).map((fenceId) => {
            const fence = document.fencesById?.[fenceId];
            return fence ? { ...fence, id: fenceIdMap.get(String(fence.id)) } : null;
        }).filter(Boolean);
        const links = (document.linkIds || []).map((linkId) => {
            const link = document.linksById?.[linkId];
            if (!link) return null;
            const from = link.fromType === "fence" ? fenceIdMap.get(String(link.from)) : nodeIdMap.get(String(link.from));
            const to = link.toType === "fence" ? fenceIdMap.get(String(link.to)) : nodeIdMap.get(String(link.to));
            return {
                ...link,
                from,
                to
            };
        }).filter(Boolean);

        spacesById[nextSpaceId] = { nodes, links, fences };
        convertedDocs[nextSpaceId] = {
            schemaVersion: document.schemaVersion || 2,
            spaceId: nextSpaceId,
            updatedAt: document.updatedAt || null,
            nodeIds: nodes.map((node) => node.id),
            nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
            linkIds: links.map((link) => link.id),
            linksById: Object.fromEntries(links.map((link) => [link.id, link])),
            fenceIds: fences.map((fence) => fence.id),
            fencesById: Object.fromEntries(fences.map((fence) => [fence.id, fence]))
        };
    }

    const nextManifest = {
        ...manifest,
        currentSpaceId: manifest.currentSpaceId === "root" ? "root" : nodeIdMap.get(String(manifest.currentSpaceId)),
        spaceTrail: (manifest.spaceTrail || []).map((id) => nodeIdMap.get(String(id))).filter(Boolean),
        spaces: {}
    };

    for (const [spaceId, space] of Object.entries(spacesById)) {
        nextManifest.spaces[spaceId] = {
            ...(manifest.spaces?.[spaceId] || {}),
            path: resolvePath(spaceId, spacesById),
            nodeCount: space.nodes.length,
            linkCount: space.links.length,
            fenceCount: space.fences.length,
            updatedAt: convertedDocs[spaceId].updatedAt || null
        };
    }

    return { manifest: nextManifest, docs: convertedDocs };
}

async function writeGraph(graph) {
    await fs.mkdir(spacesDir, { recursive: true });
    for (const file of await fs.readdir(spacesDir)) {
        if (file.endsWith(".json")) {
            await fs.unlink(path.join(spacesDir, file));
        }
    }
    for (const [spaceId, document] of Object.entries(graph.docs)) {
        const target = path.join(graphRoot, graph.manifest.spaces[spaceId].path);
        await fs.writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
    }
    await fs.writeFile(manifestPath, `${JSON.stringify(graph.manifest, null, 2)}\n`);
}

const source = await readGraph();
const converted = convertGraph(source.manifest, source.docs);
await writeGraph(converted);
