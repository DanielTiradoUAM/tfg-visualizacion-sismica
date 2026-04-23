import * as sp from "../seisplot/seisplotjs.mjs";

const LIVE_THRESHOLD_MS = 10 * 60 * 1000;
const RECENT_CACHE_MS = 15 * 60 * 1000;
const BACKGROUND_BUDGET_MS = 4;
const ACTIVE_BUDGET_MS = 14;
const DRAW_INTERVAL_MS = 250;

let containerEl = null;
let helicorderEl = null;
let heliConfig = null;
let heliData = null;
let nowMarkerTimer = null;
let timeWindow = null;

let viewIsActive = false;
let streamCaughtUp = false;
let renderState = "inactive";
let hasRenderedData = false;

let packetQueue = [];
let rafHandle = null;
let lastDrawTime = 0;

const stores = {
    history: createStore(),
    recent: createStore(),
    pending: createStore(),
    rendered: createStore(),
};

function createStore() {
    return { list: [], ids: new Set() };
}

function resetStore(store) {
    store.list = [];
    store.ids = new Set();
}

function segmentId(segment) {
    const source = segment?.sourceId?.toString?.() ?? segment?.codes?.() ?? "unknown";
    const start = segment?.startTime?.toMillis?.() ?? 0;
    const end = segment?.endTime?.toMillis?.() ?? 0;
    return `${source}|${start}|${end}|${segment?.numPoints ?? 0}|${segment?.sampleRate ?? 0}`;
}

function addToStore(store, segment) {
    const id = segmentId(segment);
    if (store.ids.has(id)) return false;
    store.list.push(segment);
    store.ids.add(id);
    return true;
}

function removeFirstFromStore(store) {
    const segment = store.list.shift();
    if (!segment) return null;
    store.ids.delete(segmentId(segment));
    return segment;
}

function sortByStartTime(segments) {
    return segments.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
}

function buildTimeWindow(reference = sp.luxon.DateTime.utc()) {
    const hoursToAdd = reference.hour % 2 === 0 ? 2 : 1;
    const plotEnd = reference.plus({ hours: hoursToAdd }).startOf("hour");
    return sp.luxon.Interval.before(plotEnd, sp.luxon.Duration.fromISO("P1D"));
}

function isInsideWindow(segment) {
    return segment.endTime >= timeWindow.start && segment.startTime <= timeWindow.end;
}

function emitState(nextState) {
    if (renderState === nextState) return;
    renderState = nextState;
    window.dispatchEvent(new CustomEvent("seisview:helicorder:state", {
        detail: { state: nextState }
    }));
}

function emitProgress(processed, queued) {
    const pct = queued > 0 ? Math.min(100, Math.round((processed / queued) * 100)) : 100;
    window.dispatchEvent(new CustomEvent("seisview:helicorder:progress", {
        detail: {
            phase: "refine",
            processed,
            queued,
            pct,
            queueLeft: Math.max(0, queued - processed),
        }
    }));
}

function createDisplayData(segments = []) {
    const sdd = segments.length > 0
        ? sp.seismogram.SeismogramDisplayData.fromSeismogram(new sp.seismogram.Seismogram(segments))
        : new sp.seismogram.SeismogramDisplayData(timeWindow);

    sdd.timeRange = timeWindow;
    sdd.markerList = [];
    sdd.addMarkers([{
        markertype: "predicted",
        name: "now",
        time: sp.luxon.DateTime.utc(),
    }]);

    return sdd;
}

function applyDisplayData(sdd) {
    if (!helicorderEl) return;
    heliData = sdd;
    helicorderEl.seisData = [sdd];
    hasRenderedData = !!sdd?.seismogram;
}

function ensureHelicorderElement() {
    if (!containerEl || helicorderEl) return;
    heliData = createDisplayData();
    helicorderEl = new sp.helicorder.Helicorder([heliData], heliConfig);
    containerEl.appendChild(helicorderEl);
}

function drawHelicorder() {
    if (!viewIsActive || !helicorderEl) return;
    heliConfig.fixedTimeScale = timeWindow;
    helicorderEl.draw();
    lastDrawTime = performance.now();
}

function rebuildRenderedSnapshot() {
    if (!viewIsActive) return;
    applyDisplayData(createDisplayData(sortByStartTime([...stores.rendered.list].filter(isInsideWindow))));
    drawHelicorder();
}

function clearRenderedView() {
    if (!helicorderEl) return;
    resetStore(stores.rendered);
    applyDisplayData(createDisplayData());
    drawHelicorder();
}

function pruneStore(store, keepSegment) {
    const nextList = [];
    const nextIds = new Set();

    for (const segment of store.list) {
        if (!keepSegment(segment)) continue;
        nextList.push(segment);
        nextIds.add(segmentId(segment));
    }

    store.list = sortByStartTime(nextList);
    store.ids = nextIds;
}

function pruneCaches() {
    pruneStore(stores.history, segment => segment.endTime.toMillis() >= timeWindow.start.toMillis() && isInsideWindow(segment));

    const recentCutoff = Date.now() - RECENT_CACHE_MS;
    pruneStore(stores.recent, segment => segment.endTime.toMillis() >= recentCutoff && isInsideWindow(segment));
    pruneStore(stores.pending, isInsideWindow);
    pruneStore(stores.rendered, isInsideWindow);
}

function refreshTimeWindow(referenceTime) {
    const nextWindow = buildTimeWindow(referenceTime);
    if (timeWindow && timeWindow.start.equals(nextWindow.start) && timeWindow.end.equals(nextWindow.end)) {
        return;
    }

    timeWindow = nextWindow;
    pruneCaches();

    if (heliConfig) {
        heliConfig.fixedTimeScale = timeWindow;
    }

    if (viewIsActive) {
        clearRenderedView();
        queueCachedSegments();
    }
}

function queueCachedSegments() {
    resetStore(stores.pending);
    resetStore(stores.rendered);

    const merged = new Map();
    for (const segment of stores.history.list) merged.set(segmentId(segment), segment);
    for (const segment of stores.recent.list) merged.set(segmentId(segment), segment);

    for (const segment of sortByStartTime([...merged.values()].filter(isInsideWindow))) {
        addToStore(stores.pending, segment);
    }
}

function markStreamCaughtUp(packetEndMs) {
    if (streamCaughtUp || packetEndMs < Date.now() - LIVE_THRESHOLD_MS) return;
    streamCaughtUp = true;
}

function appendDuringCatchup(segment) {
    try {
        heliData.append(segment);
        hasRenderedData = true;
    } catch (error) {
        console.warn("[Helicorder] append() durante catch-up falló, reconstruyendo:", error?.message ?? error);
        rebuildRenderedSnapshot();
    }
}

function appendLive(segment) {
    if (!helicorderEl) return;

    try {
        if (!heliData?.seismogram) {
            rebuildRenderedSnapshot();
            return;
        }

        helicorderEl.appendSegment(segment);
        lastDrawTime = performance.now();
    } catch (error) {
        console.warn("[Helicorder] appendSegment falló, reconstruyendo:", error?.message ?? error);
        rebuildRenderedSnapshot();
    }
}

function handleSegment(segment) {
    const now = sp.luxon.DateTime.utc();
    const referenceTime = segment.endTime.toMillis() > now.toMillis() ? segment.endTime : now;
    refreshTimeWindow(referenceTime);
    if (!isInsideWindow(segment)) return;

    addToStore(stores.recent, segment);

    if (!streamCaughtUp || viewIsActive) {
        const inserted = addToStore(stores.history, segment);
        if (!viewIsActive || !inserted) return;

        if (renderState === "ready" && streamCaughtUp) {
            addToStore(stores.rendered, segment);
            appendLive(segment);
        } else {
            addToStore(stores.pending, segment);
        }
    }
}

function extractSegments(packet) {
    const isMseed = typeof packet?.isMiniseed === "function" ? packet.isMiniseed() : packet?.isMiniseed;
    if (!isMseed) return [];

    const record = typeof packet?.asMiniseed === "function" ? packet.asMiniseed() : packet?._miniseed;
    if (!record) return [];

    const seismograms = sp.miniseed.seismogramPerChannel([record]);
    if (!Array.isArray(seismograms) || seismograms.length === 0) return [];

    return seismograms.flatMap(seis => seis?.segments ?? []);
}

function processPacketQueue(deadline) {
    while (packetQueue.length > 0 && performance.now() < deadline) {
        const packet = packetQueue.shift();
        const packetEndMs = Number(packet?.hppacketend) / 1000;
        if (packetEndMs) markStreamCaughtUp(packetEndMs);

        try {
            for (const segment of extractSegments(packet)) {
                handleSegment(segment);
            }
        } catch (error) {
            console.warn("[Helicorder] Error procesando paquete:", error?.message ?? error);
        }
    }
}

function processRenderQueue(deadline) {
    if (!viewIsActive) return;

    if (stores.pending.list.length === 0) {
        if (streamCaughtUp && renderState !== "ready") {
            if (!hasRenderedData && stores.rendered.list.length > 0) {
                rebuildRenderedSnapshot();
            } else {
                drawHelicorder();
            }
            emitState("ready");
            emitProgress(1, 1);
        }
        return;
    }

    if (renderState !== "catching_up") {
        emitState("catching_up");
    }

    const totalQueued = stores.pending.list.length + stores.rendered.list.length;
    let processed = 0;

    while (stores.pending.list.length > 0 && performance.now() < deadline) {
        const segment = removeFirstFromStore(stores.pending);
        if (!segment || !addToStore(stores.rendered, segment)) continue;
        appendDuringCatchup(segment);
        processed++;
    }

    if (processed > 0 && performance.now() - lastDrawTime >= DRAW_INTERVAL_MS) {
        drawHelicorder();
        emitProgress(stores.rendered.list.length, Math.max(totalQueued, 1));
    }

    if (stores.pending.list.length === 0 && streamCaughtUp) {
        drawHelicorder();
        emitState("ready");
        emitProgress(1, 1);
    }
}

function startProcessor() {
    if (rafHandle) return;

    const tick = () => {
        const budgetMs = viewIsActive ? ACTIVE_BUDGET_MS : BACKGROUND_BUDGET_MS;
        const deadline = performance.now() + budgetMs;

        processPacketQueue(deadline);
        processRenderQueue(deadline);

        rafHandle = requestAnimationFrame(tick);
    };

    rafHandle = requestAnimationFrame(tick);
}

function updateNowMarker() {
    if (!heliData) return;

    heliData.markerList = (heliData.markerList ?? []).filter(marker => marker.name !== "now");
    heliData.addMarkers([{
        markertype: "predicted",
        name: "now",
        time: sp.luxon.DateTime.utc(),
    }]);

    if (viewIsActive) drawHelicorder();
}

function bindFilterEvents() {
    window.addEventListener("seisview:filter:helicorder:lines", event => {
        if (!heliConfig) return;
        heliConfig.numLines = event.detail.lines;
        if (viewIsActive) drawHelicorder();
    });

    window.addEventListener("seisview:filter:helicorder:amplitude", event => {
        if (!heliConfig) return;
        const amp = event.detail.amplitude;
        heliConfig.fixedAmplitudeScale = amp > 0 ? [-amp, amp] : [0, 0];
        if (viewIsActive) drawHelicorder();
    });

    window.addEventListener("seisview:filter:helicorder:detrend", event => {
        if (!heliConfig) return;
        heliConfig.detrendLines = event.detail.detrend;
        if (viewIsActive) drawHelicorder();
    });
}

export function initHelicorder(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) {
        console.error("[Helicorder] No se encontró el contenedor:", containerId);
        return;
    }

    timeWindow = buildTimeWindow();
    heliConfig = new sp.helicorder.HelicorderConfig(timeWindow);
    heliConfig.numLines = 12;
    heliConfig.title = "";
    heliConfig.detrendLines = true;

    bindFilterEvents();
    startProcessor();
    nowMarkerTimer = setInterval(updateNowMarker, 60_000);
    emitState("inactive");
}

export function ingestHelicorderPacket(packet) {
    if (packet) packetQueue.push(packet);
}

export function activateHelicorderView() {
    viewIsActive = true;
    ensureHelicorderElement();
    clearRenderedView();
    queueCachedSegments();

    emitState("warming");

    if (stores.pending.list.length > 0 || !streamCaughtUp) {
        emitState("catching_up");
        emitProgress(stores.rendered.list.length, Math.max(stores.pending.list.length, 1));
    } else {
        drawHelicorder();
        emitState("ready");
    }
}

export function deactivateHelicorderView() {
    viewIsActive = false;
    emitState("inactive");
}

export function destroyHelicorder() {
    if (nowMarkerTimer) clearInterval(nowMarkerTimer);
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (helicorderEl?.parentElement) helicorderEl.parentElement.removeChild(helicorderEl);

    containerEl = null;
    helicorderEl = null;
    heliConfig = null;
    heliData = null;
    nowMarkerTimer = null;
    timeWindow = null;

    viewIsActive = false;
    streamCaughtUp = false;
    renderState = "inactive";
    hasRenderedData = false;

    packetQueue = [];
    resetStore(stores.history);
    resetStore(stores.recent);
    resetStore(stores.pending);
    resetStore(stores.rendered);

    rafHandle = null;
    lastDrawTime = 0;
}
