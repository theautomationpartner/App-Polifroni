import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
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

  /*
   * En local NO hay respaldo en el deploy. Se probó: las funciones de Vercel exigen la sesión
   * firmada de Monday y la lista blanca, así que un pedido que sale del navegador de la
   * computadora vuelve con 403 ("esta app sólo funciona dentro de monday.com") y la app lo leía
   * como "usuario sin permisos". Lo que corre en local, corre ACÁ:
   *  - los escenarios de Make, con su URL en `.env.local` (sin ella, la app avisa qué falta);
   *  - la numeración, contra la MISMA tabla de Neon que producción, con la `DATABASE_URL` de
   *    `.env.local` (ver `funcionesLocales`).
   */

  /* Los escenarios leen el PDF con IA: los 30 s por defecto de http-proxy los cortarían a mitad de
     camino. Acompaña al tope del cliente. */
  const espera = { timeout: 180_000, proxyTimeout: 180_000 }

  /**
   * Un escenario de Make detrás de una ruta del propio origen.
   *
   * Con la URL del hook en `.env.local` se le pega directo. Sin ella la ruta no existe (404) y la
   * app avisa qué variable falta, en vez de mandarlo a un lugar que lo va a rechazar.
   */
  const hook = (escenario: string, url: string | undefined): Record<string, ProxyOptions> => {
    const ruta = `/make/${escenario}`
    const limpia = url?.trim()

    if (limpia) {
      return {
        [ruta]: {
          target: new URL(limpia).origin,
          changeOrigin: true,
          rewrite: () => new URL(limpia).pathname,
          ...espera,
        },
      }
    }

    return {}
  }

  /**
   * Las funciones de `api/` que en local tienen que correr TAL CUAL corren en Vercel.
   *
   * La numeración vive en la tabla `numeracion_op` de Neon: Vite carga las mismas rutas que usa la
   * función (`api/_numeracionHttp.ts`) y les pasa el pedido. Sin el guardián, porque en local no hay
   * sesión de Monday que verificar; la tabla es la misma que en producción, así que el número que se
   * ve —y el que se reserva— es el real.
   */
  const funcionesLocales: Plugin = {
    name: 'api-local',
    configureServer(server) {
      const db = env.DATABASE_URL || env.POSTGRES_URL
      if (db) process.env.DATABASE_URL = db
      server.middlewares.use('/api/numeracion', async (req, res) => {
        if (!db) {
          res.statusCode = 503
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Falta DATABASE_URL en .env.local: la numeración vive en la base de Neon. Cargala (la cadena con pooler) y reiniciá npm run dev.',
            }),
          )
          return
        }
        const mod = await server.ssrLoadModule('/api/_numeracionHttp.ts')
        await mod.manejarNumeracion(req, res)
      })
    },
  }

  return {
    plugins: [react(), funcionesLocales],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      /* 5190 y 5191 los usa La Batea en la misma máquina: Polifroni va en el 5192. */
      port: 5192,
      strictPort: true,
      proxy: {
        ...hook('leer-documento', env.MAKE_WEBHOOK_LEER_DOC),
        ...hook('leer-observaciones', env.MAKE_WEBHOOK_LEER_OBSERVACIONES || env.LEER_OBSERVACIONES),
        ...hook('enviar-op-cliente', env.MAKE_WEBHOOK_ENVIAR_OP),
        ...hook('enviar-op-taller', env.MAKE_WEBHOOK_ENVIAR_OP_TALLER),
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
