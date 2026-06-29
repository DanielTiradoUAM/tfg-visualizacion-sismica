// src/quakes/map/mapHandlers.js
import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";

import {
  CURRENT_QUAKE,
  setCurrentQuake,
  toggleStation,
  CURRENT_STATIONS
} from "../state/selectionState.js";

import { displayQuakeDetails } from "../ui/quakeDetails.js";
import { displayStationDetails } from "../ui/stationDetails.js";
import { renderSelectedStationsPanel } from "../ui/selectedStationsPanel.js";
import {
  renderSeismogramError,
  renderSeismogramLoading,
  renderSeismogramPreview,
  renderStationPreparedPreview,
} from "../ui/seismogramPreview.js";
import {
  getCachedWaveformPackets,
  setCachedWaveformPackets,
} from "../state/waveformCache.js";
import { fetchStationWaveformPackets } from "../../../shared/datalink/waveformPackets.js";
import { exportToMSeed } from "../../../shared/datalink/mseedDownload.js";
import {
  createStationUrl,
  encodeEventPayload,
  getPreferredStationChannel,
  persistLastStationSelection,
} from "../../../shared/navigation/navigation.js";
import {
  clearAllRayLines,
  renderSeismicRays,
} from "./seismicRays.js";

let lastSelectedStation = null;
let lastStationHighlighted = null;
let lastPreviewRequestId = 0;
let currentPacketsByChannel = null;

function hasAnyPackets(packetsByChannel) {
  return Object.values(packetsByChannel ?? {}).some(packets => packets?.length);
}

function setDownloadReady(station, packetsByChannel) {
  const downloadBtn = document.getElementById("btnDownloadMSeed");
  if (!downloadBtn) return;

  const canDownload = Boolean(CURRENT_QUAKE && station && hasAnyPackets(packetsByChannel));
  downloadBtn.classList.toggle("hidden", !CURRENT_QUAKE);
  downloadBtn.disabled = !canDownload;
}

function clearStationSelectionView(map) {
  lastPreviewRequestId++;
  lastSelectedStation = null;
  currentPacketsByChannel = null;
  setDownloadReady(null, null);
  clearAllRayLines();

  const stationsPanel = document.getElementById("stationInfoPanel");
  const seismogramContainer = document.getElementById("seismogramContainer");
  stationsPanel?.classList.add("hidden");
  if (seismogramContainer) seismogramContainer.innerHTML = "";

  if (lastStationHighlighted) {
    map.colorClass(
      sp.leafletutil.cssClassForStationCodes(lastStationHighlighted),
      null
    );
    lastStationHighlighted = null;
  }
}

function renderStations(map) {
  renderSelectedStationsPanel({
    map,
    stations: CURRENT_STATIONS,
    activeStation: lastSelectedStation,
    onFocusStation: station => {
      map.dispatchEvent(
        new CustomEvent("stationclick", {
          detail: { station, fromList: true } // Pasamos un flag para saber el origen
        })
      );
    },
    onRemoveStation: station => {
      const removedActiveStation = lastSelectedStation?.codes() === station.codes();
      toggleStation(station);
      if (removedActiveStation) {
        lastSelectedStation = CURRENT_STATIONS[0] ?? null;
        currentPacketsByChannel = null;
        setDownloadReady(lastSelectedStation, null);
      }
      renderStations(map);

      if (CURRENT_STATIONS.length === 0) {
        const container = document.getElementById("stationInfoPanel");
        if (container) container.classList.add("hidden");
      } else if (removedActiveStation && lastSelectedStation) {
        map.dispatchEvent(
          new CustomEvent("stationclick", {
            detail: { station: lastSelectedStation, fromList: true }
          })
        );
      }
    },
  });

  renderSeismicRays(map, CURRENT_QUAKE, CURRENT_STATIONS);
}

async function loadMapSeismogramPreview(station) {
  const requestId = ++lastPreviewRequestId;

  if (!CURRENT_QUAKE) {
    currentPacketsByChannel = null;
    setDownloadReady(station, null);
    renderStationPreparedPreview(station, false);
    return;
  }

  renderSeismogramLoading(station);
  setDownloadReady(station, null);

  try {
    let packetsByChannel = getCachedWaveformPackets(CURRENT_QUAKE, station);

    if (!packetsByChannel) {
      packetsByChannel = await fetchStationWaveformPackets(CURRENT_QUAKE, station);
      setCachedWaveformPackets(CURRENT_QUAKE, station, packetsByChannel);
    }

    if (requestId !== lastPreviewRequestId) return;

    currentPacketsByChannel = packetsByChannel;
    const rendered = await renderSeismogramPreview(CURRENT_QUAKE, station, packetsByChannel);
    setDownloadReady(station, rendered ? packetsByChannel : null);
  } catch (error) {
    if (requestId !== lastPreviewRequestId) return;
    console.warn("[Map] No se pudo cargar el preview del sismograma:", error);
    currentPacketsByChannel = null;
    setDownloadReady(station, null);
    renderSeismogramError(station, "No se pudo cargar el sismograma de este evento.");
  }
}

export function registerMapHandlers(map) {

  if (!map) return;

  const openStationBtn = document.getElementById("btnOpenStationView");
  const downloadBtn = document.getElementById("btnDownloadMSeed");

  function openStationInTab(station) {
    const selection = {
      net: station.networkCode?.trim(),
      sta: station.stationCode?.trim(),
      cha: getPreferredStationChannel(station),
      mode: CURRENT_QUAKE ? "event" : "live",
      eventPayload: CURRENT_QUAKE ? encodeEventPayload(CURRENT_QUAKE) : null,
    };

    persistLastStationSelection(selection);
    window.open(createStationUrl(selection).toString(), "_blank", "noopener");
  }

  openStationBtn?.addEventListener("click", () => {
    if (lastSelectedStation) {
      openStationInTab(lastSelectedStation);
    }
  });

  downloadBtn?.addEventListener("click", () => {
    if (!lastSelectedStation || !currentPacketsByChannel) return;
    exportToMSeed(currentPacketsByChannel, lastSelectedStation);
  });

  map.addEventListener("stationclick", async (ce) => {
    const station = ce.detail.station;
    const fromList = ce.detail.fromList;

    if (lastStationHighlighted) {
      map.colorClass(
        sp.leafletutil.cssClassForStationCodes(lastStationHighlighted),
        null
      );
    }
  
    lastStationHighlighted = station;
  
    map.colorClass(
      sp.leafletutil.cssClassForStationCodes(station),
      "blue"
    );
  
    // ---- SOLO añadimos estación si viene del mapa y no está ya seleccionada ----
  
    const alreadySelected = CURRENT_STATIONS.some(
      s => s.codes() === station.codes()
    );
  
    // en el handler de stationclick:
    if (!fromList && !alreadySelected) {
        if (CURRENT_QUAKE) {
            toggleStation(station);  // multi-select solo con terremoto
        } else {
            // sin terremoto: selección única, reemplazar
            CURRENT_STATIONS.length = 0;
            toggleStation(station);
        }
    }
  
    lastSelectedStation = station;
    renderStations(map);
  
    displayStationDetails(station, { hasCurrentQuake: Boolean(CURRENT_QUAKE) });

    await loadMapSeismogramPreview(station);
  
  });

  map.addEventListener("quakeclick", (ce) => {

    const quake = ce.detail.quake;
  
    // Si se hace click en el mismo terremoto → deseleccionar
    if (CURRENT_QUAKE && CURRENT_QUAKE === quake) {
  
      map.colorClass(
        sp.leafletutil.cssClassForQuake(CURRENT_QUAKE),
        "yellow"
      );
  
      setCurrentQuake(null);
  
      const quakePanel = document.getElementById("quakeInfoPanel");
  
      quakePanel?.classList.add("hidden");
      clearStationSelectionView(map);

      return;
    }
  
    // Restaurar color anterior
    if (CURRENT_QUAKE !== null) {
      map.colorClass(
        sp.leafletutil.cssClassForQuake(CURRENT_QUAKE),
        "yellow"
      );
    }
  
    setCurrentQuake(quake);
    clearStationSelectionView(map);
    
    map.colorClass(
      sp.leafletutil.cssClassForQuake(CURRENT_QUAKE),
      "green"
    );
  
    displayQuakeDetails(CURRENT_QUAKE);
  
    renderStations(map);
  
  });

}
