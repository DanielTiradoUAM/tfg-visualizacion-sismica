import * as sp from "../seisplot/seisplotjs.mjs";

const LAST_STATION_KEY = "seisview:last-station";

function toBase64Url(text) {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function normalizeEventPayload(quake) {
  if (!quake) return null;

  const mag = quake.magnitudeList?.[0];
  const origin = quake.originList?.[0];

  return {
    id: quake.eventId || quake.id || quake.publicId || null,
    publicId: quake.publicId || null,
    description: quake.description || "Sismo",
    time: quake.time?.toISO?.() || quake.time?.toString?.() || null,
    latitude: quake.latitude ?? origin?.latitude ?? null,
    longitude: quake.longitude ?? origin?.longitude ?? null,
    depth: quake.depth ?? origin?.depth ?? null,
    magnitude: mag?.magQuantity?.value ?? null,
    magnitudeType: mag?.type ?? null,
  };
}

export function hydrateEventPayload(payload) {
  if (!payload) return null;

  return {
    ...payload,
    time: payload.time ? sp.luxon.DateTime.fromISO(payload.time, { zone: "utc" }) : null,
  };
}

export function encodeEventPayload(quake) {
  const payload = normalizeEventPayload(quake);
  if (!payload) return "";
  return toBase64Url(JSON.stringify(payload));
}

export function decodeEventPayload(encoded) {
  if (!encoded) return null;

  try {
    return hydrateEventPayload(JSON.parse(fromBase64Url(encoded)));
  } catch (error) {
    console.warn("[Navigation] No se pudo decodificar el evento:", error);
    return null;
  }
}

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
