import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

/** Lo que dejó la factura en el Drive de Polifroni. */
export interface FacturaEnDrive {
  id: string
  webViewLink: string
  /** "2026 / Facturas Obras / 2026-10-14". */
  ruta: string
  yaEstaba: boolean
}

/**
 * Guarda el PDF de la factura de obra emitida en el Drive de Polifroni, en <año> / Facturas Obras /
 * <fecha> (`/api/factura-drive`). La carpeta del día la crea el servidor si no existe; un reintento no
 * sube el archivo dos veces.
 */
export async function guardarFacturaEnDrive(pdf: File, fecha: string): Promise<FacturaEnDrive> {
  const form = new FormData()
  form.append('archivo', pdf, pdf.name || 'Factura.pdf')
  form.append('fecha', fecha)
  const r = await fetch('/api/factura-drive', {
    method: 'POST',
    /* Sin Content-Type a mano: el navegador lo pone con su boundary. */
    headers: await cabecerasPropias(),
    body: form,
    signal: AbortSignal.timeout(90_000),
  })
  if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Guardar la factura en Drive')
  const cuerpo = (await r.json().catch(() => ({}))) as Partial<FacturaEnDrive> & { mensajeError?: string; detalle?: string }
  if (!r.ok || !cuerpo.id) {
    if (cuerpo.detalle) console.warn('[factura-drive]', cuerpo.detalle)
    throw new Error(cuerpo.mensajeError || 'No se pudo guardar la factura en el Drive de Polifroni.')
  }
  return cuerpo as FacturaEnDrive
}
