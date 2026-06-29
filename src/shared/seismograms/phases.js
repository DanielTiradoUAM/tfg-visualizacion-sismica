import * as sp from "../../vendor/seisplot/seisplotjs.mjs";

export async function calculatePhaseMarkers(quake, station, phases = "P,S") {
  if (!quake || !station) return [];

  const daz = sp.distaz.distaz(
    station.latitude,
    station.longitude,
    quake.latitude,
    quake.longitude
  );

  const taup = new sp.traveltime.TraveltimeQuery();
  taup.distdeg([daz.distanceDeg]);
  taup.evdepthInMeter(quake.depth);
  taup.phases(phases);

  const travelTimes = await taup.queryJson();
  const arrivals = travelTimes?.arrivals ?? [];

  if (!arrivals?.length) return [];

  return arrivals.map(arrival => ({
    name: arrival.phase ?? arrival.name,
    time: quake.time.plus({ seconds: arrival.time }),
    markertype: "predicted",
    description: `Predicted ${arrival.phase ?? arrival.name}`,
  }));
}

export async function addPhaseMarkers(sdds, quake, station, phases = "P,S") {
  try {
    const markers = await calculatePhaseMarkers(quake, station, phases);
    if (!markers.length) return;

    for (const sdd of sdds) {
      sdd.addMarkers(markers);
    }
  } catch (err) {
    console.warn("No se pudieron calcular fases:", err);
  }
}
