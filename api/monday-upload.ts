/**
 * Serverless Function (Vercel) — proxy de la subida de archivos a Monday.
 *
 * Las columnas `file` no se completan por `column_values`: hay que mandar el binario a
 * https://api.monday.com/v2/file (multipart/form-data). Es el camino por el que se adjunta la
 * Orden ETMO. El token sale de `MONDAY_TOKEN`, igual que en `/api/monday`.
 *
 * El cuerpo se reenvía TAL CUAL, con su `Content-Type` original: ahí viaja el `boundary` del
 * multipart, y sin él la API no puede separar las partes.
 *
 * Equivale al proxy de Vite (`/monday-api-file`) que sólo existe en desarrollo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_VERSION = '2024-10'

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return responder(res, 405, { errors: [{ message: 'Method Not Allowed' }] })
  }

  const token = process.env.MONDAY_TOKEN
  if (!token) {
    return responder(res, 500, {
      errors: [{ message: 'MONDAY_TOKEN no está configurado en el servidor.' }],
    })
  }

  const contentType = req.headers['content-type']
  if (!contentType?.startsWith('multipart/form-data')) {
    return responder(res, 400, {
      errors: [{ message: 'La subida de archivos tiene que ser multipart.' }],
    })
  }

  try {
    /* Se bufferea el cuerpo en lugar de reenviar el stream: son PDF de una obra (archivos chicos) y
       así no se depende del soporte de `duplex: 'half'` del runtime. */
    const body = await leerCuerpo(req)
    const upstream = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: token,
        'API-Version': API_VERSION,
      },
      body,
    })

    const texto = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    res.end(texto)
  } catch (e) {
    console.error('[api/monday-upload]', e)
    responder(res, 502, { errors: [{ message: 'No se pudo subir el archivo a Monday.' }] })
  }
}

/** El cuerpo crudo. El runtime deja el multipart sin tocar, así que casi siempre hay que leer el stream. */
async function leerCuerpo(req: Pedido): Promise<ArrayBuffer> {
  if (Buffer.isBuffer(req.body)) return bytes(req.body)
  if (typeof req.body === 'string') return bytes(Buffer.from(req.body))

  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  return bytes(Buffer.concat(partes))
}

/** La ventana exacta del Buffer: `fetch` sólo declara `ArrayBuffer` como cuerpo binario. */
function bytes(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
