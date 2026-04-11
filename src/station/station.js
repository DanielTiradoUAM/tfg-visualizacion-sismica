/**
 * station.js — Módulo principal de la vista de estación.
 *
 * Flujo de relleno del panel "Detalles":
 *  - Inmediato:      red, estación, canal → desde URL params
 *  - Async (FDSN):   lat, lon, elevación, sensor, ubicación → queryStations()
 *  - 1er paquete:    sps, encoding, tamaño rec., continuación → header MiniSEED
 *  - Cada paquete:   latencia, paquetes, última muestra → calculado en vivo
 */

import * as sp from "../seisplot/seisplotjs.mjs";
import { getDataLink } from "../quakes/data/datalinkService.js";
import { queryStations } from "../quakes/data/fdsnQueries.js";
import { initWaveform, pushPacketToWaveform } from './waveform.js';
import { initSpectrogram, pushPacketToSpectrogram } from './spectrogram.js';

/* ══════════════════════════════════════════
   1. PARÁMETROS DE URL
══════════════════════════════════════════ */
const params  = new URLSearchParams(window.location.search);
const NETWORK = params.get("net") || "OD";
const STATION = params.get("sta") || "UAM";
const CHANNEL = params.get("cha") || "HHZ";

/* ══════════════════════════════════════════
   2. ESTADO
══════════════════════════════════════════ */
let packetCount       = 0;
let firstPacketDone   = false;  // Guard: detalles técnicos solo se leen una vez
let firstPacketLogged = false;  // Guard: console.dir solo la primera vez
let STATION_REGISTRY  = [];

/* ══════════════════════════════════════════
   3. RELOJ UTC
══════════════════════════════════════════ */
const clockEl = document.getElementById("utc-clock");
function tickClock() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    clockEl.textContent =
        `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}
setInterval(tickClock, 1000);
tickClock();

/* ══════════════════════════════════════════
   4. ESTADO DE CONEXIÓN
══════════════════════════════════════════ */
const statusEl   = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");

function setStatus(state) {
    statusEl.classList.remove('is-live', 'is-error');
    if (state === 'live') {
        statusEl.classList.add('is-live');
        statusText.textContent = 'LIVE';
    } else if (state === 'error') {
        statusEl.classList.add('is-error');
        statusText.textContent = 'ERROR';
    } else {
        statusText.textContent = 'CONNECTING';
    }
}

/* ══════════════════════════════════════════
   5. HELPER: escribir en el panel de detalles
   Centraliza el acceso al DOM para evitar
   repetir getElementById en cada función.
══════════════════════════════════════════ */
function setDetail(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
}

/* ══════════════════════════════════════════
   6. DETALLES ESTÁTICOS (URL params)
   Se ejecuta inmediatamente, sin esperar nada.
══════════════════════════════════════════ */
function fillStaticDetails() {
    document.getElementById("title").textContent = `${NETWORK}.${STATION} — ${CHANNEL}`;
    setDetail('d-net', NETWORK);
    setDetail('d-sta', STATION);
    setDetail('d-cha', CHANNEL);

    // Marcar el canal activo en los botones por defecto del HTML
    document.querySelectorAll('.ch-btn').forEach(btn => {
        btn.classList.toggle('ch-btn--active', btn.dataset.channel === CHANNEL);
    });
}

/* ══════════════════════════════════════════
   7. LISTA DE ESTACIONES + DETALLES FDSN

   queryStations() de fdsnQueries.js devuelve un array de objetos Network.
   Cada Network tiene:
     network.networkCode  → "OD"
     network.stations[]   → array de Station, cada uno con:
       station.stationCode      → "ALHM0"
       station.latitude         → número
       station.longitude        → número
       station.elevation        → número
       station.channels[]       → array de Channel, cada uno con:
         channel.channelCode    → "HHZ"
         channel.locationCode   → "" | "00" | etc.
         channel.sensor         → objeto con .description
         channel.sampleRate     → número (también lo tenemos en MiniSEED)

   Hacemos UNA sola llamada a queryStations() y la reutilizamos para:
     a) Poblar la lista de estaciones del panel izquierdo.
     b) Rellenar los datos geográficos/sensor de la estación activa.
     c) Actualizar los botones de canal con los canales reales.
══════════════════════════════════════════ */
async function loadFDSNData() {
    // Mostrar estado de carga en la lista
    const listEl = document.getElementById('station-list');
    listEl.innerHTML = '<div class="station-list__empty">Cargando estaciones…</div>';

    let networks;
    try {
        networks = await queryStations();
    } catch (err) {
        console.warn("[FDSN] Error al consultar estaciones:", err.message);
        listEl.innerHTML = '<div class="station-list__empty">Error al cargar estaciones.</div>';
        return;
    }

    if (!networks?.length) {
        listEl.innerHTML = '<div class="station-list__empty">No se encontraron estaciones.</div>';
        return;
    }

    // ── a) Construir STATION_REGISTRY ──
    // Aplanamos networks → stations en una lista plana de { net, sta, status }
    STATION_REGISTRY = [];
    for (const network of networks) {
        const netCode = network.networkCode?.trim();
        if (!netCode) continue;
        for (const station of (network.stations ?? [])) {
            const staCode = station.stationCode?.trim();
            if (!staCode) continue;
            STATION_REGISTRY.push({ net: netCode, sta: staCode, status: 'online' });
        }
    }
    console.log(`[FDSN] ${STATION_REGISTRY.length} estaciones cargadas.`);
    renderStationList();

    // ── b) Detalles geográficos de la estación activa ──
    // Buscamos el objeto Network que coincide con NETWORK
    const activeNetwork = networks.find(n => n.networkCode?.trim() === NETWORK);
    if (!activeNetwork) return;

    // Dentro de esa red, buscamos la estación que coincide con STATION
    const activeStation = activeNetwork.stations?.find(
        s => s.stationCode?.trim() === STATION
    );
    if (!activeStation) return;

    // Rellenar lat / lon / elevación
    setDetail('d-lat', `${activeStation.latitude.toFixed(4)}°`);
    setDetail('d-lon', `${activeStation.longitude.toFixed(4)}°`);
    setDetail('d-ele', `${activeStation.elevation.toFixed(1)} m`);

    // ── c) Detalles del canal activo ──
    // Buscamos el canal que coincide con CHANNEL (insensible a mayúsculas)
    const activeChannel = activeStation.channels?.find(
        ch => ch.channelCode?.trim().toUpperCase() === CHANNEL.toUpperCase()
    );

    if (activeChannel) {
        // locationCode suele ser "" (vacío) → mostramos "—" para que no quede en blanco
        const loc = activeChannel.locationCode?.trim();
        setDetail('d-loc', loc || '—');

        // Nombre del instrumento (ej: "Raspberry Shake 1D", "Güralp CMG-3T")
        const sensor = activeChannel.sensor?.description?.trim();
        setDetail('d-sensor', sensor || '—');

        // sampleRate desde FDSN (lo sobreescribirá el MiniSEED, pero por si acaso)
        if (activeChannel.sampleRate) {
            setDetail('d-sps', `${activeChannel.sampleRate} sps`);
        }
    }

    // Actualizar los botones de canal con los disponibles realmente en esta estación
    if (activeStation.channels?.length) {
        updateChannelButtons(activeStation.channels);
    }
}

/**
 * Reconstruye #channel-grid con los canales reales devueltos por FDSN.
 * Elimina duplicados (puede haber múltiples locationCodes para un mismo chanCode).
 */
function updateChannelButtons(channels) {
    const grid = document.getElementById("channel-grid");
    if (!grid) return;

    const seen  = new Set();
    const codes = [];
    for (const ch of channels) {
        const code = ch.channelCode?.trim().toUpperCase();
        if (code && !seen.has(code)) {
            seen.add(code);
            codes.push(code);
        }
    }
    if (!codes.length) return;

    grid.innerHTML = '';
    for (const code of codes) {
        const btn = document.createElement('button');
        btn.className = 'ch-btn' + (code === CHANNEL ? ' ch-btn--active' : '');
        btn.dataset.channel = code;
        btn.textContent = code;
        btn.addEventListener('click', () => switchChannel(code));
        grid.appendChild(btn);
    }
}

/* ══════════════════════════════════════════
   8. DETALLES TÉCNICOS (primer paquete MiniSEED)

   Del log de consola, los campos relevantes del header son:
     header.sampleRate       → 100        (muestras/s)
     header.encoding         → 1          (1=INT16, 10=Steim1, 11=Steim2)
     header.recordSize       → 512        (bytes del registro MiniSEED)
     header.continuationCode → 32         (32=espacio=registro normal)
     header.locCode          → ""         (código de ubicación)
     header.numSamples       → 208        (muestras en este paquete)
     header.startTime.ts     → timestamp ms UTC del inicio
     header.endTime.ts       → timestamp ms UTC del final

   IMPORTANTE: esta función tiene el guard `firstPacketDone` para ejecutarse
   solo una vez. El bug anterior era que `firstPacketDone` se podía activar
   antes de que los elementos del DOM existieran, porque `main()` llama a
   `initWaveform` antes de garantizar que el DOM esté pintado. Ahora usamos
   `setDetail()` que ya comprueba si el elemento existe.
══════════════════════════════════════════ */

// Tabla de encodings MiniSEED → nombre legible
const ENCODING_NAMES = {
    0:  "ASCII",
    1:  "INT 16-bit",
    3:  "INT 32-bit",
    4:  "IEEE Float 32",
    5:  "IEEE Double 64",
    10: "Steim-1",
    11: "Steim-2",
    19: "Steim-3",
};

function fillPacketDetails(header) {
    if (firstPacketDone) return;
    firstPacketDone = true;

    // sampleRate: también lo da FDSN, pero aquí lo confirmamos desde la señal real
    setDetail('d-sps', `${header.sampleRate} sps`);

    // Encoding: número → nombre legible (tabla arriba)
    setDetail('d-enc',
        ENCODING_NAMES[header.encoding] ?? `Desconocido (${header.encoding})`
    );

    // Tamaño del registro MiniSEED en bytes
    setDetail('d-recsize', `${header.recordSize} B`);

    // Código de continuación:
    //   32 (espacio ASCII) = registro normal
    //   otros valores indican continuaciones de registros largos
    const contDesc = header.continuationCode === 32
        ? 'Normal'
        : `${header.continuationCode}`;
    setDetail('d-contcode', contDesc);

    // locationCode desde el header (confirma lo que devolvió FDSN)
    // Solo lo sobreescribimos si FDSN no lo había rellenado
    const locEl = document.getElementById('d-loc');
    if (locEl && locEl.textContent === '—') {
        setDetail('d-loc', header.locCode?.trim() || '—');
    }
}

/* ══════════════════════════════════════════
   9. TELEMETRÍA EN VIVO (cada paquete)

   - startTime.ts → timestamp en ms del inicio del paquete
   - endTime.ts   → timestamp en ms del final del paquete
     (el log muestra que endTime existe en el header como _DateTime con .ts)
   - Latencia = Date.now() - endTime.ts  (diferencia entre "ahora" y el fin del paquete)
══════════════════════════════════════════ */
function updateLiveTelemetry(header) {
    packetCount++;
    setDetail('d-packets', packetCount);

    // Preferimos endTime si está disponible (evitamos recalcular)
    // Fallback: calculamos endTime desde startTime + duración
    let endMs;
    if (header.endTime?.ts) {
        endMs = header.endTime.ts;
    } else if (header.endTime?.toMillis) {
        endMs = header.endTime.toMillis();
    } else {
        // Fallback: startTime + (numSamples / sampleRate) * 1000
        const startMs = header.startTime?.ts ?? header.startTime?.toMillis?.() ?? 0;
        endMs = startMs + (header.numSamples / header.sampleRate) * 1000;
    }

    // Latencia en segundos (redondeada a 1 decimal)
    const latencyS = (Date.now() - endMs) / 1000;
    const latEl    = document.getElementById("d-latency");
    if (latEl) {
        latEl.textContent = `${latencyS.toFixed(1)} s`;
        // Color semafórico: verde < 3s / amarillo < 10s / rojo >= 10s
        latEl.style.color =
            latencyS < 3  ? 'var(--text-live)'   :
            latencyS < 10 ? 'var(--text-warn)'   :
                            'var(--text-danger)';
    }

    // Última muestra: hora UTC del fin del paquete
    const d   = new Date(endMs);
    const pad = n => n.toString().padStart(2, '0');
    setDetail('d-last',
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
    );
}

/* ══════════════════════════════════════════
   10. HANDLER CENTRAL DE PAQUETES
══════════════════════════════════════════ */
function handleIncomingPacket(packet) {
    if (!firstPacketLogged) {
        console.log("📦 [DEBUG] Primer paquete DataLink:");
        console.dir(packet);
        firstPacketLogged = true;
    }

    setStatus('live');

    const header = packet._miniseed?.header;
    if (header) {
        fillPacketDetails(header);
        updateLiveTelemetry(header);
    }

    pushPacketToWaveform(packet);
    pushPacketToSpectrogram(packet);
}

/* ══════════════════════════════════════════
   11. LISTA DE ESTACIONES — render y búsqueda
══════════════════════════════════════════ */
function renderStationList(filter = '') {
    const listEl = document.getElementById('station-list');
    const query  = filter.toLowerCase().trim();

    // Agrupar por red, aplicando el filtro de búsqueda
    const grouped = {};
    for (const s of STATION_REGISTRY) {
        const fullId = `${s.net}.${s.sta}`;
        if (query && !fullId.toLowerCase().includes(query)) continue;
        if (!grouped[s.net]) grouped[s.net] = [];
        grouped[s.net].push(s);
    }

    // Badge: X online / Y total
    const onlineCount = STATION_REGISTRY.filter(s => s.status === 'online').length;
    const countEl = document.getElementById('station-count');
    if (countEl) countEl.textContent = `${onlineCount}/${STATION_REGISTRY.length}`;

    listEl.innerHTML = '';

    if (!Object.keys(grouped).length) {
        listEl.innerHTML = '<div class="station-list__empty">Sin resultados.</div>';
        return;
    }

    for (const [net, stations] of Object.entries(grouped)) {
        const groupLabel = document.createElement('div');
        groupLabel.className = 'station-group-label';
        groupLabel.textContent = `Red ${net}`;
        listEl.appendChild(groupLabel);

        for (const s of stations) {
            const item = document.createElement('div');
            item.className = 'station-item';
            if (s.net === NETWORK && s.sta === STATION) item.classList.add('is-active');

            const dot  = document.createElement('span');
            dot.className = `stn-dot stn-dot--${s.status}`;

            const name = document.createElement('span');
            name.textContent = `${s.net}.${s.sta}`;

            item.appendChild(dot);
            item.appendChild(name);
            item.addEventListener('click', () => {
                const url = new URL(window.location.href);
                url.searchParams.set('net', s.net);
                url.searchParams.set('sta', s.sta);
                url.searchParams.set('cha', CHANNEL);
                window.location.href = url.toString();
            });
            listEl.appendChild(item);
        }
    }
}

document.getElementById('station-search')?.addEventListener('input', e => {
    renderStationList(e.target.value);
});

/* ══════════════════════════════════════════
   12. TABS: Sismograma ↔ Helicorder
══════════════════════════════════════════ */
document.getElementById('tab-waveform')?.addEventListener('click', () => {
    document.getElementById('tab-waveform').classList.add('tab-btn--active');
    document.getElementById('tab-helicorder').classList.remove('tab-btn--active');
    document.getElementById('view-waveform').classList.remove('charts-view--hidden');
    document.getElementById('view-helicorder').classList.add('charts-view--hidden');
});
document.getElementById('tab-helicorder')?.addEventListener('click', () => {
    document.getElementById('tab-helicorder').classList.add('tab-btn--active');
    document.getElementById('tab-waveform').classList.remove('tab-btn--active');
    document.getElementById('view-helicorder').classList.remove('charts-view--hidden');
    document.getElementById('view-waveform').classList.add('charts-view--hidden');
});

/* ══════════════════════════════════════════
   13. CAMBIO DE CANAL
══════════════════════════════════════════ */
function switchChannel(channelCode) {
    if (channelCode === CHANNEL) return;
    const url = new URL(window.location.href);
    url.searchParams.set('net', NETWORK);
    url.searchParams.set('sta', STATION);
    url.searchParams.set('cha', channelCode);
    window.location.href = url.toString();
}

// Botones por defecto del HTML (se reemplazan cuando FDSN responde)
document.querySelectorAll('.ch-btn').forEach(btn => {
    btn.addEventListener('click', () => switchChannel(btn.dataset.channel));
});

/* ══════════════════════════════════════════
   14. FILTROS
   Emiten eventos custom en window para que waveform.js
   y spectrogram.js los escuchen cuando se implementen.

   Para conectar un filtro en waveform.js:
     window.addEventListener('seisview:filter:waveform', e => {
         const { fmin, fmax } = e.detail; // null = sin filtro
         // aplicar / quitar filtro...
     });
══════════════════════════════════════════ */
function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    console.log(`[Filtro] ${name}`, detail);
}

document.getElementById('wave-filter-apply')?.addEventListener('click', () => {
    const fmin = parseFloat(document.getElementById('wave-fmin').value);
    const fmax = parseFloat(document.getElementById('wave-fmax').value);
    if (isNaN(fmin) || isNaN(fmax) || fmin >= fmax) {
        console.warn('[Filtro] Bandpass no válido:', fmin, fmax);
        return;
    }
    emit('seisview:filter:waveform', { fmin, fmax });
});

document.getElementById('wave-filter-clear')?.addEventListener('click', () => {
    document.getElementById('wave-fmin').value = '';
    document.getElementById('wave-fmax').value = '';
    emit('seisview:filter:waveform', { fmin: null, fmax: null });
});

document.getElementById('spec-filter-apply')?.addEventListener('click', () => {
    const fmin = parseFloat(document.getElementById('spec-fmin').value);
    const fmax = parseFloat(document.getElementById('spec-fmax').value);
    if (isNaN(fmin) || isNaN(fmax) || fmin >= fmax) {
        console.warn('[Filtro] Rango espectrograma no válido:', fmin, fmax);
        return;
    }
    emit('seisview:filter:spectrogram', { fmin, fmax });
});

document.getElementById('fft-apply')?.addEventListener('click', () => {
    const windowSize = parseInt(document.getElementById('fft-window').value, 10);
    if (!windowSize || windowSize < 64) return;
    emit('seisview:filter:fft', { windowSize });
});

document.getElementById('fft-colormap')?.addEventListener('change', e => {
    emit('seisview:filter:colormap', { colormap: e.target.value });
});

/* ══════════════════════════════════════════
   15. PATRÓN DATALINK
   Del log: "FDSN:OD_ALHM0__H_H_Z/MSEED"
   Formato: FDSN:NET_STA__C1_C2_C3/MSEED
   donde C1_C2_C3 son las tres letras del canal separadas por '_'
══════════════════════════════════════════ */
function buildPattern() {
    const [c1, c2, c3] = CHANNEL.split('');
    return `FDSN:${NETWORK}_${STATION}__${c1}_${c2}_${c3}/MSEED`;
}

/* ══════════════════════════════════════════
   16. MAIN
══════════════════════════════════════════ */
async function main() {
    // Inmediato: lo que sabemos desde la URL
    fillStaticDetails();
    setStatus('connecting');

    // Async: datos FDSN (lista + detalles). No bloquea el stream.
    loadFDSNData().catch(err => {
        console.warn("[FDSN] Fallo en carga inicial:", err.message);
    });

    try {
        initWaveform("waveform");
        await initSpectrogram();

        console.log("🔌 Conectando a DataLink...");
        const dl = getDataLink(handleIncomingPacket);
        await dl.connect();

        const pattern = buildPattern();
        await dl.awaitDLCommand("MATCH", pattern);

        // Cargar los últimos 10 minutos de histórico
        const backTime = sp.luxon.DateTime.utc().minus(
            sp.luxon.Duration.fromISO("PT10M")
        );
        await dl.positionAfter(backTime);

        console.log("▶ Streaming:", pattern);
        await dl.stream();

        window.addEventListener("beforeunload", () => {
            if (dl?.isConnected()) dl.close();
        });

    } catch (error) {
        setStatus('error');
        console.error("💥 Error crítico:", error);
    }
}

main();