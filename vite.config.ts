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
/**
 * La numeración de las OP en local, sin el data store de Make: el mayor N° de PVC y de Aluminio
 * que ya hay en el tablero de órdenes. Contesta con la misma forma que `api/numeracion`.
 */
async function numeracionLocal(
  metodo: string,
  token: string,
  res: import('node:http').ServerResponse,
): Promise<void> {
  res.setHeader('content-type', 'application/json')
  if (metodo === 'POST') {
    res.end(JSON.stringify({ ok: true, local: true }))
    return
  }
  try {
    const pedir = async (query: string, variables: Record<string, unknown> = {}) => {
      const r = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2024-10' },
        body: JSON.stringify({ query, variables }),
      })
      return (await r.json()) as { data?: Record<string, unknown> }
    }
    type Pagina = { cursor: string | null; items: { column_values: { id: string; text: string | null }[] }[] }
    const campos = 'cursor items { column_values(ids: ["numeric_mm7ep0eq", "text_mm7gjg24"]) { id text } }'
    const primera = await pedir(`query { boards(ids: [18432207111]) { items_page(limit: 500) { ${campos} } } }`)
    let pagina = (primera.data?.boards as { items_page: Pagina }[] | undefined)?.[0]?.items_page
    let pvc = 0
    let alu = 0
    for (let n = 0; pagina && n < 20; n++) {
      for (const i of pagina.items) {
        for (const c of i.column_values) {
          const v = Number(String(c.text ?? '').replace(/\D/g, '')) || 0
          if (c.id === 'numeric_mm7ep0eq') pvc = Math.max(pvc, v)
          else alu = Math.max(alu, v)
        }
      }
      if (!pagina.cursor) break
      const sig = await pedir(`query ($c: String!) { next_items_page(limit: 500, cursor: $c) { ${campos} } }`, {
        c: pagina.cursor,
      })
      pagina = sig.data?.next_items_page as Pagina | undefined
    }
    res.end(JSON.stringify({ nroOrdenPVC: String(pvc), nroOrdenAluminio: `A${alu}` }))
  } catch {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'No se pudo calcular la numeración desde el tablero.' }))
  }
}

export default defineConfig(({ mode }) => {
  // Prefijo vacío: también se leen las variables SIN `VITE_`, que se usan sólo acá (nunca en el bundle).
  const env = loadEnv(mode, process.cwd(), '')

  /*
   * En local NO hay respaldo en el deploy. Se probó: las funciones de Vercel exigen la sesión
   * firmada de Monday y la lista blanca, así que un pedido que sale del navegador de la
   * computadora vuelve con 403 ("esta app sólo funciona dentro de monday.com") y la app lo leía
   * como "usuario sin permisos". Lo que corre en local, corre ACÁ:
   *  - los escenarios de Make, con su URL en `.env.local` (sin ella, la app avisa qué falta);
   *  - la numeración, con `MAKE_TOKEN` contra el data store o, sin él, leída del tablero de
   *    órdenes con el token de desarrollo (ver `numeracionLocal`).
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
   * La numeración habla con el data store de Make con un token del servidor: en vez de reescribirla
   * para el navegador, Vite carga el mismo archivo y le pasa el pedido. Lo que se prueba en local es
   * exactamente lo que se despliega.
   */
  const funcionesLocales: Plugin = {
    name: 'api-local',
    configureServer(server) {
      if (env.MAKE_TOKEN) process.env.MAKE_TOKEN = env.MAKE_TOKEN
      server.middlewares.use('/api/numeracion', async (req, res) => {
        /* Sin `MAKE_TOKEN` en `.env.local` no se puede leer el data store de Make: la numeración
           se calcula del tablero de órdenes (el último N° de cada tipo), y registrar un número
           usado no escribe nada —el data store real lo sigue llevando producción—. */
        if (!env.MAKE_TOKEN) {
          await numeracionLocal(req.method ?? 'GET', env.VITE_MONDAY_TOKEN ?? '', res)
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
