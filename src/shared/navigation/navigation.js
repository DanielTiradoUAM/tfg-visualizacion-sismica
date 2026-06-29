export {
  decodeEventPayload,
  encodeEventPayload,
  hydrateEventPayload,
  normalizeEventPayload,
} from "./eventPayload.js";
export {
  getPreferredStationChannel,
  persistLastStationSelection,
  readLastStationSelection,
} from "./stationSelection.js";

export function createStationUrl({
  net,
  sta,
  cha,
  mode = "live",
  eventPayload = null,
}) {
  const url = new URL("./station.html", window.location.href);

  if (net) url.searchParams.set("net", net);
  if (sta) url.searchParams.set("sta", sta);
  if (cha) url.searchParams.set("cha", cha);
  if (mode && mode !== "live") url.searchParams.set("mode", mode);
  if (eventPayload) url.searchParams.set("event", eventPayload);

  return url;
}

export function createMapUrl() {
  return new URL("./index.html", window.location.href);
}

