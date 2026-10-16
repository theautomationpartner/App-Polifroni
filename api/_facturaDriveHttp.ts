/**
 * La ruta de `/api/factura-drive`, sin el guardián: la usa la función de Vercel (que autoriza antes) y
 * el servidor de Vite en desarrollo.
 *
 *   POST multipart/form-data
 *     archivo  el PDF del comprobante emitido (el que devolvió ARCA)
 *     fecha    "2026-10-14": la carpeta del día
 *
 *   200 { id, webViewLink, ruta, yaEstaba }
 *   4xx/5xx { mensajeError }
 *
 * Guarda la factura de obra en el Drive de Polifroni, en <año> / Facturas Obras / <fecha> (ver
 * `guardarFacturaObra`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ErrorDrive, ErrorTokenDrive, driveConfigurado, guardarFacturaObra } from './_drive.js'

type Pedido = IncomingMessage & { body?: unknown }

/** Un PDF de ARCA pesa unos 30 KB: 10 MB es de sobra y frena cualquier otra cosa. */
const MAX_BYTES = 10 * 1024 * 1024

export async function manejarFacturaDrive(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { mensajeError: 'Method Not Allowed' })
  if (!driveConfigurado()) {
    return responder(res, 503, {
      mensajeError: 'No se pudo guardar la factura en Drive. Contactate con el soporte de TAP, CODIGO: ERROR_CREDENCIALES_GOOGLE_DRIVE',
    })
  }
  try {
    const partes: Buffer[] = []
    for await (const trozo of req) partes.push(Buffer.from(trozo))
    let cuerpo: Buffer = Buffer.concat(partes)
    if (!cuerpo.length && Buffer.isBuffer(req.body)) cuerpo = req.body
    const form = await new Response(new Uint8Array(cuerpo), {
      headers: { 'content-type': String(req.headers['content-type'] ?? '') },
    }).formData()

    const archivo = form.get('archivo')
    const fecha = String(form.get('fecha') ?? '').trim()
    if (!(archivo instanceof Blob) || !archivo.size) return responder(res, 400, { mensajeError: 'No llegó el PDF de la factura.' })
    if (archivo.size > MAX_BYTES) return responder(res, 413, { mensajeError: 'El PDF de la factura es demasiado grande.' })
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    /* Sólo PDF: "%PDF" al principio. */
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      return responder(res, 400, { mensajeError: 'El archivo de la factura no es un PDF.' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return responder(res, 400, { mensajeError: 'Falta la fecha de la factura.' })
    const nombre = (archivo instanceof File && archivo.name ? archivo.name : 'Factura.pdf').replace(/[\/]/g, '-')

    return responder(res, 200, await guardarFacturaObra(bytes, nombre, fecha))
  } catch (e) {
    console.error('[api/factura-drive]', e)
    const codigo = e instanceof ErrorTokenDrive ? 'ERROR_TOKEN_GOOGLE_DRIVE' : e instanceof ErrorDrive ? 'ERROR_GOOGLE_DRIVE' : 'ERROR_INTERNO'
    return responder(res, 502, {
      mensajeError: `No se pudo guardar la factura en el Drive de Polifroni. Contactate con el soporte de TAP, CODIGO: ${codigo}`,
      detalle: e instanceof Error ? e.message : '',
    })
  }
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}
