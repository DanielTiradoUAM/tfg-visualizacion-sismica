// src/quakes/ui/seismogramContainer.js

const containerSelector = "div#seismogramDisplayContainer";

/**
 * Devuelve el contenedor principal del sismograma
 */
function getContainer() {
  return document.querySelector(containerSelector);
}

/**
 * Limpia completamente el contenedor del sismograma
 */
export function clearSeismogramContainer() {
  const container = getContainer();
  if (container) {
    container.innerHTML = "";
  }
}

/**
 * Muestra el estado de carga mientras se conecta a DataLink
 * @param {string} stationCode
 */
export function showLoading(stationCode) {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="loading-card">
      <p>🔄 Conectando a DataLink para ${stationCode}...</p>
      <div class="spinner"></div>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el contenedor del sismograma
 * @param {string} message
 */
export function showError(message) {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="error-card">
      <p>❌ ${message}</p>
    </div>
  `;
}

/**
 * Muestra la cabecera del sismograma y crea el div destino del gráfico
 * @param {Object} params
 * @param {string} params.stationCode
 * @param {string} params.channelCode
 * @param {Object} params.quake
 */
export function showSeismogramHeader({ stationCode, channelCode, quake }) {
  const container = getContainer();
  if (!container) return;

  container.innerHTML = `
    <div class="seismogram-header">
      <h3>📉 Sismograma: ${stationCode} - ${channelCode}</h3>
      <p>
        Evento: ${quake.description || "Sismo"}
        (M${quake.magnitudeList[0].magQuantity.value.toFixed(1)})
      </p>
    </div>
    <div id="seismograph-target" style="height: 400px; width: 100%;"></div>
  `;
}

/**
 * Devuelve el elemento DOM donde se dibuja el sismograma
 */
export function getSeismogramTarget() {
  const container = getContainer();
  if (!container) return null;

  return container.querySelector("#seismograph-target");
}
