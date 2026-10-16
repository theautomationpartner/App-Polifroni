/**
 * Serverless Function (Vercel) — el robot de Tempoglass (ver `api/_tempoglass.ts`).
 *
 *   POST { nombre: "IDOP-053 - PVC 2282" }
 *
 * Responde EN VIVO, una línea JSON por paso (NDJSON), para que la pantalla diga por dónde va:
 *
 *   { "etapa": "sesion" }                                 iniciando sesión
 *   { "etapa": "logueado" }                               entró
 *   { "etapa": "buscando", "nombre": "…" }                en Obras, escribiendo en el buscador
 *   { "etapa": "fin", "ok": true, buscado, resultados, encontrada }
 *   { "etapa": "error", "paso": "login", "mensaje": "…" } Tempoglass no respondió lo esperado
 *
 * La sesión de Tempoglass vive sólo acá: al navegador le llegan los avisos, nunca las cookies.
 * Por ahora sólo BUSCA la obra: no crea ni cambia nada en Tempoglass.
 *
 * Sólo admin: la solicitud de cortes de vidrio, desde donde se llama, es una operación del admin.
 */
import type { ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe, leerJson, responderJson, type Pedido } from './_http.js'
import { buscarObraTempoglass, ErrorTempoglass } from './_tempoglass.js'

interface Cuerpo {
  nombre?: unknown
}

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responderJson(res, 405, { error: 'Method Not Allowed' })

  /* Las capas y el cuerpo, ANTES de abrir el stream: un rechazo tiene que llegar como un error HTTP
     común, no como una línea más. */
  let nombre: string
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'tempoglass')
    const cuerpo = await leerJson<Cuerpo>(req)
    nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : ''
  } catch (e) {
    if (e instanceof SyntaxError) return responderJson(res, 400, { error: 'Bad Request' })
    const { status, cuerpo } = respuestaDeError(e)
    return responderJson(res, status, cuerpo)
  }
  if (!nombre || nombre.length > 120) return responderJson(res, 400, { error: 'falta el nombre de la obra' })

  res.statusCode = 200
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.flushHeaders()
  const enviar = (linea: object) => res.write(JSON.stringify(linea) + '\n')

  try {
    const busqueda = await buscarObraTempoglass(nombre, enviar)
    enviar({ etapa: 'fin', ok: true, ...busqueda })
  } catch (e) {
    /* Un paso de Tempoglass que no dio lo esperado no es un error de la app: se dice cuál fue. */
    if (e instanceof ErrorTempoglass) {
      enviar({ etapa: 'error', paso: e.paso, mensaje: e.message })
    } else {
      console.warn('[tempoglass] falla inesperada', e)
      enviar({ etapa: 'error', paso: 'conexion', mensaje: 'Tempoglass no respondió.' })
    }
  }
  res.end()
}
