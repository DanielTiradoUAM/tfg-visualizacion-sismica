export function flattenStationList(networks) {
  const stationList = [];

  for (const network of networks) {
    const netCode = network.networkCode?.trim();
    if (!netCode) continue;

    for (const station of network.stations ?? []) {
      const staCode = station.stationCode?.trim();
      if (!staCode) continue;
      stationList.push({ net: netCode, sta: staCode });
    }
  }

  return stationList;
}

