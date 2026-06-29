// src/quakes/map/mapInit.js

import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";

/**
 * Inicialización del mapa
 */
export const mymap = document.querySelectorAll("sp-station-quake-map")[0];

// --- Lógica de Zoom y Mapa (Sincronización robusta) ---

let zoomEnabled = false;

function tryEnableZoom() {
  if (zoomEnabled) return;

  if (mymap && mymap.map) {
    const leafletInstance = mymap.map;

    leafletInstance.whenReady(() => {
      leafletInstance.scrollWheelZoom.enable();
      leafletInstance.invalidateSize(true);
      zoomEnabled = true;
      console.log("✅ Zoom de rueda habilitado con whenReady. ¡Éxito!");
    });
  } else {
    setTimeout(tryEnableZoom, 50);
  }
}

// Arranque diferido exactamente como en el original
setTimeout(() => {
  tryEnableZoom();
}, 200);

// --- Estilos del mapa ---
mymap.addStyle(`
  div.stationMapMarker {
    color: rebeccapurple;
  }
  /* NO pongas color ni fill aquí para path.quakeMapMarker */
  /* Si lo pones, bloquearás el currentColor de Leaflet */
`);

