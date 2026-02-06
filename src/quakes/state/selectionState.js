// src/quakes/state/selectionState.js

/**
 * Estado global de selección actual
 * Controla:
 *  - Un único terremoto seleccionado
 *  - Varias estaciones seleccionadas
 */

export let CURRENT_QUAKE = null;
export let CURRENT_STATIONS = [];

/**
 * Selecciona un terremoto.
 * Al cambiar de terremoto:
 *  - se limpian las estaciones seleccionadas
 */
export function setCurrentQuake(quake) {
  CURRENT_QUAKE = quake;
  CURRENT_STATIONS = [];
}

/**
 * Añade o quita una estación de la selección.
 * Si ya está seleccionada → se quita
 * Si no está → se añade
 */
export function toggleStation(station) {
  const index = CURRENT_STATIONS.findIndex(
    (s) => s.code === station.code
  );

  if (index === -1) {
    CURRENT_STATIONS.push(station);
  } else {
    CURRENT_STATIONS.splice(index, 1);
  }
}

/**
 * Limpia todas las estaciones seleccionadas
 * (útil si luego lo necesitas explícitamente)
 */
export function clearStations() {
  CURRENT_STATIONS = [];
}

/**
 * Getter del estado completo (por claridad)
 */
export function getSelectionState() {
  return {
    quake: CURRENT_QUAKE,
    stations: CURRENT_STATIONS,
  };
}
