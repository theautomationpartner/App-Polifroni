/**
 * Lectura con Claude de la orden de HETMO de una OP de PVC, vía `/api/hetmo`.
 *
 * El PDF va directo desde la app, sin esperar a que exista la OP en Monday. Viaja como bytes crudos
 * —no en base64, que pesa un tercio más—: un archivo que pasó `prepararArchivoParaSubir` entra en el
 * tope de 4,5 MB de Vercel. El base64 lo arma el servidor, en el pedido a Anthropic.
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'
import type { LecturaHetmo } from '@/lib/lecturaHetmo'

export { aAberturasOp, aVidriosOp, type LecturaHetmo } from '@/lib/lecturaHetmo'

/** La lectura no salió: el mensaje es para mostrarlo tal cual. */
export class ErrorLecturaIA extends Error {}

/* La lectura con razonamiento de un listado largo puede pasar el minuto. El servidor corta a los
   5 minutos; acá se espera un poco menos para poder decirlo con palabras. */
const ESPERA_MS = 280_000

/** Las aberturas de la orden y sus vidrios, en una sola lectura. */
export async function leerHetmo(pdf: Blob): Promise<LecturaHetmo> {
  let r: Response
  try {
    r = await fetch('/api/hetmo?modo=aberturas', {
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
    aberturas: Array.isArray(datos.aberturas) ? datos.aberturas : [],
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

/** Una abertura a editar, con sus datos actuales en la OP (ver `api/_hetmoEdicion.ts`). */
export interface AberturaAEditar {
  codigo: string
  descripcion: string | null
  color: string | null
  ancho: string | null
  alto: string | null
  cantidad: number | null
  vidrios: unknown[]
  taps: unknown[]
  /** Índices (desde 0) de los vidrios elegidos para editar. */
  vidriosAEditar: number[]
}

/** Lo que la IA leyó del dibujo nuevo para cada abertura pedida. */
export interface LecturaEdicion {
  aberturas: { codigoOriginal: string; encontrada: boolean; modelo: unknown }[]
  /** Las aberturas del dibujo nuevo que la OP todavía no tiene. */
  nuevas: unknown[]
}

/**
 * Edición de una OP: la IA lee el dibujo nuevo de HETMO y devuelve los datos de cada abertura
 * pedida tal como figuran ahí, y las aberturas que el dibujo trae y la OP no tiene (`modelos`: todos
 * los de la OP). El cuerpo es el largo del JSON (4 bytes), el JSON y el PDF crudo.
 */
export async function leerEdicion(pdf: Blob, aberturas: AberturaAEditar[], modelos: string[]): Promise<LecturaEdicion> {
  const json = new TextEncoder().encode(JSON.stringify({ aberturas, modelosExistentes: modelos }))
  const largo = new Uint8Array(4)
  new DataView(largo.buffer).setUint32(0, json.length)
  let r: Response
  try {
    r = await fetch('/api/hetmo?modo=edicion', {
      method: 'POST',
      headers: await cabecerasPropias({ 'content-type': 'application/octet-stream' }),
      body: new Blob([largo, json, pdf]),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (e) {
    throw new ErrorLecturaIA(
      e instanceof DOMException && e.name === 'TimeoutError'
        ? 'La IA tardó demasiado en leer el dibujo nuevo. Probá de nuevo.'
        : 'No se pudo hablar con el servidor que lee el documento.',
    )
  }
  if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Edición de OP')
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
    throw new ErrorLecturaIA(cuerpo.error || `No se pudo procesar el dibujo nuevo (HTTP ${r.status}).`)
  }
  const datos = (await r.json()) as Partial<LecturaEdicion>
  return {
    aberturas: Array.isArray(datos.aberturas) ? datos.aberturas : [],
    nuevas: Array.isArray(datos.nuevas) ? datos.nuevas : [],
  }
}

/**
 * La lectura con la que se armó la OP final de una OP (guardada en la base al generarla o al
 * editarla). `null` si no hay: la OP es anterior, y hay que leer su PDF original.
 */
export async function leerLecturaGuardada(ordenId: string): Promise<unknown | null> {
  const r = await fetch(`/api/hetmo?modo=lectura&orden=${encodeURIComponent(ordenId)}`, {
    headers: await cabecerasPropias(),
  })
  if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Lectura de la OP')
  if (!r.ok) throw new Error(`Lectura guardada: HTTP ${r.status}`)
  return ((await r.json()) as { lectura?: unknown }).lectura ?? null
}

/** Guarda la lectura con la que se armó la OP final de una OP (para poder editarla después). */
export async function guardarLectura(ordenId: string, lectura: unknown): Promise<void> {
  const r = await fetch(`/api/hetmo?modo=lectura&orden=${encodeURIComponent(ordenId)}`, {
    method: 'POST',
    headers: await cabecerasPropias({ 'content-type': 'application/json' }),
    body: JSON.stringify({ lectura }),
  })
  if (!r.ok) throw new Error(`Guardar la lectura: HTTP ${r.status}`)
}
