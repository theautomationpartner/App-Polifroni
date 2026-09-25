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

  /**
   * La app ya desplegada. Se usa como respaldo para los escenarios que NO tienen su URL en
   * `.env.local`: en vez de dejar la ruta muerta, el pedido va a `/api/make` del deploy, que sí
   * tiene la variable cargada. Así se prueba el circuito completo en local sin repartir las URLs
   * de los hooks por las máquinas de cada uno.
   *
   * No agrega exposición: esa ruta ya es pública. Se puede apuntar a otro lado con `APP_URL`, y
   * apagar el respaldo poniéndola vacía.
   */
  const desplegada = (env.APP_URL ?? 'https://app-polifroni.vercel.app').trim()

  /* Los escenarios leen el PDF con IA: los 30 s por defecto de http-proxy los cortarían a mitad de
     camino. Acompaña al tope del cliente. */
  const espera = { timeout: 180_000, proxyTimeout: 180_000 }

  /**
   * Un escenario de Make detrás de una ruta del propio origen.
   *
   * Con la URL del hook en `.env.local` se le pega directo. Sin ella, se pasa por la función del
   * deploy. Si tampoco hay deploy configurado, la ruta no existe y la app avisa que falta
   * configurar el escenario.
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

    if (!desplegada) return {}
    return {
      [ruta]: {
        target: desplegada,
        changeOrigin: true,
        rewrite: () => `/api/make?escenario=${escenario}`,
        ...espera,
      },
    }
  }

  /**
   * Las funciones de `api/` que en local tienen que correr TAL CUAL corren en Vercel.
   *
   * La numeración habla con el data store de Make con un token del servidor: en vez de reescribirla
   * para el navegador, Vite carga el mismo archivo y le pasa el pedido. Lo que se prueba en local es
   * exactamente lo que se despliega.
   */
  const funcionesLocales: Plugin = {
    name: 'api-local',
    configureServer(server) {
      if (env.MAKE_TOKEN) process.env.MAKE_TOKEN = env.MAKE_TOKEN
      server.middlewares.use('/api/numeracion', async (req, res) => {
        /* Sin `MAKE_TOKEN` en `.env.local` se usa la función del deploy, que sí lo tiene: igual que
           los escenarios de Make, así se prueba en local sin repartir el token por las máquinas. */
        if (!env.MAKE_TOKEN && desplegada) {
          try {
            const partes: Buffer[] = []
            for await (const trozo of req) partes.push(Buffer.from(trozo))
            const r = await fetch(`${desplegada}/api/numeracion`, {
              method: req.method,
              headers: { 'Content-Type': 'application/json' },
              body: req.method === 'POST' ? Buffer.concat(partes).toString('utf8') : undefined,
            })
            res.statusCode = r.status
            res.setHeader('content-type', 'application/json')
            res.end(await r.text())
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'No se pudo llegar a la numeración del deploy.' }))
          }
          return
        }
        const mod = await server.ssrLoadModule('/api/numeracion.ts')
        await mod.default(req, res)
      })
    },
  }

  return {
    plugins: [react(), funcionesLocales],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5191,
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
