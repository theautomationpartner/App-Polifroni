/**
 * Serverless Function (Vercel) — índice de obras para el buscador rápido.
 *
 * Devuelve SÓLO el id y el nombre de cada obra: es lo único que el buscador necesita para ir
 * sugiriendo mientras se escribe. Todo lo demás de la obra se lee de Monday recién al elegirla.
 *
 * ── Dónde se guarda ──
 * No hay base de datos. El índice lo guarda la CDN de Vercel: la respuesta sale con
 * `s-maxage=1800` (media hora) y `stale-while-revalidate`, así que durante media hora todos los que
 * abran la app reciben la misma copia sin que esta función ni Monday se enteren, y pasado ese tiempo
 * la siguiente visita recibe la copia vieja al instante mientras la CDN pide una nueva por detrás.
 * Consumo de base: cero.
 *
 * El cron de `vercel.json` la llama cada 30 minutos en el horario de Polifroni (lunes a sábado,
 * 6 a 18 h de Argentina) para que la copia esté siempre tibia en horario laboral. Fuera de ese
 * horario nadie la refresca: una obra dada de alta a la noche aparece a la mañana siguiente, o al
 * instante con el botón Buscar, que sigue consultando Monday directo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_VERSION = '2024-10'
const BOARD_OBRAS = 9617181553
/** Tope de vueltas: 10 × 500 = 5000 obras. El tablero tiene unas 600. */
const MAX_PAGINAS = 10

interface Pagina {
  cursor: string | null
  items: { id: string; name: string }[]
}

async function monday<T>(token: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': API_VERSION },
    body: JSON.stringify({ query, variables }),
  })
  const json = (await r.json()) as { data?: T; errors?: { message: string }[] }
  if (!r.ok || json.errors?.length || !json.data) {
    throw new Error(json.errors?.map((e) => e.message).join(' · ') || `HTTP ${r.status}`)
  }
  return json.data
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') return responder(res, 405, { error: 'Method Not Allowed' })

  const token = process.env.MONDAY_TOKEN
  if (!token) return responder(res, 500, { error: 'MONDAY_TOKEN no está configurado.' })

  try {
    const obras: { id: string; nombre: string }[] = []
    const primera = await monday<{ boards: { items_page: Pagina }[] }>(
      token,
      `query { boards(ids: [${BOARD_OBRAS}]) { items_page(limit: 500) { cursor items { id name } } } }`,
      {},
    )
    let pagina: Pagina | undefined = primera.boards[0]?.items_page
    for (let vuelta = 0; pagina && vuelta < MAX_PAGINAS; vuelta++) {
      for (const i of pagina.items) obras.push({ id: i.id, nombre: i.name })
      if (!pagina.cursor) break
      const sig: { next_items_page: Pagina } = await monday(
        token,
        `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { id name } } }`,
        { c: pagina.cursor },
      )
      pagina = sig.next_items_page
    }

    res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    return responder(res, 200, { generado: new Date().toISOString(), obras })
  } catch (e) {
    console.error('[api/obras-indice]', e)
    /* Sin caché: un error no se tiene que quedar media hora en la CDN. */
    res.setHeader('cache-control', 'no-store')
    return responder(res, 502, { error: 'No se pudo leer el tablero de obras.' })
  }
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
