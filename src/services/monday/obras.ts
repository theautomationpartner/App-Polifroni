/**
 * Todo lo que la app sabe del tablero 🪟 Obras: leer obras, buscarlas, guardar las observaciones,
 * adjuntar el PDF de ETMO y registrar la actividad del ítem.
 *
 * Ninguna consulta sale de este board (9617181553). Los datos del cliente y del arquitecto se leen
 * de las columnas ESPEJO y de conexión de la propia obra —su `display_value`—, así no hace falta
 * entrar a los tableros vinculados.
 */
import { memoGlobal } from './cache'
import { BOARD_OBRAS, COL } from './columns'
import { byId, num, sumaMirror, valor, type CV, type MondayItem } from './parse'
import { mondayApi, mondaySubirArchivo, urlArchivo } from './sdk'
import type { Actividad, ArchivoObra, EstadoObra, Obra, ObraFila } from '@/types'

/* ────────────────────────────────────────────────────────────────────────────────
 * Estructura del tablero (para pintar las etiquetas con SU color)
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface EtiquetaBoard {
  /** El índice es lo que la API acepta para filtrar; el texto es lo que se muestra. */
  indice: number
  texto: string
  color: string
}

export interface ColumnaBoard {
  id: string
  title: string
  type: string
  /** texto de la etiqueta → color hexadecimal que le puso Monday. */
  colores: Record<string, string>
  /** Las etiquetas en el orden del tablero, con su índice. Vacío si la columna no es de estado. */
  etiquetas: EtiquetaBoard[]
}

interface SettingsStatus {
  labels?: Record<string, string>
  labels_colors?: Record<string, { color?: string }>
}

async function getEstructuraImpl(): Promise<Record<string, ColumnaBoard>> {
  const d = await mondayApi<{
    boards: { columns: { id: string; title: string; type: string; settings_str: string }[] }[]
  }>(`query { boards(ids: [${BOARD_OBRAS}]) { columns { id title type settings_str } } }`)

  const salida: Record<string, ColumnaBoard> = {}
  for (const c of d.boards[0]?.columns ?? []) {
    const colores: Record<string, string> = {}
    const etiquetas: EtiquetaBoard[] = []
    if (c.type === 'status') {
      let s: SettingsStatus = {}
      try {
        s = JSON.parse(c.settings_str || '{}') as SettingsStatus
      } catch {
        s = {}
      }
      for (const [idx, texto] of Object.entries(s.labels ?? {})) {
        const color = s.labels_colors?.[idx]?.color
        if (texto && color) colores[texto] = color
        if (texto) etiquetas.push({ indice: Number(idx), texto, color: color ?? '' })
      }
      etiquetas.sort((a, b) => a.indice - b.indice)
    }
    salida[c.id] = { id: c.id, title: c.title, type: c.type, colores, etiquetas }
  }
  return salida
}

/**
 * Columnas del tablero con los colores de cada etiqueta. Es un catálogo: se lee UNA vez y todas
 * las vistas comparten la misma promesa (ver `memoGlobal`).
 */
export const getEstructuraBoard = memoGlobal(getEstructuraImpl)

/** Título real de una columna en el tablero; si todavía no se leyó la estructura, el id. */
export function tituloColumna(estructura: Record<string, ColumnaBoard>, id: string): string {
  return estructura[id]?.title ?? id
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Lectura de ítems
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Las columnas que la app pide. Pedir sólo éstas mantiene la consulta lejos del tope de complejidad. */
const IDS = Object.values(COL)

const CAMPOS_COLUMNA = `
  id
  type
  text
  value
  ... on MirrorValue { display_value }
  ... on BoardRelationValue { display_value linked_item_ids }
  ... on FormulaValue { display_value }
`

const CAMPOS_ITEM = `
  id
  name
  group { title }
  column_values(ids: ${JSON.stringify(IDS)}) { ${CAMPOS_COLUMNA} }
`

/** Archivos de una columna `file`: vienen en `value` como JSON, no en `text`. */
function archivos(cv?: CV): ArchivoObra[] {
  const raw = (cv as { value?: string | null } | undefined)?.value
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as {
      files?: { name?: string; assetId?: number | string; isImage?: string | boolean }[]
    }
    return (parsed.files ?? [])
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

/** Etiqueta de una columna status con el color que le puso el tablero. */
function estado(
  cvs: Record<string, CV>,
  estructura: Record<string, ColumnaBoard>,
  columna: string,
): EstadoObra {
  const texto = (cvs[columna]?.text ?? '').trim()
  return { texto, color: texto ? (estructura[columna]?.colores[texto] ?? '') : '' }
}

/**
 * El saldo, calculado a mano cuando la columna fórmula no contesta.
 *
 * Devuelve '' si tampoco hay con qué calcularlo: inventar un cero diría "está todo cobrado", que
 * es lo contrario de "no sé".
 */
function saldoDeRespaldo(c: Record<string, CV>): string {
  const total = num(valor(c[COL.totalPactado]))
  if (!total) return ''
  const cancelado = sumaMirror(c[COL.canceladoEspejo])
  return String(total - cancelado)
}

/**
 * Texto de una columna, ya limpio.
 *
 * Las columnas FÓRMULA y ESPEJO devuelven a veces la cadena literal `"null"` —cuando el cálculo
 * todavía no está resuelto del lado de Monday—. Eso no es un valor: mostrarlo pondría "null" en
 * pantalla donde corresponde decir que el dato falta. Se trata como vacío.
 */
const limpiar = (bruto: string): string => {
  const t = bruto.trim()
  return t === 'null' || t === 'undefined' ? '' : t
}

/** Los ids de las PERSONAS (no equipos) de una columna people, desde su valor JSON. */
function personas(valorJson: string | null | undefined): string[] {
  if (!valorJson) return []
  try {
    const v = JSON.parse(valorJson) as { personsAndTeams?: { id: number | string; kind?: string }[] }
    return (v.personsAndTeams ?? []).filter((p) => p.kind !== 'team').map((p) => String(p.id))
  } catch {
    return []
  }
}

function aObra(item: MondayItem & { group?: { title?: string } }, estructura: Record<string, ColumnaBoard>): Obra {
  const c = byId(item)
  const txt = (id: string) => limpiar(valor(c[id]) ?? '')

  return {
    id: item.id,
    nombre: item.name,
    idObra: txt(COL.idObra),
    grupo: item.group?.title ?? '',
    creacion: txt(COL.creacion),

    ctaCteCliente: txt(COL.ctaCteCliente),
    ctaCteClienteIds: c[COL.ctaCteCliente]?.linked_item_ids ?? [],
    arquitecto: txt(COL.arquitecto),
    arquitectoIds: c[COL.arquitecto]?.linked_item_ids ?? [],
    asignado: txt(COL.asignado),
    asignadoIds: personas(c[COL.asignado]?.value),

    celCoordinar: txt(COL.celCoordinar),
    ubicacion: txt(COL.ubicacion),
    tipo: estado(c, estructura, COL.tipo),
    etapaProduccion: estado(c, estructura, COL.etapaProduccion),
    etapaVenta: estado(c, estructura, COL.etapaVenta),
    premarco: estado(c, estructura, COL.premarco),
    coordinarEntrega: estado(c, estructura, COL.coordinarEntrega),
    fechaColocacion: txt(COL.fechaColocacion),
    totalPactado: txt(COL.totalPactado),
    /* El saldo sale de la fórmula del tablero; si vino en blanco —pasa mientras Monday recalcula—
       se reconstruye con el espejo de los recibos, que es de donde sale la fórmula. Verificado
       contra la obra de prueba: total 10.000 − espejo (70, -70, 96, 96, 96 = 288) = 9.712, que es
       exactamente lo que devuelve la fórmula cuando devuelve algo. */
    saldo: txt(COL.saldo) || saldoDeRespaldo(c),
    pctCancelado: txt(COL.pctCancelado),
    validacionCtaCte: estado(c, estructura, COL.validacionCtaCte),

    celCliente: txt(COL.celCliente),
    emailCliente: txt(COL.emailCliente),
    celArquitecto: txt(COL.celArquitecto),

    ordenEtmo: archivos(c[COL.ordenEtmo]),
    opFinal: archivos(c[COL.opFinal]),
    planoAberturas: archivos(c[COL.planoAberturas]),
    planoPlanta: archivos(c[COL.planoPlanta]),
    presupuestoAceptado: archivos(c[COL.presupuestoAceptado]),

    observaciones: c[COL.observaciones]?.text ?? '',

    estadoOpFinal: estado(c, estructura, COL.estadoOpFinal),
    opDestinatario: estado(c, estructura, COL.opDestinatario),
    opVia: estado(c, estructura, COL.opVia),
    estadoEnvioOp: estado(c, estructura, COL.estadoEnvioOp),
    mjsEnviadoCliente: estado(c, estructura, COL.mjsEnviadoCliente),
    confirmacionOp: estado(c, estructura, COL.confirmacionOp),
    confirmacionTaller: estado(c, estructura, COL.confirmacionTaller),
    combina: estado(c, estructura, COL.combina),
    estadoEnvioTaller: estado(c, estructura, COL.estadoEnvioTaller),
  }
}

/** Una obra por su id de ítem. `null` si el ítem no existe o no es de este tablero. */
export async function getObra(itemId: string): Promise<Obra | null> {
  const estructura = await getEstructuraBoard()
  const d = await mondayApi<{ items: (MondayItem & { group?: { title?: string } })[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_ITEM} } }`,
    { ids: [itemId] },
  )
  const item = d.items?.[0]
  return item ? aObra(item, estructura) : null
}

/** Fila de la lista: sólo lo que se ve en el listado. */
const COLS_FILA = [
  COL.idObra,
  COL.ctaCteCliente,
  COL.ubicacion,
  COL.tipo,
  COL.etapaProduccion,
  COL.etapaVenta,
  COL.confirmacionOp,
  COL.confirmacionTaller,
]

function aFila(item: MondayItem, estructura: Record<string, ColumnaBoard>): ObraFila {
  const c = byId(item)
  return {
    id: item.id,
    nombre: item.name,
    idObra: limpiar(c[COL.idObra]?.text ?? ''),
    cliente: limpiar(valor(c[COL.ctaCteCliente]) ?? ''),
    ubicacion: limpiar(c[COL.ubicacion]?.text ?? ''),
    tipo: estado(c, estructura, COL.tipo),
    etapaProduccion: estado(c, estructura, COL.etapaProduccion),
    etapaVenta: estado(c, estructura, COL.etapaVenta),
    confirmacionOp: estado(c, estructura, COL.confirmacionOp),
    confirmacionTaller: estado(c, estructura, COL.confirmacionTaller),
  }
}

const CAMPOS_FILA = `
  id
  name
  column_values(ids: ${JSON.stringify(COLS_FILA)}) {
    id
    text
    ... on BoardRelationValue { display_value }
  }
`

/** Una página de resultados. `cursor` en `null` significa que no hay más. */
export interface PaginaObras {
  filas: ObraFila[]
  cursor: string | null
}

/**
 * Obras del tablero, de a una página.
 *
 * Con `termino` filtra por nombre (contiene); sin término empieza a listar el tablero entero, que
 * es como el catálogo (`features/obras/catalogoObras`) trae su primer lote. Nunca se piden todos
 * los ítems de una: el board tiene cientos y la primera pantalla tiene que aparecer enseguida.
 */
export async function buscarObras(termino: string, limite: number): Promise<PaginaObras> {
  const t = termino.trim()

  /* Un id de ítem pegado en el buscador se resuelve directo: es el caso del día a día —te pasan el
     id de la obra por chat— y filtrar por nombre nunca lo encontraría. */
  if (/^\d{6,}$/.test(t)) {
    const d = await mondayApi<{ items: MondayItem[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_FILA} } }`,
      { ids: [t] },
    )
    const estructura = await getEstructuraBoard()
    return { filas: (d.items ?? []).map((i) => aFila(i, estructura)), cursor: null }
  }

  const queryParams = t
    ? { rules: [{ column_id: 'name', compare_value: [t], operator: 'contains_text' }] }
    : {}

  const d = await mondayApi<{
    boards: { items_page: { cursor: string | null; items: MondayItem[] } }[]
  }>(
    `query ($limit: Int!, $q: ItemsQuery) {
      boards(ids: [${BOARD_OBRAS}]) {
        items_page(limit: $limit, query_params: $q) {
          cursor
          items { ${CAMPOS_FILA} }
        }
      }
    }`,
    { limit: limite, q: queryParams },
  )

  const estructura = await getEstructuraBoard()
  const page = d.boards[0]?.items_page
  return { filas: (page?.items ?? []).map((i) => aFila(i, estructura)), cursor: page?.cursor ?? null }
}

/**
 * Obras filtradas por el valor de una o varias columnas de ESTADO.
 *
 * Los filtros van por ÍNDICE y no por texto: es lo único que la API acepta (`any_of`), y además
 * sobrevive a que alguien renombre una etiqueta en el tablero. Varias columnas se combinan con Y
 * —"confirmadas por el cliente y pendientes en el taller"—, y varios valores de una misma columna
 * con O, que es como se lee un filtro cuando se marcan dos casillas.
 */
export async function listarPorEstado(
  filtros: { columna: string; indices: number[] }[],
  limite = 100,
): Promise<PaginaObras> {
  const rules = filtros
    .filter((f) => f.indices.length > 0)
    .map((f) => ({ column_id: f.columna, compare_value: f.indices, operator: 'any_of' }))

  const d = await mondayApi<{
    boards: { items_page: { cursor: string | null; items: MondayItem[] } }[]
  }>(
    `query ($limit: Int!, $q: ItemsQuery) {
      boards(ids: [${BOARD_OBRAS}]) {
        items_page(limit: $limit, query_params: $q) {
          cursor
          items { ${CAMPOS_FILA} }
        }
      }
    }`,
    { limit: limite, q: rules.length > 0 ? { operator: 'and', rules } : {} },
  )

  const estructura = await getEstructuraBoard()
  const page = d.boards[0]?.items_page
  return { filas: (page?.items ?? []).map((i) => aFila(i, estructura)), cursor: page?.cursor ?? null }
}

/** Página siguiente de una búsqueda ya empezada (el cursor lo devolvió la anterior). */
export async function siguientePaginaObras(cursor: string, limite: number): Promise<PaginaObras> {
  const d = await mondayApi<{ next_items_page: { cursor: string | null; items: MondayItem[] } }>(
    `query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items { ${CAMPOS_FILA} }
      }
    }`,
    { cursor, limit: limite },
  )
  const estructura = await getEstructuraBoard()
  const page = d.next_items_page
  return { filas: (page?.items ?? []).map((i) => aFila(i, estructura)), cursor: page?.cursor ?? null }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Archivos
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * URL para VER un archivo del tablero. Monday firma una dirección de S3 que vence en una hora;
 * se pide en el momento y se pasa por el proxy, porque S3 no manda cabeceras CORS.
 */
export async function getUrlArchivo(assetId: string): Promise<string> {
  const d = await mondayApi<{ assets: { public_url: string }[] }>(
    `query ($ids: [ID!]!) { assets(ids: $ids) { public_url } }`,
    { ids: [assetId] },
  )
  const url = d.assets?.[0]?.public_url
  if (!url) throw new Error('Monday no devolvió la dirección del archivo.')
  return urlArchivo(url)
}

/** Adjunta un archivo a una columna `file` de la obra (la Orden ETMO, por ejemplo). */
export async function subirArchivo(itemId: string, columna: string, archivo: File): Promise<string> {
  const d = await mondaySubirArchivo<{ add_file_to_column: { id: string } }>(
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columna}", file: $file) { id }
    }`,
    archivo,
  )
  return d.add_file_to_column.id
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Escrituras
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Guarda las observaciones por ítem (columna de texto de la OP). */
export async function guardarObservaciones(itemId: string, texto: string): Promise<void> {
  await mondayApi(
    `mutation ($valor: String!) {
      change_simple_column_value(
        board_id: ${BOARD_OBRAS}
        item_id: ${itemId}
        column_id: "${COL.observaciones}"
        value: $valor
        create_labels_if_missing: false
      ) { id }
    }`,
    { valor: texto },
  )
}

/**
 * Vacía una columna de archivos.
 *
 * Se usa para sacar un adjunto cargado por equivocación. Va con `change_column_value` y no con la
 * versión "simple" porque el valor es un objeto (`{"clear_all": true}`), que es como Monday pide
 * borrar los archivos de una columna: no existe un "quitar este archivo".
 */
export async function limpiarArchivos(itemId: string, columna: string): Promise<void> {
  await mondayApi(
    `mutation ($valor: JSON!) {
      change_column_value(
        board_id: ${BOARD_OBRAS}
        item_id: ${itemId}
        column_id: "${columna}"
        value: $valor
      ) { id }
    }`,
    { valor: JSON.stringify({ clear_all: true }) },
  )
}

/**
 * Deja una columna de estado SIN valor.
 *
 * No es lo mismo que ponerle una etiqueta de "no enviado": vacío significa "acá todavía no pasó
 * nada", y es lo único honesto que se puede decir de una orden recién generada. Va con
 * `change_column_value` porque borrar pide un objeto (`{}`), no un texto.
 */
export async function limpiarEstado(itemId: string, columna: string): Promise<void> {
  await mondayApi(
    `mutation ($valor: JSON!) {
      change_column_value(
        board_id: ${BOARD_OBRAS}
        item_id: ${itemId}
        column_id: "${columna}"
        value: $valor
      ) { id }
    }`,
    { valor: JSON.stringify({}) },
  )
}

/** Cambia una columna status por su etiqueta (la etiqueta tiene que existir en el tablero). */
export async function setEstado(itemId: string, columna: string, etiqueta: string): Promise<void> {
  await mondayApi(
    `mutation ($valor: String!) {
      change_simple_column_value(
        board_id: ${BOARD_OBRAS}
        item_id: ${itemId}
        column_id: "${columna}"
        value: $valor
        create_labels_if_missing: false
      ) { id }
    }`,
    { valor: etiqueta },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Historial de actividades (updates del ítem)
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Un update puntual, por su id.
 *
 * Es el camino bueno cuando el escenario contesta con el id del update que acaba de escribir: se
 * lee EXACTAMENTE ese, sin filtrar por fecha ni adivinar cuál de los últimos es el que corresponde.
 */
export async function getActividadPorId(updateId: string): Promise<Actividad | null> {
  const d = await mondayApi<{
    updates: { id: string; body: string; created_at: string; creator: { name: string } | null }[]
  }>(
    `query ($ids: [ID!]) {
      updates(ids: $ids) { id body created_at creator { name } }
    }`,
    { ids: [updateId] },
  )
  const u = d.updates?.[0]
  return u
    ? { id: u.id, body: u.body ?? '', fecha: u.created_at, autor: u.creator?.name ?? 'Automatización' }
    : null
}

/**
 * El update que la automatización dejó DESPUÉS del momento indicado.
 *
 * Es el plan B de `getActividadPorId`: sirve cuando la respuesta del escenario no llegó a tiempo y
 * el único dato disponible es que el tablero quedó en error.
 *
 * Es lo que se muestra cuando una corrida falla. Se filtra por fecha a propósito: el ítem arrastra
 * updates de corridas viejas —de hace semanas— y mostrarlos como si fueran el resultado de lo que
 * el usuario acaba de hacer es peor que no mostrar nada. Si esta corrida no escribió nada, devuelve
 * `null` y la pantalla lo dice así.
 */
export async function getActividadDesde(itemId: string, desdeMs: number): Promise<Actividad | null> {
  const recientes = await getActividades(itemId, 3)
  return recientes.find((a) => new Date(a.fecha).getTime() >= desdeMs) ?? null
}

/** Las últimas entradas del historial del ítem, de la más nueva a la más vieja. */
export async function getActividades(itemId: string, limite = 30): Promise<Actividad[]> {
  const d = await mondayApi<{
    items: { updates: { id: string; body: string; created_at: string; creator: { name: string } | null }[] }[]
  }>(
    `query ($ids: [ID!], $limit: Int!) {
      items(ids: $ids) {
        updates(limit: $limit) { id body created_at creator { name } }
      }
    }`,
    { ids: [itemId], limit: limite },
  )
  return (d.items?.[0]?.updates ?? []).map((u) => ({
    id: u.id,
    body: u.body ?? '',
    fecha: u.created_at,
    autor: u.creator?.name ?? 'Automatización',
  }))
}

/**
 * Deja constancia en el historial del ítem. Cada acción que la app dispara —adjuntar el ETMO,
 * pedir la generación de la OP, mandarla al cliente o al taller— queda escrita acá, así el
 * tablero cuenta la misma historia que la app.
 */
export async function registrarActividad(itemId: string, cuerpoHtml: string): Promise<void> {
  await mondayApi(
    `mutation ($item: ID!, $body: String!) {
      create_update(item_id: $item, body: $body) { id }
    }`,
    { item: itemId, body: cuerpoHtml },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Espera activa
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Una etiqueta de status con el MOMENTO en que cambió.
 *
 * El `changed_at` es la diferencia entre "la columna dice Enviado" y "la columna pasó a Enviado
 * recién". Sin él, una obra que ya tenía el estado puesto de una corrida anterior hace que la app
 * dé por terminado algo que ni siquiera empezó. Pasó exactamente eso con el envío al cliente.
 */
export interface EstadoConFecha {
  texto: string
  /** Milisegundos epoch del último cambio; 0 si la columna nunca se tocó. */
  cambio: number
}

function estadoConFecha(cv?: CV): EstadoConFecha {
  const texto = limpiar(cv?.text ?? '')
  const raw = (cv as { value?: string | null } | undefined)?.value
  let cambio = 0
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { changed_at?: string }
      const t = parsed.changed_at ? Date.parse(parsed.changed_at) : NaN
      cambio = Number.isFinite(t) ? t : 0
    } catch {
      cambio = 0
    }
  }
  return { texto, cambio }
}

const SIN_ESTADO: EstadoConFecha = { texto: '', cambio: 0 }

/**
 * Lee UNAS POCAS columnas de status con su fecha de cambio.
 *
 * Es la consulta que se repite cada pocos segundos mientras un escenario trabaja, así que pide sólo
 * lo que se mira. Y viene con el `changed_at` porque lo que importa no es qué dice la columna, sino
 * si cambió DESPUÉS de que el usuario apretó el botón: una obra puede arrastrar un "Enviado" de
 * hace meses, y darlo por bueno sería informar un envío que nunca ocurrió.
 */
export async function getEstadosConFecha(
  itemId: string,
  columnas: string[],
): Promise<Record<string, EstadoConFecha>> {
  const d = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ${JSON.stringify(columnas)}) { id text value }
      }
    }`,
    { ids: [itemId] },
  )
  const item = d.items?.[0]
  const c = item ? byId(item) : {}
  return Object.fromEntries(columnas.map((id) => [id, c[id] ? estadoConFecha(c[id]) : SIN_ESTADO]))
}

/** Estados del envío de la OP al cliente, con la fecha de su último cambio. */
export interface EstadoEnvio {
  /** 🤖 Estado de Envío OP: Enviar | Enviando | Enviado | Error de Envío. */
  envioOp: EstadoConFecha
  /** Mjs Enviado Cliente: Enviado | Error Envio. */
  mensajeCliente: EstadoConFecha
}

/** Lo que hay que mirar mientras el escenario manda el mensaje al cliente. */
export async function getEstadoEnvio(itemId: string): Promise<EstadoEnvio> {
  const c = await getEstadosConFecha(itemId, [COL.estadoEnvioOp, COL.mjsEnviadoCliente])
  return {
    envioOp: c[COL.estadoEnvioOp] ?? SIN_ESTADO,
    mensajeCliente: c[COL.mjsEnviadoCliente] ?? SIN_ESTADO,
  }
}

/** Lo que hay que mirar mientras el escenario manda la orden al taller. */
export async function getEstadoTaller(itemId: string): Promise<EstadoConFecha> {
  const c = await getEstadosConFecha(itemId, [COL.estadoEnvioTaller])
  return c[COL.estadoEnvioTaller] ?? SIN_ESTADO
}

/** Lo único que hay que mirar para saber cómo va la generación de la OP final. */
export interface EstadoOp {
  /** Etiqueta de 🤖Estado Orden de Prod Final: Generar | Generando | Generado | Error - Ver Update. */
  estado: string
  /** Archivos de la columna 🤖OP Final. */
  opFinal: ArchivoObra[]
}

/**
 * Estado de la generación, con la consulta MÍNIMA: dos columnas de un ítem.
 *
 * Esto es lo que se pregunta cada pocos segundos mientras el escenario trabaja, así que pedir la
 * obra entera —cuarenta columnas, conexiones y espejos incluidos— sería pagar cuarenta veces por el
 * dato que se necesita. La obra completa se relee UNA vez, recién cuando la corrida termina.
 */
export async function getEstadoOp(itemId: string): Promise<EstadoOp> {
  const d = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ${JSON.stringify([COL.estadoOpFinal, COL.opFinal])}) { id text value }
      }
    }`,
    { ids: [itemId] },
  )
  const item = d.items?.[0]
  if (!item) return { estado: '', opFinal: [] }
  const c = byId(item)
  return {
    estado: limpiar(c[COL.estadoOpFinal]?.text ?? ''),
    opFinal: archivos(c[COL.opFinal]),
  }
}

/**
 * Relee la obra cada `intervalo` hasta que `cumple` diga que sí, o hasta agotar el tiempo.
 *
 * Lo usan los pasos que disparan un escenario de Make: el webhook contesta enseguida ("Accepted")
 * pero el trabajo recién empieza, así que la única forma de saber cómo terminó es mirar el tablero,
 * que es donde el escenario deja el resultado. Devuelve la última obra leída —cumpla o no— para que
 * la vista muestre siempre el estado real.
 */
export async function esperarEnTablero(
  itemId: string,
  cumple: (obra: Obra) => boolean,
  opciones: { timeoutMs?: number; intervaloMs?: number; onLatido?: (obra: Obra) => void } = {},
): Promise<{ obra: Obra | null; cumplio: boolean }> {
  const { timeoutMs = 180_000, intervaloMs = 5_000, onLatido } = opciones
  const limite = Date.now() + timeoutMs
  let ultima: Obra | null = null

  for (;;) {
    ultima = await getObra(itemId)
    if (ultima) {
      onLatido?.(ultima)
      if (cumple(ultima)) return { obra: ultima, cumplio: true }
    }
    if (Date.now() >= limite) return { obra: ultima, cumplio: false }
    await new Promise((r) => setTimeout(r, intervaloMs))
  }
}
