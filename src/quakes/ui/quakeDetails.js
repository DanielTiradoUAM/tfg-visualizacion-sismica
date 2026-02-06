/**
 * Muestra la información detallada del objeto Quake en el HTML.
 * @param {sp.quakeml.Quake | null} quake - El objeto terremoto seleccionado.
 */
export function displayQuakeDetails(quake) {
    const headerSpan = document.querySelector("span#earthquakeDescription");

    if (!quake) {
        // Estado inicial o sin terremoto seleccionado
        quakeDetailsContainer.innerHTML = '<div class="quake-card"><h3>Seleccione un Terremoto en el mapa 👆</h3></div>';
        headerSpan.textContent = "Seleccione un Terremoto";
        return;
    }

    const mag = quake.magnitudeList[0];
    const origin = quake.originList[0];
    
    const magStr = `${mag.magQuantity.value.toFixed(1)} ${mag.type}`;
    const timeStr = quake.time.toFormat('yyyy-MM-dd HH:mm:ss ZZZ');
    
    // 1. Actualizar la cabecera (HEADER)
    headerSpan.innerHTML = `🌍 **Evento:** M${magStr} (${quake.description})`;

    // 2. Actualizar el contenedor principal con la tabla de detalles
    quakeDetailsContainer.innerHTML = `
        <div class="quake-card">
            <h2>🌍 Detalles del Terremoto</h2>
            <table>
                <tr>
                    <th>Magnitud:</th>
                    <td><strong>${magStr}</strong></td>
                </tr>
                <tr>
                    <th>Hora UTC:</th>
                    <td>${timeStr}</td>
                </tr>
                <tr>
                    <th>Localización:</th>
                    <td>Lat: ${origin.latitude.toFixed(2)}°, Lon: ${origin.longitude.toFixed(2)}°</td>
                </tr>
                <tr>
                    <th>Profundidad:</th>
                    <td>${origin.depth.toFixed(1)} km</td>
                </tr>
                <tr>
                    <th>Descripción:</th>
                    <td>${quake.description}</td>
                </tr>
            </table>
        </div>
    `;
}