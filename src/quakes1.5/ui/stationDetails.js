/**
 * Muestra la información detallada de la Estación en el HTML.
 * @param {sp.stationxml.Station | null} station - El objeto estación seleccionado.
 */
export function displayStationDetails(station) {
    if (!station) {
        stationDetailsContainer.innerHTML = '<div class="station-card"><h3>Seleccione una Estación en el mapa 👆</h3></div>';
        document.querySelector("span#stationCode").textContent = "Seleccione una Estación";
        return;
    }
    
    const code = station.codes();
    document.querySelector("span#stationCode").textContent = code;
    
    stationDetailsContainer.innerHTML = `
        <div class="station-card">
            <h2>📡 Detalles de la Estación</h2>
            <table>
                <tr>
                    <th>Código:</th>
                    <td><strong>${code}</strong></td>
                </tr>
                <tr>
                    <th>Localización:</th>
                    <td>${station.latitude.toFixed(4)} N, ${station.longitude.toFixed(4)} E</td>
                </tr>
                <tr>
                    <th>Elevación:</th>
                    <td>${station.elevation.toFixed(1)} m</td>
                </tr>
                <tr>
                    <th>Canales:</th>
                    <td>${station.channels ? station.channels.length : 0} disponibles</td>
                </tr>
            </table>
        </div>
    `;
  }