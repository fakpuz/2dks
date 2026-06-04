import { getFenceDisplayRect, getLinkEndpoint, getNodesInFence, isNodeInsideCollapsedFence, visibleNodes } from './graph.js';
import { currentFences, currentLinks, currentNodes, getCurrentNode, state } from './state.js';
import { renderMarkdown } from './markdown.js';

const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d");
const hoverPreview = document.getElementById("hover-preview");
const hoverPreviewTitle = document.getElementById("hover-preview-title");
const hoverPreviewBody = document.getElementById("hover-preview-body");
const minimap = document.getElementById("minimap");
const minimapCtx = minimap.getContext("2d");

export function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function toScreen(x, y) {
    return {
        x: (x + state.view.x) * state.view.zoom + canvas.width / 2,
        y: (y + state.view.y) * state.view.zoom + canvas.height / 2
    };
}

export function toWorld(x, y) {
    return {
        x: (x - canvas.width / 2) / state.view.zoom - state.view.x,
        y: (y - canvas.height / 2) / state.view.zoom - state.view.y
    };
}

export function hitNode(worldX, worldY) {
    return [...visibleNodes()].reverse().find((node) => {
        if (isNodeInsideCollapsedFence(node)) return false;
        const dx = node.x - worldX;
        const dy = node.y - worldY;
        return Math.sqrt(dx * dx + dy * dy) < (node.size || 40);
    }) || null;
}

function drawGrid() {
    const size = Math.max(24, 50 * state.view.zoom);
    const offsetX = (state.view.x * state.view.zoom + canvas.width / 2) % size;
    const offsetY = (state.view.y * state.view.zoom + canvas.height / 2) % size;
    ctx.strokeStyle = "rgba(0, 240, 255, 0.015)";
    ctx.lineWidth = 1;
    for (let x = offsetX; x < canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    const origin = toScreen(0, 0);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(canvas.width, origin.y);
    ctx.stroke();
}

function traceNodeShape(x, y, radius, shape) {
    if (shape === "square") {
        ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
        return;
    }
    if (shape === "triangle") {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.lineTo(x - radius, y + radius);
        ctx.closePath();
        return;
    }
    if (shape === "diamond") {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
        return;
    }
    if (shape === "hexagon") {
        for (let index = 0; index < 6; index += 1) {
            const angle = (Math.PI / 3) * index - Math.PI / 2;
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (index === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        return;
    }
    ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function drawArrowhead(end, angle) {
    const size = 10;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 240, 255, 0.32)";
    ctx.fill();
}

function projectRectEdge(center, target, width, height, padding = 0) {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (!dx && !dy) return center;
    const halfW = width / 2 + padding;
    const halfH = height / 2 + padding;
    const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    return {
        x: center.x + dx * scale,
        y: center.y + dy * scale
    };
}

function getLinkAnchor(endpoint, otherEndpoint) {
    const center = toScreen(endpoint.x, endpoint.y);
    const other = toScreen(otherEndpoint.x, otherEndpoint.y);
    const padding = 8 * state.view.zoom;

    if (endpoint.type === "fence") {
        return projectRectEdge(center, other, endpoint.w * state.view.zoom, endpoint.h * state.view.zoom, padding);
    }

    const dx = other.x - center.x;
    const dy = other.y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const radius = (endpoint.size || 40) * state.view.zoom + padding;
    return {
        x: center.x + (dx / distance) * radius,
        y: center.y + (dy / distance) * radius
    };
}

function drawLink(link) {
    const from = getLinkEndpoint(link.from, link.fromType || "node");
    const to = getLinkEndpoint(link.to, link.toType || "node");
    if (!from || !to) return;
    if (from.type === "node" && !visibleNodes().some((node) => node.id === from.id)) return;
    if (to.type === "node" && !visibleNodes().some((node) => node.id === to.id)) return;

    const start = getLinkAnchor(from, to);
    const end = getLinkAnchor(to, from);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = link.label ? "rgba(0, 240, 255, 0.28)" : "rgba(0, 240, 255, 0.18)";
    ctx.lineWidth = 1.5 * state.view.zoom;
    ctx.stroke();

    if (link.directed !== false) {
        drawArrowhead(end, angle);
    }

    if (link.label) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        ctx.fillStyle = "rgba(10, 15, 26, 0.88)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(midX - 40, midY - 10, 80, 20, 8);
        else ctx.rect(midX - 40, midY - 10, 80, 20);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#d9f8ff";
        ctx.font = "11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(link.label.slice(0, 12), midX, midY + 1);
    }
}

function drawNode(node) {
    const { x, y } = toScreen(node.x, node.y);
    const radius = (node.size || 40) * state.view.zoom;
    const isSelected = state.selectedIds.includes(node.id);
    const isHovered = state.hoveredId === node.id;
    const subspaceMeta = state.manifest.spaces?.[node.id];
    const hasSubspace = Boolean(subspaceMeta && (subspaceMeta.nodeCount > 0 || subspaceMeta.linkCount > 0 || subspaceMeta.fenceCount > 0));

    ctx.beginPath();
    traceNodeShape(x, y, radius, node.shape || "circle");
    ctx.fillStyle = isSelected ? "rgba(0, 240, 255, 0.82)" : (isHovered ? "rgba(255, 255, 255, 0.12)" : (node.color || "rgba(255, 255, 255, 0.05)"));
    ctx.shadowBlur = isSelected ? 24 : (isHovered ? 12 : 0);
    ctx.shadowColor = isSelected ? "rgba(0, 240, 255, 0.6)" : "rgba(255, 255, 255, 0.2)";
    ctx.fill();
    const strokeStyle = hasSubspace ? "#ffcc00" : (isSelected ? "#ffffff" : (isHovered ? "rgba(0, 240, 255, 0.7)" : null));
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = (hasSubspace ? 3 : 1.5) * state.view.zoom;
        ctx.stroke();
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = isSelected ? "#000000" : "#ffffff";
    ctx.font = `500 ${Math.max(11, 11 * state.view.zoom)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.title || "Untitled", x, y);
}

function drawFence(fence) {
    const rect = getFenceDisplayRect(fence);
    const { x, y } = toScreen(rect.x, rect.y);
    const width = rect.w * state.view.zoom;
    const height = rect.h * state.view.zoom;
    const isSelected = state.selectedFenceId === fence.id;
    const memberCount = getNodesInFence(fence).length;
    ctx.fillStyle = isSelected ? "rgba(0, 240, 255, 0.05)" : "rgba(255, 255, 255, 0.025)";
    ctx.strokeStyle = isSelected
        ? "rgba(0, 240, 255, 0.32)"
        : (fence.collapsed ? "rgba(255, 204, 0, 0.24)" : "rgba(255, 255, 255, 0.08)");
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, 12);
    else ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isSelected ? "rgba(230, 248, 255, 0.95)" : "rgba(255, 255, 255, 0.7)";
    ctx.font = `${Math.max(10, 10 * state.view.zoom)}px ui-monospace, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${fence.collapsed ? "▸" : "▾"} ${fence.name || "Group"}`, x + 10, y + 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = `${Math.max(9, 9 * state.view.zoom)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(`${memberCount} node${memberCount === 1 ? "" : "s"}`, x + 10, y + 36);
}

function drawSelectionBox() {
    if (!state.selectionBox) return;
    const left = Math.min(state.selectionBox.startX, state.selectionBox.endX);
    const top = Math.min(state.selectionBox.startY, state.selectionBox.endY);
    const width = Math.abs(state.selectionBox.endX - state.selectionBox.startX);
    const height = Math.abs(state.selectionBox.endY - state.selectionBox.startY);
    ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.setLineDash([6, 4]);
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);
}

function updateHoverPreview(node) {
    if (!hoverPreview || !hoverPreviewTitle || !hoverPreviewBody) return;
    if (!state.showPreview || !node) {
        hoverPreview.hidden = true;
        return;
    }
    const screen = toScreen(node.x, node.y);
    const left = Math.min(Math.max(16, screen.x + 18), canvas.width - 256);
    const top = Math.min(Math.max(16, screen.y - 32), canvas.height - 236);
    hoverPreviewTitle.textContent = node.title?.trim() || "Untitled";
    hoverPreviewBody.innerHTML = node.content?.trim()
        ? renderMarkdown(node.content, {
            resolveEmbed: (targetTitle) => {
                const normalized = targetTitle.trim().toLowerCase();
                const target = currentNodes().find((candidate) => candidate.title?.trim().toLowerCase() === normalized);
                if (!target) {
                    return `<span class="md-embed-missing">${targetTitle}</span>`;
                }
                const title = target.title?.trim() || "Untitled";
                const content = target.content?.trim()
                    ? renderMarkdown(target.content)
                    : "<p>No content yet.</p>";
                return `<div class="md-embed"><div class="md-embed-title">${title}</div>${content}</div>`;
            }
        })
        : "<p>No content yet.</p>";
    hoverPreview.style.left = `${left}px`;
    hoverPreview.style.top = `${top}px`;
    hoverPreview.hidden = false;
}

function drawMinimap() {
    const nodes = currentNodes();
    minimap.width = 180;
    minimap.height = 120;
    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
    if (nodes.length === 0) return;

    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.min((minimap.width - 20) / width, (minimap.height - 20) / height);

    minimapCtx.fillStyle = "rgba(255,255,255,0.18)";
    visibleNodes().forEach((node) => {
        const x = 10 + (node.x - minX) * scale;
        const y = 10 + (node.y - minY) * scale;
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    minimapCtx.strokeStyle = "rgba(0, 240, 255, 0.55)";
    minimapCtx.strokeRect(
        10 + ((-state.view.x - canvas.width / (2 * state.view.zoom)) - minX) * scale,
        10 + ((-state.view.y - canvas.height / (2 * state.view.zoom)) - minY) * scale,
        (canvas.width / state.view.zoom) * scale,
        (canvas.height / state.view.zoom) * scale
    );
}

export function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    currentFences().forEach(drawFence);
    currentLinks().forEach(drawLink);

    visibleNodes().forEach((node) => {
        if (!node.content) return;
        const matches = node.content.matchAll(/\[\[([^\]|!]+)(?:\|[^\]]+)?\]\]/g);
        for (const match of matches) {
            const target = currentNodes().find((candidate) => candidate.title?.toLowerCase() === match[1].trim().toLowerCase());
            if (!target) continue;
            drawLink({ from: node.id, to: target.id, directed: false });
        }
    });

    if (state.isLinking) {
        const from = getLinkEndpoint(state.isLinking.id, state.isLinking.type);
        if (from) {
            const start = toScreen(from.x, from.y);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(state.lastMouse.x, state.lastMouse.y);
            ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    visibleNodes().forEach((node) => {
        const insideCollapsedFence = isNodeInsideCollapsedFence(node);
        if (!insideCollapsedFence) drawNode(node);
    });

    if (state.multiSelectMode && state.showChrome) {
        ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("MULTI-SELECT ACTIVE", canvas.width / 2, 40);
    }

    drawSelectionBox();
    drawMinimap();
    updateHoverPreview(state.showPreview && state.hoveredId ? getCurrentNode(state.hoveredId) : null);
    requestAnimationFrame(render);
}
