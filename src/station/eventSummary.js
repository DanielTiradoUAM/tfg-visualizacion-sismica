import { Spectrogram } from "https://esm.sh/spectrogram-js";
import * as sp from "../seisplot/seisplotjs.mjs";
import {
  addPhaseMarkers,
  applyAbsoluteTime,
  createSeismographConfig,
  removeInstrumentResponseIfPossible,
} from "../quakes/seismograms/loadSeismogram.js";

function buildMessage(type, text) {
  const node = document.createElement("div");
  node.className = `event-summary__message event-summary__message--${type}`;
  node.textContent = text;
  return node;
}

async function buildChannelDisplayData(quake, station, channelCode, packets) {
  if (!packets?.length) return null;

  const merged = sp.miniseed.merge(packets);
  let seis = new sp.seismogram.Seismogram(merged.segments);
  const channel = station.channels.find(c => c.channelCode === channelCode);

  seis = await removeInstrumentResponseIfPossible(seis, channel);

  const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);
  applyAbsoluteTime(sdd, quake);
  await addPhaseMarkers([sdd], quake, station);

  return sdd;
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
}

async function renderSpectrogram(section, sdd) {
  const host = document.createElement("div");
  host.className = "event-summary__plot-host event-summary__plot-host--spectrogram";
  const canvas = document.createElement("canvas");
  canvas.className = "event-summary__spectrogram";
  host.appendChild(canvas);
  section.appendChild(host);

  const seismogram = sdd.seismogram;
  if (!seismogram?.sampleRate || !seismogram?.y?.length) {
    host.appendChild(buildMessage("warning", "Sin muestras suficientes para el espectrograma."));
    return;
  }

  const startMillis = sdd.timeRange.start.toMillis();
  const dt = 1000 / seismogram.sampleRate;
  const points = Array.from(seismogram.y, (value, index) => [startMillis + index * dt, value]);

  const spectrogram = new Spectrogram({
    sampleRate: seismogram.sampleRate,
    windowSize: 256,
    overlap: 230,
    windowType: "hann",
    minDb: 60,
    maxDb: 120,
  });

  spectrogram.setColormap("inferno");
  await spectrogram.init();
  spectrogram.setData(points);

  await new Promise(resolve => requestAnimationFrame(resolve));

  const width = Math.max(canvas.clientWidth, 700);
  const height = Math.max(canvas.clientHeight, 240);
  const duration = points.length / seismogram.sampleRate;

  spectrogram.render({
    canvas,
    width,
    height,
    timeRange: [0, duration],
    freqRange: [0, Math.min(50, seismogram.sampleRate / 2)],
  });
}

function renderSpectra(section, sdd) {
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
  spectra.setAttribute("logfreq", "true");

  host.appendChild(spectra);
  spectra.draw();
}

export async function renderEventSummary({
  container,
  quake,
  station,
  channelCode,
  packetsByChannel,
}) {
  container.innerHTML = "";

  const packets = packetsByChannel[channelCode];
  if (!packets?.length) {
    container.appendChild(buildMessage("warning", `No hay datos disponibles para ${channelCode}.`));
    return;
  }

  const sdd = await buildChannelDisplayData(quake, station, channelCode, packets);
  if (!sdd) {
    container.appendChild(buildMessage("warning", `No se pudo construir el resumen para ${channelCode}.`));
    return;
  }

  const waveformSection = createSection("SISMOGRAMA", "event-summary__section--waveform");
  const spectrogramSection = createSection("ESPECTROGRAMA", "event-summary__section--spectrogram");
  const spectraSection = createSection("ESPECTRO DE AMPLITUD", "event-summary__section--spectra");

  container.append(waveformSection, spectrogramSection, spectraSection);

  renderWaveform(waveformSection, sdd);
  await renderSpectrogram(spectrogramSection, sdd);
  renderSpectra(spectraSection, sdd);
}
