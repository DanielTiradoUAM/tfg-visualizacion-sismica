// src/quakes/state/selectionState.js

/**
 * Estado global de selección actual
 * Se importa desde cualquier módulo que necesite saber
 * qué terremoto o estación están activos.
 */

export let CURRENT_QUAKE = null;
export let CURRENT_STATION = null;

/**
 * Setters explícitos para mantener el estado centralizado
 * (no es obligatorio usarlos, pero ayuda a no liarla)
 */

export function setCurrentQuake(quake) {
  CURRENT_QUAKE = quake;
}

export function setCurrentStation(station) {
  CURRENT_STATION = station;
}

/**
 * Getter opcional (por claridad semántica)
 */
export function getSelectionState() {
  return {
    quake: CURRENT_QUAKE,
    station: CURRENT_STATION,
  };
}
