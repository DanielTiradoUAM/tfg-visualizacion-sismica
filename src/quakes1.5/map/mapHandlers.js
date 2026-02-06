// src/quakes/map/mapHandlers.js

import * as sp from "../../seisplot/seisplotjs.mjs";

import {
  CURRENT_QUAKE,
  CURRENT_STATION,
  setCurrentQuake,
  setCurrentStation,
} from "../state/selectionState.js";

import { displayQuakeDetails } from "../ui/quakeDetails.js";
import { displayStationDetails } from "../ui/stationDetails.js";
import { loadAndDisplaySeismogram } from "../seismograms/loadSeismogram.js";

/**
 * Registra los manejadores de eventos del mapa
 * @param {HTMLElement} map - componente <sp-station-quake-map>
 */
export function registerMapHandlers(map) {
  if (!map) return;

  // --- Click en estación ---
  map.addEventListener("stationclick", (ce) => {
    const station = ce.detail.station;

    setCurrentStation(station);
    displayStationDetails(station);

    // Si ya hay terremoto seleccionado → cargar sismograma
    if (CURRENT_QUAKE) {
      loadAndDisplaySeismogram(CURRENT_QUAKE, station);
    }
  });

  // --- Click en terremoto ---
  map.addEventListener("quakeclick", (ce) => {
    const quake = ce.detail.quake;

    // Quitar highlight anterior
    if (CURRENT_QUAKE) {
      map.removeColorClass(
        sp.leafletutil.cssClassForQuake(CURRENT_QUAKE)
      );
    }

    setCurrentQuake(quake);

    // Highlight del nuevo terremoto
    map.colorClass(
      sp.leafletutil.cssClassForQuake(quake),
      "green"
    );

    displayQuakeDetails(quake);

    // Si ya hay estación seleccionada → cargar sismograma
    if (CURRENT_STATION) {
      loadAndDisplaySeismogram(quake, CURRENT_STATION);
    }
  });
}
