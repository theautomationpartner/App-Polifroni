/**
 * Serverless Function (Vercel) — "Confirmar" y "Perdido" de Consultar y Gestionar Presupuestos: lo
 * mismo que la respuesta del cliente por el enlace. La lógica vive en `_presupuestoRespuestaHttp.ts`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarRespuestaPresupuesto } from './_presupuestoRespuestaHttp.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  /* El guardián antes que nada: firma, lista blanca, team y segundo factor. Escribe en Monday. */
  let userId: string
  try {
    userId = exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'escribir').userId
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarRespuestaPresupuesto(req, res, userId)
}
