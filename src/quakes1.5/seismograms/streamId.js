// src/quakes/seismograms/streamId.js

/**
 * Devuelve el StreamId en formato FDSN Source ID compatible con DataLink
 * Formato: FDSN:NET_STA_LOC_B_I_O/MSEED
 * 
 * @param {Object} station - sp.stationxml.Station
 * @returns {string|null}
 */
export function findStreamId(station) {
  if (!station.channels || station.channels.length === 0) {
    console.warn(`Estación ${station.codes()}: No se encontraron canales.`);
    return null;
  }

  const preferredPrefixes = ["HH", "BH", "EH"];
  const preferredOrientations = ["Z", "N", "E"];

  for (const prefix of preferredPrefixes) {
    for (const orientation of preferredOrientations) {
      for (const channel of station.channels) {

        const chanCode = channel.channelCode?.trim().toUpperCase();
        if (!chanCode || chanCode.length !== 3) continue;

        if (chanCode.startsWith(prefix) && chanCode.endsWith(orientation)) {

          const net = station.networkCode.trim();
          const sta = station.stationCode.trim();
          const loc = (channel.locationCode || "").trim();

          const c1 = chanCode.charAt(0);
          const c2 = chanCode.charAt(1);
          const c3 = chanCode.charAt(2);

          const streamId = `FDSN:${net}_${sta}_${loc}_${c1}_${c2}_${c3}/MSEED`;

          console.log(`🎯 StreamId FDSN generado: ${streamId}`);
          return streamId;
        }
      }
    }
  }

  console.warn(`❌ No se encontró un canal compatible en ${station.codes()}.`);
  return null;
}
