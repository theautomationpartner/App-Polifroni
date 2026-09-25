/**
 * Serverless Function (Vercel) — numeración de las Órdenes de Producción.
 *
 * El último número usado vive en un data store de Make ("Enumeracion Orden de Produccion FINAL
 * (Obras)", 92748), en UN registro con dos campos: `nroOrdenPVC` ("3000") y `nroOrdenAluminio`
 * ("A3000"). Esta función es el único camino hacia ese registro: el token de Make (`MAKE_TOKEN`)
 * es del servidor y no llega nunca al navegador.
 *
 *   GET   → { nroOrdenPVC, nroOrdenAluminio }            el último número de cada tipo
 *   POST  { tipo: "PVC" | "Aluminio", numero: "3001" }   deja ese número como el último usado
 *
 * El POST no suma a ciegas: vuelve a leer el registro y sólo escribe si el número es MAYOR que el
 * que hay. Así, si dos personas generan a la vez con el mismo número, el contador no retrocede ni
 * salta dos lugares.
 *
 * Sólo se puede tocar ESE registro y esos dos campos: la función no recibe ni ids ni claves.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const ZONA = 'https://us1.make.com/api/v2'
const DATA_STORE = 92748
const CLAVE = '1f0d3b1dc57a'
const CAMPO = { PVC: 'nroOrdenPVC', Aluminio: 'nroOrdenAluminio' } as const

type Pedido = IncomingMessage & { body?: unknown }
type Registro = { nroOrdenPVC?: string; nroOrdenAluminio?: string }

/** "A3001" → 3001, "3001" → 3001. */
const valor = (s: string | undefined): number => Number(String(s ?? '').replace(/\D/g, '')) || 0

async function leer(token: string): Promise<Registro> {
  const r = await fetch(`${ZONA}/data-stores/${DATA_STORE}/data?pg[limit]=100`, {
    headers: { Authorization: `Token ${token}` },
  })
  if (!r.ok) throw new Error(`Make respondió HTTP ${r.status} al leer el data store`)
  const d = (await r.json()) as { records?: { key: string; data: Registro }[] }
  const reg = d.records?.find((x) => x.key === CLAVE)
  if (!reg) throw new Error('No está el registro de la numeración en el data store')
  return reg.data
}

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  const token = process.env.MAKE_TOKEN?.trim()
  if (!token) return responder(res, 500, { error: 'MAKE_TOKEN no está configurado en el servidor.' })

  try {
    if (req.method === 'GET') {
      const reg = await leer(token)
      return responder(res, 200, {
        nroOrdenPVC: reg.nroOrdenPVC ?? '',
        nroOrdenAluminio: reg.nroOrdenAluminio ?? '',
      })
    }

    if (req.method === 'POST') {
      const body = (await leerCuerpo(req)) as { tipo?: string; numero?: string }
      const tipo = body.tipo === 'PVC' || body.tipo === 'Aluminio' ? body.tipo : null
      const numero = String(body.numero ?? '').trim()
      if (!tipo || !/^A?\d{1,9}$/i.test(numero)) {
        return responder(res, 400, { error: 'Tipo o número inválido.' })
      }
      const campo = CAMPO[tipo]
      const actual = await leer(token)
      if (valor(numero) <= valor(actual[campo])) {
        return responder(res, 200, { ...actual, actualizado: false })
      }
      /* Aluminio conserva su "A" adelante, venga o no en lo que mandó la app. */
      const nuevo = tipo === 'Aluminio' ? `A${valor(numero)}` : String(valor(numero))
      const r = await fetch(`${ZONA}/data-stores/${DATA_STORE}/data/${CLAVE}`, {
        method: 'PATCH',
        headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: nuevo }),
      })
      if (!r.ok) throw new Error(`Make respondió HTTP ${r.status} al actualizar el data store`)
      return responder(res, 200, { ...actual, [campo]: nuevo, actualizado: true })
    }

    return responder(res, 405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('[api/numeracion]', e)
    return responder(res, 502, { error: 'No se pudo hablar con el data store de Make.' })
  }
}

async function leerCuerpo(req: Pedido): Promise<unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  const partes: Buffer[] = []
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
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
