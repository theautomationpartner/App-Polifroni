/**
 * Serverless Function (Vercel) — `POST /api/arca-padron`: los datos fiscales de un CUIT/CUIL para el
 * alta de clientes y constructores/arquitectos del presupuesto. La lógica vive en `_arcaHttp.ts`.
 *
 * Pasa por acá y no directo a ARCA para que la clave no salga nunca del servidor (ver `_arca.ts`). Es
 * un endpoint de DATOS: sólo contesta a quien entró con su sesión de Monday, está en la lista blanca,
 * pasó el segundo factor y su team puede escribir (el alta termina creando un ítem en Monday).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarArcaPadron } from './_arcaHttp.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'escribir')
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarArcaPadron(req, res)
}
