const waveformCache = new Map();

function getEventKey(quake) {
  return quake?.eventId
    || quake?.id
    || quake?.publicId
    || quake?.time?.toISO?.()
    || quake?.time?.toString?.()
    || "event";
}

export function getWaveformCacheKey(quake, station) {
  return `${getEventKey(quake)}:${station.codes()}`;
}

export function getCachedWaveformPackets(quake, station) {
  return waveformCache.get(getWaveformCacheKey(quake, station));
}

export function setCachedWaveformPackets(quake, station, packetsByChannel) {
  waveformCache.set(getWaveformCacheKey(quake, station), packetsByChannel);
}

export function clearWaveformCache() {
  waveformCache.clear();
}

