import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sourcePath = path.join(root, "public/graph/index.json");
const spacesDir = path.join(root, "public/graph/spaces");

function resolveSpacePath(spaceId, spacesById = {}) {
    void spacesById;
    if (String(spaceId) === "root") return "spaces/root.json";
    return `spaces/${encodeURIComponent(String(spaceId))}.json`;
}

async function main() {
    const manifest = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    const nextManifest = { ...manifest, spaces: { ...manifest.spaces } };
    const spaces = {};

    for (const [spaceId, meta] of Object.entries(manifest.spaces || {})) {
        const oldPath = path.join(root, "public/graph", meta.path);
        let document;
        try {
            document = JSON.parse(await fs.readFile(oldPath, "utf8"));
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
        const nodes = (document.nodeIds || []).map((id) => document.nodesById?.[id]).filter(Boolean);
        const links = (document.linkIds || []).map((id) => document.linksById?.[id]).filter(Boolean);
        const fences = (document.fenceIds || []).map((id) => document.fencesById?.[id]).filter(Boolean);
        spaces[spaceId] = { nodes, links, fences, document };
    }

    await fs.mkdir(spacesDir, { recursive: true });

    for (const [spaceId, entry] of Object.entries(spaces)) {
        const nextPath = resolveSpacePath(spaceId, spaces);
        nextManifest.spaces[spaceId] = {
            ...nextManifest.spaces[spaceId],
            path: nextPath
        };
        await fs.writeFile(path.join(root, "public/graph", nextPath), `${JSON.stringify(entry.document, null, 2)}\n`);
    }

    await fs.writeFile(sourcePath, `${JSON.stringify(nextManifest, null, 2)}\n`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
