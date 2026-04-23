/**
 * station.js — Módulo principal de la vista de estación.
 */

import * as sp from "../seisplot/seisplotjs.mjs";
import { getDataLink } from "../quakes/data/datalinkService.js";
import { queryStations } from "../quakes/data/fdsnQueries.js";
import { fetchStationChannelWaveformPackets } from "../quakes/data/waveformPackets.js";
import { initWaveform, pushPacketToWaveform } from "./waveform.js";
import { initSpectrogram, pushPacketToSpectrogram } from "./spectrogram.js";
import { renderEventSummary } from "./eventSummary.js";
import {
  initHelicorder,
  ingestHelicorderPacket,
  activateHelicorderView,
  deactivateHelicorderView,
  destroyHelicorder,
} from "./helicorder.js";
import {
  createMapUrl,
  createStationUrl,
  decodeEventPayload,
  getPreferredStationChannel,
  persistLastStationSelection,
} from "../shared/navigation.js";

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
let _helicorderState = "inactive";
let _helicorderProgressLabel = "CARGANDO";

const eventPacketCache = new Map();

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
const panelHeli = document.getElementById("panel-helicorder");
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
  if (!statusEl || !statusText) return;

  statusEl.classList.remove(
    "topnav__status--live",
    "topnav__status--error",
    "topnav__status--loading"
  );

  switch (state) {
    case "live":
      statusEl.classList.add("topnav__status--live");
      statusText.textContent = "LIVE";
      break;
    case "error":
      statusEl.classList.add("topnav__status--error");
      statusText.textContent = "ERROR";
      break;
    case "loading":
      statusEl.classList.add("topnav__status--loading");
      statusText.textContent = label ?? "CARGANDO";
      break;
    default:
      statusText.textContent = label ?? "CONNECTING";
  }
}

function setDetail(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "—";
}

function persistCurrentStation() {
  persistLastStationSelection({
    net: NETWORK,
    sta: STATION,
    cha: CHANNEL,
  });
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

  const heliVisible = isHelicorderViewActive();
  const heliBusy = _helicorderState === "warming" || _helicorderState === "catching_up";

  if (heliVisible && heliBusy) {
    setStatus("loading", _helicorderProgressLabel);
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

  const mag = EVENT_PAYLOAD.magnitude != null
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

function getSelectableChannels(station) {
  const channels = [...new Set(
    (station?.channels ?? [])
      .map(channel => channel.channelCode?.trim().toUpperCase())
      .filter(Boolean)
  )];

  channels.sort((left, right) => {
    const order = ["HH", "BH", "EH"];
    const leftPrefix = order.indexOf(left.slice(0, 2));
    const rightPrefix = order.indexOf(right.slice(0, 2));
    const leftWeight = leftPrefix === -1 ? 99 : leftPrefix;
    const rightWeight = rightPrefix === -1 ? 99 : rightPrefix;

    if (leftWeight !== rightWeight) return leftWeight - rightWeight;

    const orientationOrder = ["Z", "N", "E"];
    return orientationOrder.indexOf(left[2]) - orientationOrder.indexOf(right[2]);
  });

  return channels;
}

function renderChannelSelector() {
  if (!channelSelectEl || !ACTIVE_STATION) return;

  const channels = getSelectableChannels(ACTIVE_STATION);
  channelSelectEl.innerHTML = "";

  for (const channelCode of channels) {
    const option = document.createElement("option");
    option.value = channelCode;
    option.textContent = channelCode;
    option.selected = channelCode === CHANNEL;
    channelSelectEl.appendChild(option);
  }

  setDetail("d-chan-count", `${channels.length}`);
}

function updateEventDetails() {
  if (!isEventMode() || !EVENT_PAYLOAD || !ACTIVE_STATION) return;

  const mag = EVENT_PAYLOAD.magnitude != null
    ? `M${Number(EVENT_PAYLOAD.magnitude).toFixed(1)} ${EVENT_PAYLOAD.magnitudeType || ""}`.trim()
    : EVENT_PAYLOAD.description || "Evento";

  setDetail("d-event-mag", mag);
  setDetail("d-event-time", EVENT_PAYLOAD.time?.toFormat?.("HH:mm:ss 'UTC'") || "—");
  setDetail("d-event-depth", EVENT_PAYLOAD.depth != null ? `${Number(EVENT_PAYLOAD.depth).toFixed(1)} km` : "—");

  if (EVENT_PAYLOAD.latitude != null && EVENT_PAYLOAD.longitude != null) {
    const dist = sp.distaz.distaz(
      ACTIVE_STATION.latitude,
      ACTIVE_STATION.longitude,
      EVENT_PAYLOAD.latitude,
      EVENT_PAYLOAD.longitude
    );
    setDetail("d-event-dist", `${dist.distanceDeg.toFixed(2)}°`);
  } else {
    setDetail("d-event-dist", "—");
  }
}

function renderStationList(query = "") {
  const listEl = document.getElementById("station-list");
  listEl.innerHTML = "";

  const q = query.toLowerCase().replace(/[\s.]/g, "");
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
    const item = document.createElement("div");
    item.className = "station-item";
    if (station.net === NETWORK && station.sta === STATION) item.classList.add("station-item--active");

    const dot = document.createElement("span");
    dot.className = "station-item__dot station-item__dot--online";

    const name = document.createElement("span");
    name.textContent = `${station.net}.${station.sta}`;

    item.append(dot, name);
    item.addEventListener("click", () => {
      navigateToStation({
        net: station.net,
        sta: station.sta,
      });
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

  STATION_LIST = [];
  for (const network of networks) {
    const netCode = network.networkCode?.trim();
    if (!netCode) continue;

    for (const station of network.stations ?? []) {
      const staCode = station.stationCode?.trim();
      if (!staCode) continue;
      STATION_LIST.push({ net: netCode, sta: staCode });
    }
  }

  renderStationList(document.getElementById("station-search")?.value ?? "");

  const activeNetwork = networks.find(network => network.networkCode?.trim() === NETWORK);
  ACTIVE_STATION = activeNetwork?.stations?.find(station => station.stationCode?.trim() === STATION) || null;

  if (!ACTIVE_STATION) {
    listEl.innerHTML = '<div class="station-list__empty">La estación seleccionada no existe.</div>';
    return false;
  }

  const availableChannels = getSelectableChannels(ACTIVE_STATION);
  const fallbackChannel = availableChannels.includes(CHANNEL)
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
  const latEl = document.getElementById("d-latency");
  if (latEl) {
    latEl.textContent = `${latencyS.toFixed(1)} s`;
    latEl.style.color =
      latencyS < 3 ? "var(--text-live)" :
      latencyS < 10 ? "var(--text-warn)" :
      "var(--text-danger)";
  }

  const d = new Date(endMs);
  const pad = n => String(n).padStart(2, "0");
  setDetail("d-last", `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`);
}

function handlePacket(packet) {
  const endMs = Number(packet.hppacketend) / 1000;
  const tenMinAgo = Date.now() - LIVE_THRESHOLD_MS;
  const isLive = endMs >= tenMinAgo;

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

  viewLiveEl.classList.toggle("view--hidden", isHeli);
  viewHeliEl.classList.toggle("view--hidden", !isHeli);
  viewEventEl?.classList.add("view--hidden");

  btnViewLive.classList.toggle("view-toggle__btn--active", !isHeli);
  btnViewHeli.classList.toggle("view-toggle__btn--active", isHeli);

  if (panelSpec) panelSpec.classList.toggle("view--hidden", isHeli);
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
  panelHeli?.classList.add("view--hidden");

  if (eventMode) {
    btnViewLive.style.display = "none";
    btnViewHeli.style.display = "none";
    viewLiveEl.classList.add("view--hidden");
    viewEventEl.classList.remove("view--hidden");
    panelSpec.classList.add("view--hidden");
    panelHeli.classList.add("view--hidden");
    eventBlockEl.classList.remove("view--hidden");
    for (const row of telemetryRows) {
      if (row) row.style.display = "none";
    }
  } else {
    btnViewLive.style.display = "";
    btnViewHeli.style.display = "";
    viewEventEl.classList.add("view--hidden");
    viewLiveEl.classList.remove("view--hidden");
    panelSpec.classList.remove("view--hidden");
    eventBlockEl.classList.add("view--hidden");
    for (const row of telemetryRows) {
      if (row) row.style.display = "";
    }
  }

  refreshStatus();
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

function buildPattern() {
  const [c1, c2, c3] = CHANNEL.split("");
  return `FDSN:${NETWORK}_${STATION}__${c1}_${c2}_${c3}/MSEED`;
}

async function renderEventMode() {
  if (!ACTIVE_STATION || !EVENT_PAYLOAD) return;

  if (eventEmptyStateEl) {
    eventEmptyStateEl.textContent = `Generando hoja resumen para ${CHANNEL}…`;
  }
  eventSummaryContentEl.innerHTML = "";

  const cacheKey = `${EVENT_PAYLOAD.id || EVENT_PAYLOAD.time?.toISO?.() || "event"}:${NETWORK}.${STATION}.${CHANNEL}`;
  let packetsByChannel = eventPacketCache.get(cacheKey);

  if (!packetsByChannel) {
    packetsByChannel = await fetchStationChannelWaveformPackets(EVENT_PAYLOAD, ACTIVE_STATION, CHANNEL);
    eventPacketCache.set(cacheKey, packetsByChannel);
  }

  if (eventEmptyStateEl) {
    eventEmptyStateEl.style.display = "none";
  }

  await renderEventSummary({
    container: eventSummaryContentEl,
    quake: EVENT_PAYLOAD,
    station: ACTIVE_STATION,
    channelCode: CHANNEL,
    packetsByChannel,
  });
}

async function runLiveMode() {
  setStatus("connecting");

  const loaded = await loadFDSNData();
  if (!loaded) return;

  fillStaticDetails();
  initSpectrogramFilters();
  initHelicorderFilters();

  try {
    initWaveform("waveform");
    await initSpectrogram();
    initHelicorder("helicorder");

    const dl = getDataLink(handlePacket);
    const pattern = buildPattern();

    await dl.connect();
    await dl.awaitDLCommand("MATCH", pattern);

    const backTime = sp.luxon.DateTime.utc().minus(sp.luxon.Duration.fromISO("P1D"));
    await dl.positionAfter(backTime);

    setStatus("loading", "0%");
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
  await renderEventMode();
}

function registerUiListeners() {
  btnViewLive?.addEventListener("click", () => setView("live"));
  btnViewHeli?.addEventListener("click", () => setView("helicorder"));

  document.getElementById("station-search")?.addEventListener("input", event => {
    renderStationList(event.target.value);
  });

  channelSelectEl?.addEventListener("change", event => {
    const nextChannel = event.target.value;
    if (!nextChannel || nextChannel === CHANNEL) return;

    navigateToStation({ cha: nextChannel });
  });

  window.addEventListener("seisview:helicorder:progress", event => {
    const { phase, pct } = event.detail;
    _helicorderProgressLabel = phase === "refine" && pct < 100 ? `${pct}%` : "LIVE";
    refreshStatus();
  });

  window.addEventListener("seisview:helicorder:state", event => {
    _helicorderState = event.detail.state;

    if (_helicorderState === "warming") {
      _helicorderProgressLabel = "CARGANDO";
    } else if (_helicorderState === "catching_up" && _helicorderProgressLabel === "LIVE") {
      _helicorderProgressLabel = "0%";
    }

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
