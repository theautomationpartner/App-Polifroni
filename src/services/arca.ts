/**
 * La consulta al padrón de ARCA desde la app: pasa por `/api/arca-padron` (la clave del servicio vive sólo
 * en el servidor, ver `api/_arca.ts`). Nunca tira: cualquier problema vuelve como `{ ok: false, mensaje }`,
 * listo para mostrar, porque una consulta que falla no puede frenar un alta (se completa a mano).
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

/** Lo que trae el padrón de un CUIT/CUIL. */
export interface DatosDeArca {
  cuit: string
  razonSocial: string
  /** El código: RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO, CONSUMIDOR_FINAL, NO_ALCANZADO. */
  condicionIva: string
  condicionIvaTexto: string
  domicilio: string
  localidad: string
  provincia: string
  /** ARCA no respondió y el servicio devolvió lo último que sabía. */
  datoViejo: boolean
}

export type RespuestaArca = { ok: true; datos: DatosDeArca } | { ok: false; error: string; mensaje: string }

const SIN_SERVICIO: RespuestaArca = {
  ok: false,
  error: 'sin_conexion',
  mensaje: 'No se pudo consultar ARCA. Completá los datos a mano.',
}

export async function consultarArca(cuit: string): Promise<RespuestaArca> {
  try {
    const r = await fetch('/api/arca-padron', {
      method: 'POST',
      headers: await cabecerasPropias({ 'content-type': 'application/json' }),
      body: JSON.stringify({ cuit }),
      /* Un poco más que lo que espera el servidor a ARCA (8 s). */
      signal: AbortSignal.timeout(15_000),
    })
    if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Consulta a ARCA')
    const cuerpo = (await r.json().catch(() => null)) as RespuestaArca | null
    return r.ok && cuerpo && typeof cuerpo.ok === 'boolean' ? cuerpo : SIN_SERVICIO
  } catch {
    return SIN_SERVICIO
  }
}
