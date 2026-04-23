import { getDataLink } from "./datalinkService.js";
import { findStreamIdByChannel, findStreamIds } from "../seismograms/streamId.js";


/**
 * Descarga paquetes MiniSEED para un streamId en un intervalo de tiempo
 */
export async function fetchWaveformPackets({
  streamId,
  startTime,
  endTime,
  maxPackets = 1500,
  maxWaitTime = 20000,
}) {
  const packets = [];
  let timeoutId = null;
  let dlConn = null;

  try {
    // 1. Definimos la lógica de qué hacer con los paquetes ANTES de pedir la conexión
    const handlePacket = (packet) => {
      const rec = packet.asMiniseed() || packet.asMiniseed3();
      if (rec) packets.push(rec);

      // Lógica de parada: si alcanzamos el tiempo o el límite de paquetes, cerramos
      if (packet.packetTime >= endTime || packets.length >= maxPackets) {
        if (dlConn) dlConn.close();
      }
    };

    // 2. Llamamos a getDataLink pasando nuestro manejador
    // Esto es lo que cambió: ahora pasamos la función como argumento
    dlConn = getDataLink(handlePacket);

    await dlConn.connect();

    const matchResponse = await dlConn.awaitDLCommand("MATCH", streamId);

    if (matchResponse.isError()) {
      console.warn(`❌ MATCH fallido para ${streamId}`);
      return packets;
    }

    await dlConn.positionAfter(startTime);

    // 3. Iniciamos el stream dentro de una promesa para controlar el final/timeout
    await new Promise((resolve, reject) => {
      dlConn.setOnClose(resolve);

      dlConn.stream().catch(reject);

      timeoutId = setTimeout(() => {
        console.warn(`⏱ Timeout en ${streamId}`);
        dlConn.close();
      }, maxWaitTime);
    });

  } catch (err) {
    console.warn(`💥 Error descargando ${streamId}`, err);
  } finally {
    if (dlConn && dlConn.isConnected()) dlConn.close();
    if (timeoutId) clearTimeout(timeoutId);
  }

  return packets;
}

/**
 * Descarga TODOS los paquetes necesarios para una estación y un terremoto
 * Devuelve un objeto indexado por channelCode
 *
 * {
 *   Z: [MiniSeedRecord, ...],
 *   N: [...],
 *   E: [...]
 * }
 */
export async function fetchStationWaveformPackets(
    quake,
    station
  ) {
    const startTime = quake.time.minus({ minutes: 1 });
    const endTime   = quake.time.plus({ minutes: 10 });
  
    const streams = findStreamIds(station);
    const packetsByChannel = {};
  
    if (streams.length === 0) {
      console.warn(
        `⚠️ ${station.stationCode} sin canales compatibles`
      );
      return packetsByChannel;
    }
  
    for (const { channelCode, streamId } of streams) {
      console.log(
        `📡 Descargando paquetes ${station.stationCode} ${channelCode}`
      );
  
      packetsByChannel[channelCode] =
        await fetchWaveformPackets({
          streamId,
          startTime,
          endTime,
        });
    }
  
    return packetsByChannel;
  }

export async function fetchStationChannelWaveformPackets(quake, station, channelCode) {
  const startTime = quake.time.minus({ minutes: 1 });
  const endTime = quake.time.plus({ minutes: 10 });
  const stream = findStreamIdByChannel(station, channelCode);

  if (!stream) {
    return {};
  }

  return {
    [stream.channelCode]: await fetchWaveformPackets({
      streamId: stream.streamId,
      startTime,
      endTime,
    }),
  };
}
