/**
 * Serverless Function (Vercel) — proxy de la API GraphQL de Monday.
 *
 * El navegador pega contra `/api/monday` (mismo origen, sin CORS) y esta función reenvía a
 * https://api.monday.com/v2 poniendo el token desde `MONDAY_TOKEN`, una variable de entorno del
 * SERVIDOR (sin prefijo `VITE_`). Ésa es toda la razón de que exista: con `VITE_MONDAY_TOKEN` el
 * token queda escrito dentro del JavaScript que se descarga el navegador, y cualquiera que abra la
 * página puede leerlo y usarlo contra los tableros.
 *
 * Equivale al proxy de Vite (`/monday-api`), que sólo existe mientras corre `npm run dev`.
 *
 * ── Lo que todavía NO tiene ──
 * No hay autenticación de usuario: quien llegue a la URL del deploy puede usar esta ruta. Hasta que
 * esa capa exista, el deploy tiene que estar protegido (Vercel → Settings → Deployment Protection).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_VERSION = '2024-10'

/** El cuerpo puede venir ya parseado por el runtime: con `application/json`, siempre lo está. */
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

  try {
    /* El cuerpo se reenvía tal cual (query + variables). La Authorization que haya mandado el
       cliente NO se usa: contra Monday sólo vale el token del servidor. */
    const body = await leerCuerpo(req)
    const upstream = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    /* El detalle queda en el log de la función; al cliente le llega el aviso, no las tripas. */
    console.error('[api/monday]', e)
    responder(res, 502, { errors: [{ message: 'No se pudo hablar con la API de Monday.' }] })
  }
}

/** El cuerpo crudo, tal como lo mandó el cliente. Con JSON el runtime ya lo parseó: se rearma. */
async function leerCuerpo(req: Pedido): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)

  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  return Buffer.concat(partes).toString('utf8')
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
