// ===============================
// IMPORTS
// ===============================

import * as sp from "../seisplot/seisplotjs.mjs";
import { mymap } from "./map/mapInit.js";
import { registerMapHandlers } from "./map/mapHandlers.js";

import {
  CURRENT_QUAKE,
  CURRENT_STATION,
  setCurrentQuake,
  setCurrentStation,
} from "./state/selectionState.js";

import { displayQuakeDetails } from "./ui/quakeDetails.js";
import { displayStationDetails } from "./ui/stationDetails.js";

import { loadAndDisplaySeismogram } from "./seismograms/loadSeismogram.js";

import { loadFdsnData } from "./data/fdsnQueries.js";

// ===============================
// ESTADO INICIAL UI
// ===============================

displayQuakeDetails(null);
displayStationDetails(null);

// ===============================
// CARGA DE DATOS
// ===============================

loadFdsnData(mymap)
  .then(({ quakeList, stationList }) => {
    console.log("✅ Datos FDSN cargados");

    // Asignamos los datos al mapa para visualización
    const seisDataList = [];

    for (const q of quakeList) {
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

    mymap.seisData = seisDataList;

  })
  .catch(err => {
    console.error("❌ Error cargando FDSN:", err);
    document.querySelector("#mapContainer").innerHTML =
      `<p>Error cargando datos de Eventos/Estaciones. ${err}</p>`;
  });

// ===============================
// MANEJADORES DEL MAPA
// ===============================

registerMapHandlers(mymap);
