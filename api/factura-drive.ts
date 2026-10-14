/**
 * Serverless Function (Vercel) — guarda el PDF de una factura de obra emitida en el Drive de Polifroni,
 * en <año> / Facturas Obras / <fecha>: ver `api/_facturaDriveHttp.ts`.
 *
 * Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (las mismas del envío de la
 * OP) y, opcional, GOOGLE_DRIVE_FACTURAS_ID (la carpeta "Facturas Obras", para no buscarla).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { manejarFacturaDrive } from './_facturaDriveHttp.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  /* El guardián antes que nada: firma del session token, lista blanca y segundo factor. */
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'facturas')
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarFacturaDrive(req, res)
}
