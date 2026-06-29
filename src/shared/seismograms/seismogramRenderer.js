import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { buildProcessedSeismogramData } from "./seismogramData.js";

export function createSeismographConfig() {
  const config = new sp.seismographconfig.SeismographConfig();

  config.title = null;
  config.xLabel = "Tiempo (UTC)";
  config.yLabel = "Velocity (m/s)";
  config.isRelativeTime = false;
  config.margin.bottom = 60;
  config.doMarkers = true;
  config.markerTextOffset = 0.85;
  config.markerFlagpoleBase = "bottom";

  return config;
}

export function renderSeismogram(target, sdds, configOverrides = {}) {
  if (!target) return null;

  target.innerHTML = "";
  const config = createSeismographConfig();
  Object.assign(config, configOverrides);

  const seismograph = new sp.seismograph.Seismograph(sdds, config);
  seismograph.style.fill = "white";
  seismograph.style.display = "block";
  seismograph.style.width = "100%";
  seismograph.style.height = "100%";
  seismograph.style.color = "white";

  target.appendChild(seismograph);
  seismograph.draw();
  seismograph.drawMarkers();

  // Inyectamos en el shadow root tras el render
    const shadow = seismograph.shadowRoot;
    if (shadow) {
        const style = document.createElement("style");
        style.textContent = `.marker .markerpath { stroke: white !important; }`;
        shadow.appendChild(style);
    }

  return seismograph;
}

export async function loadAndDisplaySeismogram(quake, station, packetsByChannel) {
  const target = document.getElementById("seismogramContainer");
  if (!target) return;

  const sdds = await buildProcessedSeismogramData(quake, station, packetsByChannel);

  if (sdds.length === 0) {
    target.innerHTML = `<div style="color:#ff4444;text-align:center;margin-top:20px;">
                          No hay datos disponibles para esta estación
                        </div>`;
    return;
  }

  renderSeismogram(target, sdds, { linkedAmplitude: true });
}

