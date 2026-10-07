/**
 * La ruta de `/api/hetmo`, sin el guardián: la usa la función de Vercel (que autoriza antes) y el
 * servidor de Vite en desarrollo. Lo que se prueba en local es la misma lectura que corre en
 * producción.
 *
 *   POST ?modo=aberturas               cuerpo: los bytes del PDF  → { aberturas, vidrios }
 *   POST ?modo=listado                 cuerpo: los bytes del PDF  → { numeroListado, version, paginas }
 *                                      (la lectura completa que arma la OP final)
 *   POST ?modo=edicion                 cuerpo: largo + JSON de las aberturas + PDF del dibujo nuevo
 *                                      → { aberturas } (ver `_hetmoEdicion.ts`)
 *   GET  ?modo=lectura&orden=ID        → { lectura } la lectura guardada de la OP (o null)
 *   POST ?modo=lectura&orden=ID        cuerpo: JSON { lectura } → la guarda (ver `_lecturaOp.ts`)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { ErrorLectura, leerHetmo } from './_hetmo.js'
import { leerEdicion, separarCuerpo } from './_hetmoEdicion.js'
import { leerListado } from './_hetmoListado.js'
import { guardarLecturaOp, idValido, leerLecturaOp } from './_lecturaOp.js'

type Pedido = IncomingMessage & { body?: unknown }

export async function manejarHetmo(req: Pedido, res: ServerResponse): Promise<void> {
  const params = new URL(req.url ?? '/', 'http://local').searchParams
  const pedido = params.get('modo')
  if (pedido === 'lectura') return manejarLectura(req, res, params.get('orden') ?? '')
  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
  try {
    const pdf = await leerBytes(req)
    if (!pdf.length) return responder(res, 400, { error: 'No llegó el documento.' })
    if (pedido === 'listado') return responder(res, 200, await leerListado(pdf))
    if (pedido === 'edicion') {
      const { aberturas, modelosExistentes, pdf: dibujo } = separarCuerpo(pdf)
      return responder(res, 200, await leerEdicion(dibujo, aberturas, modelosExistentes))
    }
    return responder(res, 200, await leerHetmo(pdf))
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

/** La lectura guardada de una OP: leerla (GET) o guardarla (POST, `{ lectura }`). */
async function manejarLectura(req: Pedido, res: ServerResponse, orden: string): Promise<void> {
  if (!idValido(orden)) return responder(res, 400, { error: 'Falta la OP.' })
  try {
    if (req.method === 'GET') return responder(res, 200, { lectura: await leerLecturaOp(orden) })
    if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
    const cuerpo = await leerBytes(req)
    if (cuerpo.length > 2_000_000) return responder(res, 413, { error: 'La lectura es demasiado grande.' })
    const { lectura } = JSON.parse(cuerpo.toString('utf8') || '{}') as { lectura?: unknown }
    if (!lectura || typeof lectura !== 'object') return responder(res, 400, { error: 'Falta la lectura.' })
    await guardarLecturaOp(orden, lectura)
    return responder(res, 200, { ok: true })
  } catch (e) {
    console.error('[api/hetmo] lectura guardada', e)
    return responder(res, 502, { error: 'No se pudo leer o guardar la lectura de la OP en la base.' })
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
