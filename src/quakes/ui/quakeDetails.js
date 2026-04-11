/**
 * Muestra la información detallada del objeto Quake en el panel overlay.
 * @param {sp.quakeml.Quake | null} quake
 */
export function displayQuakeDetails(quake) {
    const panel = document.getElementById("quakeInfoPanel");
    const magnitudeEl = document.getElementById("quakeMagnitude");
    const detailsEl = document.getElementById("quakeDetails");
  
    if (!quake) {
        panel.classList.remove("visible");
        return;
    }

    panel.classList.add("visible");

  
    // Extraer datos reales de SeisPlot
    const mag = quake.magnitudeList[0];
    const origin = quake.originList[0];
  
    const magStr = `${mag.magQuantity.value.toFixed(1)} ${mag.type}`;
    const timeStr = quake.time.toFormat('yyyy-MM-dd HH:mm:ss ZZZ');
  
    // Mostrar panel
    panel.classList.remove("hidden");
    panel.classList.add("visible-panel");
  
    // Columna izquierda → magnitud grande
    magnitudeEl.innerHTML = `
      <div>
        <div style="font-size: 5rem; font-weight: bold;">
          ${mag.magQuantity.value.toFixed(1)}
        </div>
        <div style="font-size: 1.2rem;">
          ${mag.type}
        </div>
      </div>
    `;
  
    // Columna derecha → resto de información
    detailsEl.innerHTML = `
      <div><strong>Hora UTC:</strong> ${timeStr}</div>
      <div><strong>Latitud:</strong> ${origin.latitude.toFixed(2)}°</div>
      <div><strong>Longitud:</strong> ${origin.longitude.toFixed(2)}°</div>
      <div><strong>Profundidad:</strong> ${origin.depth.toFixed(1)} km</div>
      <div><strong>Descripción:</strong> ${quake.description}</div>
    `;
  }
  