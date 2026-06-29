import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { findStreamIds } from "../datalink/streamIds.js";
import { removeInstrumentResponseIfPossible } from "./instrumentResponse.js";
import { addPhaseMarkers } from "./phases.js";

export function applyAbsoluteTime(sdd, quake) {
  if (quake?.time) {
    sdd.addQuake(quake);
  }
}

export async function buildChannelDisplayData(
  quake,
  station,
  channelCode,
  packets,
  processingOptions = {}
) {
  if (!packets?.length) return null;

  const merged = sp.miniseed.merge(packets);
  let seis = new sp.seismogram.Seismogram(merged.segments);
  const channel = station.channels.find(c => c.channelCode === channelCode);

  seis = await removeInstrumentResponseIfPossible(seis, channel, processingOptions);

  const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);
  applyAbsoluteTime(sdd, quake);
  if (processingOptions.addPhases !== false) {
    await addPhaseMarkers([sdd], quake, station);
  }

  return sdd;
}

export async function buildProcessedSeismogramData(quake, station, packetsByChannel) {
  const streams = findStreamIds(station);
  const sdds = [];

  for (const { channelCode } of streams) {
    const sdd = await buildChannelDisplayData(
      quake,
      station,
      channelCode,
      packetsByChannel[channelCode]
    );

    if (sdd) {
      sdds.push(sdd);
    } else {
      console.warn(`Sin paquetes en ${channelCode}`);
    }
  }

  return sdds;
}
