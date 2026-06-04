async function githubRequest(env, path, init = {}) {
    if (!env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN is not set in environment variables.");
    }

    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "2dks-sync-worker",
            ...(init.headers || {})
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`GitHub API error (${response.status}): ${errorText}`);
        error.status = response.status;
        error.body = errorText;
        throw error;
    }

    return response;
}

function fileBlobRequest(content) {
    return {
        content: `${JSON.stringify(content, null, 2)}\n`,
        encoding: "utf-8"
    };
}

async function fetchExistingManifest(env) {
    try {
        return await fetchRepoJson(env, "public/graph/index.json");
    } catch (error) {
        if (error?.status === 404) {
            return { spaces: {} };
        }
        throw error;
    }
}

async function fetchTrackedBlobPaths(env, treeSha) {
    const response = await githubRequest(env, `/git/trees/${treeSha}?recursive=1`);
    const payload = await response.json();
    return new Set(
        (payload.tree || [])
            .filter((entry) => entry.type === "blob")
            .map((entry) => entry.path)
    );
}

function expectedSpacePath(spaceId) {
    return String(spaceId) === "root"
        ? "spaces/root.json"
        : `spaces/${encodeURIComponent(String(spaceId))}.json`;
}

function isValidSpacePath(spaceId, targetPath) {
    return String(targetPath || "") === expectedSpacePath(spaceId);
}

function dedupeTreeEntries(entries) {
    return [...new Map(entries.map((entry) => [entry.path, entry])).values()];
}

function decodeGitHubContent(payload) {
    return atob(String(payload?.content || "").replace(/\n/g, ""));
}

async function fetchRepoJson(env, repoPath) {
    const response = await githubRequest(env, `/contents/${repoPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
    const payload = await response.json();
    return JSON.parse(decodeGitHubContent(payload));
}

function emptyManifest() {
    return {
        schemaVersion: 2,
        rootSpaceId: "root",
        currentSpaceId: "root",
        spaceTrail: [],
        view: { x: 0, y: 0, zoom: 1 },
        waypoints: [],
        sync: { sha: null, lastSyncedAt: null },
        spaceMemory: { viewsBySpaceId: {} },
        spaces: {
            root: {
                path: "spaces/root.json",
                nodeCount: 0,
                linkCount: 0,
                fenceCount: 0,
                updatedAt: null
            }
        }
    };
}

function emptySpaceDocument(spaceId = "root") {
    return {
        schemaVersion: 2,
        spaceId: String(spaceId),
        updatedAt: null,
        nodeIds: [],
        nodesById: {},
        linkIds: [],
        linksById: {},
        fenceIds: [],
        fencesById: {}
    };
}

function graphResponse(document, status = 200) {
    return json(document, status, {
        "Cache-Control": "no-store, private"
    });
}

async function serveGraphRequest(env, pathname) {
    if (pathname === "/graph/index.json") {
        try {
            return graphResponse(await fetchRepoJson(env, "public/graph/index.json"));
        } catch (error) {
            if (error?.status === 404) {
                return graphResponse(emptyManifest());
            }
            throw error;
        }
    }

    const spaceMatch = pathname.match(/^\/graph\/spaces\/([^/]+)\.json$/);
    if (!spaceMatch) {
        return json({ error: "Unsupported graph path." }, 404);
    }

    const repoPath = `public${pathname}`;
    try {
        return graphResponse(await fetchRepoJson(env, repoPath));
    } catch (error) {
        if (error?.status === 404 && pathname === "/graph/spaces/root.json") {
            return graphResponse(emptySpaceDocument("root"));
        }
        if (error?.status === 404) {
            return json({ error: `Graph document not found: ${pathname}` }, 404);
        }
        throw error;
    }
}

async function createCommit(env, payload) {
    const refRes = await githubRequest(env, `/git/ref/heads/${env.GITHUB_BRANCH}`);
    const ref = await refRes.json();
    const lastCommitSha = ref.object.sha;
    const existingManifest = await fetchExistingManifest(env);

    const commitRes = await githubRequest(env, `/git/commits/${lastCommitSha}`);
    const commit = await commitRes.json();
    const baseTreeSha = commit.tree.sha;
    const trackedPaths = await fetchTrackedBlobPaths(env, baseTreeSha);

    const manifestBlobRes = await githubRequest(env, "/git/blobs", {
        method: "POST",
        body: JSON.stringify(fileBlobRequest(payload.manifest))
    });
    const manifestBlob = await manifestBlobRes.json();

    const treeEntries = [{
        path: "public/graph/index.json",
        mode: "100644",
        type: "blob",
        sha: manifestBlob.sha
    }];

    for (const [spaceId, document] of Object.entries(payload.spaces || {})) {
        const targetPath = payload.manifest?.spaces?.[spaceId]?.path;
        if (!isValidSpacePath(spaceId, targetPath)) {
            throw new Error(`Invalid path for space ${spaceId}. Expected ${expectedSpacePath(spaceId)}.`);
        }
        const blobRes = await githubRequest(env, "/git/blobs", {
            method: "POST",
            body: JSON.stringify(fileBlobRequest(document))
        });
        const blob = await blobRes.json();
        treeEntries.push({
            path: `public/graph/${targetPath}`,
            mode: "100644",
            type: "blob",
            sha: blob.sha
        });
    }

    const nextPaths = new Set(Object.values(payload.manifest?.spaces || {}).map((meta) => `public/graph/${meta.path}`));
    const previousPaths = new Set(Object.values(existingManifest?.spaces || {}).map((meta) => `public/graph/${meta.path}`));
    for (const oldPath of previousPaths) {
        if (!oldPath.startsWith("public/graph/spaces/")) continue;
        if (!nextPaths.has(oldPath) && trackedPaths.has(oldPath)) {
            treeEntries.push({
                path: oldPath,
                mode: "100644",
                type: "blob",
                sha: null
            });
        }
    }

    const uniqueTreeEntries = dedupeTreeEntries(treeEntries);
    const treeRes = await githubRequest(env, "/git/trees", {
        method: "POST",
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: uniqueTreeEntries
        })
    });
    const tree = await treeRes.json();

    const newCommitRes = await githubRequest(env, "/git/commits", {
        method: "POST",
        body: JSON.stringify({
            message: `Sync 2DKS graph at ${new Date().toISOString()}`,
            tree: tree.sha,
            parents: [lastCommitSha]
        })
    });
    const newCommit = await newCommitRes.json();

    await githubRequest(env, `/git/refs/heads/${env.GITHUB_BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: newCommit.sha })
    });

    return newCommit.sha;
}

function isNonFastForward(error) {
    return error?.status === 422 && String(error?.body || "").toLowerCase().includes("not a fast forward");
}

function isBadObjectState(error) {
    return error?.status === 422 && String(error?.body || "").toLowerCase().includes("badobjectstate");
}

async function createCommitWithRetry(env, payload, retries = 3) {
    let lastError = null;

    for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
            return await createCommit(env, payload);
        } catch (error) {
            lastError = error;
            if ((!isNonFastForward(error) && !isBadObjectState(error)) || attempt === retries - 1) {
                throw error;
            }
        }
    }

    throw lastError || new Error("Failed to create commit.");
}

function parseCookies(header) {
    return Object.fromEntries(
        (header || "")
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const [key, ...rest] = part.split("=");
                return [key, rest.join("=")];
            })
    );
}

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...headers
        }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/data") {
            const corsHeaders = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            };

            if (request.method === "OPTIONS") {
                return new Response(null, { headers: corsHeaders });
            }

            try {
                const payload = await request.json();
                const sha = await createCommitWithRetry(env, payload);
                return json({ success: true, sha }, 200, corsHeaders);
            } catch (error) {
                return json({ success: false, error: error.message }, 500, corsHeaders);
            }
        }

        if (url.pathname === "/graph/index.json" || /^\/graph\/spaces\/[^/]+\.json$/.test(url.pathname)) {
            try {
                return await serveGraphRequest(env, url.pathname);
            } catch (error) {
                return json({ error: error.message }, error?.status || 500);
            }
        }

        return env.ASSETS.fetch(request);
    }
};
