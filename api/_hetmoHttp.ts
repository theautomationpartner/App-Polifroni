/**
 * La ruta de `/api/hetmo`, sin el guardián: la usa la función de Vercel (que autoriza antes) y el
 * servidor de Vite en desarrollo. Lo que se prueba en local es la misma lectura que corre en
 * producción.
 *
 *   POST ?modo=vidrios|observaciones   cuerpo: los bytes del PDF  → { observaciones, vidrios }
 *   POST ?modo=listado                 cuerpo: los bytes del PDF  → { numeroListado, version, paginas }
 *                                      (la lectura completa que arma la OP final)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { ErrorLectura, leerHetmo, type ModoLectura } from './_hetmo.js'
import { leerListado } from './_hetmoListado.js'

type Pedido = IncomingMessage & { body?: unknown }

export async function manejarHetmo(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
  try {
    const pdf = await leerBytes(req)
    if (!pdf.length) return responder(res, 400, { error: 'No llegó el documento.' })
    const pedido = new URL(req.url ?? '/', 'http://local').searchParams.get('modo')
    if (pedido === 'listado') return responder(res, 200, await leerListado(pdf))
    const modo: ModoLectura = pedido === 'observaciones' ? 'observaciones' : 'vidrios'
    return responder(res, 200, await leerHetmo(pdf, modo))
  } catch (e) {
    console.error('[api/hetmo]', e)
    if (e instanceof ErrorLectura) return responder(res, e.status, { error: e.message })
    if (e instanceof Anthropic.RateLimitError) {
      return responder(res, 502, { error: 'La IA está saturada en este momento. Probá de nuevo en un minuto.' })
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return responder(res, 503, { error: 'La clave de la API de Claude no es válida.' })
    }
    if (e instanceof Anthropic.APIError) {
      return responder(res, 502, { error: 'La IA no pudo procesar el documento. Probá de nuevo en unos segundos.' })
    }
    return responder(res, 500, { error: 'No se pudo procesar el documento.' })
  }
}

/** El cuerpo, tal cual. Se lee el stream ANTES de tocar `req.body`: en Vercel ese campo es un
    getter que lo consume; si el stream vino vacío, se usa lo que haya dejado. */
async function leerBytes(req: Pedido): Promise<Buffer> {
  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  const cuerpo = Buffer.concat(partes)
  return !cuerpo.length && Buffer.isBuffer(req.body) ? req.body : cuerpo
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}
