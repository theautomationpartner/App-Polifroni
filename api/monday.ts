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
 * ── El guardián ──
 * Antes de reenviar nada se verifica QUIÉN pide (`_guard.ts`): la firma del session token de Monday,
 * el alta en la lista blanca y el segundo factor. Corre en Node —no en edge— porque `jsonwebtoken`
 * lo necesita.
 *
 * ── El rol ──
 * Quien esté en el team Admin —aunque también esté en otros— pasa cualquier consulta. Sin él (hoy,
 * sólo Produccion) se LEE: una `mutation` se rechaza con 403. Su única escritura —marcar la producción completada— no pasa por
 * acá sino por `/api/produccion-completada`, donde la consulta la escribe el servidor.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { esAdmin } from './_equipos.js'
import { autorizarPedido, respuestaDeError, type Sesion } from './_guard.js'
import { deviceTokenDe } from './_http.js'

const API_VERSION = '2024-10'

/** El cuerpo puede venir ya parseado por el runtime: con `application/json`, siempre lo está. */
type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return responder(res, 405, { errors: [{ message: 'Method Not Allowed' }] })
  }

  /* El guardián antes que nada: firma del session token, lista blanca y segundo factor. Sin él,
     esta ruta sería el token de Monday de Polifroni publicado en internet. */
  let sesion: Sesion
  try {
    sesion = await autorizarPedido(req.headers.authorization, deviceTokenDe(req))
  } catch (e) {
    const { status, cuerpo } = respuestaDeError(e)
    /* El `codigo` es lo que le deja a la pantalla distinguir "no estás habilitado" de "tu sesión
       no vale" de "al servidor le falta una variable". */
    return responder(res, status, {
      errors: [{ message: cuerpo.error }],
      ...(cuerpo.codigo ? { codigo: cuerpo.codigo } : {}),
    })
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
    if (!esAdmin(sesion) && esMutacion(body)) {
      console.warn(`[api/monday] 403 · mutation sin rol admin (${sesion.roles?.join(', ') || 'ninguno'}, usuario ${sesion.userId})`)
      return responder(res, 403, {
        errors: [{ message: 'Forbidden' }],
        codigo: 'operacion_no_permitida',
      })
    }
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

/**
 * ¿El pedido escribe? Se mira la palabra `mutation` en CUALQUIER lugar de la consulta, no sólo al
 * principio: un documento GraphQL puede traer varias operaciones. Un cuerpo ilegible cuenta como
 * mutación: ante la duda, se rechaza.
 */
function esMutacion(body: string): boolean {
  try {
    const { query } = JSON.parse(body) as { query?: unknown }
    return typeof query !== 'string' || /\bmutation\b/i.test(query)
  } catch {
    return true
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
