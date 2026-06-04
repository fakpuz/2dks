function numberOr(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function normalizeViewState(view = {}) {
    return {
        x: numberOr(view.x, 0),
        y: numberOr(view.y, 0),
        zoom: numberOr(view.zoom, 1)
    };
}

export function createEmptySpaceMemory() {
    return {
        viewsBySpaceId: {}
    };
}

export function normalizeSpaceMemory(spaceMemory = {}) {
    const viewsBySpaceId = Object.fromEntries(
        Object.entries(spaceMemory.viewsBySpaceId || {}).map(([spaceId, view]) => [
            String(spaceId),
            normalizeViewState(view)
        ])
    );

    return { viewsBySpaceId };
}

export function rememberSpaceView(manifest, spaceId, view) {
    const nextMemory = normalizeSpaceMemory(manifest?.spaceMemory);
    nextMemory.viewsBySpaceId[String(spaceId)] = normalizeViewState(view);
    return nextMemory;
}

export function forgetSpaceViews(manifest, spaceIds = []) {
    const nextMemory = normalizeSpaceMemory(manifest?.spaceMemory);
    spaceIds.forEach((spaceId) => {
        delete nextMemory.viewsBySpaceId[String(spaceId)];
    });
    return nextMemory;
}

export function getRememberedSpaceView(manifest, spaceId, fallback = { x: 0, y: 0, zoom: 1 }) {
    const normalizedFallback = normalizeViewState(fallback);
    const view = manifest?.spaceMemory?.viewsBySpaceId?.[String(spaceId)];
    return view ? normalizeViewState(view) : normalizedFallback;
}
