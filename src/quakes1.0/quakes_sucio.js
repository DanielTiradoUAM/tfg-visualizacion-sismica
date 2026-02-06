import * as sp from "../seisplot/seisplotjs.mjs";

const mymap = document.querySelector("sp-station-quake-map");

// Referencias a los contenedores de la interfaz
const quakeDetailsContainer = document.querySelector("div#quakeDetailsContainer");
const stationDetailsContainer = document.querySelector("div#stationDetailsContainer");
const seismogramDisplayContainer = document.querySelector("div#seismogramDisplayContainer");


// Variables globales para rastrear la selección actual
let CURRENT_QUAKE = null;
let CURRENT_STATION = null;

// --- Lógica de Zoom y Mapa (Sincronización robusta) ---

let zoomEnabled = false;

function tryEnableZoom() {
    if (zoomEnabled) return; 

    if (mymap && mymap.map) {
        const leafletInstance = mymap.map;
        
        leafletInstance.whenReady(() => {
            leafletInstance.scrollWheelZoom.enable();
            leafletInstance.invalidateSize(true);
            zoomEnabled = true;
            console.log("✅ Zoom de rueda habilitado con whenReady. ¡Éxito!");
        });
        
    } else {
        setTimeout(tryEnableZoom, 50);
    }
}

setTimeout(() => {
    tryEnableZoom();
}, 200);

// --- Configuración DataLink ---

// URL de tu servidor DataLink (¡Asegúrate que sea accesible!)
// NOTA: Si usas el proxy de tu entorno de desarrollo, el puerto 8080 debe
// ser el puerto donde corre el servidor Datalink real (e.g., ringserver).
const DATALINK_HOST = "localhost:5173"; 

/**
 * Obtiene una nueva conexión DataLink.
 * @returns {sp.datalink.DataLinkConnection}
 */
function getDataLink() {
    return new sp.datalink.DataLinkConnection(
        `ws://${DATALINK_HOST}/datalink-ws`,
        // packetHandler (usado para modo STREAM, pero se requiere en el constructor)
        () => {}, 
        // errorHandler
        (error) => {
            console.error("DataLink Error:", error);
            // Mostrar error solo si es el contenedor principal de sismograma
            if (seismogramDisplayContainer.innerHTML.includes('🔄')) { 
                seismogramDisplayContainer.innerHTML = `<div class="error-card"><p>❌ Fallo en la conexión DataLink: ${error.message}</p></div>`;
            }
        }
    );
}


// --- Funciones de Visualización de Detalles ---

/**
 * Muestra la información detallada del objeto Quake en el HTML.
 * @param {sp.quakeml.Quake | null} quake - El objeto terremoto seleccionado.
 */
function displayQuakeDetails(quake) {
    const headerSpan = document.querySelector("span#earthquakeDescription");

    if (!quake) {
        // Estado inicial o sin terremoto seleccionado
        quakeDetailsContainer.innerHTML = '<div class="quake-card"><h3>Seleccione un Terremoto en el mapa 👆</h3></div>';
        headerSpan.textContent = "Seleccione un Terremoto";
        return;
    }

    const mag = quake.magnitudeList[0];
    const origin = quake.originList[0];
    
    const magStr = `${mag.magQuantity.value.toFixed(1)} ${mag.type}`;
    const timeStr = quake.time.toFormat('yyyy-MM-dd HH:mm:ss ZZZ');
    
    // 1. Actualizar la cabecera (HEADER)
    headerSpan.innerHTML = `🌍 **Evento:** M${magStr} (${quake.description})`;

    // 2. Actualizar el contenedor principal con la tabla de detalles
    quakeDetailsContainer.innerHTML = `
        <div class="quake-card">
            <h2>🌍 Detalles del Terremoto</h2>
            <table>
                <tr>
                    <th>Magnitud:</th>
                    <td><strong>${magStr}</strong></td>
                </tr>
                <tr>
                    <th>Hora UTC:</th>
                    <td>${timeStr}</td>
                </tr>
                <tr>
                    <th>Localización:</th>
                    <td>Lat: ${origin.latitude.toFixed(2)}°, Lon: ${origin.longitude.toFixed(2)}°</td>
                </tr>
                <tr>
                    <th>Profundidad:</th>
                    <td>${origin.depth.toFixed(1)} km</td>
                </tr>
                <tr>
                    <th>Descripción:</th>
                    <td>${quake.description}</td>
                </tr>
            </table>
        </div>
    `;
}

/**
 * Muestra la información detallada de la Estación en el HTML.
 * @param {sp.stationxml.Station | null} station - El objeto estación seleccionado.
 */
function displayStationDetails(station) {
  if (!station) {
      stationDetailsContainer.innerHTML = '<div class="station-card"><h3>Seleccione una Estación en el mapa 👆</h3></div>';
      document.querySelector("span#stationCode").textContent = "Seleccione una Estación";
      return;
  }
  
  const code = station.codes();
  document.querySelector("span#stationCode").textContent = code;
  
  stationDetailsContainer.innerHTML = `
      <div class="station-card">
          <h2>📡 Detalles de la Estación</h2>
          <table>
              <tr>
                  <th>Código:</th>
                  <td><strong>${code}</strong></td>
              </tr>
              <tr>
                  <th>Localización:</th>
                  <td>${station.latitude.toFixed(4)} N, ${station.longitude.toFixed(4)} E</td>
              </tr>
              <tr>
                  <th>Elevación:</th>
                  <td>${station.elevation.toFixed(1)} m</td>
              </tr>
              <tr>
                  <th>Canales:</th>
                  <td>${station.channels ? station.channels.length : 0} disponibles</td>
              </tr>
              <tr>
                  <th>Datos DataLink:</th>
                  <td>Pendiente de cargar...</td>
              </tr>
          </table>
      </div>
  `;
}

// NOTA: Se asume que las importaciones y la configuración inicial (DATALINK_HOST, getDataLink) 
// están correctamente definidas en el código que me has proporcionado.

/**
 * Devuelve el StreamId en formato FDSN Source ID:
 * FDSN:NET_STA_LOC_B_I_O/MSEED
 * acorde al formato real detectado en el servidor DataLink.
 */
function findStreamId(station) {
    if (!station.channels || station.channels.length === 0) {
        console.warn(`Estación ${station.codes()}: No se encontraron canales.`);
        return null;
    }

    const preferredPrefixes = ["HH", "BH", "EH"];
    const preferredOrientations = ["Z", "N", "E"];

    for (const prefix of preferredPrefixes) {
        for (const orientation of preferredOrientations) {
            for (const channel of station.channels) {
                
                // Obtenemos el código del canal (ej: "HHZ")
                const chanCode = channel.channelCode?.trim().toUpperCase();
                if (!chanCode || chanCode.length !== 3) continue;

                if (chanCode.startsWith(prefix) && chanCode.endsWith(orientation)) {
                    
                    const net = station.networkCode.trim();
                    const sta = station.stationCode.trim();
                    const loc = (channel.locationCode || "").trim();
                    
                    // Descomponemos el canal: "HHZ" -> "H", "H", "Z"
                    const c1 = chanCode.charAt(0);
                    const c2 = chanCode.charAt(1);
                    const c3 = chanCode.charAt(2);

                    // Construimos el FDSN Source ID
                    // Formato: FDSN:NET_STA_LOC_B_I_O/MSEED
                    // Si loc está vacío, quedarán dos guiones bajos seguidos (STA__B)
                    const streamId = `FDSN:${net}_${sta}_${loc}_${c1}_${c2}_${c3}/MSEED`;

                    console.log(`🎯 StreamId FDSN generado: ${streamId}`);
                    return streamId;
                }
            }
        }
    }

    console.warn(`❌ No se encontró un canal compatible en ${station.codes()}.`);
    return null;
}



/**
 * Lógica para cargar y mostrar el sismograma utilizando DataLink.
 * @param {sp.quakeml.Quake} quake 
 * @param {sp.stationxml.Station} station 
 */
async function loadAndDisplaySeismogram(quake, station) {
    
    // 1. Mostrar estado de carga y limpiar el contenedor
    seismogramDisplayContainer.innerHTML = `
        <div class="loading-card">
            <p>🔄 Conectando a DataLink para ${station.stationCode}...</p>
            <div class="spinner"></div>
        </div>`;

    // 2. Determinar StreamId (Usando la función corregida con formato FDSN)
    const streamId = findStreamId(station);

    if (!streamId) {
        seismogramDisplayContainer.innerHTML = `
            <div class="error-card"><p>❌ No se encontró un canal compatible (HHZ, BHZ, EHZ) en la estación ${station.codes()}.</p></div>
        `;
        return;
    }

    console.log(`🎯 Intentando conectar al StreamId: ${streamId}`);
    
    // 3. Definir la ventana de tiempo (Ejemplo: 2 min antes y 8 min después del terremoto)
    // Nota: Usamos el tiempo del terremoto para que el sismograma sea relevante al evento.
    const startTime = quake.time.minus({ minutes: 2 });
    const endTime = quake.time.plus({ minutes: 8 });
    
    let dlConn = getDataLink(); 
    const packets = [];
    const maxPackets = 1500; // Aumentado ligeramente para cubrir 10 min de datos a 100Hz
    const maxWaitTime = 25000; // 25 segundos de margen para la descarga
    let timeoutId = null;

    try {
        // 4. Establecer conexión DataLink
        await dlConn.connect(); 
        console.log("✅ DataLink: Conexión establecida.");
    
        // 5. Configurar el MATCH específico (Cambiado de .* al ID real)
        const matchResponse = await dlConn.awaitDLCommand("MATCH", streamId); 
        console.log(`📡 MATCH '${streamId}':`, matchResponse.toString());

        if (matchResponse.isError()) {
            throw new Error(`El servidor no reconoce el canal: ${streamId}`);
        }
    
        // 6. Posicionarse en el tiempo solicitado
        await dlConn.positionAfter(startTime);
        console.log(`⏰ POSITION: Desde ${startTime.toISO()}`);
    
        // --- PROMESA DE RECEPCIÓN ---
        const dataReceivePromise = new Promise((resolve, reject) => {
            
            dlConn.setOnClose((closeEvent) => { 
                console.log(`🔌 Conexión cerrada. Procesando ${packets.length} paquetes...`);
                clearTimeout(timeoutId);
                resolve();
            });
            
            dlConn.packetHandler = (packet) => {
                // Log de seguimiento
                console.log(`📦 Recibido: ${packet.streamId} | ${packet.packetTime.toFormat('HH:mm:ss.S')}`);
    
                const dataRecord = packet.asMiniseed() || packet.asMiniseed3();
                
                if (dataRecord) {
                    packets.push(dataRecord);
                }
                
                // CONDICIÓN DE PARADA:
                // Paramos si el paquete recibido ya supera nuestra hora de fin
                if (packet.packetTime >= endTime) {
                    console.log("🏁 Ventana de tiempo completada.");
                    dlConn.close(); 
                }
                // O si alcanzamos el límite de seguridad de paquetes
                if (packets.length >= maxPackets) {
                    console.log("⚠️ Límite de paquetes alcanzado.");
                    dlConn.close();
                }
            };
            
            // 7. Iniciar el flujo de datos
            dlConn.stream()
                .then(() => console.log("🚀 STREAM activado. Esperando datos..."))
                .catch(reject);
    
            // Timeout de seguridad por si no hay datos en ese periodo
            timeoutId = setTimeout(() => {
                if (packets.length === 0) {
                    console.error("🚫 TIMEOUT: No llegaron datos en 25s.");
                }
                dlConn.close(); 
            }, maxWaitTime);
        });

        // Esperar a que la descarga termine
        await dataReceivePromise;
        
        // 8. Validar si tenemos datos
        if (packets.length === 0) {
            seismogramDisplayContainer.innerHTML = `
                <div class="error-card">
                    <p>⚠️ No se encontraron datos para <b>${streamId}</b> en el periodo del terremoto.</p>
                    <small>Es posible que el servidor no tenga datos históricos para esa fecha específica.</small>
                </div>`;
            return;
        }
        
        
        // 9. Procesar y preparar la visualización
        // sp.miniseed.merge devuelve un Array de SeismogramSegment (o un objeto que los contiene)
        const mergedResult = sp.miniseed.merge(packets);
                
        // El archivo seismogram.ts muestra que el constructor acepta SeismogramSegment | Array<SeismogramSegment>
        const seis = new sp.seismogram.Seismogram(mergedResult.segments);
        
        // Extraer códigos para la metadata
        const channelCode = streamId.split('_').slice(-3).map(p => p[0]).join('').split('/')[0];

        // Buscar el objeto canal original
        const channel = station.channels.find(c => c.channelCode === channelCode);
        
        // Usamos el método estático definido en el archivo: static fromSeismogram(seismogram: Seismogram)
        const sdd = sp.seismogram.SeismogramDisplayData.fromSeismogram(seis);
        
        // Asignamos el canal y el sismo manualmente como permite la clase
        if (channel) sdd.channel = channel; 
        sdd.addQuake(quake);

        // 10. Dibujar el sismograma
        seismogramDisplayContainer.innerHTML = `
            <div class="seismogram-header">
                <h3>📉 Sismograma: ${station.stationCode} - ${channelCode}</h3>
                <p>Evento: ${quake.description || 'Sismo'} (M${quake.magnitude.mag.toFixed(1)})</p>
            </div>
            <div id="seismograph-target" style="height: 400px; width: 100%;"></div>
        `;
        
        const target = seismogramDisplayContainer.querySelector("#seismograph-target");

        // Configuración del gráfico (SeismographConfig suele requerir clase, no objeto plano)
        const graphConfig = new sp.seismographconfig.SeismographConfig();
        graphConfig.title = `${station.stationCode} - ${channelCode}`;
        graphConfig.xLabel = "Tiempo UTC";
        graphConfig.isRelativeTime = false;

        // Crear el componente visual y adjuntarlo
        const seismograph = new sp.seismograph.Seismograph([sdd], graphConfig);
        target.appendChild(seismograph);

    } catch (error) {
        console.error("Error en loadAndDisplaySeismogram:", error);
        seismogramDisplayContainer.innerHTML = `
            <div class="error-card"><p>❌ Error: ${error.message}</p></div>`;
    } finally {
        // Asegurar cierre de conexión y limpieza de memoria
        if (dlConn && dlConn.isConnected()) {
             dlConn.close();
        }
        if (timeoutId) clearTimeout(timeoutId);
    }
}

// Inicializar contenedores con el estado por defecto
if (quakeDetailsContainer) displayQuakeDetails(null);
if (stationDetailsContainer) displayStationDetails(null);

// --- LÓGICA DE ESTILOS Y CONSULTAS FDSN ---

mymap.addStyle(`
  div.stationMapMarker {
    color: rebeccapurple;
  }
  path.quakeMapMarker {
    fill: orange;
    stroke: yellow;
    fill-opacity: 0.25;
  }
`);

const PROXY_HOST = "localhost:5173/fdsn-seismo";

let queryTimeWindow = sp.util.durationEnd(sp.luxon.Duration.fromISO('PT6H'), sp.luxon.DateTime.utc());

// 1. Consulta de Eventos (Terremotos)
let eventQuery = new sp.fdsnevent.EventQuery(PROXY_HOST)
  .timeRange(queryTimeWindow);
eventQuery.protocol("http");

// 2. Consulta de Estaciones
let stationQuery = new sp.fdsnstation.StationQuery(PROXY_HOST)
  .timeRange(queryTimeWindow)
stationQuery.protocol("http");

let stationsPromise = stationQuery.queryChannels();
let quakePromise = eventQuery.query();

// snip start seismogramload
Promise.all([quakePromise, stationsPromise])
  .then(([quakeList, networkList]) => {
    
    const map = document.querySelectorAll("sp-station-quake-map")[0];
    
    // Configuración de eventos de clic en el mapa
    map.addEventListener("stationclick", (ce) => {
      CURRENT_STATION = ce.detail.station;
      displayStationDetails(CURRENT_STATION); 

      // Si ya hay un terremoto seleccionado, inicia la carga del sismograma
      if (CURRENT_QUAKE) {
          loadAndDisplaySeismogram(CURRENT_QUAKE, CURRENT_STATION);
      }
    });
      
    map.addEventListener("quakeclick", (ce) => {
      // 1. Limpia la clase del terremoto anterior
      if (CURRENT_QUAKE !== null)
        map.removeColorClass(sp.leafletutil.cssClassForQuake(CURRENT_QUAKE));
        
      CURRENT_QUAKE = ce.detail.quake;
      
      // 2. Resalta el terremoto seleccionado
      map.colorClass(sp.leafletutil.cssClassForQuake(CURRENT_QUAKE),"green");
      
      // 3. Muestra los detalles del terremoto
      displayQuakeDetails(CURRENT_QUAKE); 
      
      // 4. Si ya hay una estación seleccionada, inicia la carga del sismograma
      if (CURRENT_STATION) {
          loadAndDisplaySeismogram(CURRENT_QUAKE, CURRENT_STATION);
      }
    });

    // ASIGNACIÓN DE DATOS AL MAPA
    
    // Creamos la lista de SeismogramDisplayData (necesaria para el componente)
    let seismogramDataList = [];
    for (const q of quakeList) {
      // Usamos la hora del terremoto + una duración (e.g., 40 minutos)
      const timeWindow = sp.util.startDuration(q.time, 2400); 
      
      for (const c of sp.stationxml.allChannels(networkList)) {
        let sdd = sp.seismogram.SeismogramDisplayData.fromChannelAndTimeWindow(
          c,
          timeWindow,
        );
        sdd.addQuake(q);
        seismogramDataList.push(sdd);
      }
    }
    mymap.seisData = seismogramDataList;

  })
  .catch(function (error) {
    const div = document.querySelector("div#mapContainer"); 
    div.innerHTML = `
    <p>Error cargando datos de Eventos/Estaciones. ${error}</p>
  `;
    console.assert(false, error);
  });