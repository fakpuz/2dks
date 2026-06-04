import { buildSpaceIndex, generateTimestampId, getNodeTags, normalizeTitle } from './repo-data.js';
import { currentFences, currentNodes, getCurrentNode, setSpaceIndex, state } from './state.js';

export const NODE_TEMPLATES = {
    note: { title: "", content: "" },
    idea: { title: "New Idea", content: "## Idea\n\n- Why it matters\n- Next step\n" },
    question: { title: "Open Question", content: "## Question\n\n> What do we still need to understand?\n" },
    task: { title: "New Task", content: "- [ ] Next action\n- [ ] Owner\n- [ ] Deadline\n" },
    reference: { title: "Reference", content: "## Source\n\n- Link:\n- Summary:\n- Key quote:\n" }
};

export { getNodeTags, normalizeTitle };

export function findNodeByTitle(title, spaceId = state.currentSpaceId) {
    const normalized = normalizeTitle(title);
    const cachedId = state.spaceIndexes[spaceId]?.titleToId?.get(normalized);
    if (cachedId) {
        return state.spaces[spaceId]?.nodes.find((node) => node.id === cachedId) || null;
    }
    return state.spaces[spaceId]?.nodes.find((node) => normalizeTitle(node.title || "") === normalized) || null;
}

export function visibleNodes() {
    if (!state.activeTagFilter) return currentNodes();
    return currentNodes().filter((node) => getNodeTags(node).includes(state.activeTagFilter));
}

export function collectSpaceTags(spaceId = state.currentSpaceId) {
    const tagIndex = state.spaceIndexes[spaceId]?.tagIndex;
    if (tagIndex) {
        return [...tagIndex.keys()].sort();
    }
    return [...new Set((state.spaces[spaceId]?.nodes || []).flatMap(getNodeTags))].sort();
}

export function getBacklinks(node, spaceId = state.currentSpaceId) {
    if (!node?.title) return [];
    const backlinkIds = state.spaceIndexes[spaceId]?.backlinks?.get(node.id) || [];
    if (backlinkIds.length) {
        return backlinkIds.map((id) => state.spaces[spaceId]?.nodes.find((candidate) => candidate.id === id)).filter(Boolean);
    }
    return [];
}

export function createNodeAt(worldX, worldY, templateName = "note", title = "") {
    const template = NODE_TEMPLATES[templateName] || NODE_TEMPLATES.note;
    const node = {
        id: generateTimestampId(),
        title: title || template.title || "",
        content: template.content || "",
        x: worldX,
        y: worldY,
        size: 40,
        color: "rgba(255, 255, 255, 0.05)",
        shape: "circle"
    };
    currentNodes().push(node);
    setSpaceIndex(state.currentSpaceId, buildSpaceIndex(state.spaces[state.currentSpaceId]));
    return node;
}

export function resolveOrCreateWikilink(targetTitle, originNode = getCurrentNode(state.selectedIds[0])) {
    let target = findNodeByTitle(targetTitle);
    if (target) return target;

    const baseX = originNode?.x ?? -state.view.x;
    const baseY = originNode?.y ?? -state.view.y;
    target = createNodeAt(baseX + 180, baseY, "note", targetTitle.trim());
    return target;
}

export function applyLayout(layoutType, nodeIds) {
    const nodes = nodeIds.map((id) => getCurrentNode(id)).filter(Boolean);
    if (nodes.length === 0) return;

    const center = nodes.reduce((acc, node) => ({ x: acc.x + node.x, y: acc.y + node.y }), { x: 0, y: 0 });
    center.x /= nodes.length;
    center.y /= nodes.length;

    if (layoutType === "grid") {
        const columns = Math.ceil(Math.sqrt(nodes.length));
        nodes.forEach((node, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            node.x = center.x + (col - (columns - 1) / 2) * 150;
            node.y = center.y + (row - (Math.ceil(nodes.length / columns) - 1) / 2) * 120;
        });
        return;
    }

    if (layoutType === "circle" || layoutType === "radial") {
        const radius = layoutType === "circle" ? Math.max(140, nodes.length * 18) : Math.max(100, nodes.length * 24);
        nodes.forEach((node, index) => {
            const angle = (Math.PI * 2 * index) / nodes.length;
            const currentRadius = layoutType === "radial" ? radius + (index % 3) * 60 : radius;
            node.x = center.x + Math.cos(angle) * currentRadius;
            node.y = center.y + Math.sin(angle) * currentRadius;
        });
        return;
    }

    if (layoutType === "force") {
        for (let step = 0; step < 80; step += 1) {
            for (const node of nodes) {
                let vx = 0;
                let vy = 0;
                for (const other of nodes) {
                    if (node.id === other.id) continue;
                    const dx = node.x - other.x || 0.001;
                    const dy = node.y - other.y || 0.001;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const repulsion = 1800 / distance ** 2;
                    vx += (dx / distance) * repulsion;
                    vy += (dy / distance) * repulsion;
                }
                vx += (center.x - node.x) * 0.01;
                vy += (center.y - node.y) * 0.01;
                node.x += vx;
                node.y += vy;
            }
        }
    }
}

export function getFenceDisplayRect(fence) {
    return {
        x: fence.x,
        y: fence.y,
        w: fence.collapsed ? 180 : fence.w,
        h: fence.collapsed ? 44 : fence.h
    };
}

export function getNodesInFence(fence, nodes = currentNodes()) {
    return nodes.filter((node) => node.x >= fence.x && node.x <= fence.x + fence.w && node.y >= fence.y && node.y <= fence.y + fence.h);
}

export function fitFenceToNodes(fence, nodeIds = []) {
    const members = (nodeIds.length ? nodeIds.map((id) => getCurrentNode(id)).filter(Boolean) : getNodesInFence(fence));
    if (members.length === 0) return false;

    const paddingX = 90;
    const paddingTop = 70;
    const paddingBottom = 70;
    const left = Math.min(...members.map((node) => node.x - (node.size || 40)));
    const right = Math.max(...members.map((node) => node.x + (node.size || 40)));
    const top = Math.min(...members.map((node) => node.y - (node.size || 40)));
    const bottom = Math.max(...members.map((node) => node.y + (node.size || 40)));

    fence.x = left - paddingX;
    fence.y = top - paddingTop;
    fence.w = (right - left) + paddingX * 2;
    fence.h = (bottom - top) + paddingTop + paddingBottom;
    return true;
}

export function findFenceAt(worldX, worldY) {
    return [...currentFences()].reverse().find((fence) => {
        const rect = getFenceDisplayRect(fence);
        return worldX >= rect.x && worldX <= rect.x + rect.w && worldY >= rect.y && worldY <= rect.y + rect.h;
    }) || null;
}

export function getFenceById(fenceId) {
    return currentFences().find((fence) => fence.id === fenceId) || null;
}

export function isNodeInsideCollapsedFence(node, fences = currentFences()) {
    return fences.some((fence) => {
        if (!fence.collapsed) return false;
        return node.x >= fence.x && node.x <= fence.x + fence.w && node.y >= fence.y && node.y <= fence.y + fence.h;
    });
}

export function getLinkEndpoint(endpointId, endpointType = "node") {
    if (endpointType === "fence") {
        const fence = getFenceById(endpointId);
        if (!fence) return null;
        const rect = getFenceDisplayRect(fence);
        return {
            id: fence.id,
            type: "fence",
            x: rect.x + rect.w / 2,
            y: rect.y + rect.h / 2,
            w: rect.w,
            h: rect.h,
            title: fence.name || "Group"
        };
    }

    const node = getCurrentNode(endpointId);
    if (!node) return null;
    return {
        id: node.id,
        type: "node",
        x: node.x,
        y: node.y,
        size: node.size || 40,
        shape: node.shape || "circle",
        title: node.title || "Untitled"
    };
}
