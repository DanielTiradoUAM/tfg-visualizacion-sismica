import { Spectrogram } from "spectrogram-js";
import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";
import {
  createSeismographConfig,
} from "../../../shared/seismograms/seismogramRenderer.js";
import { buildChannelDisplayData } from "../../../shared/seismograms/seismogramData.js";

export const DEFAULT_EVENT_FILTERS = {
  signalFilterEnabled: true,
  lowHz: 0.5,
  highHz: 10,
  fftWindowSize: 256,
  // spectrogramFreqMin: 0,
  // spectrogramFreqMax: 25,
  // minDb: 35,
  // maxDb: 110,
  // colormap: "inferno",
  removeResponse: true,
  spectraLogFreq: true,
};

function buildMessage(type, text) {
  const node = document.createElement("div");
  node.className = `event-summary__message event-summary__message--${type}`;
  node.textContent = text;
  return node;
}

function patchSpectrogramAxis(spectrogram) {
  const axisRenderer = spectrogram?.renderer?.axisRenderer;
  if (!axisRenderer || axisRenderer.__seisviewPatched) return;

  const originalDraw = axisRenderer.draw;
  axisRenderer.draw = function(ctx, width, height, timeRange, freqRange, margins) {
    const originalFillText = ctx.fillText;
    const originalStroke = ctx.stroke;

    ctx.fillText = function() {
      ctx.fillStyle = "#FFFFFF";
      originalFillText.apply(this, arguments);
    };
    ctx.stroke = function() {
      ctx.strokeStyle = "#FFFFFF";
      originalStroke.apply(this, arguments);
    };

    originalDraw.call(this, ctx, width, height, timeRange, freqRange, margins);

    ctx.fillText = originalFillText;
    ctx.stroke = originalStroke;
  };
  axisRenderer.__seisviewPatched = true;
}

function seismogramToSpectrogramPoints(seismogram) {
  const points = [];

  for (const segment of seismogram.segments ?? []) {
    const startMillis = segment.startTime.toMillis();
    const dt = 1000 / segment.sampleRate;

    for (let index = 0; index < segment.y.length; index++) {
      points.push([startMillis + index * dt, segment.y[index]]);
    }
  }

  return points;
}

function createSection(label, className) {
  const section = document.createElement("section");
  section.className = `event-summary__section ${className}`;

  const title = document.createElement("span");
  title.className = "event-summary__label";
  title.textContent = label;
  section.appendChild(title);

  return section;
}

function renderWaveform(section, sdd) {
  const host = document.createElement("div");
  host.className = "event-summary__plot-host event-summary__plot-host--waveform";
  section.appendChild(host);

  const config = createSeismographConfig();
  config.margin.bottom = 60;
  config.isInteractive = false;
  config.wheelZoom = false;
  config.linkedAmplitude = true;

  const seismograph = new sp.seismograph.Seismograph([sdd], config);
  seismograph.style.display = "block";
  seismograph.style.width = "100%";
  seismograph.style.height = "100%";
  seismograph.style.color = "white";
  seismograph.style.fill = "white";

  host.appendChild(seismograph);
  seismograph.draw();
  seismograph.drawMarkers();

  // Inyectamos en el shadow root tras el render
    const shadow = seismograph.shadowRoot;
    if (shadow) {
        const style = document.createElement("style");
        style.textContent = `.marker .markerpath { stroke: white !important; }`;
        shadow.appendChild(style);
    }
}

async function renderSpectrogram(section, sdd, filters) {
  const host = document.createElement("div");
  host.className = "event-summary__plot-host event-summary__plot-host--spectrogram";
  const canvas = document.createElement("canvas");
  canvas.className = "event-summary__spectrogram";
  host.appendChild(canvas);
  section.appendChild(host);

  const seismogram = sdd.seismogram;
  if (!seismogram?.sampleRate || !seismogram?.segments?.length) {
    host.appendChild(buildMessage("warning", "Sin muestras suficientes para el espectrograma."));
    return;
  }

  const points = seismogramToSpectrogramPoints(seismogram);
  if (!points.length) {
    host.appendChild(buildMessage("warning", "Sin muestras suficientes para el espectrograma."));
    return;
  }

  const spectrogram = new Spectrogram({
    sampleRate: seismogram.sampleRate,
    windowSize: filters.fftWindowSize,
    overlap: Math.floor(filters.fftWindowSize * 0.9),
    windowType: "hann",
    minDb: filters.minDb,
    maxDb: filters.maxDb,
  });

  spectrogram.setColormap(filters.colormap);

  try {
    await spectrogram.init();
    patchSpectrogramAxis(spectrogram);
    spectrogram.setData(points);

    await new Promise(resolve => requestAnimationFrame(resolve));

    const width = Math.max(canvas.clientWidth || host.clientWidth, 700);
    const height = Math.max(canvas.clientHeight || host.clientHeight, 180);
    const duration = Math.max(
      0.001,
      spectrogram.getDuration?.() ?? (points.length / seismogram.sampleRate)
    );
    const nyquist = seismogram.sampleRate / 2;

    spectrogram.render({
      canvas,
      width,
      height,
      timeRange: [0, duration],
      freqRange: [
        Math.max(0, filters.spectrogramFreqMin),
        Math.min(filters.spectrogramFreqMax, nyquist),
      ],
    });
  } catch (error) {
    console.error("[EventSummary] Error renderizando espectrograma:", error);
    host.appendChild(buildMessage("warning", "No se pudo renderizar el espectrograma."));
  }
}

function renderSpectra(section, sdd, filters) {
  const host = document.createElement("div");
  host.className = "event-summary__plot-host event-summary__plot-host--spectra";
  section.appendChild(host);

  const config = new sp.seismographconfig.SeismographConfig();
  config.margin.left = 72;
  config.margin.right = 24;
  config.margin.top = 24;
  config.margin.bottom = 52;



  const fft = sp.fft.fftForward(sdd);
  const spectra = new sp.spectraplot.SpectraPlot([fft], config);
  spectra.setAttribute("logfreq", `${filters.spectraLogFreq !== false}`);

  if (spectra.shadowRoot) {
    const style = document.createElement("style");
    style.textContent = `
      /* Solo el texto del eje Y ("Amplitude") */
      text.y.label {
        fill: white !important;
      },

      text.x.label {
        fill: white !important;
      }
        
    `;
    spectra.shadowRoot.appendChild(style);
  }

  if (spectra.shadowRoot) {
    const styleX = document.createElement("style");
    styleX.textContent = `
      text.x.label,
      text.x.sublabel {
        fill: white !important;
      }
    `;
    spectra.shadowRoot.appendChild(styleX);
  }

  host.appendChild(spectra);
  spectra.draw();
}

export async function renderEventSummary({
  container,
  quake,
  station,
  channelCode,
  packetsByChannel,
  filters = DEFAULT_EVENT_FILTERS,
}) {
  container.innerHTML = "";

  const packets = packetsByChannel[channelCode];
  if (!packets?.length) {
    container.appendChild(buildMessage("warning", `No hay datos disponibles para ${channelCode}.`));
    return;
  }

  const normalizedFilters = { ...DEFAULT_EVENT_FILTERS, ...filters };
  const sdd = await buildChannelDisplayData(
    quake,
    station,
    channelCode,
    packets,
    {
      signalFilter: {
        enabled: normalizedFilters.signalFilterEnabled,
        type: sp.filter.BAND_PASS,
        lowHz: normalizedFilters.lowHz,
        highHz: normalizedFilters.highHz,
      },
      removeResponse: normalizedFilters.removeResponse,
    }
  );
  if (!sdd) {
    container.appendChild(buildMessage("warning", `No se pudo construir el resumen para ${channelCode}.`));
    return;
  }

  const waveformSection = createSection("SISMOGRAMA", "event-summary__section--waveform");
  // const spectrogramSection = createSection("ESPECTROGRAMA", "event-summary__section--spectrogram");
  const spectraSection = createSection("ESPECTRO DE AMPLITUD", "event-summary__section--spectra");

  // Si incluyo espectrograma
  // container.append(waveformSection, spectrogramSection, spectraSection);
  container.append(waveformSection, spectraSection);

  renderWaveform(waveformSection, sdd);
  // await renderSpectrogram(spectrogramSection, sdd, normalizedFilters);
  renderSpectra(spectraSection, sdd, normalizedFilters);
}
