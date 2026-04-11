/**
 * Muestra la información detallada de la Estación en el panel overlay.
 * @param {sp.stationxml.Station | null} station
 */
export function displayStationDetails(station) {

    const panel = document.getElementById("stationInfoPanel");
    const nameEl = document.getElementById("stationName");
    const detailsEl = document.getElementById("stationDetails");

    if (!station) {
        panel.classList.remove("visible");
        return;
    }

    panel.classList.add("visible");

    const code = station.codes();

    nameEl.textContent = code;

    detailsEl.innerHTML = `
        <div><strong>Latitud:</strong> ${station.latitude.toFixed(4)}°</div>
        <div><strong>Longitud:</strong> ${station.longitude.toFixed(4)}°</div>
        <div><strong>Elevación:</strong> ${station.elevation.toFixed(1)} m</div>
        <div><strong>Canales disponibles:</strong> ${
            station.channels ? station.channels.length : 0
        }</div>
    `;
}
