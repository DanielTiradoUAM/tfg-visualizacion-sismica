// src/quakes/ui/seismogramContainer.js

const containerSelector = "div#seismogramDisplayContainer";

/**
 * Devuelve el contenedor principal
 */
function getContainer() {
  return document.querySelector(containerSelector);
}

/**
 * Limpia todos los sismogramas (al cambiar de terremoto)
 */
export function clearSeismogramContainer() {
  const container = getContainer();
  if (container) {
    container.innerHTML = "";
  }
}

/**
 * Crea el contenedor base para una estación (si no existe)
 */
function ensureStationContainer(stationCode, quake) {
  const container = getContainer();
  if (!container) return null;

  let stationDiv = container.querySelector(
    `.seismogram-card[data-station="${stationCode}"]`
  );

  if (!stationDiv) {
    stationDiv = document.createElement("div");
    stationDiv.className = "seismogram-card";
    stationDiv.dataset.station = stationCode;

    stationDiv.innerHTML = `
      <div class="seismogram-header">
        <h3>📉 Estación ${stationCode}</h3>
        <p>
          Evento: ${quake.description || "Sismo"}
          (M${quake.magnitudeList[0].magQuantity.value.toFixed(1)})
        </p>
      </div>
      <div class="seismogram-target" style="height: 300px; width: 100%;"></div>
    `;

    container.appendChild(stationDiv);
  }

  return stationDiv;
}

/**
 * Muestra estado de carga para una estación concreta
 */
export function showLoading(stationCode, quake) {
  const stationDiv = ensureStationContainer(stationCode, quake);
  if (!stationDiv) return;

  const target = stationDiv.querySelector(".seismogram-target");
  target.innerHTML = `
    <div class="loading-card">
      <p>🔄 Conectando a DataLink…</p>
      <div class="spinner"></div>
    </div>
  `;
}

/**
 * Muestra error para una estación concreta
 */
export function showError(stationCode, message) {
  const container = getContainer();
  if (!container) return;

  const stationDiv = container.querySelector(
    `.seismogram-card[data-station="${stationCode}"]`
  );
  if (!stationDiv) return;

  const target = stationDiv.querySelector(".seismogram-target");
  target.innerHTML = `
    <div class="error-card">
      <p>❌ ${message}</p>
    </div>
  `;
}

/**
 * Devuelve el target donde dibujar el sismograma de una estación
 */
export function getSeismogramTarget(stationCode) {
  const container = getContainer();
  if (!container) return null;

  const stationDiv = container.querySelector(
    `.seismogram-card[data-station="${stationCode}"]`
  );

  if (!stationDiv) return null;

  return stationDiv.querySelector(".seismogram-target");
}
