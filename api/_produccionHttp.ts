/**
 * La ruta de `/api/produccion-completada`, sin el guardián: la usa la función de Vercel (que
 * autoriza antes) y el servidor de Vite en desarrollo, donde no hay sesión de Monday que verificar.
 *
 *   POST { ordenId }  → { estado: "Produccion Completada" }
 *
 * Marca una OP como "Produccion Completada" en `🤖Estado OP`. La consulta la escribe el SERVIDOR:
 * el cliente manda sólo el id, así que el team Produccion —que por el proxy no puede escribir nada—
 * puede hacer esto y nada más.
 *
 * Antes de escribir se relee la OP: sólo una "Enviada a Taller" pasa a completada. En cualquier
 * otro estado —también si ya está completada: una orden se finaliza UNA vez— 409 con el estado
 * actual, y no se escribe nada.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mondayServidor } from './_mondayApi.js'

type Pedido = IncomingMessage & { body?: unknown }

const BOARD_ORDENES = '18432207111'
/** `🤖Estado OP`. */
const COL_ESTADO = 'color_mm7g3ta4'
const ETIQUETA_TALLER = 'Enviada a Taller'
export const ETIQUETA_COMPLETADA = 'Produccion Completada'

export async function manejarProduccionCompletada(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })

  let ordenId: string
  try {
    const body = (await leerCuerpo(req)) as { ordenId?: unknown }
    ordenId = String(body.ordenId ?? '').trim()
  } catch {
    return responder(res, 400, { error: 'Bad Request' })
  }
  if (!/^\d{1,20}$/.test(ordenId)) return responder(res, 400, { error: 'Orden inválida.' })

  try {
    const data = await mondayServidor<{
      items?: { id: string; state?: string; board?: { id: string }; column_values?: { text: string | null }[] }[]
    }>(
      `query ($ids: [ID!], $col: [String!]) {
        items(ids: $ids) { id state board { id } column_values(ids: $col) { text } }
      }`,
      { ids: [ordenId], col: [COL_ESTADO] },
    )
    const item = data.items?.[0]
    /* Sólo OP del tablero de órdenes: con un id de otro tablero, esto no escribe nada. */
    if (!item || String(item.board?.id) !== BOARD_ORDENES || item.state === 'deleted' || item.state === 'archived') {
      return responder(res, 404, { error: 'La orden no está en el tablero de órdenes.' })
    }
    const estado = (item.column_values?.[0]?.text ?? '').trim()
    if (estado === ETIQUETA_COMPLETADA) {
      return responder(res, 409, { error: 'La producción de la orden ya fue finalizada.', estado })
    }
    if (estado !== ETIQUETA_TALLER) return responder(res, 409, { error: 'La orden no está enviada al taller.', estado })

    await mondayServidor(
      `mutation ($id: ID!, $valor: String!) {
        change_simple_column_value(board_id: ${BOARD_ORDENES}, item_id: $id, column_id: "${COL_ESTADO}", value: $valor) { id }
      }`,
      { id: ordenId, valor: ETIQUETA_COMPLETADA },
      { escritura: true },
    )
    return responder(res, 200, { estado: ETIQUETA_COMPLETADA })
  } catch (e) {
    console.error('[api/produccion-completada]', e)
    return responder(res, 502, { error: 'No se pudo actualizar la orden en Monday.' })
  }
}

async function leerCuerpo(req: Pedido): Promise<unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  const texto = Buffer.concat(partes).toString('utf8')
  return texto ? JSON.parse(texto) : {}
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}
