// ===============================
// IMPORTS
// ===============================

import * as sp from "./seisplot/seisplotjs.mjs";
import { mymap } from "./quakes/map/mapInit.js";
import { registerMapHandlers } from "./quakes/map/mapHandlers.js";


import { displayQuakeDetails } from "./quakes/ui/quakeDetails.js";
import { displayStationDetails } from "./quakes/ui/stationDetails.js";


import { loadFdsnData } from "./quakes/data/fdsnQueries.js";

// ===============================
// ESTADO INICIAL UI
// ===============================

// displayQuakeDetails(null);
// displayStationDetails(null);

// ===============================
// CARGA DE DATOS
// ===============================

loadFdsnData(mymap)
  .then(({ quakeList, stationList }) => {
    console.log("✅ Datos FDSN cargados");

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
    document.querySelector("#mapContainer").innerHTML =
      `<p>Error cargando datos de Eventos/Estaciones. ${err}</p>`;
  });
