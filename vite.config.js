// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/tfg-visualizacion-sismica/', 
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        station: resolve(__dirname, 'station.html'),
      },
    },
  },
  
  server: {
    proxy: {
      // 1. Proxy para las peticiones FDSN (HTTP/S)
      //    Ruta: /fdsn-seismo -> http://seismo.ii.uam.es
      '/fdsn-seismo': {
        target: 'http://seismo.ii.uam.es', 
        changeOrigin: true,
        secure: false,
        // Eliminamos el prefijo /fdsn-seismo al pasar al target
        rewrite: (path) => path.replace(/^\/fdsn-seismo/, ''), 
        ws: false, // Esto es tráfico HTTP normal
      },

      // 2. Proxy para la conexión DataLink (WebSocket)
      //    Ruta: /datalink-ws -> ws://live.openseismometer.net:18000
      '/datalink-ws': {
        target: 'ws://live.openseismometer.net:18000', // ws://seedlink.openseismometer.net:18000 un subdominio para esto y otro para la web
        changeOrigin: true,
        secure: false, // Conectando a un endpoint ws:// no seguro
        ws: true, // CLAVE: Habilitar el proxy para WebSockets
        // La ruta /datalink-ws se reescribirá al path real del servicio DataLink (/datalink)
        rewrite: (path) => path.replace(/^\/datalink-ws/, '/datalink'),
      },
    },
  },
});
