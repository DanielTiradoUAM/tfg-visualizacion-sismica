import * as sp from "../../vendor/seisplot/seisplotjs.mjs";

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

