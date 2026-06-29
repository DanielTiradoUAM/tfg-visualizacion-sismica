import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";

const CATCHUP_THRESHOLD_MS = 60 * 1000; 
const ACTIVE_BUDGET_MS   = 12;
const BACKGROUND_BUDGET_MS = 6;
const BACKGROUND_DELAY_MS  = 24;

let containerEl    = null;
let placeholderEl  = null;
let helicorderEl   = null;
let heliConfig     = null;
let heliData       = null;
let nowMarkerTimer = null;
let timeWindow     = null;

let viewIsActive   = false;
let streamCaughtUp = false;
let renderState    = "inactive"; // "inactive" | "loading" | "ready"

let packetQueue    = [];
let processorTimer = null;

const segmentCache = { list: [], ids: new Set() };

// ─── Utilidades de caché ─────────────────────────────────────────────────────

function segmentId(segment) {
    const source = segment?.sourceId?.toString?.() ?? segment?.codes?.() ?? "unknown";
    const start  = segment?.startTime?.toMillis?.() ?? 0;
    const end    = segment?.endTime?.toMillis?.()   ?? 0;
    return `${source}|${start}|${end}|${segment?.numPoints ?? 0}|${segment?.sampleRate ?? 0}`;
}

function sortByStartTime(segments) {
    return segments.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
}

function addToCache(segment) {
    const id = segmentId(segment);
    if (segmentCache.ids.has(id)) return false;
    segmentCache.list.push(segment);
    segmentCache.ids.add(id);
    return true;
}

function resetCache() {
    segmentCache.list = [];
    segmentCache.ids  = new Set();
}

// ─── Ventana temporal ────────────────────────────────────────────────────────

function buildTimeWindow(reference = sp.luxon.DateTime.utc()) {
    const hoursToAdd = reference.hour % 2 === 0 ? 2 : 1;
    const plotEnd    = reference.plus({ hours: hoursToAdd }).startOf("hour");
    return sp.luxon.Interval.before(plotEnd, sp.luxon.Duration.fromISO("P1D"));
}

function isInsideWindow(segment) {
    return segment.endTime >= timeWindow.start && segment.startTime <= timeWindow.end;
}

function pruneCacheToWindow() {
    const kept         = segmentCache.list.filter(isInsideWindow);
    segmentCache.list  = sortByStartTime(kept);
    segmentCache.ids   = new Set(kept.map(segmentId));
}

function checkAndAdvanceTimeWindow(reference) {
    const next = buildTimeWindow(reference);
    if (timeWindow?.start.equals(next.start) && timeWindow?.end.equals(next.end)) return false;

    timeWindow = next;
    if (heliConfig) heliConfig.fixedTimeScale = timeWindow;
    pruneCacheToWindow();
    return true;
}

// ─── Estado ──────────────────────────────────────────────────────────────────

function emitState(nextState) {
    if (renderState === nextState) return;
    renderState = nextState;
    window.dispatchEvent(new CustomEvent("seisview:helicorder:state", {
        detail: { state: nextState },
    }));
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

function ensurePlaceholder() {
    if (!containerEl || placeholderEl) return;
    placeholderEl           = document.createElement("div");
    placeholderEl.className = "helicorder-placeholder";
    placeholderEl.textContent = "Cargando helicorder…";
    containerEl.appendChild(placeholderEl);
}

function removePlaceholder() {
    if (!placeholderEl) return;
    placeholderEl.remove();
    placeholderEl = null;
}

function ensureHelicorderElement() {
    if (!containerEl || helicorderEl) return;
    if (!heliData) heliData = createDisplayData();
    helicorderEl = new sp.helicorder.Helicorder([heliData], heliConfig);
    
    
    containerEl.appendChild(helicorderEl);
}

// ─── Datos y renderizado ─────────────────────────────────────────────────────

function createDisplayData(segments = []) {
    const sdd = segments.length > 0
        ? sp.seismogram.SeismogramDisplayData.fromSeismogram(
              new sp.seismogram.Seismogram(segments)
          )
        : new sp.seismogram.SeismogramDisplayData(timeWindow);

    sdd.timeRange   = timeWindow;
    sdd.markerList  = [];
    sdd.addMarkers([{ markertype: "predicted", name: "now", time: sp.luxon.DateTime.utc() }]);
    return sdd;
}

function snapshotSegments() {
    return sortByStartTime(segmentCache.list.filter(isInsideWindow));
}

function applyDisplayData(sdd) {
    heliData = sdd;
    if (helicorderEl) helicorderEl.seisData = [sdd];
}

function drawHelicorder() {
    if (!viewIsActive || !helicorderEl) return;
    heliConfig.fixedTimeScale = timeWindow;
    helicorderEl.draw();
}

function rebuildSnapshot() {
    applyDisplayData(createDisplayData(snapshotSegments()));
    if (!viewIsActive) return;
    ensureHelicorderElement();
    removePlaceholder();
    drawHelicorder();
}

// ─── Procesador de paquetes ───────────────────────────────────────────────────

function extractSegments(packet) {
    const isMseed = typeof packet?.isMiniseed === "function"
        ? packet.isMiniseed()
        : packet?.isMiniseed;
    if (!isMseed) return [];

    const record = typeof packet?.asMiniseed === "function"
        ? packet.asMiniseed()
        : packet?._miniseed;
    if (!record) return [];

    const seismograms = sp.miniseed.seismogramPerChannel([record]);
    if (!Array.isArray(seismograms) || seismograms.length === 0) return [];

    return seismograms.flatMap(s => s?.segments ?? []);
}

function handleSegment(segment) {
    const now       = sp.luxon.DateTime.utc();
    const reference = segment.endTime > now ? segment.endTime : now;
    checkAndAdvanceTimeWindow(reference);
    if (!isInsideWindow(segment)) return;
    addToCache(segment);
}

function processPacketQueue(deadline) {
    let justCaughtUp = false;

    while (packetQueue.length > 0 && performance.now() < deadline) {
        const packet      = packetQueue.shift();
        const packetEndMs = Number(packet?.hppacketend) / 1000;

        if (packetEndMs && !streamCaughtUp && packetEndMs >= Date.now() - CATCHUP_THRESHOLD_MS) {
            streamCaughtUp = true;
            justCaughtUp   = true;
        }

        try {
            for (const segment of extractSegments(packet)) {
                handleSegment(segment);
            }
        } catch (_) { /* ignorar paquetes corruptos */ }
    }

    // Cuando el replay alcanza el presente: construir y mostrar por primera y única vez.
    if (justCaughtUp) {
        rebuildSnapshot();
        emitState("ready");
    }
}

function clearProcessorTimer() {
    if (!processorTimer) return;
    clearTimeout(processorTimer);
    processorTimer = null;
}

function scheduleProcessor() {
    if (processorTimer) return;

    const delay = viewIsActive ? 0 : BACKGROUND_DELAY_MS;
    processorTimer = setTimeout(() => {
        processorTimer = null;
        if (packetQueue.length === 0) return;

        const budget = viewIsActive ? ACTIVE_BUDGET_MS : BACKGROUND_BUDGET_MS;
        processPacketQueue(performance.now() + budget);

        if (packetQueue.length > 0) scheduleProcessor();
    }, delay);
}

// ─── Marcador "now" (se actualiza cada minuto) ───────────────────────────────

function updateNowMarker() {
    if (!heliData || renderState !== "ready") return;

    heliData.markerList = (heliData.markerList ?? []).filter(m => m.name !== "now");
    heliData.addMarkers([{ markertype: "predicted", name: "now", time: sp.luxon.DateTime.utc() }]);

    if (viewIsActive && helicorderEl) helicorderEl.redraw?.();
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function bindFilterEvents() {
    window.addEventListener("seisview:filter:helicorder:lines", ({ detail }) => {
        if (!heliConfig) return;
        heliConfig.numLines = detail.lines;
        if (renderState === "ready") rebuildSnapshot();
    });

    window.addEventListener("seisview:filter:helicorder:amplitude", ({ detail }) => {
        if (!heliConfig) return;
        const amp = detail.amplitude;
        heliConfig.fixedAmplitudeScale = amp > 0 ? [-amp, amp] : [0, 0];
        if (renderState === "ready") rebuildSnapshot();
    });

    window.addEventListener("seisview:filter:helicorder:detrend", ({ detail }) => {
        if (!heliConfig) return;
        heliConfig.detrendLines = detail.detrend;
        if (renderState === "ready") rebuildSnapshot();
    });
}

// ─── API pública ─────────────────────────────────────────────────────────────

export function initHelicorder(containerId) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) {
        console.error("[Helicorder] Contenedor no encontrado:", containerId);
        return;
    }

    containerEl.classList.add("helicorder-host");

    timeWindow = buildTimeWindow();
    heliConfig = new sp.helicorder.HelicorderConfig(timeWindow);
    heliConfig.numLines    = 12;
    heliConfig.title       = "";
    heliConfig.detrendLines = true;

    bindFilterEvents();
    emitState("inactive");
}

export function ingestHelicorderPacket(packet) {
    if (!packet || streamCaughtUp) return;
    packetQueue.push(packet);
    if (renderState === "inactive") emitState("loading");
    scheduleProcessor();
}

export function activateHelicorderView() {
    viewIsActive = true;

    if (streamCaughtUp) {
        // El replay ya terminó: mostrar inmediatamente.
        ensureHelicorderElement();
        rebuildSnapshot();
        emitState("ready");
        return;
    }

    // Aún procesando el histórico: mostrar placeholder.
    ensurePlaceholder();
    if (renderState === "inactive") emitState("loading");
}

export function deactivateHelicorderView() {
    viewIsActive = false;
}

export function destroyHelicorder() {
    clearProcessorTimer();

    helicorderEl?.remove();
    removePlaceholder();

    containerEl    = null;
    placeholderEl  = null;
    helicorderEl   = null;
    heliConfig     = null;
    heliData       = null;
    nowMarkerTimer = null;
    timeWindow     = null;

    viewIsActive   = false;
    streamCaughtUp = false;
    renderState    = "inactive";

    packetQueue    = [];
    resetCache();
}
