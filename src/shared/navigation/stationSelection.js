const LAST_STATION_KEY = "seisview:last-station";

export function getPreferredStationChannel(station) {
  if (!station?.channels?.length) return "HHZ";

  const preferredPrefixes = ["HH", "BH", "EH"];
  const preferredOrientations = ["Z", "N", "E"];

  for (const prefix of preferredPrefixes) {
    for (const orientation of preferredOrientations) {
      const match = station.channels.find(channel => {
        const code = channel.channelCode?.trim().toUpperCase();
        return code?.startsWith(prefix) && code.endsWith(orientation);
      });

      if (match?.channelCode) {
        return match.channelCode.trim().toUpperCase();
      }
    }
  }

  return station.channels[0]?.channelCode?.trim().toUpperCase() || "HHZ";
}

export function persistLastStationSelection(selection) {
  if (!selection?.net || !selection?.sta || !selection?.cha) return;
  localStorage.setItem(LAST_STATION_KEY, JSON.stringify(selection));
}

export function readLastStationSelection() {
  const raw = localStorage.getItem(LAST_STATION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.net && parsed?.sta && parsed?.cha) {
      return parsed;
    }
  } catch (error) {
    console.warn("[Navigation] No se pudo leer la última estación:", error);
  }

  return null;
}

