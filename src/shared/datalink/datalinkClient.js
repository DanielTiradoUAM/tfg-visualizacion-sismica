import * as sp from "../../vendor/seisplot/seisplotjs.mjs";
import { DATALINK_URL } from "../../app/config.js";

/**
 * Crea una conexión DataLink permitiendo inyectar el manejador de paquetes
 * @param {Function} packetHandler - Función que procesa cada paquete recibido
 */
export function getDataLink(packetHandler) {
  return new sp.datalink.DataLinkConnection(
    DATALINK_URL,
    (packet) => {
      // Si nos pasan un handler, lo usamos. Si no, no hacemos nada.
      if (packetHandler) packetHandler(packet);
    },
    (error) => {
      console.error("❌ DataLink Error:", error);
    }
  );
}
