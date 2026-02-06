// src/quakes/seismograms/loadSeismogram.js

import * as sp from "../../seisplot/seisplotjs.mjs";
import { getDataLink } from "../data/datalinkService.js";
import { findStreamId } from "./streamId.js";
import {
  showLoading,
  showError,
  showSeismogramHeader,
  getSeismogramTarget,
} from "../ui/seismogramContainer.js";

/**
 * Carga y muestra un sismograma usando DataLink
 * @param {Object} quake - sp.quakeml.Quake
 * @param {Object} station - sp.stationxml.Station
 */
export async function loadAndDisplaySeismogram(quake, station) {

  showLoading(station.stationCode);

  const streamId = findStreamId(station);
  if (!streamId) {
    showError(
      `No se encontró un canal compatible (HHZ, BHZ, EHZ) en la estación ${station.codes()}`
    );
    return;
  }

  const startTime = quake.time.minus({ minutes: 2 });
  const endTime = quake.time.plus({ minutes: 8 });

  const packets = [];
  const maxPackets = 1500;
  const maxWaitTime = 25000;

  let dlConn = getDataLink();
  let timeoutId = null;

  try {
    await dlConn.connect();
    console.log("✅ DataLink conectado");

    const matchResponse = await dlConn.awaitDLCommand("MATCH", streamId);
    if (matchResponse.isError()) {
      throw new Error(`El servidor no reconoce el canal ${streamId}`);
    }

    await dlConn.positionAfter(startTime);

    await new Promise((resolve, reject) => {

      dlConn.setOnClose(() => {
        clearTimeout(timeoutId);
        resolve();
      });

      dlConn.packetHandler = (packet) => {
        const dataRecord =
          packet.asMiniseed() || packet.asMiniseed3();

        if (dataRecord) packets.push(dataRecord);

        if (packet.packetTime >= endTime || packets.length >= maxPackets) {
          dlConn.close();
        }
      };

      dlConn.stream().catch(reject);

      timeoutId = setTimeout(() => {
        console.warn("⏱ Timeout DataLink");
        dlConn.close();
      }, maxWaitTime);
    });

    if (packets.length === 0) {
      showError(
        `No se encontraron datos para ${streamId} en el periodo del terremoto`
      );
      return;
    }

    const merged = sp.miniseed.merge(packets);
    const seis = new sp.seismogram.Seismogram(merged.segments);

    const channelCode = streamId
      .split("_")
      .slice(-3)
      .map(p => p[0])
      .join("")
      .split("/")[0];

    const channel = station.channels.find(
      c => c.channelCode === channelCode
    );

    const sdd = sp.seismogram.SeismogramDisplayData
      .fromSeismogram(seis);

    if (channel) sdd.channel = channel;
    sdd.addQuake(quake);

    showSeismogramHeader({
      stationCode: station.stationCode,
      channelCode,
      quake,
    });

    const target = getSeismogramTarget();

    const graphConfig = new sp.seismographconfig.SeismographConfig();
    graphConfig.title = `${station.stationCode} - ${channelCode}`;
    graphConfig.xLabel = "Tiempo UTC";
    graphConfig.isRelativeTime = false;

    const seismograph = new sp.seismograph.Seismograph(
      [sdd],
      graphConfig
    );

    target.appendChild(seismograph);

  } catch (error) {
    console.error(error);
    showError(error.message);
  } finally {
    if (dlConn && dlConn.isConnected()) dlConn.close();
    if (timeoutId) clearTimeout(timeoutId);
  }
}
