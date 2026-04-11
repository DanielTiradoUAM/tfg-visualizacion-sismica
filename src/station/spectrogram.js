import { Spectrogram } from 'https://esm.sh/spectrogram-js';
import RingBuffer from './RingBuffer.js';
import * as sp from "../seisplot/seisplotjs.mjs";

// Configuraciones constantes
let spectrogram = null;
let ring = null;
const spectrogramDuration = 600;
const spectrogramFreqRange = [0, 50]; 
const sampleRate = 100;
const fftWindowSize = 256;
let lastTimestamp = null;


export const initSpectrogram = async () => {
    const canvas = document.getElementById('spectrogram-canvas');
    if (!canvas) {
        console.error("No se encontró el canvas #spectrogram-canvas");
        return;
    }

    spectrogram = new Spectrogram({
        sampleRate,
        windowSize: fftWindowSize,
        overlap: Math.floor(fftWindowSize * 0.9),
        windowType: 'hann',
        minDb: 60,
        maxDb: 120
    });

    const axisRenderer = spectrogram.renderer.axisRenderer;
    const originalDraw = axisRenderer.draw;

    axisRenderer.draw = function(ctx, width, height, timeRange, freqRange, margins) {
        const [tStart, tEnd] = timeRange;
        const { left, bottom, top, right } = margins;
        const plotW = width - left - right;
        const plotH = height - bottom - top;
        const bottomY = top + plotH;

        const originalFillText = ctx.fillText;
        const originalStroke = ctx.stroke;
        const originalLineTo = ctx.lineTo;

        // 1. Filtramos los TEXTOS automáticos
        ctx.fillText = function(text) {
            if (/:/.test(text) || /^\d+s$/.test(text)) return; 
            ctx.fillStyle = '#FFFFFF';
            originalFillText.apply(this, arguments);
        };

        // 2. Filtramos las RAYITAS (Ticks) automáticas
        // Las rayitas de la librería miden 5px y empiezan en bottomY
        ctx.lineTo = function(x, y) {
            const isTimeTick = (y > bottomY && y <= bottomY + 6);
            if (isTimeTick) return; // Si es una línea hacia abajo del eje X, la ignoramos
            originalLineTo.apply(this, arguments);
        };

        // 3. Forzamos el STROKE en blanco
        ctx.stroke = function() {
            ctx.strokeStyle = '#FFFFFF';
            originalStroke.apply(this, arguments);
        };

        // 4. Dibujamos la base (ahora limpia de ticks de tiempo)
        originalDraw.call(this, ctx, width, height, timeRange, freqRange, margins);

        // --- RESTAURAMOS PARA DIBUJAR LO NUESTRO ---
        ctx.lineTo = originalLineTo;
        ctx.fillText = originalFillText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#FFFFFF';

        // 5. Dibujamos NUESTROS ticks cada minuto
        const duration = tEnd - tStart;
        const startTimeStamp = this.model.startTime; 
        const firstMinuteTs = Math.ceil((startTimeStamp + tStart * 1000) / 60000) * 60000;
        
        for (let ts = firstMinuteTs; ts <= startTimeStamp + tEnd * 1000; ts += 60000) {
            const timeRel = (ts - startTimeStamp) / 1000;
            const x = left + ((timeRel - tStart) / duration) * plotW;

            if (x < left || x > left + plotW) continue;

            // Dibujamos nuestra marca limpia
            ctx.beginPath();
            ctx.moveTo(x, bottomY);
            ctx.lineTo(x, bottomY + 5);
            ctx.stroke();

            const date = new Date(ts);
            const label = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
            ctx.fillText(label, x, bottomY + 8);
        }

        // Limpieza final
        ctx.stroke = originalStroke;
    };


    spectrogram.setColormap('inferno');
    await spectrogram.init();

    // 4. Inicialización del buffer de memoria (10 segundos de capacidad)
    ring = new RingBuffer(spectrogramDuration * sampleRate);

    /**
     * Bucle de renderizado visual.
     * Se ejecuta a ~60 FPS para redibujar el canvas con lo que haya en el motor.
     */
    
    const draw = () => {
        // Si no hay datos todavía, esperamos
        if (!lastTimestamp) {
            requestAnimationFrame(draw);
            return;
        }
    
        const duration = spectrogram.getDuration();
        const end = Math.max(0.001, duration);
        const start = end - spectrogramDuration;
        
    
        spectrogram.render({
            canvas: document.getElementById('spectrogram-canvas'),
            width: canvas.clientWidth, // Usa el ancho real del elemento
            height: canvas.clientHeight,
            timeRange: [start, end],
            freqRange: spectrogramFreqRange,
        });
    
        requestAnimationFrame(draw);
    };

    // Iniciamos el bucle de dibujo (estará "esperando" a que pushPacket envíe datos)
    draw();

    console.log("🎨 Espectrograma inicializado y listo para recibir paquetes reales.");
};


/**
 * Procesa un paquete de DataLink y lo envía al espectrograma.
 * @param {DataLinkPacket} packet - El paquete recibido desde station.js
 */
export function pushPacketToSpectrogram(packet) {
    if (!spectrogram || !ring) return;

    try {
        const record = packet._miniseed;
        if (!record || !record.header) return;

        const { sampleRate: sRate, numSamples, startTime, encoding, littleEndian } = record.header;
        
        // 1. Descompresión
        let dataArray = sp.seedcodec.decompress(encoding, record.data, numSamples, littleEndian);


        // 2. Reconstrucción temporal

        // --- COMPENSACIÓN MANUAL PARA FORZAR UTC ---
        // Obtenemos el desfase en minutos (ej: en España GMT+1 es -60) y lo pasamos a ms
        const timezoneOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
        
        // El startTs real en UTC
        const startTsUTC = startTime.toMillis ? startTime.toMillis() : startTime.ts;
        
        // "Engañamos" al timestamp: le restamos el offset para que al usar .getHours() 
        // la librería muestre el valor que corresponde a UTC.
        const fakeStartTs = startTsUTC + timezoneOffsetMs;

        const dt = 1000 / sRate;
        const dataPoints = new Array(dataArray.length);
        
        for (let i = 0; i < dataArray.length; i++) {
            // Usamos el timestamp "falso" que compensa la zona horaria
            dataPoints[i] = [fakeStartTs + (i * dt), dataArray[i]];
        }

        ring.pushMany(dataPoints);
        spectrogram.setData(ring.toArray());

        // Guardamos el último timestamp (también compensado) para el render
        lastTimestamp = fakeStartTs + (dataArray.length * dt);

    } catch (e) {
        console.error("💥 Error en pushPacketToSpectrogram:", e.message);
    }
}