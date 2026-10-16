/**
 * Serverless Function (Vercel) — el robot de Tempoglass (ver `api/_tempoglass.ts`).
 *
 *   POST {
 *     nombre: "IDOP-053 - PVC 2282",            la obra, con su nombre EXACTO en Tempoglass
 *     ubicacion: "Av. Marconi 1155",            para crearla allá si no existe (puede ir vacía)
 *     comentario: "…", fecha: "2026-10-22",     la cabecera del pedido
 *     archivo: { nombre, base64 },              la planilla con el formato de Tempoglass
 *     esperado: { renglones, piezas },          lo que tiene que quedar cargado
 *     retomar?: { pedido, obra, idIntObra }     un pedido que ya se creó: se sigue, no se crea otro
 *   }
 *
 * Responde EN VIVO, una línea JSON por paso (NDJSON), para que la pantalla diga por dónde va:
 * `sesion`, `logueado`, `buscando`, `obraSeleccionada`, `creandoPedido`, `pedidoCreado`,
 * `importando`, `importado`, `cerrando`, `reintentando`; y al final
 *   { "etapa": "fin", "ok": true, obra, idIntObra, pedido, renglones }
 *   { "etapa": "error", "paso": "…", "mensaje": "…" }
 *
 * La sesión de Tempoglass vive sólo acá: al navegador le llegan los avisos, nunca las cookies.
 *
 * Sólo admin: la solicitud de cortes de vidrio, desde donde se llama, es una operación del admin.
 */
import type { ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { autorizarPedido, respuestaDeError } from './_guard.js'
import { deviceTokenDe, leerJson, responderJson, type Pedido } from './_http.js'
import { cargarPedidoTempoglass, ErrorTempoglass, type DatosCargaPedido, type ObraTempoglass } from './_tempoglass.js'

/** Una planilla de pedido son kilobytes: más de 2 MB no es una planilla de cortes. */
const MAX_ARCHIVO = 2 * 1024 * 1024

const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)
const entero = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100_000 ? v : null)

/** El cuerpo, validado campo por campo. `null` si algo falta o no tiene la forma esperada. */
export function leerDatos(c: Record<string, unknown>): DatosCargaPedido | null {
  const nombre = texto(c.nombre, 120)
  /* La ubicación puede venir vacía: la obra de Monday puede no tenerla cargada. */
  const ubicacion = typeof c.ubicacion === 'string' ? c.ubicacion.trim().slice(0, 255) : ''
  const comentario = texto(c.comentario, 500)
  const fecha = typeof c.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null
  const a = (c.archivo ?? {}) as Record<string, unknown>
  const nombreArchivo = texto(a.nombre, 150)
  const base64 = typeof a.base64 === 'string' ? a.base64 : ''
  const datos = Buffer.from(base64, 'base64')
  const e = (c.esperado ?? {}) as Record<string, unknown>
  const renglones = entero(e.renglones)
  const piezas = entero(e.piezas)
  if (!nombre || !comentario || !fecha || !nombreArchivo || !datos.length || datos.length > MAX_ARCHIVO || !renglones || !piezas) {
    return null
  }

  let retomar: DatosCargaPedido['retomar']
  if (c.retomar) {
    const r = c.retomar as Record<string, unknown>
    const o = (r.obra ?? {}) as Record<string, unknown>
    const pedido = typeof r.pedido === 'string' && /^\d+$/.test(r.pedido) ? r.pedido : null
    const idIntObra = typeof r.idIntObra === 'string' && /^\d+$/.test(r.idIntObra) ? r.idIntObra : null
    const obra: ObraTempoglass | null =
      typeof o.id === 'string' && typeof o.nombre === 'string' ? { id: o.id, nombre: o.nombre, descripcion: '' } : null
    if (!pedido || !idIntObra || !obra) return null
    retomar = { pedido, idIntObra, obra }
  }

  return { nombre, ubicacion, comentario, fecha, archivo: { nombre: nombreArchivo, datos }, esperado: { renglones, piezas }, retomar }
}

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responderJson(res, 405, { error: 'Method Not Allowed' })

  /* Las capas y el cuerpo, ANTES de abrir el stream: un rechazo tiene que llegar como un error HTTP
     común, no como una línea más. */
  let datos: DatosCargaPedido | null
  try {
    exigirRuta(await autorizarPedido(req.headers.authorization, deviceTokenDe(req)), 'tempoglass')
    datos = leerDatos(await leerJson<Record<string, unknown>>(req))
  } catch (e) {
    if (e instanceof SyntaxError) return responderJson(res, 400, { error: 'Bad Request' })
    const { status, cuerpo } = respuestaDeError(e)
    return responderJson(res, status, cuerpo)
  }
  if (!datos) return responderJson(res, 400, { error: 'faltan datos del pedido' })

  res.statusCode = 200
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.flushHeaders()
  const enviar = (linea: object) => res.write(JSON.stringify(linea) + '\n')

  try {
    const cargado = await cargarPedidoTempoglass(datos, enviar)
    enviar({ etapa: 'fin', ok: true, ...cargado })
  } catch (e) {
    /* Un paso de Tempoglass que no dio lo esperado no es un error de la app: se dice cuál fue. */
    if (e instanceof ErrorTempoglass) {
      enviar({ etapa: 'error', paso: e.paso, mensaje: e.message })
    } else {
      /* Lo que no es de Tempoglass es un bug del robot: se registra entero para encontrarlo. */
      console.error('[tempoglass] falla inesperada del robot', e)
      enviar({ etapa: 'error', paso: 'robot', mensaje: 'Falla inesperada del robot (ver los logs de Vercel).' })
    }
  }
  res.end()
}
