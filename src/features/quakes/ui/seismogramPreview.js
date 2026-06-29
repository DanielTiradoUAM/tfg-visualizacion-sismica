import { loadAndDisplaySeismogram } from "../../../shared/seismograms/seismogramRenderer.js";

function getTarget() {
  const target = document.getElementById("seismogramContainer");
  return target;
}

export function renderStationPreparedPreview(station, hasCurrentQuake) {
  const target = getTarget();
  if (!target) return;

  const modeLabel = hasCurrentQuake ? "evento seleccionado" : "monitorizacion en vivo";
  const hint = hasCurrentQuake
    ? "Selecciona una estacion para cargar el sismograma del evento."
    : "Usa el boton de detalle para abrir la monitorizacion en vivo de esta estacion.";
  target.innerHTML = `
    <div class="seismogram-preview seismogram-preview--idle">
      <div class="seismogram-preview__code">
        ${station.codes()}
      </div>
      <div class="seismogram-preview__text">
        Estacion preparada para ${modeLabel}. ${hint}
      </div>
    </div>`;
}

export function renderSeismogramLoading(station) {
  const target = getTarget();
  if (!target) return;

  target.innerHTML = `
    <div class="seismogram-preview seismogram-preview--loading">
      <div class="seismogram-preview__code">${station.codes()}</div>
      <div class="seismogram-preview__text">Descargando y procesando sismograma del evento...</div>
    </div>`;
}

export function renderSeismogramError(station, message = "No hay datos disponibles para esta estacion.") {
  const target = getTarget();
  if (!target) return;

  target.innerHTML = `
    <div class="seismogram-preview seismogram-preview--error">
      <div class="seismogram-preview__code">${station.codes()}</div>
      <div class="seismogram-preview__text">${message}</div>
    </div>`;
}

export async function renderSeismogramPreview(quake, station, packetsByChannel) {
  const hasPackets = Object.values(packetsByChannel ?? {}).some(packets => packets?.length);

  if (!hasPackets) {
    renderSeismogramError(station);
    return false;
  }

  await loadAndDisplaySeismogram(quake, station, packetsByChannel);
  return true;
}
