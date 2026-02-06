// src/quakes/seismograms/loadSeismogram.js

import * as sp from "../../seisplot/seisplotjs.mjs";
import { getDataLink } from "../data/datalinkService.js";
import { findStreamIds } from "./streamId.js";
import {
  showLoading,
  showError,
  getSeismogramTarget,
} from "../ui/seismogramContainer.js";

/**
 * Normaliza un SeismogramDisplayData a [-1, 1]
 */
function normalizeSDD(sdd) {
  const data = sdd.seismogram.segments[0].y;
  const max = Math.max(...data.map(Math.abs));
  if (max === 0) return;

  for (let i = 0; i < data.length; i++) {
    data[i] /= max;
  }
}

/**
 * Carga y muestra sismogramas multicanal (Z, N, E)
 * solapados para una estación
 */
export async function loadAndDisplaySeismogram(quake, station) {

  showLoading(station.stationCode, quake);

  // 🔹 Obtener StreamIds ya priorizados (HH > BH > EH)
  const streams = findStreamIds(station);

  if (streams.length === 0) {
    showError(
      station.stationCode,
      "La estación no tiene canales compatibles (Z, N, E)"
    );
    return;
  }

  const startTime = quake.time.minus({ minutes: 1 });
  const endTime   = quake.time.plus({ minutes: 10 });

  const sdds = [];

  for (const { channelCode, streamId } of streams) {

    console.log(`📡 Cargando ${station.stationCode} ${channelCode}`);

    const packets = [];
    const maxPackets = 1500;
    const maxWaitTime = 20000;

    let dlConn = getDataLink();
    let timeoutId = null;

    try {
      await dlConn.connect();

      const matchResponse =
        await dlConn.awaitDLCommand("MATCH", streamId);

      if (matchResponse.isError()) {
        console.warn(`❌ MATCH fallido para ${streamId}`);
        continue;
      }

      await dlConn.positionAfter(startTime);

      await new Promise((resolve, reject) => {

        dlConn.setOnClose(resolve);

        dlConn.packetHandler = (packet) => {
          const rec =
            packet.asMiniseed() || packet.asMiniseed3();

          if (rec) packets.push(rec);

          if (
            packet.packetTime >= endTime ||
            packets.length >= maxPackets
          ) {
            dlConn.close();
          }
        };

        dlConn.stream().catch(reject);

        timeoutId = setTimeout(() => {
          console.warn(`⏱ Timeout en ${channelCode}`);
          dlConn.close();
        }, maxWaitTime);
      });

      if (packets.length === 0) {
        console.warn(`⚠️ Sin datos en ${channelCode}`);
        continue;
      }

      const merged = sp.miniseed.merge(packets);
      const seis = new sp.seismogram.Seismogram(merged.segments);

      const sdd =
        sp.seismogram.SeismogramDisplayData
          .fromSeismogram(seis);

      // 🔹 Asociar metadata del canal real (si existe)
      const channel = station.channels.find(
        c => c.channelCode === channelCode
      );
      if (channel) sdd.channel = channel;

      sdd.addQuake(quake);

      // 🔧 Normalización por canal (cuando quieras activarla)
      // normalizeSDD(sdd);

      sdds.push(sdd);

    } catch (err) {
      console.warn(
        `💥 Error en ${station.stationCode} ${channelCode}`,
        err
      );
    } finally {
      if (dlConn && dlConn.isConnected()) dlConn.close();
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  if (sdds.length === 0) {
    showError(
      station.stationCode,
      "No se pudieron cargar datos de los canales"
    );
    return;
  }

  const target = getSeismogramTarget(station.stationCode);
  if (!target) return;

  target.innerHTML = "";

  const config = new sp.seismographconfig.SeismographConfig();
  config.title = `Estación ${station.stationCode}`;
  config.xLabel = "Tiempo (s desde origen)";
  config.isRelativeTime = true;

  const seismograph =
    new sp.seismograph.Seismograph(sdds, config);

  target.appendChild(seismograph);
}

