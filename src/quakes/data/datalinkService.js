// src/quakes/data/datalinkService.js

import * as sp from "../../seisplot/seisplotjs.mjs";

const DATALINK_HOST = "localhost:5173";

/**
 * Devuelve una nueva conexión DataLink
 * @returns {sp.datalink.DataLinkConnection}
 */
export function getDataLink() {
  return new sp.datalink.DataLinkConnection(
    `ws://${DATALINK_HOST}/datalink-ws`,
    () => {}, // packetHandler obligatorio aunque no se use aquí
    (error) => {
      console.error("❌ DataLink Error:", error);
    }
  );
}
