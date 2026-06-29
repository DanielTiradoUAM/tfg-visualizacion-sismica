import { fetchStationChannelWaveformPackets } from "../../../shared/datalink/waveformPackets.js";
import { renderEventSummary } from "./eventSummary.js";

export function getEventPacketCacheKey(eventPayload, network, station, channel) {
  const eventId = eventPayload.id || eventPayload.time?.toISO?.() || "event";
  return `${eventId}:${network}.${station}.${channel}`;
}

export async function renderStationEventMode({
  container,
  emptyState,
  quake,
  station,
  networkCode,
  stationCode,
  channelCode,
  packetCache,
  filters,
}) {
  if (!station || !quake) return;

  if (emptyState) {
    emptyState.textContent = `Generando hoja resumen para ${channelCode}...`;
  }
  container.innerHTML = "";

  const cacheKey = getEventPacketCacheKey(quake, networkCode, stationCode, channelCode);
  let packetsByChannel = packetCache.get(cacheKey);

  if (!packetsByChannel) {
    packetsByChannel = await fetchStationChannelWaveformPackets(quake, station, channelCode);
    packetCache.set(cacheKey, packetsByChannel);
  }

  if (emptyState) emptyState.style.display = "none";

  await renderEventSummary({
    container,
    quake,
    station,
    channelCode,
    packetsByChannel,
    filters,
  });

  return packetsByChannel;
}
