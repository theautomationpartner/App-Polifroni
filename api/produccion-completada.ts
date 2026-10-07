/**
 * Serverless Function (Vercel) — "Completar producción de órdenes": marca una OP enviada al taller
 * como "Produccion Completada". La lógica vive en `_produccionHttp.ts`.
 *
 * Pueden usarla los teams Admin y Produccion: es la única escritura que tiene el team Produccion
 * (ver `_equipos.ts` y el bloqueo de mutaciones en `monday.ts`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarProduccionCompletada } from './_produccionHttp.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  /* El guardián antes que nada: firma, lista blanca, team y segundo factor. Y sólo Admin y
     Produccion finalizan: pasar el guardián no alcanza, cualquier team entra a la app. */
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'finalizar')
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarProduccionCompletada(req, res)
}
