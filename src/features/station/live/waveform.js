import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";
import { applySignalFilter } from "../../../shared/seismograms/filters.js";

let rtDisp = null;
let currentSignalFilter = null;

function rebuildVisibleWaveform() {
    if (!rtDisp?.organizedDisplay || !rtDisp?.rawSeisData) return;

    const displayData = rtDisp.rawSeisData.map(sdd => {
        if (!currentSignalFilter || !sdd.seismogram) return sdd;

        const filtered = applySignalFilter(sdd.seismogram, currentSignalFilter);
        return typeof sdd.cloneWithNewSeismogram === "function"
            ? sdd.cloneWithNewSeismogram(filtered)
            : sp.seismogram.SeismogramDisplayData.fromSeismogram(filtered);
    });

    rtDisp.organizedDisplay.seisData = displayData;
    rtDisp.organizedDisplay.seisDataUpdated?.();
    rtDisp.organizedDisplay.draw?.();
}

export function initWaveform(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("❌ No se encontró el contenedor para waveform:", containerId);
        return;
    }

    console.log("📈 Inicializando Waveform (Seisplotjs)...");
    
    const config = new sp.seismographconfig.SeismographConfig();

    config.title = null;
    config.xLabel = "Tiempo (UTC)";
    config.yLabel = "Velocity (m/s)";
    config.isRelativeTime = false;

    // --- CAMBIO AQUÍ: Forzar altura mínima ---
    // Esto le dice al componente que el área de dibujo debe intentar ocupar esto
    config.minHeight = 415; 

    config.margin.bottom = 100;

    
    config.doMarkers = false; 
    config.markerTextOffset = 0.85;
    config.markerFlagpoleBase = "bottom";
    

    // Configuración de 10 minutos de histórico visible
    const duration = sp.luxon.Duration.fromISO("PT10M");


    rtDisp = sp.animatedseismograph.createRealtimeDisplay({
        duration,
        seismographConfig: config
    });

    const displayEl = rtDisp.organizedDisplay;


    // Aplicamos los estilos directamente al elemento
    displayEl.style.color = "white";
    displayEl.style.fill = "white";

    displayEl.tools = "false";

    container.appendChild(displayEl);
    displayEl.draw();
    

    // Optimización de renderizado
    rtDisp.animationScaler.minRedrawMillis =
        sp.animatedseismograph.calcOnePixelDuration(rtDisp.organizedDisplay);

    rtDisp.animationScaler.animate();
    console.log("✅ Waveform lista");
}

/**
 * Recibe el paquete completo de DataLink y lo envía al display de Seisplotjs
 */
export function pushPacketToWaveform(packet) {
    if (rtDisp && rtDisp.packetHandler) {
        rtDisp.packetHandler(packet);
        if (currentSignalFilter) rebuildVisibleWaveform();
    }
}

export function applyWaveformFilter({ lowHz, highHz }) {
    currentSignalFilter = {
        enabled: true,
        poles: 2,
        type: sp.filter.BAND_PASS,
        lowHz,
        highHz,
    };
    rebuildVisibleWaveform();
}
