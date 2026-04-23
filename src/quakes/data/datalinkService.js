import * as sp from "../../seisplot/seisplotjs.mjs";

// IMPORTANTE: Si usas el proxy de Vite, esto está bien. 
// Si falla, prueba cambiarlo por la IP real del servidor (ej: live.openseismometer.net:18000)
export const DATALINK_URL = `ws://localhost:5173/datalink-ws`;

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