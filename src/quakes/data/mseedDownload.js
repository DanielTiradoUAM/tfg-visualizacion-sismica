

/**
 * Exporta los DataRecords a un archivo .mseed binario 
 * extrayendo exactamente el bloque de 512 bytes.
 */
export function exportToMSeed(packetsByChannel, station) {
  console.group("💾 Generando MiniSEED para Snuffler");

  if (!packetsByChannel) {
      console.error("❌ No hay paquetes");
      console.groupEnd();
      return;
  }

  const binaryRecords = [];
  let totalPackets = 0;

  for (const [channelCode, packets] of Object.entries(packetsByChannel)) {
      console.log(`📦 Procesando ${channelCode}: ${packets.length} paquetes`);

      packets.forEach((rec, index) => {
          try {
              // 1. Validar que tenemos el buffer y el header
              if (!rec.data || !rec.data.buffer || !rec.header) return;

              const { recordSize, dataOffset } = rec.header;
              const { byteOffset, buffer } = rec.data;

              // 2. Calcular el inicio real del paquete MiniSEED (Header + Data)
              // Si los datos empiezan en 164 y el offset dentro del header es 64,
              // el header empieza en 100.
              const startOfRecord = byteOffset - dataOffset;

              // 3. Extraer exactamente el tamaño del registro (512 bytes)
              if (startOfRecord >= 0 && (startOfRecord + recordSize) <= buffer.byteLength) {
                  const recordBuffer = buffer.slice(startOfRecord, startOfRecord + recordSize);
                  binaryRecords.push(recordBuffer);
                  totalPackets++;
              } else {
                  console.warn(`⚠️ Paquete ${index} fuera de límites. Start: ${startOfRecord}`);
              }

          } catch (err) {
              console.error(`💥 Error en paquete ${index} de ${channelCode}:`, err);
          }
      });
  }

  if (binaryRecords.length === 0) {
      console.error("❌ No se pudo extraer ningún bloque válido.");
      console.groupEnd();
      return;
  }

  // 4. Crear el Blob binario
  const blob = new Blob(binaryRecords, { type: "application/octet-stream" });
  
  // 5. Descargar
  const filename = `${station?.networkCode || 'OD'}.${station?.stationCode || 'MNTS0'}.mseed`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }, 100);

  console.log(`✅ Finalizado: ${totalPackets} paquetes guardados en ${filename}`);
  console.groupEnd();
}