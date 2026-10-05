/**
 * Serverless Function (Vercel) — un mensaje de texto por WhatsApp (360messenger): los avisos de la
 * Agenda. Ver `manejarWhatsappTexto` en `api/_whatsappHttp.ts`. Necesita WHATSAPP_360_API_KEY.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirAdmin } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarWhatsappTexto } from './_whatsappHttp.js'

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
  await manejarWhatsappTexto(req, res)
}
