/**
 * 🏭 Orden de Produccion (18432207111): un ítem por cada OP emitida.
 *
 * La obra guarda sólo la ÚLTIMA OP en sus columnas; este tablero guarda TODAS, cada una con su
 * número, quién midió, cuándo, los dos documentos (el ETMO original y la OP final) y sus
 * observaciones como subelementos. Es el historial que la obra sola no puede tener.
 *
 * Una obra puede tener VARIAS órdenes. Cada vez que se elige una obra para emitir ("Generar una
 * nueva", o una obra que todavía no tiene OP) se crea SIEMPRE una OP nueva —nunca se reusa otra—
 * y se suma a la columna "Orden de Produccion" de la obra, junto a las que ya tenía.
 *
 * Al crearla se le carga lo que ya se sabe: el tipo y el número automático. La Orden HETMO se le
 * adjunta cuando se sube en la app; al apretar "Generar la OP final", los datos de la medición y
 * las observaciones; cuando la OP sale, el PDF final y el estado "Generada". Después lo mueven el
 * envío ("Enviada Pend Confirmar") y la respuesta del cliente ("Confirmada" / "NO Confirmado").
 */
import { BOARD_OBRAS, BOARD_ORDENES, COL_OP_ARCHIVOS } from './columns'
import { getUrlArchivo, subirArchivo } from './obras'
import { byId, type MondayItem } from './parse'
import { mondayApi } from './sdk'
import type { ArchivoObra } from '@/types'

export { BOARD_ORDENES }

export const COL_OP = {
  personas: 'multiple_person_mm7gz5g1',
  nroPvc: 'numeric_mm7ep0eq',
  nroAluminio: 'text_mm7gjg24',
  idOp: 'pulse_id_mm7e9nvx',
  obra: 'board_relation_mm7e604m',
  etmo: 'file_mm7g9dnc',
  opFinal: 'file_mm7g7emd',
  estado: 'color_mm7g3ta4',
  medidoPor: 'text_mm7gq0gg',
  observacion: 'long_text_mm7g7k7n',
  fechaMedicion: 'date_mm7gejvf',
  tipo: 'color_mm7gbz9q',
  /** 🤖N OP HETMO (text): "número-versión" del listado HETMO, lo devuelve la generación. */
  nOpHetmo: 'text_mm7g5hbe',
  /** 🤖Estado De Envio OP (status): Enviando... | Enviada | Error De Envio. */
  estadoEnvio: 'color_mm7hdg10',
  /** Link al PDF enviado (link): la URL compartida que devuelve el envío. */
  linkPdf: 'link_mm7hmk9d',
} as const

/** Etiquetas de `Estado De Envio OP`, tal cual están en el tablero. */
export const ESTADO_ENVIO_OP = {
  enviando: 'Enviando...',
  enviada: 'Enviada',
  error: 'Error De Envio',
} as const

/** Colores de esas etiquetas en el tablero, para pintarlas igual en la app. */
export const COLOR_ENVIO_OP: Record<string, string> = {
  'Enviando...': '#fdab3d',
  Enviada: '#00c875',
  'Error De Envio': '#df2f4a',
}

/** Columnas de los subelementos: una observación por abertura y un renglón por vidrio. */
export const COL_OBS = {
  texto: 'long_text_mm7g5wfj',
  estado: 'color_mm7g7r8s',
  comp1: 'dropdown_mm7gmkmy',
  camara: 'dropdown_mm7g1hyj',
  comp2: 'dropdown_mm7gf95e',
  ancho: 'text_mm7g8jy3',
  alto: 'text_mm7gat0',
  cantidad: 'numeric_mm7gs5gy',
} as const

/** Un vidrio del documento, tal como lo devuelve la lectura del ETMO. */
export interface VidrioLeido {
  modelo: string
  comp1: string | null
  camara: string | null
  comp2: string | null
  ancho: string | null
  alto: string | null
  cant: number | null
}

/** Etiquetas de `Estado OP`, tal cual están en el tablero. */
export const ESTADO_OP = {
  generada: 'Generada',
  enviada: 'Enviada Pend Confirmar',
  confirmada: 'Confirmada',
  noConfirmada: 'NO Confirmado',
} as const

export interface DatosOrden {
  tipo: 'PVC' | 'Aluminio'
  /** "3001" o "A3001". */
  numero: string
  personas: string[]
  medidoPor: string
  observacion: string
  /** `YYYY-MM-DD`. */
  fecha: string
}

async function cambiarColumnas(itemId: string, valores: Record<string, unknown>): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_ORDENES}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: itemId, valores: JSON.stringify(valores) },
  )
}

/** La OP abierta de una obra: su id y el número que quedó reservado en ella. */
export interface OrdenAbierta {
  id: string
  numero: string
}

/** Las columnas del número, según el tipo: la de PVC es numérica, la de Aluminio es texto ("A3001"). */
function columnasNumero(tipo: 'PVC' | 'Aluminio', numero: string): Record<string, unknown> {
  return tipo === 'PVC'
    ? { [COL_OP.nroPvc]: numero.replace(/\D/g, ''), [COL_OP.nroAluminio]: '' }
    : { [COL_OP.nroAluminio]: numero, [COL_OP.nroPvc]: '' }
}

/**
 * Crea la OP de la obra SÓLO con el nombre, y en seguida le carga lo que ya se sabe al entrar: el
 * vínculo a la obra, el tipo (PVC / Aluminio, de la obra), el número automático en la columna de su
 * tipo y el nombre definitivo "<obra> - IDOP-00X".
 *
 * El `IDOP-00X` lo asigna Monday un instante DESPUÉS de crear el ítem (probado: leído en el acto
 * viene vacío), así que se reintenta unas veces antes de renunciar al nombre definitivo.
 */
export async function crearOrdenVacia(
  obraId: string,
  obraNombre: string,
  tipo: 'PVC' | 'Aluminio',
  numero: string,
): Promise<string> {
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!) {
      create_item(board_id: ${BOARD_ORDENES}, item_name: $nombre) { id }
    }`,
    { nombre: obraNombre },
  )
  const id = d.create_item.id

  let idOp = ''
  for (let intento = 0; intento < 6 && !idOp; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, 700))
    const r = await mondayApi<{ items: { column_values: { text: string | null }[] }[] }>(
      `query ($id: [ID!]) { items(ids: $id) { column_values(ids: ["${COL_OP.idOp}"]) { text } } }`,
      { id: [id] },
    ).catch(() => null)
    idOp = r?.items[0]?.column_values[0]?.text?.trim() ?? ''
  }
  await cambiarColumnas(id, {
    [COL_OP.obra]: { item_ids: [Number(obraId)] },
    [COL_OP.tipo]: { label: tipo },
    ...(numero ? columnasNumero(tipo, numero) : {}),
    ...(idOp ? { name: `${obraNombre} - ${idOp}` } : {}),
  })
  return id
}

/** Columna de Obras donde se listan TODAS las órdenes de producción de la obra. */
const COL_OBRA_ORDENES = 'board_relation_mm7hcngm'

/**
 * Suma la OP a la columna "Orden de Produccion" de la obra, CONSERVANDO las que ya tenía.
 *
 * Una columna conectada se escribe entera: mandar sólo la nueva borraría las anteriores. Por eso se
 * leen primero las que hay y se escribe la lista completa.
 */
export async function vincularOrdenEnObra(obraId: string, ordenId: string): Promise<void> {
  const d = await mondayApi<{ items: { column_values: { linked_item_ids?: string[] }[] }[] }>(
    `query ($id: [ID!]) {
      items(ids: $id) {
        column_values(ids: ["${COL_OBRA_ORDENES}"]) { ... on BoardRelationValue { linked_item_ids } }
      }
    }`,
    { id: [obraId] },
  )
  const previas = d.items[0]?.column_values[0]?.linked_item_ids ?? []
  const todas = [...new Set([...previas.map(String), ordenId])].map(Number)
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_OBRAS}, item_id: $id, column_values: $valores) { id }
    }`,
    { id: obraId, valores: JSON.stringify({ [COL_OBRA_ORDENES]: { item_ids: todas } }) },
  )
}

/**
 * La OP de esta visita a la obra.
 *
 * `iniciarOrden` la crea SIEMPRE (es lo que pasa al elegir la obra para emitir). `ordenDeLaVisita`
 * devuelve la que se inició y sólo crea una si no hay ninguna —p. ej. si se recargó la página—.
 * Guardar la promesa por obra es lo que evita crear dos si la pantalla se monta dos veces seguidas.
 */
const visitas = new Map<string, Promise<OrdenAbierta>>()

export function iniciarOrden(
  obraId: string,
  obraNombre: string,
  tipo: 'PVC' | 'Aluminio',
  proximoNumero: () => Promise<string>,
): Promise<OrdenAbierta> {
  const p = (async () => {
    const numero = await proximoNumero().catch(() => '')
    const id = await crearOrdenVacia(obraId, obraNombre, tipo, numero)
    await vincularOrdenEnObra(obraId, id).catch((e) =>
      console.warn('[ordenes] no se pudo sumar la OP a la obra', e),
    )
    return { id, numero }
  })()
  p.catch(() => visitas.delete(obraId))
  visitas.set(obraId, p)
  return p
}

export function ordenDeLaVisita(
  obraId: string,
  obraNombre: string,
  tipo: 'PVC' | 'Aluminio',
  proximoNumero: () => Promise<string>,
): Promise<OrdenAbierta> {
  return visitas.get(obraId) ?? iniciarOrden(obraId, obraNombre, tipo, proximoNumero)
}

/** La OP ya se generó: la visita terminó, y la próxima vez que se elija la obra se crea otra. */
export function terminarVisita(obraId: string): void {
  visitas.delete(obraId)
}

/** Carga los datos de la OP (al apretar "Generar la OP final"). */
export async function completarOrden(ordenId: string, o: DatosOrden): Promise<void> {
  const columnas: Record<string, unknown> = {
    [COL_OP.tipo]: { label: o.tipo },
    [COL_OP.medidoPor]: o.medidoPor,
    [COL_OP.observacion]: { text: o.observacion },
  }
  if (o.fecha) columnas[COL_OP.fechaMedicion] = { date: o.fecha }
  /* El número va en la columna de su tipo; la otra se vacía, por si el tipo cambió entre un intento
     y otro. Se vuelve a escribir por si se corrigió a mano con el lápiz. */
  if (o.numero) Object.assign(columnas, columnasNumero(o.tipo, o.numero))
  if (o.personas.length) {
    columnas[COL_OP.personas] = {
      personsAndTeams: o.personas.map((id) => ({ id: Number(id), kind: 'person' })),
    }
  }
  await cambiarColumnas(ordenId, columnas)
}

/**
 * Los subelementos de la OP: UNO por abertura (estado "Observacion", con lo que se escribió) y UNO
 * por vidrio (estado "Vidrio", con su composición y medidas). Ejemplo real: 7 aberturas y 6
 * vidrios → 13 subelementos.
 *
 * REEMPLAZA los que hubiera: si un intento anterior falló, la OP ya tiene subelementos, y volver a
 * crearlos los duplicaría. Se crean en tandas de 10 en una sola mutación cada una (alias), en vez
 * de 13 pedidos seguidos.
 */
export async function crearSubelementos(
  ordenId: string,
  observaciones: { nombre: string; texto: string }[],
  vidrios: VidrioLeido[],
): Promise<void> {
  const previas = await mondayApi<{ items: { subitems: { id: string }[] | null }[] }>(
    `query ($id: [ID!]) { items(ids: $id) { subitems { id } } }`,
    { id: [ordenId] },
  )
  for (const sub of previas.items[0]?.subitems ?? []) {
    await mondayApi(`mutation ($id: ID!) { delete_item(item_id: $id) { id } }`, { id: sub.id })
  }

  const etiqueta = (v: string | null) => (v && v.trim() ? { labels: [v.trim()] } : null)
  const filas: { nombre: string; valores: Record<string, unknown> }[] = [
    ...observaciones.map((o) => ({
      nombre: o.nombre,
      valores: { [COL_OBS.estado]: { label: 'Observacion' }, [COL_OBS.texto]: { text: o.texto } },
    })),
    ...vidrios.map((v) => {
      const valores: Record<string, unknown> = { [COL_OBS.estado]: { label: 'Vidrio' } }
      /* Las composiciones ("3+3", "4") son etiquetas de columnas desplegables: si una todavía no
         existe en el tablero, se crea (`create_labels_if_missing`). */
      if (etiqueta(v.comp1)) valores[COL_OBS.comp1] = etiqueta(v.comp1)
      if (etiqueta(v.camara)) valores[COL_OBS.camara] = etiqueta(v.camara)
      if (etiqueta(v.comp2)) valores[COL_OBS.comp2] = etiqueta(v.comp2)
      if (v.ancho) valores[COL_OBS.ancho] = v.ancho
      if (v.alto) valores[COL_OBS.alto] = v.alto
      if (v.cant != null) valores[COL_OBS.cantidad] = String(v.cant)
      return { nombre: (v.modelo || 'Vidrio').toUpperCase(), valores }
    }),
  ]

  for (let desde = 0; desde < filas.length; desde += 10) {
    const tanda = filas.slice(desde, desde + 10)
    const variables: Record<string, unknown> = { padre: ordenId }
    const firma = ['$padre: ID!']
    const cuerpo = tanda.map((f, k) => {
      variables[`n${k}`] = f.nombre
      variables[`v${k}`] = JSON.stringify(f.valores)
      firma.push(`$n${k}: String!`, `$v${k}: JSON!`)
      return `s${k}: create_subitem(parent_item_id: $padre, item_name: $n${k}, column_values: $v${k}, create_labels_if_missing: true) { id }`
    })
    await mondayApi(`mutation (${firma.join(', ')}) { ${cuerpo.join('\n')} }`, variables)
  }
}

/** Los documentos de UNA OP: su Orden HETMO y su OP final. */
export async function getArchivosOrden(
  ordenId: string,
): Promise<{ etmo: ArchivoObra[]; opFinal: ArchivoObra[] }> {
  const d = await mondayApi<{ items: MondayItem[] }>(
    `query ($id: [ID!]) {
      items(ids: $id) { id column_values(ids: ["${COL_OP_ARCHIVOS.etmo}", "${COL_OP_ARCHIVOS.opFinal}"]) { id text value } }
    }`,
    { id: [ordenId] },
  )
  const item = d.items[0]
  if (!item) return { etmo: [], opFinal: [] }
  const c = byId(item)
  return { etmo: archivosDe(c[COL_OP_ARCHIVOS.etmo]?.value), opFinal: archivosDe(c[COL_OP_ARCHIVOS.opFinal]?.value) }
}

function archivosDe(valorJson: string | null | undefined): ArchivoObra[] {
  if (!valorJson) return []
  try {
    const v = JSON.parse(valorJson) as {
      files?: { name?: string; assetId?: number | string; isImage?: string | boolean }[]
    }
    return (v.files ?? [])
      .filter((f) => f.assetId != null)
      .map((f) => ({
        assetId: String(f.assetId),
        nombre: f.name ?? 'archivo',
        esImagen: f.isImage === true || f.isImage === 'true',
      }))
  } catch {
    return []
  }
}

/** Sube la Orden HETMO a la OP (reemplaza la que hubiera: una OP sale de UN documento). */
export async function subirEtmoAOrden(ordenId: string, archivo: File): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP_ARCHIVOS.etmo]: { clear_all: true } }).catch(() => {})
  await subirArchivo(ordenId, COL_OP_ARCHIVOS.etmo, archivo)
}

/** Saca la Orden HETMO de la OP (se cargó la equivocada). */
export async function quitarEtmoDeOrden(ordenId: string): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP_ARCHIVOS.etmo]: { clear_all: true } })
}

/**
 * Copia un archivo de la obra a la OP.
 *
 * Monday no tiene "copiar archivo entre columnas": se bajan los bytes del adjunto y se vuelven a
 * subir. Es lo mismo que hace quien lo arrastra de un ítem al otro.
 */
export async function copiarArchivo(
  archivo: ArchivoObra,
  ordenId: string,
  columna: string,
): Promise<void> {
  const url = await getUrlArchivo(archivo.assetId)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`No se pudo bajar ${archivo.nombre}: HTTP ${r.status}`)
  const blob = await r.blob()
  const tipo = blob.type || (archivo.esImagen ? 'image/png' : 'application/pdf')
  /* Una OP lleva UN documento de cada tipo: si ya había uno (un intento anterior), se reemplaza. */
  await cambiarColumnas(ordenId, { [columna]: { clear_all: true } }).catch(() => {})
  await subirArchivo(ordenId, columna, new File([blob], archivo.nombre, { type: tipo }))
}

/** Guarda el N° de OP HETMO ("9.205-1") que devuelve la generación. */
export async function guardarNroHetmo(ordenId: string, texto: string): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP.nOpHetmo]: texto })
}

/** Guarda en la OP el link al PDF que se le mandó al cliente, con el texto "Ver Orden De Produccion". */
export async function guardarLinkOrden(ordenId: string, url: string): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP.linkPdf]: { url, text: 'Ver Orden De Produccion' } })
}

/** Mueve el estado de envío de la OP ("Enviando..." → "Enviada" o "Error De Envio"). */
export async function setEstadoEnvioOrden(ordenId: string, etiqueta: string): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP.estadoEnvio]: { label: etiqueta } })
}

/** Lo que el paso de envío muestra de la OP emitida. */
export interface ResumenOrden {
  id: string
  nombre: string
  idOp: string
  numero: string
  tipo: string
  nOpHetmo: string
  medidoPor: string
  fechaMedicion: string
  /** Observación de la medición (long_text_mm7g7k7n). */
  observacion: string
  estadoEnvio: string
  opFinal: ArchivoObra[]
}

/**
 * La ÚLTIMA OP EMITIDA de la obra: la más nueva que ya tiene su OP final. Es la que se le manda al
 * cliente. Una OP recién abierta (sin documento todavía) no cuenta.
 */
export async function ultimaOrdenEmitida(ordenesIds: string[]): Promise<ResumenOrden | null> {
  if (ordenesIds.length === 0) return null
  const cols = [
    COL_OP.idOp,
    COL_OP.nroPvc,
    COL_OP.nroAluminio,
    COL_OP.tipo,
    COL_OP.nOpHetmo,
    COL_OP.medidoPor,
    COL_OP.fechaMedicion,
    COL_OP.observacion,
    COL_OP.estadoEnvio,
    COL_OP.opFinal,
  ]
  const d = await mondayApi<{ items: (MondayItem & { state?: string })[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { id name state column_values(ids: ${JSON.stringify(cols)}) { id text value } } }`,
    { ids: ordenesIds },
  )
  const emitidas = (d.items ?? [])
    .filter((i) => i.state !== 'archived' && i.state !== 'deleted')
    .map((i) => ({ i, c: byId(i) }))
    .map(({ i, c }) => ({ i, c, opFinal: archivosDe(c[COL_OP.opFinal]?.value) }))
    .filter((x) => x.opFinal.length > 0)
    .sort((a, b) => Number(b.i.id) - Number(a.i.id))
  const u = emitidas[0]
  if (!u) return null
  const t = (id: string) => (u.c[id]?.text ?? '').trim()
  return {
    id: u.i.id,
    nombre: u.i.name,
    idOp: t(COL_OP.idOp),
    numero: t(COL_OP.nroAluminio) || t(COL_OP.nroPvc),
    tipo: t(COL_OP.tipo),
    nOpHetmo: t(COL_OP.nOpHetmo),
    medidoPor: t(COL_OP.medidoPor),
    fechaMedicion: t(COL_OP.fechaMedicion),
    observacion: t(COL_OP.observacion),
    estadoEnvio: t(COL_OP.estadoEnvio),
    opFinal: u.opFinal,
  }
}

export async function setEstadoOrden(ordenId: string, etiqueta: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valor: String!) {
      change_simple_column_value(board_id: ${BOARD_ORDENES}, item_id: $id, column_id: "${COL_OP.estado}", value: $valor) { id }
    }`,
    { id: ordenId, valor: etiqueta },
  )
}

/**
 * La OP más nueva de una obra, con su estado. `null` si la obra todavía no tiene ninguna.
 *
 * Los ids de Monday crecen con el tiempo: el más alto es el último creado.
 */
export async function ultimaOrdenDeObra(
  obraId: string,
): Promise<{ id: string; estado: string; numero: string } | null> {
  const d = await mondayApi<{
    boards: {
      items_page: { items: { id: string; column_values: { id: string; text: string | null }[] }[] }
    }[]
  }>(
    `query ($q: ItemsQuery) {
      boards(ids: [${BOARD_ORDENES}]) {
        items_page(limit: 100, query_params: $q) {
          items { id column_values(ids: ["${COL_OP.estado}", "${COL_OP.nroPvc}", "${COL_OP.nroAluminio}"]) { id text } }
        }
      }
    }`,
    { q: { rules: [{ column_id: COL_OP.obra, compare_value: [Number(obraId)], operator: 'any_of' }] } },
  )
  const items = d.boards[0]?.items_page.items ?? []
  if (!items.length) return null
  const ultimo = items.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a))
  const col = (id: string) => ultimo.column_values.find((c) => c.id === id)?.text?.trim() ?? ''
  return {
    id: ultimo.id,
    estado: col(COL_OP.estado),
    numero: col(COL_OP.nroAluminio) || col(COL_OP.nroPvc),
  }
}

/**
 * Archiva una OP que no llegó a generarse (la automatización falló). Se ARCHIVA y no se borra: si
 * alguien la quiere mirar, sigue en el archivo del tablero.
 */
export async function archivarOrden(ordenId: string): Promise<void> {
  await mondayApi(`mutation ($id: ID!) { archive_item(item_id: $id) { id } }`, { id: ordenId })
}

/** Mueve el estado de la última OP de la obra, si hace falta. Nunca rompe el flujo si falla. */
export async function sincronizarEstadoOrden(obraId: string, etiqueta: string): Promise<void> {
  try {
    const op = await ultimaOrdenDeObra(obraId)
    if (op && op.estado !== etiqueta) await setEstadoOrden(op.id, etiqueta)
  } catch (e) {
    console.warn('[ordenes] no se pudo actualizar el estado de la OP', e)
  }
}
