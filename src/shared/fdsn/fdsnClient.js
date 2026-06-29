import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { FDSN_PROXY_HOST } from "../../app/config.js";

/**
 * Devuelve el rango temporal usado en las consultas FDSN
 */
export function getQueryTimeWindow() {
  return sp.util.durationEnd(
    sp.luxon.Duration.fromISO("PT6H"),
    sp.luxon.DateTime.utc()
  );
}

/**
 * Consulta los eventos sísmicos (terremotos)
 * @returns {Promise<Array>}
 */
export function queryEarthquakes() {
  const timeWindow = getQueryTimeWindow();

  const eventQuery = new sp.fdsnevent.EventQuery(FDSN_PROXY_HOST)
    .timeRange(timeWindow);

  eventQuery.protocol("http");

  return eventQuery.query();
}

/**
 * Consulta estaciones y canales
 * @returns {Promise<Array>}
 */
export function queryStations() {
  const timeWindow = getQueryTimeWindow();

  const stationQuery = new sp.fdsnstation.StationQuery(FDSN_PROXY_HOST)
    .timeRange(timeWindow);

  stationQuery.protocol("http");

  return stationQuery.queryChannels();
}

/**
 * Orchestrates loading both earthquakes and stations
 * @returns {Promise<{quakeList: Array, stationList: Array}>}
 */
export async function loadFdsnData() {
  // Use Promise.all to run both queries simultaneously for better performance
  const [quakeList, stationList] = await Promise.all([
    queryEarthquakes(),
    queryStations()
  ]);

  return { quakeList, stationList };
}
