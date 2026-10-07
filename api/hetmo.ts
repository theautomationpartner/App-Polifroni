/**
 * Serverless Function (Vercel) — lectura con Claude de la orden de HETMO de una OP de PVC.
 *
 *   POST ?modo=aberturas               cuerpo: los bytes del PDF  → { aberturas, vidrios }
 *   POST ?modo=listado                 cuerpo: los bytes del PDF  → la lectura para la OP final
 *   POST ?modo=edicion                 el dibujo nuevo y las aberturas a editar → sus datos nuevos
 *   GET|POST ?modo=lectura&orden=ID    la lectura guardada con la que se armó la OP final
 *
 * La app manda el PDF directo, sin pasar por Monday (ver `api/_hetmo.ts`). Necesita
 * `ANTHROPIC_API_KEY` en las variables del proyecto.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exigirAdmin } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe } from './_http.js'
import { manejarHetmo } from './_hetmoHttp.js'

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
  await manejarHetmo(req, res)
}
