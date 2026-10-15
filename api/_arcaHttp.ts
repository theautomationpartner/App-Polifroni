/**
 * La ruta de `/api/arca-padron`, sin el guardián: la usa la función de Vercel (que autoriza antes) y el
 * servidor de Vite en desarrollo.
 *
 *   POST { cuit }  → { ok: true, datos } | { ok: false, error, mensaje }
 *
 * Un CUIT mal armado es un 400 y no gasta una consulta. Los problemas de ARCA (no encontrado, caído,
 * sin clave) vuelven como 200 con `ok: false`: la pantalla los muestra y deja completar a mano.
 */
import type { ServerResponse } from 'node:http'
import { consultarPadron } from './_arca.js'
import { leerJson, responderJson, type Pedido } from './_http.js'

export async function manejarArcaPadron(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responderJson(res, 405, { error: 'Method Not Allowed' })
  let cuit: string
  try {
    cuit = String(((await leerJson<{ cuit?: unknown }>(req)).cuit ?? '')).replace(/\D/g, '')
  } catch {
    return responderJson(res, 400, { error: 'Bad Request' })
  }
  if (cuit.length !== 11) return responderJson(res, 400, { error: 'Bad Request' })
  responderJson(res, 200, await consultarPadron(cuit, process.env.ARCA_API_KEY))
}
