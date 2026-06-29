import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";
import { getDataLink } from "../../../shared/datalink/datalinkClient.js";

export function buildDatalinkPattern(network, station, channel) {
  const [c1, c2, c3] = channel.split("");
  return `FDSN:${network}_${station}__${c1}_${c2}_${c3}/MSEED`;
}

export async function connectLiveDataLink({
  network,
  station,
  channel,
  onPacket,
  backDurationIso = "P1D",
}) {
  const dl = getDataLink(onPacket);
  const pattern = buildDatalinkPattern(network, station, channel);

  await dl.connect();
  await dl.awaitDLCommand("MATCH", pattern);

  const backTime = sp.luxon.DateTime.utc().minus(sp.luxon.Duration.fromISO(backDurationIso));
  await dl.positionAfter(backTime);

  return { dl, pattern, backTime };
}

