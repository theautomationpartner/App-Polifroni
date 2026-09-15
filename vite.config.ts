import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Configuración del entorno LOCAL.
 *
 * Todo lo que necesita un secreto o rompe con CORS pasa por el proxy de Vite, así el navegador
 * siempre pega contra su propio origen:
 *  - `/monday-api`       → api.monday.com/v2            (GraphQL)
 *  - `/monday-api-file`  → api.monday.com/v2/file       (subida de archivos a columnas file)
 *  - `/monday-files`     → bucket S3 de Monday          (bytes de los PDF; S3 no manda CORS)
 *  - `/make/<escenario>` → webhooks de Make             (el hook no responde con cabeceras CORS)
 */
export default defineConfig(({ mode }) => {
  // Prefijo vacío: también se leen las variables SIN `VITE_`, que se usan sólo acá (nunca en el bundle).
  const env = loadEnv(mode, process.cwd(), '')

  /** Un webhook de Make detrás de una ruta del propio origen. Sin URL configurada, la ruta no existe. */
  const hook = (ruta: string, url: string | undefined): Record<string, ProxyOptions> => {
    const limpia = url?.trim()
    if (!limpia) return {}
    return {
      [ruta]: {
        target: new URL(limpia).origin,
        changeOrigin: true,
        rewrite: () => new URL(limpia).pathname,
        /* Los escenarios leen el PDF con IA: los 30 s por defecto de http-proxy los cortarían a
           mitad de camino. Acompaña al tope del cliente. */
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5191,
      strictPort: true,
      proxy: {
        ...hook('/make/leer-documento', env.MAKE_WEBHOOK_LEER_DOC),
        ...hook('/make/enviar-op-cliente', env.MAKE_WEBHOOK_ENVIAR_OP),
        ...hook('/make/enviar-op-taller', env.MAKE_WEBHOOK_TALLER),
        /* Va ANTES de '/monday-api': Vite matchea por prefijo y '/monday-api-file' también
           empieza con '/monday-api'. */
        '/monday-api-file': {
          target: 'https://api.monday.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-api-file/, '/v2/file'),
        },
        '/monday-api': {
          target: 'https://api.monday.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-api/, '/v2'),
        },
        '/monday-files': {
          target: 'https://files-monday-com.s3.amazonaws.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-files/, ''),
          /* Monday firma la dirección con `response-content-disposition=attachment`, así que S3
             devuelve el PDF como descarga y el visor embebido no muestra nada: el navegador se lo
             lleva al disco. La cabecera se saca acá, en la respuesta, porque el parámetro NO se
             puede quitar del pedido —va dentro de la firma—. Para descargarlo está el enlace
             "Abrir en otra pestaña", que usa la dirección original. */
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['content-disposition']
            })
          },
        },
      },
    },
  }
})
