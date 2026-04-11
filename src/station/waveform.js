import * as sp from "../seisplot/seisplotjs.mjs";

let rtDisp = null;

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

    
    config.doMarkers = true; 
    config.markerTextOffset = 0.85;
    config.markerFlagpoleBase = "bottom";
    

    // También es recomendable desactivar la interactividad si no quieres zoom
    config.isInteractive = false; 
    config.wheelZoom = false;

    // Configuración de 10 minutos de histórico visible
    const duration = sp.luxon.Duration.fromISO("PT10M");

    rtDisp = sp.animatedseismograph.createRealtimeDisplay({
        duration,
        minHeight: 300,
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
    }
}