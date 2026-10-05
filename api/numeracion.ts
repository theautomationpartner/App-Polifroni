/**
 * Serverless Function (Vercel) — numeración de las Órdenes de Producción.
 *
 * El último número usado de cada tipo vive en la base Postgres (Neon) de la app, tabla
 * `numeracion_op` (ver `db/numeracion.sql` y `api/_numeracion.ts`). Antes vivía en un data store de
 * Make; ya no se usa.
 *
 *   GET   → { nroOrdenPVC, nroOrdenAluminio }                   el último número de cada tipo
 *   POST  { tipo: "PVC" | "Aluminio", reservar: true }          reserva el siguiente → { numero }
 *   POST  { tipo: "PVC" | "Aluminio", numero: "3001" }          deja un número escrito a mano como
 *                                                               usado, sin retroceder el contador
 *
 * La reserva es atómica: dos OP creadas a la vez nunca reciben el mismo número. Sólo se tocan los dos
 * registros de la tabla: la función no recibe ids ni sentencias.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirAdmin } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarNumeracion } from './_numeracionHttp.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  /* El guardián antes que nada: firma del session token, lista blanca y segundo factor. */
  try {
    // Sólo el team Admin: el team Produccion no usa esta ruta.
    exigirAdmin(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)))
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarNumeracion(req, res)
}
