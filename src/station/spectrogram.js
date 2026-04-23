import { Spectrogram } from 'https://esm.sh/spectrogram-js';
import RingBuffer from './RingBuffer.js';
import * as sp from "../seisplot/seisplotjs.mjs";

/* ══════════════════════════════════════════
   ESTADO INTERNO
   Todas las variables de configuración son
   mutables para que los filtros puedan
   modificarlas en tiempo real.
══════════════════════════════════════════ */
let spectrogram  = null;
let ring         = null;
let lastTimestamp = null;

// Parámetros ajustables por el usuario (valores por defecto)
let cfg = {
    sampleRate:    100,
    fftWindowSize: 256,
    freqRange:     [0, 50],
    colormap:      'inferno',
    minDb:         60,
    maxDb:         120,
    duration:      600,   // segundos de histórico visible
};


/* ══════════════════════════════════════════
   INIT — crea el objeto Spectrogram y el eje.
   Es una función separada porque la llamamos
   también al re-inicializar cuando cambia
   fftWindowSize o minDb/maxDb.
══════════════════════════════════════════ */
async function buildSpectrogram() {
    spectrogram = new Spectrogram({
        sampleRate:  cfg.sampleRate,
        windowSize:  cfg.fftWindowSize,
        overlap:     Math.floor(cfg.fftWindowSize * 0.9),
        windowType:  'hann',
        minDb:       cfg.minDb,
        maxDb:       cfg.maxDb,
    });

    // Personalización del eje de tiempo (igual que antes)
    const axisRenderer = spectrogram.renderer.axisRenderer;
    const originalDraw = axisRenderer.draw;

    axisRenderer.draw = function(ctx, width, height, timeRange, freqRange, margins) {
        const [tStart, tEnd] = timeRange;
        const { left, bottom, top, right } = margins;
        const plotW = width - left - right;
        const plotH = height - bottom - top;
        const bottomY = top + plotH;

        const originalFillText = ctx.fillText;
        const originalStroke   = ctx.stroke;
        const originalLineTo   = ctx.lineTo;

        // Filtramos textos y ticks automáticos de la librería
        ctx.fillText = function(text) {
            if (/:/.test(text) || /^\d+s$/.test(text)) return;
            ctx.fillStyle = '#FFFFFF';
            originalFillText.apply(this, arguments);
        };
        ctx.lineTo = function(x, y) {
            const isTimeTick = (y > bottomY && y <= bottomY + 6);
            if (isTimeTick) return;
            originalLineTo.apply(this, arguments);
        };
        ctx.stroke = function() {
            ctx.strokeStyle = '#FFFFFF';
            originalStroke.apply(this, arguments);
        };

        originalDraw.call(this, ctx, width, height, timeRange, freqRange, margins);

        // Restauramos y dibujamos nuestros propios ticks por minuto
        ctx.lineTo   = originalLineTo;
        ctx.fillText = originalFillText;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle    = '#FFFFFF';
        ctx.strokeStyle  = '#FFFFFF';

        const startTimeStamp = this.model.startTime;
        const firstMinuteTs  = Math.ceil((startTimeStamp + tStart * 1000) / 60000) * 60000;
        const duration       = tEnd - tStart;

        for (let ts = firstMinuteTs; ts <= startTimeStamp + tEnd * 1000; ts += 60000) {
            const timeRel = (ts - startTimeStamp) / 1000;
            const x = left + ((timeRel - tStart) / duration) * plotW;
            if (x < left || x > left + plotW) continue;

            ctx.beginPath();
            ctx.moveTo(x, bottomY);
            ctx.lineTo(x, bottomY + 5);
            ctx.stroke();

            const date  = new Date(ts);
            const label = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
            ctx.fillText(label, x, bottomY + 8);
        }

        ctx.stroke = originalStroke;
    };

    spectrogram.setColormap(cfg.colormap); 
    await spectrogram.init();

    // Si ya había datos en el ring, los re-inyectamos para que no se pierdan
    if (ring) spectrogram.setData(ring.toArray());
}


/* ══════════════════════════════════════════
   BUCLE DE RENDER
   Se ejecuta a ~60 FPS.
   Lee cfg.freqRange en cada frame, así que
   cambiar esa variable tiene efecto inmediato.
══════════════════════════════════════════ */
function startRenderLoop() {
    const canvas = document.getElementById('spectrogram-canvas');

    const draw = () => {
        if (!lastTimestamp || !spectrogram) {
            requestAnimationFrame(draw);
            return;
        }

        const end   = Math.max(0.001, spectrogram.getDuration());
        const start = end - cfg.duration;

        spectrogram.render({
            canvas,
            width:     canvas.clientWidth,
            height:    canvas.clientHeight,
            timeRange: [start, end],
            freqRange: cfg.freqRange,   // ← se lee en cada frame
        });

        requestAnimationFrame(draw);
    };

    draw();
}


/* ══════════════════════════════════════════
   EXPORT: initSpectrogram
══════════════════════════════════════════ */
export const initSpectrogram = async () => {
    const canvas = document.getElementById('spectrogram-canvas');
    if (!canvas) {
        console.error("No se encontró el canvas #spectrogram-canvas");
        return;
    }

    ring = new RingBuffer(cfg.duration * cfg.sampleRate);
    await buildSpectrogram();
    startRenderLoop();

    // Escuchamos los eventos de filtro que emite station.js
    _registerFilterListeners();

    console.log("🎨 Espectrograma inicializado y listo.");
};


/* ══════════════════════════════════════════
   EXPORT: pushPacketToSpectrogram
   Igual que antes: descomprime, asigna timestamps
   y alimenta el ring buffer.
══════════════════════════════════════════ */
export function pushPacketToSpectrogram(packet) {
    if (!spectrogram || !ring) return;

    try {
        const record = packet._miniseed;
        if (!record || !record.header) return;

        const { sampleRate: sRate, numSamples, startTime, encoding, littleEndian } = record.header;

        let dataArray = sp.seedcodec.decompress(encoding, record.data, numSamples, littleEndian);

        // Compensación de zona horaria para mostrar UTC correcto
        const timezoneOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
        const startTsUTC  = startTime.toMillis ? startTime.toMillis() : startTime.ts;
        const fakeStartTs = startTsUTC + timezoneOffsetMs;

        const dt = 1000 / sRate;
        const dataPoints = new Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            dataPoints[i] = [fakeStartTs + i * dt, dataArray[i]];
        }

        ring.pushMany(dataPoints);
        spectrogram.setData(ring.toArray());

        lastTimestamp = fakeStartTs + dataArray.length * dt;

    } catch (e) {
        console.error("Error en pushPacketToSpectrogram:", e.message);
    }
}


/* ══════════════════════════════════════════
   FILTROS — listeners de eventos custom

   station.js emite eventos en window con
   new CustomEvent('seisview:filter:...', { detail: {...} })
   y aquí los recibimos.

   · freqRange y colormap → efecto inmediato (siguiente frame).
   · fftWindowSize y dB   → requieren recrear el objeto Spectrogram
     pero conservamos el ring buffer, así que los datos no se pierden.
══════════════════════════════════════════ */
function _registerFilterListeners() {

    // Rango de frecuencias: [fmin, fmax] Hz
    // El render loop ya lee cfg.freqRange en cada frame → inmediato.
    window.addEventListener('seisview:filter:spectrogram:freq', e => {
        const { fmin, fmax } = e.detail;
        cfg.freqRange = [fmin, fmax];
        console.log(`[Espectrograma] Rango Hz → ${fmin}–${fmax}`);
    });

    // Rango de dB: controla la sensibilidad del mapa de color.
    // minDb bajo = más sensible a señales débiles.
    // Requiere recrear el Spectrogram (parámetro de constructor).
    window.addEventListener('seisview:filter:spectrogram:db', async e => {
        const { minDb, maxDb } = e.detail;
        cfg.minDb = minDb;
        cfg.maxDb = maxDb;
        console.log(`[Espectrograma] dB → ${minDb}–${maxDb}`);
        await buildSpectrogram();  // recrea conservando ring
    });

    // Ventana FFT: más grande = mejor resolución en frecuencia, peor en tiempo.
    // Requiere recrear el Spectrogram.
    window.addEventListener('seisview:filter:spectrogram:fft', async e => {
        const { windowSize } = e.detail;
        cfg.fftWindowSize = windowSize;
        console.log(`[Espectrograma] FFT window → ${windowSize}`);
        await buildSpectrogram();  // recrea conservando ring
    });

    // Colormap: viridis, inferno, magma, plasma…
    // setColormap() existe en la API → inmediato.
    window.addEventListener('seisview:filter:spectrogram:colormap', e => {
        cfg.colormap = e.detail.colormap;
        spectrogram?.setColormap(cfg.colormap);
        console.log(`[Espectrograma] Colormap → ${cfg.colormap}`);
    });
}