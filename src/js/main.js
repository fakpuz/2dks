import '../css/style.css';
import { createNodeAt, NODE_TEMPLATES } from './graph.js';
import { getCurrentNode, getSelectedNodes, state } from './state.js';
import { loadFromStorage, saveToStorage, searchNodes } from './storage.js';
import { render, resize } from './render.js';
import { initInput } from './input.js';
import { bindEditorChrome, closeAllPanels, editor, enterSpace, openEditor, refreshHUD, searchUI, styleUI, syncEditorToSelection, updateBacklinksPanel, updateBreadcrumbs, updateTagFilterBar, updateWaypointUI } from './ui.js';

function focusNode(node) {
    state.selectedIds = [node.id];
    state.view = { x: -node.x, y: -node.y, zoom: Math.max(state.view.zoom, 1) };
    openEditor(node);
    refreshHUD();
    saveToStorage({ repoMeta: true, spaceIds: [] });
}

function renderSearchResults() {
    if (!searchUI.results) return;
    const query = state.searchQuery.trim().toLowerCase();
    const results = searchNodes(query, state.currentSpaceId);

    if (results.length === 0) {
        searchUI.results.innerHTML = `<button type="button" class="search-result" data-create="${state.searchQuery.trim()}"><strong>Create "${state.searchQuery.trim()}"</strong><span>No matches in this space.</span></button>`;
    } else {
        searchUI.results.innerHTML = results.map((node) => `
            <button type="button" class="search-result" data-node-id="${node.id}">
                <strong>${node.title || "Untitled"}</strong>
                <span>${(node.content || "").replace(/\s+/g, " ").slice(0, 120)}</span>
            </button>
        `).join("");
    }

    searchUI.results.querySelectorAll("[data-node-id]").forEach((button) => {
        button.onclick = () => {
            const node = getCurrentNode(button.dataset.nodeId);
            if (!node) return;
            state.searchOpen = false;
            searchUI.palette.hidden = true;
            focusNode(node);
        };
    });

    searchUI.results.querySelectorAll("[data-create]").forEach((button) => {
        button.onclick = () => {
            const worldX = -state.view.x;
            const worldY = -state.view.y;
            const node = createNodeAt(worldX, worldY, "note", button.dataset.create);
            saveToStorage();
            state.searchOpen = false;
            searchUI.palette.hidden = true;
            focusNode(node);
        };
    });
}

function bindSearch() {
    searchUI.input?.addEventListener("input", (event) => {
        state.searchQuery = event.target.value;
        renderSearchResults();
    });

    searchUI.palette?.addEventListener("click", (event) => {
        if (event.target === searchUI.palette) {
            state.searchOpen = false;
            searchUI.palette.hidden = true;
        }
    });
}

function bindEditor() {
    editor.fieldTitle.oninput = (event) => {
        const node = getSelectedNodes()[0];
        if (!node) return;
        node.title = event.target.value;
        updateBreadcrumbs();
        updateBacklinksPanel(node);
        refreshHUD();
        saveToStorage();
    };

    editor.fieldContent.oninput = (event) => {
        const node = getSelectedNodes()[0];
        if (!node) return;
        node.content = event.target.value;
        updateBacklinksPanel(node);
        updateTagFilterBar();
        saveToStorage();
    };

    editor.fieldTitle.onkeydown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            editor.fieldContent.focus();
        }
    };

    editor.fieldContent.onkeydown = (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            closeAllPanels();
        }
    };
}

function bindStylePanel() {
    styleUI.size.oninput = (event) => {
        const size = parseInt(event.target.value, 10);
        state.selectedIds.forEach((id) => {
            const node = getCurrentNode(id);
            if (node) node.size = size;
        });
        syncEditorToSelection();
        saveToStorage();
    };

    styleUI.colors.forEach((button) => {
        button.onclick = () => {
            const color = button.dataset.color;
            state.selectedIds.forEach((id) => {
                const node = getCurrentNode(id);
                if (node) node.color = color;
            });
            saveToStorage();
        };
    });

    styleUI.shapes.forEach((button) => {
        button.onclick = () => {
            const shape = button.dataset.shape;
            state.selectedIds.forEach((id) => {
                const node = getCurrentNode(id);
                if (node) node.shape = shape;
            });
            saveToStorage();
        };
    });
}

async function init() {
    await loadFromStorage();
    resize();
    initInput();
    bindEditor();
    bindEditorChrome();
    bindStylePanel();
    bindSearch();

    window.addEventListener("resize", resize);
    updateBreadcrumbs();
    updateWaypointUI();
    updateTagFilterBar();
    refreshHUD();

    if (state.selectedIds.length === 1) {
        const node = getSelectedNodes()[0];
        if (node) openEditor(node);
    }

    renderSearchResults();
    render();
}

export { enterSpace, focusNode, NODE_TEMPLATES, renderSearchResults };

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init(); });
} else {
    init();
}
