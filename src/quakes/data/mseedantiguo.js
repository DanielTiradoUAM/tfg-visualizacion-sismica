export function downloadMSeed(packetsByChannel, quake, station) {
    console.group("🚀 DEBUG PROFUNDO: downloadMSeed");
  
    if (!packetsByChannel) {
      console.error("❌ ERROR: packetsByChannel es null o undefined");
      console.groupEnd();
      return;
    }
  
    const channels = Object.keys(packetsByChannel);
    console.log(`📡 Canales detectados: ${channels.join(", ")}`);
  
    const binaryBuffers = [];
    let totalBytes = 0;
  
    for (const [channelCode, packets] of Object.entries(packetsByChannel)) {
      console.group(`🎚️ Analizando Canal: ${channelCode} (${packets.length} paquetes)`);
  
      packets.forEach((rec, index) => {
        console.groupCollapsed(`📦 Paquete [${index}]`);
        
        // 1. Verificar existencia de datos
        if (!rec) { console.error("❌ El registro es null"); console.groupEnd(); return; }
        if (!rec.data) { console.error("❌ rec.data no existe"); console.groupEnd(); return; }
        
        const dv = rec.data; // Esto es el DataView
        console.log("📏 Propiedades del DataView:", {
          byteOffset: dv.byteOffset,
          byteLength: dv.byteLength,
          bufferSize: dv.buffer ? dv.buffer.byteLength : 'N/A'
        });
  
        try {
          // 2. Extraer el buffer
          const recordBuffer = dv.buffer.slice(
            dv.byteOffset,
            dv.byteOffset + dv.byteLength
          );
  
          // 3. INSPECCIÓN BINARIA (La prueba de fuego)
          // Vamos a ver los primeros 12 bytes para ver si hay un header MiniSEED
          const uint8 = new Uint8Array(recordBuffer);
          let hexPreview = "";
          let asciiPreview = "";
          for (let i = 0; i < Math.min(12, uint8.length); i++) {
            hexPreview += uint8[i].toString(16).padStart(2, '0') + " ";
            asciiPreview += (uint8[i] >= 32 && uint8[i] <= 126) ? String.fromCharCode(uint8[i]) : ".";
          }
  
          console.log(`🧬 Preview Binario (Hex): ${hexPreview}`);
          console.log(`🔤 Preview Binario (ASCII): ${asciiPreview}`);
  
          // Verificación de integridad: Un MiniSEED real suele empezar con 6 dígitos
          if (!/^\d{6}/.test(asciiPreview)) {
            console.warn("⚠️ AVISO: Los primeros 6 bytes no parecen una secuencia MiniSEED estándar (000001, etc)");
          }
  
          binaryBuffers.push(recordBuffer);
          totalBytes += recordBuffer.byteLength;
  
        } catch (err) {
          console.error("💥 Error crítico al procesar buffer:", err);
        }
        
        console.groupEnd();
      });
      console.groupEnd();
    }
  
    console.log(`📊 Resumen final: ${binaryBuffers.length} bloques, ${totalBytes} bytes totales.`);
  
    if (binaryBuffers.length === 0) {
      console.error("❌ No hay nada que descargar.");
      console.groupEnd();
      return;
    }
  
    // 4. Generar Archivo
    try {
      const blob = new Blob(binaryBuffers, { type: "application/octet-stream" });
      const filename = `${station?.networkCode || 'NET'}.${station?.stationCode || 'STA'}.mseed`;
  
      console.log(`💾 Generando Blob de tipo: ${blob.type}, tamaño: ${blob.size}`);
  
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log("🏁 Proceso de descarga finalizado y URL liberada.");
      }, 200);
  
    } catch (err) {
      console.error("💥 Fallo al crear el Blob o disparar la descarga:", err);
    }
  
    console.groupEnd();
  }
  
  /**
   * Descarga un conjunto de paquetes MiniSEED ya recibidos
   *
   * packetsByChannel:
   * {
   *   Z: [MiniSeedRecord, ...],
   *   N: [...],
   *   E: [...]
   * }
   */
  export function downloadMiniSeedFile(packetsByChannel, fileName) {
    
    console.log("🚀 downloadMiniSeedFile llamado");
    console.log("📦 packetsByChannel recibido:", packetsByChannel);
  
    if (!fileName) {
      fileName = "waveform.mseed";
    }
  
    if (!packetsByChannel) {
      console.warn("⚠️ packetsByChannel es null o undefined");
      return;
    }
  
    const channelKeys = Object.keys(packetsByChannel);
  
    if (channelKeys.length === 0) {
      console.warn("⚠️ packetsByChannel está vacío");
      return;
    }
  
    const allPackets = [];
    let totalRecords = 0;
    let totalBytes = 0;
  
    for (const channel of channelKeys) {
      const channelPackets = packetsByChannel[channel];
  
      if (!channelPackets || channelPackets.length === 0) continue;
  
      console.log(`📈 ${channel} contiene ${channelPackets.length} registros`);
  
      for (let i = 0; i < channelPackets.length; i++) {
        const rec = channelPackets[i];
  
        if (!rec) continue;
  
        let uint8 = null;
  
        // 1️⃣ Ya es Uint8Array
        if (rec instanceof Uint8Array) {
          uint8 = rec;
        }
  
        // 2️⃣ Es ArrayBuffer
        else if (rec instanceof ArrayBuffer) {
          uint8 = new Uint8Array(rec);
        }
  
        // 3️⃣ Es DataView
        else if (rec instanceof DataView) {
          uint8 = new Uint8Array(
            rec.buffer,
            rec.byteOffset,
            rec.byteLength
          );
        }
  
        // 4️⃣ Es DataRecord con .data (DataView)
        else if (rec.data instanceof DataView) {
          const dv = rec.data;
          uint8 = new Uint8Array(
            dv.buffer,
            dv.byteOffset,
            dv.byteLength
          );
        }
  
        else {
          console.warn(
            `⚠️ Tipo no soportado en ${channel}[${i}]:`,
            rec.constructor?.name
          );
          continue;
        }
  
        console.log(
          `📦 Tamaño registro ${channel}[${i}]: ${rec.byteLength} bytes`
        );
  
        totalBytes += rec.byteLength;
        totalRecords++;
        allPackets.push(rec);
      }
    }
  
    console.log("📊 Total registros válidos:", totalRecords);
    console.log("📊 Total bytes acumulados:", totalBytes);
  
    if (totalBytes === 0) {
      console.warn("⚠️ Todos los registros están vacíos");
      return;
    }
  
    const blob = new Blob(allPackets, {
      type: "application/octet-stream",
    });
  
    console.log("Blob size:", blob.size, "bytes");
  
    const url = URL.createObjectURL(blob);
  
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
  
    document.body.appendChild(a);
    a.click();
  
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  
    console.log("✅ Descarga finalizada");
  }
  
  
  