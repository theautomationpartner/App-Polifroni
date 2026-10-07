/**
 * Serverless Function (Vercel) — envío de la Orden de Producción por WhatsApp (360messenger), con
 * el PDF compartido desde Google Drive. Reemplaza al escenario de Make de envío al cliente o al
 * constructor: ver `api/_whatsappHttp.ts`.
 *
 * Variables: WHATSAPP_360_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
 * CONFIRMACION_URL, CONFIRMACION_SECRET y, opcional, GOOGLE_DRIVE_FOLDER_ID.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarWhatsapp } from './_whatsappHttp.js'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  /* El guardián antes que nada: firma del session token, lista blanca y segundo factor. */
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'whatsapp')
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(cuerpo))
    return
  }
  await manejarWhatsapp(req, res)
}
