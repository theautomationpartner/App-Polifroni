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
import { byId, valor, type CV, type MondayItem } from './parse'
import { mondayApi, mondaySubirArchivo, urlArchivo } from './sdk'
import type { Actividad, ArchivoObra, EstadoObra, Obra, ObraFila } from '@/types'

/* ────────────────────────────────────────────────────────────────────────────────
 * Estructura del tablero (para pintar las etiquetas con SU color)
 * ──────────────────────────────────────────────────────────────────────────────── */

interface ColumnaBoard {
  id: string
  title: string
  type: string
  /** texto de la etiqueta → color hexadecimal que le puso Monday. */
  colores: Record<string, string>
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
      }
    }
    salida[c.id] = { id: c.id, title: c.title, type: c.type, colores }
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

    celCoordinar: txt(COL.celCoordinar),
    ubicacion: txt(COL.ubicacion),
    tipo: estado(c, estructura, COL.tipo),
    etapaProduccion: estado(c, estructura, COL.etapaProduccion),
    etapaVenta: estado(c, estructura, COL.etapaVenta),
    premarco: estado(c, estructura, COL.premarco),
    coordinarEntrega: estado(c, estructura, COL.coordinarEntrega),
    fechaColocacion: txt(COL.fechaColocacion),
    totalPactado: txt(COL.totalPactado),
    saldo: txt(COL.saldo),
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
function aFila(item: MondayItem): ObraFila {
  const c = byId(item)
  return {
    id: item.id,
    nombre: item.name,
    cliente: limpiar(valor(c[COL.ctaCteCliente]) ?? ''),
    tipo: limpiar(c[COL.tipo]?.text ?? ''),
    etapaProduccion: limpiar(c[COL.etapaProduccion]?.text ?? ''),
  }
}

const CAMPOS_FILA = `
  id
  name
  column_values(ids: ${JSON.stringify([COL.ctaCteCliente, COL.tipo, COL.etapaProduccion])}) {
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
 * Obras del tablero, de a una página. Con `termino` filtra por nombre (contiene); sin término
 * lista el tablero entero paginado. NO se traen todos los ítems de una: el board tiene cientos y
 * la app pagina de 15 o 25 como la lista de Monday.
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
    return { filas: (d.items ?? []).map(aFila), cursor: null }
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

  const page = d.boards[0]?.items_page
  return { filas: (page?.items ?? []).map(aFila), cursor: page?.cursor ?? null }
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
  const page = d.next_items_page
  return { filas: (page?.items ?? []).map(aFila), cursor: page?.cursor ?? null }
}

/** Fila de una obra puntual (la que la app muestra de arranque, sin listar el tablero entero). */
export async function getFilasPorId(ids: string[]): Promise<ObraFila[]> {
  if (ids.length === 0) return []
  const d = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_FILA} } }`,
    { ids },
  )
  return (d.items ?? []).map(aFila)
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
