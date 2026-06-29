/**
 * station.js — Módulo principal de la vista de estación.
 */

import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { queryStations } from "../../shared/fdsn/stationQueries.js";
import { initWaveform, pushPacketToWaveform, applyWaveformFilter } from "./live/waveform.js";
import { initSpectrogram, pushPacketToSpectrogram } from "./live/spectrogram.js";
import { connectLiveDataLink } from "./live/liveStream.js";
import { renderStationEventMode } from "./event/eventMode.js";
import { DEFAULT_EVENT_FILTERS } from "./event/eventSummary.js";
import { exportToMSeed } from "../../shared/datalink/mseedDownload.js";
import { getSelectableChannels, renderChannelOptions } from "./ui/channelSelector.js";
import { flattenStationList } from "./ui/stationList.js";
import { setStatusLabel } from "./ui/viewModeControls.js";
import {
  initHelicorder,
  ingestHelicorderPacket,
  activateHelicorderView,
  deactivateHelicorderView,
  destroyHelicorder,
} from "./helicorder/helicorder.js";
import {
  createMapUrl,
  createStationUrl,
  decodeEventPayload,
  getPreferredStationChannel,
  persistLastStationSelection,
} from "../../shared/navigation/navigation.js";

const params = new URLSearchParams(window.location.search);
const NETWORK = params.get("net") || "OD";
const STATION = params.get("sta") || "UAM";
let CHANNEL = params.get("cha") || "HHZ";
const MODE = params.get("mode") || "live";
const RAW_EVENT_PAYLOAD = params.get("event") || "";
const EVENT_PAYLOAD = decodeEventPayload(RAW_EVENT_PAYLOAD);
const VIEW_MODE = MODE === "event" && EVENT_PAYLOAD ? "event" : "live";

const LIVE_THRESHOLD_MS = 10 * 60 * 1000;

let packetCount = 0;
let STATION_LIST = [];
let ACTIVE_STATION = null;
let _streamIsLive = false;
let _helicorderState = "inactive"; // "inactive" | "loading" | "ready"

const eventPacketCache = new Map();
let EVENT_FILTERS = normalizeEventFilters({ ...DEFAULT_EVENT_FILTERS });
let eventPacketsByChannel = null;

const clockEl = document.getElementById("utc-clock");
const statusEl = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const modeBadgeEl = document.getElementById("view-mode-badge");
const eventTitleEl = document.getElementById("event-title");

const viewLiveEl = document.getElementById("view-live");
const viewHeliEl = document.getElementById("view-helicorder");
const viewEventEl = document.getElementById("view-event");
const btnViewLive = document.getElementById("btn-view-live");
const btnViewHeli = document.getElementById("btn-view-heli");
const panelSpec = document.getElementById("panel-spectrogram");
const panelLiveFilters = document.getElementById("panel-live-filters");
const panelHeli = document.getElementById("panel-helicorder");
const panelEventFilters = document.getElementById("panel-event-filters");
const eventDownloadBtn = document.getElementById("event-download-mseed");
const eventBlockEl = document.getElementById("event-detail-block");
const eventEmptyStateEl = document.getElementById("event-empty-state");
const eventSummaryContentEl = document.getElementById("event-summary-content");
const channelSelectEl = document.getElementById("channel-select");
const telemetryRows = [
  document.getElementById("telemetry-latency-row"),
  document.getElementById("telemetry-packets-row"),
  document.getElementById("telemetry-last-row"),
];

function isEventMode() {
  return VIEW_MODE === "event";
}

function tickClock() {
  if (!clockEl) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  clockEl.textContent =
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}
setInterval(tickClock, 1000);
tickClock();

function setStatus(state, label) {
  setStatusLabel(statusEl, statusText, state, label);
}

function setDetail(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "—";
}

function persistCurrentStation() {
  persistLastStationSelection({ net: NETWORK, sta: STATION, cha: CHANNEL });
}

function currentStationUrl(overrides = {}) {
  return createStationUrl({
    net: overrides.net || NETWORK,
    sta: overrides.sta || STATION,
    cha: overrides.cha || CHANNEL,
    mode: overrides.mode || VIEW_MODE,
    eventPayload: overrides.eventPayload ?? (isEventMode() ? RAW_EVENT_PAYLOAD : null),
  });
}

function navigateToStation(overrides = {}) {
  window.location.href = currentStationUrl(overrides).toString();
}

function initTopNav() {
  document.getElementById("nav-to-map")?.addEventListener("click", () => {
    window.location.href = createMapUrl().toString();
  });

  document.getElementById("nav-to-station")?.addEventListener("click", () => {
    persistCurrentStation();
    window.location.href = currentStationUrl().toString();
  });
}

function isHelicorderViewActive() {
  return !panelHeli?.classList.contains("view--hidden");
}

function refreshStatus() {
  if (isEventMode()) {
    setStatus("loading", "EVENT");
    return;
  }

  // Si el helicorder está visible y todavía cargando, mostrarlo.
  if (isHelicorderViewActive() && _helicorderState === "loading") {
    setStatus("loading", "CARGANDO");
    return;
  }

  if (_streamIsLive) {
    setStatus("live");
    return;
  }

  setStatus("loading", "CARGANDO");
}

function formatEventHeadline() {
  if (!EVENT_PAYLOAD) return "";

  const mag  = EVENT_PAYLOAD.magnitude != null
    ? `M${Number(EVENT_PAYLOAD.magnitude).toFixed(1)}`
    : "Evento";
  const type = EVENT_PAYLOAD.magnitudeType ? ` ${EVENT_PAYLOAD.magnitudeType}` : "";
  const time = EVENT_PAYLOAD.time?.toFormat?.("yyyy-MM-dd HH:mm:ss 'UTC'") || "";
  return `${mag}${type} · ${time}`;
}

function fillStaticDetails() {
  document.getElementById("title").textContent = `${NETWORK}.${STATION} — ${CHANNEL}`;
  setDetail("d-net", NETWORK);
  setDetail("d-sta", STATION);
  setDetail("d-cha", CHANNEL);
  setDetail("d-mode", isEventMode() ? "EVENT" : "LIVE");

  if (modeBadgeEl) {
    modeBadgeEl.textContent = isEventMode() ? "EVENT" : "LIVE";
  }

  if (eventTitleEl) {
    eventTitleEl.textContent = isEventMode()
      ? `${EVENT_PAYLOAD.description || "Evento seleccionado"} · ${formatEventHeadline()}`
      : "";
  }
}

function renderChannelSelector() {
  if (!channelSelectEl || !ACTIVE_STATION) return;

  const channels = getSelectableChannels(ACTIVE_STATION);
  renderChannelOptions(channelSelectEl, channels, CHANNEL);
  setDetail("d-chan-count", `${channels.length}`);
}

function updateEventDetails() {
  if (!isEventMode() || !EVENT_PAYLOAD || !ACTIVE_STATION) return;

  const mag = EVENT_PAYLOAD.magnitude != null
    ? `M${Number(EVENT_PAYLOAD.magnitude).toFixed(1)} ${EVENT_PAYLOAD.magnitudeType || ""}`.trim()
    : EVENT_PAYLOAD.description || "Evento";

  setDetail("d-event-mag",  mag);
  setDetail("d-event-time", EVENT_PAYLOAD.time?.toFormat?.("HH:mm:ss 'UTC'") || "—");
  setDetail("d-event-depth", EVENT_PAYLOAD.depth != null
    ? `${Number(EVENT_PAYLOAD.depth).toFixed(1)} km` : "—");

  if (EVENT_PAYLOAD.latitude != null && EVENT_PAYLOAD.longitude != null) {
    const dist = sp.distaz.distaz(
      ACTIVE_STATION.latitude, ACTIVE_STATION.longitude,
      EVENT_PAYLOAD.latitude,  EVENT_PAYLOAD.longitude
    );
    setDetail("d-event-dist", `${dist.distanceDeg.toFixed(2)}°`);
  } else {
    setDetail("d-event-dist", "—");
  }
}

function renderStationList(query = "") {
  const listEl = document.getElementById("station-list");
  listEl.innerHTML = "";

  const q        = query.toLowerCase().replace(/[\s.]/g, "");
  const filtered = STATION_LIST.filter(station => {
    if (!q) return true;
    return `${station.net}${station.sta}`.toLowerCase().includes(q)
      || station.sta.toLowerCase().includes(q)
      || station.net.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    listEl.innerHTML = '<div class="station-list__empty">Sin resultados.</div>';
    return;
  }

  for (const station of filtered) {
    const item      = document.createElement("div");
    item.className  = "station-item";
    if (station.net === NETWORK && station.sta === STATION) item.classList.add("station-item--active");

    const dot  = document.createElement("span");
    dot.className = "station-item__dot station-item__dot--online";

    const name = document.createElement("span");
    name.textContent = `${station.net}.${station.sta}`;

    item.append(dot, name);
    item.addEventListener("click", () => {
      navigateToStation({ net: station.net, sta: station.sta });
    });

    listEl.appendChild(item);
  }
}

async function loadFDSNData() {
  const listEl = document.getElementById("station-list");
  listEl.innerHTML = '<div class="station-list__empty">Cargando estaciones…</div>';

  let networks;
  try {
    networks = await queryStations();
  } catch (error) {
    console.warn("[FDSN] Error:", error.message);
    listEl.innerHTML = '<div class="station-list__empty">Error al cargar estaciones.</div>';
    return false;
  }

  if (!networks?.length) {
    listEl.innerHTML = '<div class="station-list__empty">No se encontraron estaciones.</div>';
    return false;
  }

  STATION_LIST = flattenStationList(networks);

  renderStationList(document.getElementById("station-search")?.value ?? "");

  const activeNetwork = networks.find(n => n.networkCode?.trim() === NETWORK);
  ACTIVE_STATION = activeNetwork?.stations?.find(s => s.stationCode?.trim() === STATION) || null;

  if (!ACTIVE_STATION) {
    listEl.innerHTML = '<div class="station-list__empty">La estación seleccionada no existe.</div>';
    return false;
  }

  const availableChannels = getSelectableChannels(ACTIVE_STATION);
  const fallbackChannel   = availableChannels.includes(CHANNEL)
    ? CHANNEL
    : (availableChannels[0] || getPreferredStationChannel(ACTIVE_STATION));

  if (fallbackChannel && fallbackChannel !== CHANNEL) {
    navigateToStation({ cha: fallbackChannel });
    return false;
  }

  setDetail("d-lat", `${ACTIVE_STATION.latitude.toFixed(4)}°`);
  setDetail("d-lon", `${ACTIVE_STATION.longitude.toFixed(4)}°`);
  setDetail("d-ele", `${ACTIVE_STATION.elevation.toFixed(1)} m`);

  renderChannelSelector();
  updateEventDetails();
  persistCurrentStation();
  return true;
}

function updateLiveTelemetry(packet) {
  const endMs = Number(packet.hppacketend) / 1000;
  if (!endMs) return;

  packetCount++;
  setDetail("d-packets", packetCount);

  const latencyS = (Date.now() - endMs) / 1000;
  const latEl    = document.getElementById("d-latency");
  if (latEl) {
    latEl.textContent = `${latencyS.toFixed(1)} s`;
    latEl.style.color =
      latencyS < 3  ? "var(--text-live)"   :
      latencyS < 10 ? "var(--text-warn)"   :
                      "var(--text-danger)";
  }

  const d   = new Date(endMs);
  const pad = n => String(n).padStart(2, "0");
  setDetail("d-last",
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`);
}

function handlePacket(packet) {
  const endMs    = Number(packet.hppacketend) / 1000;
  const tenMinAgo = Date.now() - LIVE_THRESHOLD_MS;
  const isLive   = endMs >= tenMinAgo;

  if (isLive && !_streamIsLive) {
    _streamIsLive = true;
    refreshStatus();
    console.log("[Station] ✓ Stream live alcanzado.");
  }

  if (isLive) {
    updateLiveTelemetry(packet);
    pushPacketToWaveform(packet);
    pushPacketToSpectrogram(packet);
  }

  // El helicorder solo ingiere paquetes mientras no haya alcanzado el presente.
  ingestHelicorderPacket(packet);
}

function setView(view) {
  if (isEventMode()) {
    viewLiveEl?.classList.add("view--hidden");
    viewHeliEl?.classList.add("view--hidden");
    viewEventEl?.classList.remove("view--hidden");
    return;
  }

  const isHeli = view === "helicorder";

  viewLiveEl.classList.toggle("view--hidden",  isHeli);
  viewHeliEl.classList.toggle("view--hidden", !isHeli);
  viewEventEl?.classList.add("view--hidden");

  btnViewLive.classList.toggle("view-toggle__btn--active", !isHeli);
  btnViewHeli.classList.toggle("view-toggle__btn--active",  isHeli);

  if (panelSpec) panelSpec.classList.toggle("view--hidden",  isHeli);
  if (panelLiveFilters) panelLiveFilters.classList.toggle("view--hidden", isHeli);
  if (panelHeli) panelHeli.classList.toggle("view--hidden", !isHeli);

  if (isHeli) {
    activateHelicorderView();
  } else {
    deactivateHelicorderView();
  }

  refreshStatus();

  if (!isHeli) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new CustomEvent("seisview:view:live:activated"));
    });
  }
}

function applyModeLayout() {
  const eventMode = isEventMode();

  viewHeliEl?.classList.add("view--hidden");
  panelLiveFilters?.classList.toggle("view--hidden", eventMode);
  panelHeli?.classList.add("view--hidden");

  if (eventMode) {
    btnViewLive.style.display = "none";
    btnViewHeli.style.display = "none";
    viewLiveEl.classList.add("view--hidden");
    viewEventEl.classList.remove("view--hidden");
    //panelSpec.classList.add("view--hidden");
    panelHeli.classList.add("view--hidden");
    panelEventFilters?.classList.remove("view--hidden");
    eventBlockEl.classList.remove("view--hidden");
    for (const row of telemetryRows) {
      if (row) row.style.display = "none";
    }
  } else {
    btnViewLive.style.display = "";
    btnViewHeli.style.display = "";
    viewEventEl.classList.add("view--hidden");
    viewLiveEl.classList.remove("view--hidden");
    // panelSpec.classList.remove("view--hidden");
    panelEventFilters?.classList.add("view--hidden");
    eventBlockEl.classList.add("view--hidden");
    for (const row of telemetryRows) {
      if (row) row.style.display = "";
    }
  }

  refreshStatus();
}

function setEventFilterInputs(filters) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  };

  setChecked("event-filter-enabled", filters.signalFilterEnabled);
  setValue("event-filter-low", filters.lowHz);
  setValue("event-filter-high", filters.highHz);
  setChecked("event-remove-response", filters.removeResponse);
  setValue("event-spectra-scale", filters.spectraLogFreq === false ? "linear" : "log");
  setValue("event-spec-fmin", filters.spectrogramFreqMin);
  setValue("event-spec-fmax", filters.spectrogramFreqMax);
  setValue("event-spec-dbmin", filters.minDb);
  setValue("event-spec-dbmax", filters.maxDb);
  setValue("event-spec-fft", filters.fftWindowSize);
  setValue("event-spec-colormap", filters.colormap);
}

function readEventFilterInputs() {
  const numberValue = (id, fallback) => {
    const value = parseFloat(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };

  const intValue = (id, fallback) => {
    const value = parseInt(document.getElementById(id)?.value, 10);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    ...EVENT_FILTERS,
    signalFilterEnabled: document.getElementById("event-filter-enabled")?.checked ?? EVENT_FILTERS.signalFilterEnabled,
    lowHz: numberValue("event-filter-low", EVENT_FILTERS.lowHz),
    highHz: numberValue("event-filter-high", EVENT_FILTERS.highHz),
    removeResponse: document.getElementById("event-remove-response")?.checked ?? EVENT_FILTERS.removeResponse,
    spectraLogFreq: (document.getElementById("event-spectra-scale")?.value || "log") !== "linear",
    spectrogramFreqMin: numberValue("event-spec-fmin", EVENT_FILTERS.spectrogramFreqMin),
    spectrogramFreqMax: numberValue("event-spec-fmax", EVENT_FILTERS.spectrogramFreqMax),
    minDb: numberValue("event-spec-dbmin", EVENT_FILTERS.minDb),
    maxDb: numberValue("event-spec-dbmax", EVENT_FILTERS.maxDb),
    fftWindowSize: intValue("event-spec-fft", EVENT_FILTERS.fftWindowSize),
    colormap: document.getElementById("event-spec-colormap")?.value || EVENT_FILTERS.colormap,
  };
}

function normalizeEventFilters(filters) {
  const nyquist = 50;
  const fallback = {
    signalFilterEnabled: true,
    lowHz: 0.5,
    highHz: 10,
    removeResponse: true,
    spectraLogFreq: true,
    spectrogramFreqMin: 0,
    spectrogramFreqMax: 25,
    minDb: 35,
    maxDb: 110,
    fftWindowSize: 256,
    colormap: "inferno",
  };
  const merged = { ...fallback, ...filters };
  let lowHz = Math.max(0.001, Number(merged.lowHz) || fallback.lowHz);
  const highHz = Math.min(Math.max(Number(merged.highHz) || fallback.highHz, lowHz + 0.001), nyquist);
  const spectrogramFreqMin = Math.max(0, Number(merged.spectrogramFreqMin) || fallback.spectrogramFreqMin);
  const spectrogramFreqMax = Math.min(
    Math.max(Number(merged.spectrogramFreqMax) || fallback.spectrogramFreqMax, spectrogramFreqMin + 1),
    nyquist
  );
  const minDb = Math.min(Number(merged.minDb) || fallback.minDb, (Number(merged.maxDb) || fallback.maxDb) - 1);
  const maxDb = Math.max(Number(merged.maxDb) || fallback.maxDb, minDb + 1);

  return {
    ...merged,
    signalFilterEnabled: merged.signalFilterEnabled !== false,
    lowHz,
    highHz,
    removeResponse: merged.removeResponse !== false,
    spectraLogFreq: merged.spectraLogFreq !== false,
    spectrogramFreqMin,
    spectrogramFreqMax,
    minDb,
    maxDb,
    fftWindowSize: Math.max(64, Math.min(Number(merged.fftWindowSize) || fallback.fftWindowSize, 4096)),
  };
}

function normalizeLiveFilters(filters) {
  const lowHz = Math.max(0.001, Number(filters.lowHz) || 1.5);
  const highHz = Math.min(Math.max(Number(filters.highHz) || 45, lowHz + 0.001), 50);
  return { lowHz, highHz };
}

function setLiveFilterInputs(filters) {
  const lowEl = document.getElementById("live-filter-low");
  const highEl = document.getElementById("live-filter-high");
  if (lowEl) lowEl.value = filters.lowHz;
  if (highEl) highEl.value = filters.highHz;
}

function readLiveFilterInputs() {
  return normalizeLiveFilters({
    lowHz: parseFloat(document.getElementById("live-filter-low")?.value),
    highHz: parseFloat(document.getElementById("live-filter-high")?.value),
  });
}

function applyEventPreset(preset) {
  const presets = {
    full: {
      lowHz: 0.1,
      highHz: 45,
      spectrogramFreqMin: 0,
      spectrogramFreqMax: 50,
      minDb: 35,
      maxDb: 120,
      fftWindowSize: 256,
      colormap: "inferno",
    },
    body: {
      lowHz: 0.5,
      highHz: 10,
      spectrogramFreqMin: 0,
      spectrogramFreqMax: 25,
      minDb: 35,
      maxDb: 110,
      fftWindowSize: 256,
      colormap: "inferno",
    },
    high: {
      lowHz: 5,
      highHz: 35,
      spectrogramFreqMin: 0,
      spectrogramFreqMax: 50,
      minDb: 40,
      maxDb: 115,
      fftWindowSize: 128,
      colormap: "viridis",
    },
  };

  EVENT_FILTERS = normalizeEventFilters({
    ...EVENT_FILTERS,
    ...(presets[preset] ?? presets.body),
  });
  setEventFilterInputs(EVENT_FILTERS);
}

function emitSpectrogramEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function initSpectrogramFilters() {
  document.getElementById("spec-freq-apply")?.addEventListener("click", () => {
    const fmin = parseFloat(document.getElementById("spec-fmin").value);
    const fmax = parseFloat(document.getElementById("spec-fmax").value);
    if (isNaN(fmin) || isNaN(fmax) || fmin >= fmax) return;
    emitSpectrogramEvent("seisview:filter:spectrogram:freq", { fmin, fmax });
  });

  document.getElementById("spec-db-apply")?.addEventListener("click", () => {
    const minDb = parseFloat(document.getElementById("spec-dbmin").value);
    const maxDb = parseFloat(document.getElementById("spec-dbmax").value);
    if (isNaN(minDb) || isNaN(maxDb) || minDb >= maxDb) return;
    emitSpectrogramEvent("seisview:filter:spectrogram:db", { minDb, maxDb });
  });

  document.getElementById("spec-fft-apply")?.addEventListener("click", () => {
    const windowSize = parseInt(document.getElementById("spec-fft").value, 10);
    if (!windowSize || windowSize < 64) return;
    emitSpectrogramEvent("seisview:filter:spectrogram:fft", { windowSize });
  });

  document.getElementById("spec-colormap")?.addEventListener("change", event => {
    emitSpectrogramEvent("seisview:filter:spectrogram:colormap", { colormap: event.target.value });
  });
}

function emitHelicorderEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function initHelicorderFilters() {
  document.getElementById("heli-lines-apply")?.addEventListener("click", () => {
    const lines = parseInt(document.getElementById("heli-lines").value, 10);
    if (!lines || lines < 4) return;
    emitHelicorderEvent("seisview:filter:helicorder:lines", { lines });
  });

  document.getElementById("heli-amp-apply")?.addEventListener("click", () => {
    const amp = parseFloat(document.getElementById("heli-amp").value);
    if (isNaN(amp) || amp < 0) return;
    emitHelicorderEvent("seisview:filter:helicorder:amplitude", { amplitude: amp });
  });

  document.getElementById("heli-detrend")?.addEventListener("change", event => {
    emitHelicorderEvent("seisview:filter:helicorder:detrend", { detrend: event.target.checked });
  });
}

function initLiveFilters() {
  setLiveFilterInputs({ lowHz: 1.5, highHz: 45 });

  document.getElementById("live-filter-apply")?.addEventListener("click", () => {
    const filters = readLiveFilterInputs();
    setLiveFilterInputs(filters);
    applyWaveformFilter(filters);
  });
}

function setEventDownloadReady(packetsByChannel) {
  if (!eventDownloadBtn) return;
  const canDownload = Object.values(packetsByChannel ?? {}).some(packets => packets?.length);
  eventDownloadBtn.disabled = !canDownload;
}

async function renderEventMode() {
  eventPacketsByChannel = await renderStationEventMode({
    container: eventSummaryContentEl,
    emptyState: eventEmptyStateEl,
    quake: EVENT_PAYLOAD,
    station: ACTIVE_STATION,
    networkCode: NETWORK,
    stationCode: STATION,
    channelCode: CHANNEL,
    packetCache: eventPacketCache,
    filters: EVENT_FILTERS,
  });
  setEventDownloadReady(eventPacketsByChannel);
}

function initEventFilters() {
  setEventFilterInputs(EVENT_FILTERS);

  document.getElementById("event-filter-preset")?.addEventListener("change", event => {
    applyEventPreset(event.target.value);
  });

  document.getElementById("event-filter-apply")?.addEventListener("click", async () => {
    setEventDownloadReady(null);
    EVENT_FILTERS = normalizeEventFilters(readEventFilterInputs());
    setEventFilterInputs(EVENT_FILTERS);
    await renderEventMode();
  });

  eventDownloadBtn?.addEventListener("click", () => {
    if (!eventPacketsByChannel || !ACTIVE_STATION) return;
    exportToMSeed(eventPacketsByChannel, ACTIVE_STATION);
  });
}

async function runLiveMode() {
  setStatus("connecting");

  const loaded = await loadFDSNData();
  if (!loaded) return;

  fillStaticDetails();
  initLiveFilters();
  initSpectrogramFilters();
  initHelicorderFilters();

  try {
    initWaveform("waveform");
    await initSpectrogram();
    initHelicorder("helicorder");

    const { dl, pattern, backTime } = await connectLiveDataLink({
      network: NETWORK,
      station: STATION,
      channel: CHANNEL,
      onPacket: handlePacket,
    });

    setStatus("loading", "CARGANDO");
    console.log("▶ Stream:", pattern, "| desde", backTime.toFormat("dd/MM HH:mm"), "UTC");

    window.addEventListener("beforeunload", () => {
      if (dl?.isConnected()) dl.close();
      destroyHelicorder();
    });

    await dl.stream();
  } catch (error) {
    setStatus("error");
    console.error("Error crítico:", error);
  }
}

async function runEventMode() {
  setStatus("loading", "EVENT");
  const loaded = await loadFDSNData();
  if (!loaded) return;

  fillStaticDetails();
  initEventFilters();
  await renderEventMode();
}

function registerUiListeners() {
  btnViewLive?.addEventListener("click", () => setView("live"));
  btnViewHeli?.addEventListener("click", () => setView("helicorder"));
  document.getElementById("event-return-live")?.addEventListener("click", () => {
    navigateToStation({ mode: "live", eventPayload: "" });
  });

  document.getElementById("station-search")?.addEventListener("input", event => {
    renderStationList(event.target.value);
  });

  channelSelectEl?.addEventListener("change", event => {
    const nextChannel = event.target.value;
    if (!nextChannel || nextChannel === CHANNEL) return;
    navigateToStation({ cha: nextChannel });
  });

  // El helicorder solo emite "inactive" | "loading" | "ready".
  window.addEventListener("seisview:helicorder:state", event => {
    _helicorderState = event.detail.state;
    refreshStatus();
  });
}

async function main() {
  initTopNav();
  registerUiListeners();
  fillStaticDetails();
  applyModeLayout();

  if (isEventMode()) {
    await runEventMode();
  } else {
    await runLiveMode();
  }
}

main();
