// src/quakes/seismograms/streamId.js

/**
 * Devuelve una lista de StreamIds FDSN compatibles con DataLink
 * Prioridad: HH > BH > EH
 * Orientaciones: Z, N, E
 *
 * @param {Object} station - sp.stationxml.Station
 * @returns {Array<{channelCode: string, streamId: string}>}
 */
export function findStreamIds(station) {
  if (!station.channels || station.channels.length === 0) {
    console.warn(`Estación ${station.codes()}: No se encontraron canales.`);
    return [];
  }

  const preferredPrefixes = ["HH", "BH", "EH"];
  const preferredOrientations = ["Z", "N", "E"];

  const results = [];

  const net = station.networkCode.trim();
  const sta = station.stationCode.trim();

  for (const prefix of preferredPrefixes) {
    for (const orientation of preferredOrientations) {

      // Si ya tenemos esta orientación, no la buscamos otra vez
      if (results.some(r => r.channelCode.endsWith(orientation))) {
        continue;
      }

      for (const channel of station.channels) {
        const chanCode = channel.channelCode?.trim().toUpperCase();
        if (!chanCode || chanCode.length !== 3) continue;

        if (chanCode.startsWith(prefix) && chanCode.endsWith(orientation)) {
          const loc = (channel.locationCode || "").trim();

          const c1 = chanCode.charAt(0);
          const c2 = chanCode.charAt(1);
          const c3 = chanCode.charAt(2);

          const streamId = `FDSN:${net}_${sta}_${loc}_${c1}_${c2}_${c3}/MSEED`;

          console.log(
            `🎯 StreamId FDSN generado: ${chanCode} → ${streamId}`
          );

          results.push({
            channelCode: chanCode,
            streamId,
          });

          break; // no buscamos más canales para esta orientación
        }
      }
    }

    // Si ya tenemos Z, N y E, paramos
    if (results.length === 3) break;
  }

  if (results.length === 0) {
    console.warn(`❌ No se encontró ningún canal compatible en ${station.codes()}.`);
  }

  return results;
}
