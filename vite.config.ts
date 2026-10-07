import { defineConfig, loadEnv, type Plugin } from 'vite'
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
 */
export default defineConfig(({ mode }) => {
  // Prefijo vacío: también se leen las variables SIN `VITE_`, que se usan sólo acá (nunca en el bundle).
  const env = loadEnv(mode, process.cwd(), '')

  /*
   * En local NO hay respaldo en el deploy. Se probó: las funciones de Vercel exigen la sesión
   * firmada de Monday y la lista blanca, así que un pedido que sale del navegador de la
   * computadora vuelve con 403 ("esta app sólo funciona dentro de monday.com") y la app lo leía
   * como "usuario sin permisos". Lo que corre en local, corre ACÁ:
   *  - la numeración, contra la MISMA tabla de Neon que producción, con la `DATABASE_URL` de
   *    `.env.local` (ver `funcionesLocales`).
   */

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

      /* La lectura de la orden de HETMO con Claude: recibe el PDF de la app y llama a la API con
         `ANTHROPIC_API_KEY` de `.env.local`. */
      if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
      server.middlewares.use('/api/hetmo', async (req, res) => {
        if (!env.ANTHROPIC_API_KEY) {
          res.statusCode = 503
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Ocurrio un error al intentar procesar el documento con IA. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ERROR_API_KEY_ANTRHOPIC',
            }),
          )
          return
        }
        const mod = await server.ssrLoadModule('/api/_hetmoHttp.ts')
        await mod.manejarHetmo(req, res)
      })

      /* El envío de la OP por WhatsApp (360messenger) con el PDF en Google Drive: la misma ruta que
         en producción, con las claves de `.env.local`. */
      for (const k of [
        'WHATSAPP_360_API_KEY',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REFRESH_TOKEN',
        'GOOGLE_DRIVE_FOLDER_ID',
        'CONFIRMACION_URL',
        'CONFIRMACION_SECRET',
        /* El WhatsApp del taller de fabricación: a donde sale la OP confirmada. */
        'TALLER_WHATSAPP',
      ]) {
        if (env[k]) process.env[k] = env[k]
      }
      /* Completar producción: la misma lógica que la función de Vercel, que escribe con el token
         del servidor. En local, el de desarrollo. */
      const tokenMonday = env.MONDAY_TOKEN || env.VITE_MONDAY_TOKEN
      if (tokenMonday && !process.env.MONDAY_TOKEN) process.env.MONDAY_TOKEN = tokenMonday
      server.middlewares.use('/api/produccion-completada', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_produccionHttp.ts')
        await mod.manejarProduccionCompletada(req, res)
      })

      /* El enlace de confirmación de la OP y del presupuesto: la misma ruta pública que en Vercel
         (allá, `/c/<código>` y `/confirmar` se reescriben a `api/confirmar`). */
      server.middlewares.use('/c/', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_confirmarHttp.ts')
        await mod.manejarConfirmar(req, res)
      })
      server.middlewares.use('/confirmar', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_confirmarHttp.ts')
        await mod.manejarConfirmar(req, res)
      })

      /* Va ANTES de '/api/whatsapp': un mensaje de texto suelto (los avisos de la Agenda). */
      server.middlewares.use('/api/whatsapp-texto', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_whatsappHttp.ts')
        await mod.manejarWhatsappTexto(req, res)
      })
      server.middlewares.use('/api/whatsapp', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_whatsappHttp.ts')
        await mod.manejarWhatsapp(req, res)
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
