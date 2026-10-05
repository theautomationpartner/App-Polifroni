/**
 * Lectura con Claude de la orden de HETMO de una OP de PVC, vía `/api/hetmo`.
 *
 * El PDF va directo desde la app, sin esperar a que exista la OP en Monday. Viaja como bytes crudos
 * —no en base64, que pesa un tercio más—: un archivo que pasó `prepararArchivoParaSubir` entra en el
 * tope de 4,5 MB de Vercel. El base64 lo arma el servidor, en el pedido a Anthropic.
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'
import type { LecturaHetmo, ModoLectura } from '@/lib/lecturaHetmo'

export { aAberturasOp, aVidriosOp, type LecturaHetmo, type ModoLectura } from '@/lib/lecturaHetmo'

/** La lectura no salió: el mensaje es para mostrarlo tal cual. */
export class ErrorLecturaIA extends Error {}

/* La lectura con razonamiento de un listado largo puede pasar el minuto. El servidor corta a los
   5 minutos; acá se espera un poco menos para poder decirlo con palabras. */
const ESPERA_MS = 280_000

export async function leerHetmo(pdf: Blob, modo: ModoLectura): Promise<LecturaHetmo> {
  let r: Response
  try {
    r = await fetch(`/api/hetmo?modo=${modo}`, {
      method: 'POST',
      /* octet-stream: Vercel entrega el cuerpo como Buffer, sin intentar interpretarlo. */
      headers: await cabecerasPropias({ 'content-type': 'application/octet-stream' }),
      body: pdf,
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (e) {
    throw new ErrorLecturaIA(
      e instanceof DOMException && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en leer el documento. Probá de nuevo.'
        : 'No se pudo hablar con el servidor que lee el documento.',
    )
  }
  /* Un rechazo de la capa de acceso lo resuelve el manejo de siempre (segundo factor, permisos). */
  if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Lectura de HETMO')
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
    throw new ErrorLecturaIA(cuerpo.error || `No se pudo procesar el documento (HTTP ${r.status}).`)
  }
  const datos = (await r.json()) as Partial<LecturaHetmo>
  return {
    observaciones: Array.isArray(datos.observaciones) ? datos.observaciones : [],
    vidrios: Array.isArray(datos.vidrios) ? datos.vidrios : [],
  }
}

/** La lectura completa del listado, la que arma la OP final (`armarDatosOp`). */
export interface LecturaListado {
  numeroListado: string | null
  version: string | null
  paginas: unknown[]
}

/**
 * Lee el listado completo de HETMO para armar la OP final. Es una sola llamada, más larga que la de
 * los vidrios: trae cada modelo con sus medidas, vidrios, tapajuntas y dónde está su dibujo.
 */
export async function leerListado(pdf: Blob): Promise<LecturaListado> {
  let r: Response
  try {
    r = await fetch('/api/hetmo?modo=listado', {
      method: 'POST',
      headers: await cabecerasPropias({ 'content-type': 'application/octet-stream' }),
      body: pdf,
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (e) {
    throw new ErrorLecturaIA(
      e instanceof DOMException && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en leer el documento. Probá de nuevo.'
        : 'No se pudo hablar con el servidor que lee el documento.',
    )
  }
  if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Lectura de HETMO')
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
    throw new ErrorLecturaIA(cuerpo.error || `No se pudo procesar el documento (HTTP ${r.status}).`)
  }
  const datos = (await r.json()) as Partial<LecturaListado>
  if (!Array.isArray(datos.paginas) || datos.paginas.length === 0) {
    throw new ErrorLecturaIA('La IA no encontró modelos en el documento. Revisá que sea el listado de HETMO.')
  }
  return { numeroListado: datos.numeroListado ?? null, version: datos.version ?? null, paginas: datos.paginas }
}
