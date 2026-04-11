// src/quakes/map/mapHandlers.js
import * as sp from "../../seisplot/seisplotjs.mjs";

import {
  CURRENT_QUAKE,
  setCurrentQuake,
  toggleStation,
  CURRENT_STATIONS
} from "../state/selectionState.js";

import { displayQuakeDetails } from "../ui/quakeDetails.js";
import { displayStationDetails } from "../ui/stationDetails.js";
import { loadAndDisplaySeismogram } from "../seismograms/loadSeismogram.js";
import { fetchStationWaveformPackets } from "../data/waveformPackets.js";
import { exportToMSeed } from "../data/mseedDownload.js";

let rayLines = new Map();        // <stationCode, leafletLine>
let waveformCache = new Map(); // key: quakeId_stationCode -> packets

let lastDownloadedData = null;
let lastSelectedStation = null;
let lastStationHighlighted = null;

let waveAnimation = null;
let dashOffset = 0;

/**
 * Genera puntos intermedios siguiendo círculo máximo
 */
function getGreatCirclePoints(lat1, lon1, lat2, lon2, pointsCount = 50) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const rLat1 = lat1 * toRad;
  const rLon1 = lon1 * toRad;
  const rLat2 = lat2 * toRad;
  const rLon2 = lon2 * toRad;

  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((rLat1 - rLat2) / 2), 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.pow(Math.sin((rLon1 - rLon2) / 2), 2)
  ));

  const points = [];

  for (let i = 0; i <= pointsCount; i++) {

    const f = i / pointsCount;

    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(rLat1) * Math.cos(rLon1) + B * Math.cos(rLat2) * Math.cos(rLon2);
    const y = A * Math.cos(rLat1) * Math.sin(rLon1) + B * Math.cos(rLat2) * Math.sin(rLon2);
    const z = A * Math.sin(rLat1) + B * Math.sin(rLat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
    const lon = Math.atan2(y, x) * toDeg;

    points.push([lat, lon]);
  }

  return points;
}

function renderStations(map) {

  const panel = document.getElementById("stationInfoPanel");

  if (panel) {
    panel.classList.toggle("hidden", CURRENT_STATIONS.length === 0);
  }

  const list = document.getElementById("selectedStationsList");
  if (list) list.innerHTML = "";

  // limpiar rayos actuales
  rayLines.forEach((line) => line.remove());
  rayLines.clear();

  CURRENT_STATIONS.forEach((station) => {

    const stationCode = station.codes();

    // ---------- LISTA HTML ----------
    const item = document.createElement("div");
    item.className = "station-list-item";

    const stationBtn = document.createElement("button");
    stationBtn.className = "station-btn";
    stationBtn.textContent = stationCode;

    const removeBtn = document.createElement("button");
    removeBtn.className = "station-remove-btn";
    removeBtn.textContent = "-";

    // Al hacer clic en el nombre, solo "enfocamos" la estación
    stationBtn.addEventListener("click", () => {
      map.dispatchEvent(
        new CustomEvent("stationclick", {
          detail: { station, fromList: true } // Pasamos un flag para saber el origen
        })
      );
    });

    // Eliminar estación (aquí sí usamos toggle porque queremos quitarla)
    removeBtn.addEventListener("click", (e) => {

      e.stopPropagation();
    
      toggleStation(station);
    
      map.colorClass(
        sp.leafletutil.cssClassForStationCodes(station),
        null
      );
    
      renderStations(map);
    
      if (CURRENT_STATIONS.length === 0) {
    
        const container = document.getElementById("stationInfoPanel");
        if (container) container.classList.add("hidden");
    
      }
    
    });

    item.appendChild(stationBtn);
    item.appendChild(removeBtn);
    list.appendChild(item);

    // ---------- RAYO SÍSMICO ----------

    if (CURRENT_QUAKE && map.map) {

      const points = getGreatCirclePoints(
        CURRENT_QUAKE.latitude,
        CURRENT_QUAKE.longitude,
        station.latitude,
        station.longitude
      );

      const line = window.L.polyline(points, {
        weight: 3,
        color: "#ff4d4d",
        opacity: 0.7,
        dashArray: "8 8",
        lineJoin: "round"
      }).addTo(map.map);

      rayLines.set(stationCode, line);
    }

  });

  startWaveAnimation();
}

/**
 * Limpia todas las líneas
 */
function clearAllRayLines() {

  rayLines.forEach((line) => line.remove());
  rayLines.clear();

  if (waveAnimation) {
    clearInterval(waveAnimation);
    waveAnimation = null;
  }
}

/**
 * Animación global de ondas
 */
function startWaveAnimation() {

  if (waveAnimation) return;

  dashOffset = 0;

  waveAnimation = setInterval(() => {

    dashOffset -= 1;

    rayLines.forEach((line) => {
      line.setStyle({
        dashOffset: dashOffset
      });
    });

  }, 40);
}













export function registerMapHandlers(map) {

  if (!map) return;

  const downloadBtn = document.getElementById("btnDownloadMSeed");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (lastDownloadedData && lastSelectedStation) {
        exportToMSeed(lastDownloadedData, lastSelectedStation);
      }
    });
  }

  map.addEventListener("stationclick", async (ce) => {

    if (!CURRENT_QUAKE) {
      return; 
    }    

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
  
    if (!fromList && !alreadySelected) {
      toggleStation(station);
    }
  
    renderStations(map);
  
    displayStationDetails(station);
  
    downloadBtn?.classList.add("hidden");
  
    if (!CURRENT_QUAKE) return;
  
    const target = document.getElementById("seismogramContainer");
  
    if (target) {
      target.innerHTML = `
        <div style="color: white; text-align: center; margin-top: 20px;">
          Descargando datos de ${station.codes()}...
        </div>`;
    }
  
    const cacheKey = `${CURRENT_QUAKE.id}_${station.codes()}`;
    let packetsByChannel;

    if (waveformCache.has(cacheKey)) {

      // usar datos cacheados
      packetsByChannel = waveformCache.get(cacheKey);

    } else {

      // descargar
      packetsByChannel = await fetchStationWaveformPackets(
        CURRENT_QUAKE,
        station
      );

      waveformCache.set(cacheKey, packetsByChannel);
    }
  
    lastDownloadedData = packetsByChannel;
    lastSelectedStation = station;
  
    loadAndDisplaySeismogram(
      CURRENT_QUAKE,
      station,
      packetsByChannel
    );
  
    if (Object.keys(packetsByChannel).length > 0) {
      downloadBtn?.classList.remove("hidden");
    }
  
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
  
      clearAllRayLines();
  
      const quakePanel = document.getElementById("quakeInfoPanel");
      const stationsPanel = document.getElementById("stationInfoPanel");
  
      quakePanel?.classList.add("hidden");
      stationsPanel?.classList.add("hidden");

      if (lastStationHighlighted) {
        map.colorClass(
          sp.leafletutil.cssClassForStationCodes(lastStationHighlighted),
          null
        );
      }

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
    waveformCache.clear();
    
    map.colorClass(
      sp.leafletutil.cssClassForQuake(CURRENT_QUAKE),
      "green"
    );
  
    displayQuakeDetails(CURRENT_QUAKE);
  
    renderStations(map);
  
  });

}