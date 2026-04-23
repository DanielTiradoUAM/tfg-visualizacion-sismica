// ===============================
// IMPORTS
// ===============================

import * as sp from "./seisplot/seisplotjs.mjs";
import { mymap } from "./quakes/map/mapInit.js";
import { registerMapHandlers } from "./quakes/map/mapHandlers.js";


import { displayQuakeDetails } from "./quakes/ui/quakeDetails.js";
import { displayStationDetails } from "./quakes/ui/stationDetails.js";


import { loadFdsnData } from "./quakes/data/fdsnQueries.js";
import {
  createMapUrl,
  createStationUrl,
  getPreferredStationChannel,
  persistLastStationSelection,
  readLastStationSelection,
} from "./shared/navigation.js";

function getFirstStation(networks) {
  for (const station of sp.stationxml.allStations(networks)) {
    return station;
  }

  return null;
}

function initClock() {
  const clockEl = document.getElementById("utc-clock");
  if (!clockEl) return;

  const tick = () => {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    clockEl.textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
  };

  tick();
  setInterval(tick, 1000);
}

function initTopNav(fallbackStation = null) {
  document.getElementById("nav-to-map")?.addEventListener("click", () => {
    window.location.href = createMapUrl().toString();
  });

  document.getElementById("nav-to-station")?.addEventListener("click", () => {
    const lastSelection = readLastStationSelection();
    const target = lastSelection
      || (fallbackStation ? {
        net: fallbackStation.networkCode?.trim(),
        sta: fallbackStation.stationCode?.trim(),
        cha: getPreferredStationChannel(fallbackStation),
      } : null);

    if (!target) return;

    persistLastStationSelection(target);
    window.location.href = createStationUrl(target).toString();
  });
}

// ===============================
// ESTADO INICIAL UI
// ===============================

// displayQuakeDetails(null);
// displayStationDetails(null);

initClock();

// ===============================
// CARGA DE DATOS
// ===============================

loadFdsnData(mymap)
  .then(({ quakeList, stationList }) => {
    console.log("✅ Datos FDSN cargados");
    initTopNav(getFirstStation(stationList));

    const seisDataList = [];

    for (const q of quakeList) {
      // 1. Lógica de color inicial: 
      // Usamos el sistema de la librería para que no haya conflictos con el clic posterior.
      const quakeClass = sp.leafletutil.cssClassForQuake(q);
      mymap.colorClass(quakeClass, "yellow");

      const timeWindow = sp.util.startDuration(q.time, 2400);

      for (const c of sp.stationxml.allChannels(stationList)) {
        const sdd = sp.seismogram.SeismogramDisplayData.fromChannelAndTimeWindow(
          c,
          timeWindow
        );
        sdd.addQuake(q);
        seisDataList.push(sdd);
      }
    }

    // Asignamos los datos al mapa
    mymap.seisData = seisDataList;

    const firstStation = getFirstStation(stationList);
    if (firstStation) {
      persistLastStationSelection({
        net: firstStation.networkCode?.trim(),
        sta: firstStation.stationCode?.trim(),
        cha: getPreferredStationChannel(firstStation),
      });
    }

    return seisDataList; 
  })
  .then(() => {
    // ===============================
    // MANEJADORES DEL MAPA
    // ===============================

    let handlersRegistered = false;

    function tryRegisterHandlers() {
      if (handlersRegistered) return;
    
      // Condición triple: 
      // 1. Existe el componente
      // 2. Existe el mapa de Leaflet interno
      // 3. Ya se han cargado y asignado los datos (seisData)
      if (mymap && mymap.map && mymap.seisData && mymap.seisData.length > 0) {
        
        // Usamos whenReady para asegurar que Leaflet terminó de dibujar
        mymap.map.whenReady(() => {
          registerMapHandlers(mymap);
          handlersRegistered = true;
          console.log("✅ Handlers registrados: Estaciones y Terremotos listos para clics.");
        });
    
      } else {
        // Si los datos aún no llegan, reintentamos cada 100ms
        setTimeout(tryRegisterHandlers, 100);
      }
    }

    // Arranque diferido para los handlers
    tryRegisterHandlers();
  })
  .catch(err => {
    console.error("❌ Error cargando FDSN:", err);
    initTopNav();
    document.querySelector("#mapContainer").innerHTML =
      `<p>Error cargando datos de Eventos/Estaciones. ${err}</p>`;
  });
