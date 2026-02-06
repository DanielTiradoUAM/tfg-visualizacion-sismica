// src/quakes/map/mapHandlers.js

import * as sp from "../../seisplot/seisplotjs.mjs";

import {
  CURRENT_QUAKE,
  CURRENT_STATIONS,
  setCurrentQuake,
  toggleStation,
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

    // Añadir / quitar estación del estado global
    toggleStation(station);

    // Mostrar info de la estación clicada (opcional pero útil)
    displayStationDetails(station);

    // Si hay terremoto seleccionado → cargar sismograma de ESTA estación
    if (CURRENT_QUAKE) {
      loadAndDisplaySeismogram(CURRENT_QUAKE, station);
    }
  });

  // --- Click en terremoto ---
  map.addEventListener("quakeclick", (ce) => {
    const quake = ce.detail.quake;

    // Quitar highlight del terremoto anterior
    if (CURRENT_QUAKE) {
      map.removeColorClass(
        sp.leafletutil.cssClassForQuake(CURRENT_QUAKE)
      );
    }

    // Seleccionar nuevo terremoto (esto limpia estaciones internamente)
    setCurrentQuake(quake);

    // Highlight del nuevo terremoto
    map.colorClass(
      sp.leafletutil.cssClassForQuake(quake),
      "green"
    );

    // Mostrar info del terremoto
    displayQuakeDetails(quake);

    /**
     * NOTA:
     * No cargamos sismogramas aquí directamente,
     * porque al cambiar de terremoto se limpian las estaciones.
     * Los sismogramas se cargarán cuando el usuario
     * vuelva a clicar estaciones.
     */
  });
}
