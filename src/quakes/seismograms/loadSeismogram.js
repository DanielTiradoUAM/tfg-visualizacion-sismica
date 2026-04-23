// src/quakes/seismograms/loadSeismogram.js

import * as sp from "../../seisplot/seisplotjs.mjs";
import { findStreamIds } from "./streamId.js";

/**
 * Ajusta el tiempo absoluto del sismograma
 */
export function applyAbsoluteTime(sdd, quake) {
  // Usar el tiempo real del terremoto como referencia
  if (quake && quake.time) {
    sdd.addQuake(quake);
  }
}

/**
 * Crea configuración del seismograph con tiempo real
 */
export function createSeismographConfig() {
  const config = new sp.seismographconfig.SeismographConfig();

  config.title = null;

  config.xLabel = "Tiempo (UTC)";
  config.yLabel = "Velocity (m/s)";

  // Tiempo absoluto
  config.isRelativeTime = false;

  // Márgenes (un poco más de espacio)
  config.margin.bottom = 60;
  
  // --- INDISPENSABLE PARA VER LAS FASES ---
  config.doMarkers = true; 
  config.markerTextOffset = 0.85; // Coloca el texto cerca del tope
  config.markerFlagpoleBase = "bottom"; // Dibuja la línea de arriba a abajo

  return config;
}


/**
 * Remueve la respuesta instrumental y limpia la señal
 * siguiendo el flujo recomendado por Seisplotjs
 */
export async function removeInstrumentResponseIfPossible(seis, channel) {

  if (!seis || !channel || !channel.response) {
    console.warn("⚠️ No hay response metadata, no se puede remover respuesta instrumental");
    return seis;
  }

  try {
    // 1️⃣ & 2️⃣ Limpieza básica
    seis = sp.filter.rMean(seis);
    seis = sp.filter.removeTrend(seis);

    // 3️⃣ Filtro Butterworth (acorde a Nyquist = 50Hz)
    // El filtro debe ser siempre menor a 50Hz
    const butterworth = sp.filter.createButterworth(
      2, 
      sp.filter.BAND_PASS,
      1.5,  // Frecuencia baja de paso (Hz)
      45,   // Frecuencia alta de paso (Hz) - bien dentro del límite de Nyquist
      1 / seis.sampleRate
    );

    seis = sp.filter.applyFilter(butterworth, seis);

    // 4️⃣ Taper para limpiar bordes
    seis = sp.taper.taper(seis);

    // 5️⃣ Deconvolución con parámetros seguros para 100Hz
    // f1, f2: inicio de la banda de paso (donde el sensor es estable)
    // f3, f4: fin de la banda de paso (deben ser < 50Hz)
    const f1 = 0.5;
    const f2 = 1.0;
    const f3 = 35.0;
    const f4 = 45.0;

    seis = sp.transfer.transfer(
      seis,
      channel.response,
      f1,
      f2,
      f3,
      f4
    );

    return seis;

  } catch (err) {
    console.error("❌ Error removiendo respuesta instrumental:", err);
    return seis;
  }
}

export async function addPhaseMarkers(sdds, quake, station) {

  if (!quake || !station) return;

  try {

    const daz = sp.distaz.distaz(
      station.latitude,
      station.longitude,
      quake.latitude,
      quake.longitude
    );

    const taup = new sp.traveltime.TraveltimeQuery();

    taup.distdeg([daz.distanceDeg]);
    taup.evdepthInMeter(quake.depth);
    taup.phases("P,S");

    // IMPORTANTE: usar queryText
    const text = await taup.queryText();

    // convertir texto TauP a objetos de llegada
    const arrivals = sp.traveltime.parseTaupText(text);

    if (!arrivals || arrivals.length === 0) return;

    for (const sdd of sdds) {

      const markers = arrivals.map(arr => {

        const phaseTime = quake.time.plus({
          seconds: arr.time
        });

        return {
          name: arr.phase,
          time: phaseTime,
          type: "predicted",
          description: `Predicted ${arr.phase}`
        };

      });

      sdd.addMarkers(markers);
    }

  } catch (err) {
    console.warn("⚠️ No se pudieron calcular fases:", err);
  }
}

export async function buildProcessedSeismogramData(quake, station, packetsByChannel) {
  const streams = findStreamIds(station);
  const sdds = [];

  for (const { channelCode } of streams) {
    const packets = packetsByChannel[channelCode];

    if (!packets || packets.length === 0) {
      console.warn(`⚠️ Sin paquetes en ${channelCode}`);
      continue;
    }

    const merged = sp.miniseed.merge(packets);
    let seis = new sp.seismogram.Seismogram(merged.segments);
    const channel = station.channels.find(c => c.channelCode === channelCode);

    seis = await removeInstrumentResponseIfPossible(seis, channel);

    const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);
    applyAbsoluteTime(sdd, quake);
    sdds.push(sdd);
  }

  if (sdds.length > 0) {
    await addPhaseMarkers(sdds, quake, station);
  }

  return sdds;
}

/**
 * Carga y muestra sismogramas multicanal (Z, N, E)
 * solapados para una estación
 */
export async function loadAndDisplaySeismogram(quake, station, packetsByChannel) {
  const target = document.getElementById("seismogramContainer");
  if (!target) return;
  const sdds = await buildProcessedSeismogramData(quake, station, packetsByChannel);

  if (sdds.length === 0) {
    target.innerHTML = `<div style="color:#ff4444;text-align:center;margin-top:20px;">
                          ⚠️ No hay datos disponibles para esta estación
                        </div>`;
    return;
  }

  // Configuración y renderizado
  target.innerHTML = "";
  const config = createSeismographConfig();
  
  // Para que todos los canales (Z, N, E) compartan la misma escala Y
  config.linkedAmplitude = true; 

  const seismograph = new sp.seismograph.Seismograph(sdds, config);

  seismograph.style.fill = "white";

  // Estilos
  seismograph.style.display = "block";
  seismograph.style.width = "100%";
  seismograph.style.height = "100%";
  // Nota: 'fill' en CSS no siempre afecta al texto del SVG, 
  // pero ayuda con la consistencia del componente.
  seismograph.style.color = "white"; 

  target.appendChild(seismograph);

  // IMPORTANTE: draw() es obligatorio después de añadir al DOM
  seismograph.draw();
  seismograph.drawMarkers();
}
