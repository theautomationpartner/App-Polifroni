/**
 * 🏭 Orden de Produccion (18432207111): un ítem por cada OP emitida.
 *
 * La obra no guarda sus órdenes: este tablero guarda TODAS, cada una con su número, quién midió,
 * cuándo, los dos documentos (el PDF original y la OP final) y sus observaciones como subelementos.
 *
 * Una obra puede tener VARIAS órdenes. La OP nace recién cuando tiene algo que guardar —al cargar
 * el PDF original—, no al elegir la obra: navegar por la app no deja ítems vacíos en el tablero.
 *
 * El estado de cada OP es UNO y vive en `🤖Estado OP` (ver `lib/estadosOp`). Una OP no se borra ni
 * se modifica: se cancela, y el motivo queda escrito en ella.
 */
import { BOARD_OBRAS, BOARD_ORDENES, COL_OP_ARCHIVOS } from './columns'
import { getUrlArchivo, subirArchivo } from './obras'
import { byId, type MondayItem } from './parse'
import { mondayApi } from './sdk'
import { ETIQUETA_OP, estadoDeOrden, type EstadoOrden } from '@/lib/estadosOp'
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
  /** 🤖Estado De Envio OP a Cliente (status): Enviando... | Enviada | Error De Envio | NO enviada. */
  estadoEnvio: 'color_mm7hdg10',
  /** 🤖Estado de Envio OP al Taller (status): Enviando... | Enviado | Error de Envio. Lo escribe el
      escenario del taller (la app le pasa la columna en `columnId`). */
  estadoEnvioTaller: 'color_mm7qjqgr',
  /** 🤖Responsable de Confirmar (dropdown, una sola): Cliente | Constructor. Lo escribe el envío. */
  confirmador: 'dropdown_mm7qyr8k',
  /** Link al PDF enviado (link): la URL compartida que devuelve el envío. */
  linkPdf: 'link_mm7hmk9d',
  /** 🤖Motivo (long_text): por qué se canceló la OP. */
  motivo: 'long_text_mm7hqq9q',
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

/** Etiquetas de `Estado OP`. La lista completa y sus reglas viven en `lib/estadosOp`. */
export const ESTADO_OP = {
  generada: ETIQUETA_OP.generada,
  enviada: ETIQUETA_OP.pendiente,
  confirmada: ETIQUETA_OP.confirmada,
  noConfirmada: ETIQUETA_OP.rechazada,
  taller: ETIQUETA_OP.taller,
  cancelada: ETIQUETA_OP.cancelada,
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
  /** Quién la está emitiendo: el usuario de la sesión. Queda en "Responsable" desde que nace. */
  responsableId: string | null = null,
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
    ...(responsableId
      ? { [COL_OP.personas]: { personsAndTeams: [{ id: Number(responsableId), kind: 'person' }] } }
      : {}),
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
 *
 * Sólo con las que SIGUEN EXISTIENDO: la columna guardaba ids de OP ya borradas, y al reescribirla
 * con ellas Monday rechazaba el cambio —la OP nueva nunca quedaba vinculada en la obra—.
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
  const previas = (d.items[0]?.column_values[0]?.linked_item_ids ?? []).map(String)
  const vivas = previas.length
    ? await mondayApi<{ items: { id: string; state?: string }[] }>(
        `query ($ids: [ID!]) { items(ids: $ids) { id state } }`,
        { ids: previas },
      )
        .then((r) => (r.items ?? []).filter((i) => i.state !== 'deleted').map((i) => String(i.id)))
        .catch(() => previas)
    : []
  const todas = [...new Set([...vivas, ordenId])].map(Number)
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
 * NO se crea al elegir la obra ni al abrir la pantalla: se crea recién con el PDF original en la
 * mano (`abrirOrden`), que es lo primero que la OP tiene que guardar. Antes nacía en el click de
 * la obra, y cada vez que alguien entraba a mirar y se iba quedaba un ítem vacío en el tablero.
 *
 * Guardar la promesa por obra es lo que evita crear dos si se sube el archivo dos veces seguidas.
 */
const visitas = new Map<string, Promise<OrdenAbierta>>()

/** La OP que ya se abrió en esta visita, si hay una. No crea nada. */
export const ordenEnCurso = (obraId: string): Promise<OrdenAbierta> | null => visitas.get(obraId) ?? null

/** La OP de esta visita: la que ya se abrió o, si no hay, una nueva. */
export function abrirOrden(
  obraId: string,
  obraNombre: string,
  tipo: 'PVC' | 'Aluminio',
  numero: string,
  responsableId: string | null = null,
): Promise<OrdenAbierta> {
  const previa = visitas.get(obraId)
  if (previa) return previa
  const p = (async () => {
    const id = await crearOrdenVacia(obraId, obraNombre, tipo, numero, responsableId)
    await vincularOrdenEnObra(obraId, id).catch((e) =>
      console.warn('[ordenes] no se pudo sumar la OP a la obra', e),
    )
    return { id, numero }
  })()
  p.catch(() => visitas.delete(obraId))
  visitas.set(obraId, p)
  return p
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

/**
 * Adjunta a la OP la Orden de Producción final que armó la app.
 *
 * Una OP lleva UNA orden final: si quedó otra de un intento anterior, se reemplaza.
 */
export async function subirOpFinal(ordenId: string, archivo: File): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP_ARCHIVOS.opFinal]: { clear_all: true } }).catch(() => {})
  await subirArchivo(ordenId, COL_OP_ARCHIVOS.opFinal, archivo)
}

/**
 * El nombre definitivo de la OP, una vez emitida: "<obra> - IDOP-030 - PVC 2281".
 *
 * Se pone al emitir la OP final y no al crearla: recién ahí el tipo y el número quedaron firmes
 * (el número se puede corregir a mano con el lápiz hasta el último momento). El número es el de la
 * columna de su tipo: el de PVC es numérico ("2281"), el de Aluminio lleva la "A" ("A3003").
 */
export async function renombrarOrdenEmitida(
  ordenId: string,
  obraNombre: string,
  tipo: 'PVC' | 'Aluminio',
  numero: string,
): Promise<void> {
  const d = await mondayApi<{ items: { column_values: { text: string | null }[] }[] }>(
    `query ($id: [ID!]) { items(ids: $id) { column_values(ids: ["${COL_OP.idOp}"]) { text } } }`,
    { id: [ordenId] },
  )
  const idOp = d.items[0]?.column_values[0]?.text?.trim() ?? ''
  const nro = tipo === 'PVC' ? numero.replace(/\D/g, '') : numero.trim()
  const nombre = [obraNombre.trim(), idOp, [tipo, nro].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
  await cambiarColumnas(ordenId, { name: nombre })
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

/** Una OP tal como la muestran el envío, el taller y la consulta. */
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
  /** Estado técnico del último WhatsApp. No decide nada: el estado de la OP es `estadoOrden`. */
  estadoEnvio: string
  /** `🤖Estado de Envio OP al Taller`: decide si la OP todavía se puede mandar al taller. */
  envioTaller: string
  /** `🤖Responsable de Confirmar`: "Cliente", "Constructor" o vacío. */
  confirmador: string
  /** La etiqueta de `🤖Estado OP` tal cual está en el tablero. */
  estado: string
  /** El estado de la OP ya interpretado (ver `lib/estadosOp`). Es el que manda. */
  estadoOrden: EstadoOrden
  /** Por qué se canceló, si se canceló. */
  motivo: string
  linkPdf: string
  obraId: string
  obraNombre: string
  /** Fecha de creación del ítem (ISO). */
  creada: string
  etmo: ArchivoObra[]
  opFinal: ArchivoObra[]
}

const COLS_RESUMEN = [
  COL_OP.idOp,
  COL_OP.nroPvc,
  COL_OP.nroAluminio,
  COL_OP.tipo,
  COL_OP.nOpHetmo,
  COL_OP.medidoPor,
  COL_OP.fechaMedicion,
  COL_OP.observacion,
  COL_OP.estadoEnvio,
  COL_OP.estadoEnvioTaller,
  COL_OP.confirmador,
  COL_OP.estado,
  COL_OP.motivo,
  COL_OP.linkPdf,
  COL_OP.etmo,
  COL_OP.opFinal,
  COL_OP.obra,
]

/** Los campos que se piden de cada OP. La obra viene con su nombre (`display_value`). */
const CAMPOS_RESUMEN = `
  id name state created_at
  column_values(ids: ${JSON.stringify(COLS_RESUMEN)}) {
    id text value
    ... on BoardRelationValue { display_value linked_item_ids }
  }
`

type ItemOrden = MondayItem & { state?: string; created_at?: string }
interface ValorOrden {
  text?: string | null
  value?: string | null
  display_value?: string
  linked_item_ids?: string[]
}

function urlDeLink(valorJson: string | null | undefined): string {
  try {
    return String((JSON.parse(valorJson ?? 'null') as { url?: string } | null)?.url ?? '')
  } catch {
    return ''
  }
}

function aResumen(i: ItemOrden): ResumenOrden {
  const c = byId(i) as Record<string, ValorOrden | undefined>
  const t = (id: string) => (c[id]?.text ?? '').trim()
  const tipo = t(COL_OP.tipo)
  const etmo = archivosDe(c[COL_OP.etmo]?.value)
  /* En Aluminio el PDF original ES la orden: no se sube aparte a la OP final. Para todo lo que
     pregunta por "el documento de la orden" —verlo, mandarlo, saber si está generada— vale ése. */
  const opFinalPropia = archivosDe(c[COL_OP.opFinal]?.value)
  const opFinal = opFinalPropia.length ? opFinalPropia : /alum/i.test(tipo) ? etmo : []
  const estado = t(COL_OP.estado)
  return {
    id: String(i.id),
    nombre: i.name,
    idOp: t(COL_OP.idOp),
    numero: t(COL_OP.nroAluminio) || t(COL_OP.nroPvc),
    tipo,
    nOpHetmo: t(COL_OP.nOpHetmo),
    medidoPor: t(COL_OP.medidoPor),
    fechaMedicion: t(COL_OP.fechaMedicion),
    observacion: t(COL_OP.observacion),
    estadoEnvio: t(COL_OP.estadoEnvio),
    envioTaller: t(COL_OP.estadoEnvioTaller),
    confirmador: t(COL_OP.confirmador),
    estado,
    estadoOrden: estadoDeOrden(estado, opFinal.length > 0),
    motivo: t(COL_OP.motivo),
    linkPdf: urlDeLink(c[COL_OP.linkPdf]?.value),
    obraId: String(c[COL_OP.obra]?.linked_item_ids?.[0] ?? ''),
    obraNombre: (c[COL_OP.obra]?.display_value ?? '').trim(),
    creada: i.created_at ?? '',
    etmo,
    opFinal,
  }
}

const vigente = (i: ItemOrden) => i.state !== 'archived' && i.state !== 'deleted'

/** Las OP de una obra (TODAS, en cualquier estado), de la más nueva a la más vieja. */
export async function ordenesDeObra(ordenesIds: string[]): Promise<ResumenOrden[]> {
  if (ordenesIds.length === 0) return []
  const d = await mondayApi<{ items: ItemOrden[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_RESUMEN} } }`,
    { ids: ordenesIds },
  )
  return (d.items ?? [])
    .filter(vigente)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map(aResumen)
}

/**
 * UNA OP, leída del tablero en el momento.
 *
 * Antes de cada acción se relee: lo que la pantalla muestra puede ser de hace un rato, y otra
 * persona pudo haberla cancelado o mandado mientras tanto. Actuar sobre el estado de la pantalla
 * es la forma de mandar dos veces la misma orden.
 */
export async function leerOrden(ordenId: string): Promise<ResumenOrden | null> {
  const d = await mondayApi<{ items: ItemOrden[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_RESUMEN} } }`,
    { ids: [ordenId] },
  )
  const i = d.items?.[0]
  return i && vigente(i) ? aResumen(i) : null
}

/** Índice de la etiqueta "Enviada Pend Confirmar" en `🤖Estado OP` (ver su `settings_str`). */
const INDICE_PEND_CONFIRMAR = 3

/**
 * Las OP del tablero, para la consulta. Se traen de a páginas de 200 con el cursor de Monday.
 * El tope de 20 páginas (4000 órdenes) es sólo para que un cursor roto no quede girando.
 *
 * `soloPendientes`: sólo las "Enviada Pend Confirmar", filtradas por Monday —no se trae el tablero
 * entero para descartar casi todo—.
 */
export async function listarOrdenes({ soloPendientes = false } = {}): Promise<ResumenOrden[]> {
  type Pagina = { cursor: string | null; items: ItemOrden[] }
  const todas: ItemOrden[] = []
  const q = soloPendientes
    ? { rules: [{ column_id: COL_OP.estado, compare_value: [INDICE_PEND_CONFIRMAR], operator: 'any_of' }] }
    : {}
  const d = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query ($q: ItemsQuery) { boards(ids: [${BOARD_ORDENES}]) { items_page(limit: 200, query_params: $q) { cursor items { ${CAMPOS_RESUMEN} } } } }`,
    { q },
  )
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  todas.push(...(pagina?.items ?? []))
  for (let n = 0; pagina?.cursor && n < 20; n++) {
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${CAMPOS_RESUMEN} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
    todas.push(...(pagina?.items ?? []))
  }
  const lista = todas.filter(vigente).sort((a, b) => Number(b.id) - Number(a.id)).map(aResumen)
  /* Lo que diga el filtro de Monday, se confirma con la etiqueta leída. */
  return soloPendientes ? lista.filter((o) => o.estadoOrden === 'pendiente') : lista
}

/** Tablero de las cuentas corrientes dadas de baja: una cuenta que vive acá está INACTIVA. */
export const BOARD_CTAS_ARCHIVADAS = 18425935891

/** `✋Cta Cte Cliente` de la obra (el mismo id que `COL.ctaCteCliente`). */
const COL_CTA_CTE_OBRA = 'board_relation_mkthtd70'

/** La cuenta corriente del cliente de una obra, y si está activa. */
export interface CuentaDeObra {
  cliente: string
  /** `null` si la obra no tiene cuenta vinculada: no se sabe, y no se inventa. */
  activa: boolean | null
}

/**
 * La cuenta corriente de cada obra, con su estado activo / inactivo.
 *
 * La obra puede vincular una cuenta de dos tableros: el de cuentas vigentes y el de ARCHIVADOS.
 * Ese tablero es lo único que hoy dice que una cuenta está dada de baja —la cuenta no tiene una
 * columna de estado—, así que la app lo lee de ahí.
 */
export async function cuentasDeObras(obraIds: string[]): Promise<Record<string, CuentaDeObra>> {
  const ids = [...new Set(obraIds.filter(Boolean))]
  const salida: Record<string, CuentaDeObra> = {}
  for (let desde = 0; desde < ids.length; desde += 100) {
    const d = await mondayApi<{
      items: {
        id: string
        column_values: { display_value?: string; linked_items?: { board?: { id: string } | null }[] }[]
      }[]
    }>(
      `query ($ids: [ID!]) {
        items(ids: $ids) {
          id
          column_values(ids: ["${COL_CTA_CTE_OBRA}"]) {
            ... on BoardRelationValue { display_value linked_items { board { id } } }
          }
        }
      }`,
      { ids: ids.slice(desde, desde + 100) },
    )
    for (const i of d.items ?? []) {
      const cv = i.column_values[0]
      const tableros = (cv?.linked_items ?? []).map((l) => String(l.board?.id ?? ''))
      salida[String(i.id)] = {
        cliente: (cv?.display_value ?? '').trim(),
        activa: tableros.length === 0 ? null : !tableros.includes(String(BOARD_CTAS_ARCHIVADAS)),
      }
    }
  }
  return salida
}

/**
 * Cambia el estado de la OP. Las etiquetas nuevas ("Enviada a Taller", "Cancelada") se crean la
 * primera vez que se usan: así el tablero no necesita un cambio manual previo.
 */
export async function setEstadoOrden(ordenId: string, etiqueta: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valor: String!) {
      change_simple_column_value(board_id: ${BOARD_ORDENES}, item_id: $id, column_id: "${COL_OP.estado}", value: $valor, create_labels_if_missing: true) { id }
    }`,
    { id: ordenId, valor: etiqueta },
  )
}

/**
 * Cancela una OP: la deja en "Cancelada" con el motivo escrito. NO se borra ni se archiva —una OP
 * cancelada sigue siendo la constancia de lo que se mandó y por qué dejó de valer—.
 *
 * El motivo lleva quién y cuándo, porque la columna es un texto y no guarda autor.
 */
/** Quién es el responsable de confirmar la OP (`🤖Responsable de Confirmar`). */
export async function guardarConfirmador(ordenId: string, rol: 'Cliente' | 'Constructor'): Promise<void> {
  await cambiarColumnas(ordenId, { [COL_OP.confirmador]: { labels: [rol] } })
}

export async function cancelarOrden(ordenId: string, motivo: string, autor: string): Promise<void> {
  const cuando = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
  const texto = `${motivo.trim()}\n— Cancelada por ${autor || 'la app'} el ${cuando}`
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_ORDENES}, item_id: $id, column_values: $valores, create_labels_if_missing: true) { id }
    }`,
    {
      id: ordenId,
      valores: JSON.stringify({
        [COL_OP.estado]: { label: ETIQUETA_OP.cancelada },
        [COL_OP.motivo]: { text: texto },
      }),
    },
  )
}

/**
 * Copia a la OP la respuesta del cliente ("Confirmada" / "NO Confirmado"), SÓLO si la OP está
 * esperándola ("Enviada Pend Confirmar").
 *
 * Una OP que ya tiene respuesta no se toca: esa respuesta es de ESTA orden, mientras que la columna
 * de la obra puede traer la de una orden anterior. Copiarla a ciegas pisaba cada "Confirmada" que
 * se cargaba en la OP con un "NO Confirmado" viejo, una y otra vez.
 */
export async function copiarRespuestaAOrden(ordenId: string, estadoActual: string, etiqueta: string): Promise<boolean> {
  if (estadoActual !== ESTADO_OP.enviada || etiqueta === estadoActual) return false
  try {
    await setEstadoOrden(ordenId, etiqueta)
    return true
  } catch (e) {
    console.warn('[ordenes] no se pudo copiar la respuesta del cliente a la OP', e)
    return false
  }
}
