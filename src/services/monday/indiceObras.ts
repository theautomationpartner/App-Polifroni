import { memoGlobal } from './cache'
import { BOARD_OBRAS } from './columns'
import { mondayApi } from './sdk'

/** Una obra del índice del buscador rápido: sólo lo necesario para sugerirla. */
export interface ObraIndice {
  id: string
  nombre: string
}

interface Pagina {
  cursor: string | null
  items: { id: string; name: string }[]
}

/** En desarrollo no hay `/api`: el índice se arma igual, contra Monday por el proxy de Vite. */
async function armarLocal(): Promise<ObraIndice[]> {
  const obras: ObraIndice[] = []
  const d = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query { boards(ids: [${BOARD_OBRAS}]) { items_page(limit: 500) { cursor items { id name } } } }`,
  )
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 10; vuelta++) {
    for (const i of pagina.items) obras.push({ id: i.id, nombre: i.name })
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { id name } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return obras
}

/**
 * El índice de obras (id + nombre), una sola vez por sesión.
 *
 * En producción sale de `/api/obras-indice`, que lo sirve desde la CDN de Vercel y lo refresca el
 * cron cada media hora en horario laboral. Si no se puede bajar, el buscador rápido queda vacío y
 * el botón Buscar sigue yendo a Monday: no se rompe nada, se pierde la sugerencia.
 */
export const getIndiceObras = memoGlobal(async (): Promise<ObraIndice[]> => {
  if (import.meta.env.DEV) return armarLocal()
  const r = await fetch('/api/obras-indice')
  if (!r.ok) throw new Error(`Índice de obras: HTTP ${r.status}`)
  const d = (await r.json()) as { obras?: ObraIndice[] }
  return d.obras ?? []
})
