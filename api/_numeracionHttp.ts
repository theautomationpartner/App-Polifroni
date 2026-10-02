/**
 * Las rutas de `/api/numeracion`, sin el guardián: las usa la función de Vercel (que autoriza antes)
 * y el servidor de Vite en desarrollo, donde no hay sesión de Monday que verificar. Así lo que se
 * prueba en local es la misma lógica, contra la misma tabla, que corre en producción.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { leer, registrar, reservar, type TipoOrden } from './_numeracion.js'

type Pedido = IncomingMessage & { body?: unknown }

export async function manejarNumeracion(req: Pedido, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'GET') return responder(res, 200, await leer())

    if (req.method === 'POST') {
      const body = (await leerCuerpo(req)) as { tipo?: string; numero?: string; reservar?: boolean }
      const tipo: TipoOrden | null = body.tipo === 'PVC' || body.tipo === 'Aluminio' ? body.tipo : null
      if (!tipo) return responder(res, 400, { error: 'Tipo inválido.' })
      if (body.reservar === true) return responder(res, 200, { numero: await reservar(tipo) })
      const numero = String(body.numero ?? '').trim()
      if (!/^A?\d{1,9}$/i.test(numero)) return responder(res, 400, { error: 'Número inválido.' })
      return responder(res, 200, await registrar(tipo, numero))
    }

    return responder(res, 405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('[api/numeracion]', e)
    return responder(res, 502, { error: 'No se pudo leer o escribir la numeración en la base.' })
  }
}

async function leerCuerpo(req: Pedido): Promise<unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  const texto = Buffer.concat(partes).toString('utf8')
  return texto ? JSON.parse(texto) : {}
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}
