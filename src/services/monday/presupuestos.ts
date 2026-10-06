/**
 * 📄 Presupuestos (9984126961): un ítem por cliente o constructor —la "bolsa" de sus presupuestos— y,
 * adentro, un SUBELEMENTO por cada presupuesto que se le mandó (tablero 9984270591).
 *
 * El tablero ya existía y lo usa la gente —tiene su botón "✋Crear Obra" y sus escenarios—, así que la
 * app escribe en SUS columnas y con SUS etiquetas; no se crea nada nuevo.
 *
 *  - La bolsa vincula al cliente (👤 Clientes 9617181550) y/o al constructor/arquitecto
 *    (👤 Constructor/Arquitecto 9618146225). No pasa por las cuentas corrientes.
 *  - Mientras la bolsa recibe presupuestos queda en "Solicitud de Presupuesto": es lo que lista
 *    "Cargar otro presupuesto".
 *  - El tipo de carpintería, el color, el PDF y la fecha de envío son de cada SUBELEMENTO.
 */
import type { ArchivoObra } from '@/types'
import { memoGlobal } from './cache'
import { archivosDeColumna, subirArchivo } from './obras'
import { byId, valor, type CV } from './parse'
import { mondayApi } from './sdk'

export const BOARD_PRESUPUESTOS = 9984126961
export const BOARD_SUB_PRESUPUESTOS = 9984270591
export const BOARD_CONTACTO = { Cliente: 9617181550, Constructor: 9618146225 } as const

/** El grupo "Presupuestos" del tablero: donde nacen las bolsas. */
const GRUPO_PRESUPUESTOS = 'topics'

/** Columnas del ítem (la bolsa) que usa la app. */
export const COL_PRES = {
  cliente: 'board_relation_mkvgt8r',
  arquitecto: 'board_relation_mkvgk8yb',
  celCliente: 'lookup_mkvtcwtk',
  celConstructor: 'lookup_mkvg31f4',
  /** ✋Enviar a: Ambos | Cliente | Arquitecto. */
  enviarA: 'color_mkwty7e5',
  /** 🤖Estado Presupuesto. */
  estado: 'color_mkvg6w7v',
  idPresupuesto: 'pulse_id_mkvgv9tn',
  creacion: 'pulse_log_mkwkx88a',
} as const

/** Columnas del subelemento (cada presupuesto enviado). */
export const COL_SUB = {
  tipo: 'dropdown_mkvgn9kx',
  color: 'dropdown_mkvgvy84',
  pdf: 'file_mkvg4p64',
  /** 🤖 Estado de Envio. OJO: `✋Enviar` (color_mkvg4tax) es el botón del escenario de Make que
      manda el presupuesto: la app NUNCA lo toca, o el presupuesto saldría dos veces. */
  estadoEnvio: 'color_mkvgch3n',
  idPdf: 'pulse_id_mkvgbfmj',
  fechaEnvio: 'date_mm1zw6h1',
  /** 🤖Clave Confirmacion: la clave del enlace de confirmación que salió en el mensaje. */
  clave: 'text_mm7wn1jz',
} as const

/** Etiquetas del tablero que escribe la app. */
export const ETIQUETA_PRES = {
  solicitud: 'Solicitud de Presupuesto',
  /** Índice de "Solicitud de Presupuesto" en `🤖Estado Presupuesto`: más estable que el texto. */
  indiceSolicitud: 5,
  enviado: 'Enviado',
} as const

/* La columna de celular es la misma en los dos tableros de contactos. */
export const COL_CONTACTO = { celular: 'phone_mksydcv6', email: 'email_mksynch6' } as const

const ids = (cv?: CV) => (cv?.linked_item_ids ?? []).map(String)
/** Un espejo que refleja varios valores ("549…, 549…"): el primero. */
const primero = (cv?: CV) => valor(cv).split(',')[0]?.trim() ?? ''

/* ────────────────────────────────────────────────────────────────────────────────
 * Clientes y constructores
 * ──────────────────────────────────────────────────────────────────────────────── */

export type TipoContacto = keyof typeof BOARD_CONTACTO

/** Un cliente o un constructor/arquitecto, como lo necesita el presupuesto. */
export interface Contacto {
  id: string
  nombre: string
  /** Sólo dígitos. Vacío: no tiene. */
  celular: string
  email: string
}

interface Pagina {
  cursor: string | null
  items: { id: string; name: string }[]
}

/**
 * Índice de nombres de un tablero de contactos, para el buscador rápido. Clientes tiene más de 3.000
 * ítems: se entrega a medida que llega cada página (`onAvance` recibe siempre lo acumulado) y queda en
 * memoria, así volver a la etapa no lo vuelve a pedir.
 */
const indices: Record<TipoContacto, { lista: { id: string; nombre: string }[]; completo: boolean; enCurso: Promise<void> | null; avisar: Set<(l: { id: string; nombre: string }[]) => void> }> = {
  Cliente: { lista: [], completo: false, enCurso: null, avisar: new Set() },
  Constructor: { lista: [], completo: false, enCurso: null, avisar: new Set() },
}

export function cargarIndiceContactos(tipo: TipoContacto, onAvance: (lista: { id: string; nombre: string }[]) => void): () => void {
  const ix = indices[tipo]
  ix.avisar.add(onAvance)
  if (ix.lista.length) onAvance(ix.lista)
  if (!ix.completo && !ix.enCurso) {
    ix.enCurso = leerIndice(tipo)
      .then(() => {
        ix.completo = true
      })
      .catch(() => {
        /* Un fallo no se guarda: la próxima visita reintenta. Lo leído hasta acá sigue sirviendo. */
      })
      .finally(() => {
        ix.enCurso = null
      })
  }
  return () => {
    ix.avisar.delete(onAvance)
  }
}

async function leerIndice(tipo: TipoContacto): Promise<void> {
  const ix = indices[tipo]
  const acumulado: { id: string; nombre: string }[] = []
  const publicar = (p: Pagina) => {
    for (const i of p.items) acumulado.push({ id: String(i.id), nombre: i.name })
    ix.lista = [...acumulado]
    ix.avisar.forEach((f) => f(ix.lista))
  }
  const d = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query { boards(ids: [${BOARD_CONTACTO[tipo]}]) { items_page(limit: 500) { cursor items { id name } } } }`,
  )
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 20; vuelta++) {
    publicar(pagina)
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { id name } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
}

/** El botón Buscar: los contactos cuyo nombre contiene lo escrito, o el que tiene ese id. */
export async function buscarContactos(tipo: TipoContacto, texto: string, limite = 50): Promise<{ id: string; nombre: string }[]> {
  const t = texto.trim()
  const board = BOARD_CONTACTO[tipo]
  if (/^\d{6,}$/.test(t)) {
    const d = await mondayApi<{ items: { id: string; name: string; board: { id: string } }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { id name board { id } } }`,
      { ids: [t] },
    )
    return d.items.filter((i) => String(i.board.id) === String(board)).map((i) => ({ id: String(i.id), nombre: i.name }))
  }
  const d = await mondayApi<{ boards: { items_page: { items: { id: string; name: string }[] } }[] }>(
    `query ($t: CompareValue!, $lim: Int!) {
      boards(ids: [${board}]) {
        items_page(limit: $lim, query_params: { rules: [{ column_id: "name", compare_value: $t, operator: contains_text }] }) { items { id name } }
      }
    }`,
    { t: [t], lim: limite },
  )
  return (d.boards[0]?.items_page.items ?? []).map((i) => ({ id: String(i.id), nombre: i.name }))
}

/** El contacto con su celular y su e-mail. `null` si el id no es de ese tablero. */
export async function getContacto(tipo: TipoContacto, id: string): Promise<Contacto | null> {
  const d = await mondayApi<{ items: { id: string; name: string; board: { id: string }; column_values: CV[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { id name board { id } column_values(ids: ${JSON.stringify([COL_CONTACTO.celular, COL_CONTACTO.email])}) { id text } }
    }`,
    { ids: [id] },
  )
  const i = d.items[0]
  if (!i || String(i.board.id) !== String(BOARD_CONTACTO[tipo])) return null
  const c = byId(i)
  return {
    id: String(i.id),
    nombre: i.name,
    celular: valor(c[COL_CONTACTO.celular]).replace(/\D/g, ''),
    email: valor(c[COL_CONTACTO.email]).trim(),
  }
}

/** Cambia el `✋Cel-WHATSAPP` del cliente o del constructor. `celular` en dígitos, con el 54. */
export async function actualizarCelularContacto(tipo: TipoContacto, id: string, celular: string): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    {
      board: String(BOARD_CONTACTO[tipo]),
      id,
      valores: JSON.stringify({ [COL_CONTACTO.celular]: { phone: celular, countryShortName: 'AR' } }),
    },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Las opciones de la carga: tipo de carpintería y color
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface OpcionesPresupuesto {
  tipos: string[]
  colores: string[]
}

/** Las etiquetas vigentes de un dropdown, en el orden del tablero (las desactivadas no se ofrecen). */
const etiquetas = (settings: string): string[] => {
  try {
    const s = JSON.parse(settings || '{}') as { labels?: { id: number; name: string; is_deactivated?: boolean }[] }
    return (s.labels ?? []).filter((l) => !l.is_deactivated && l.name.trim()).map((l) => l.name.trim())
  } catch {
    return []
  }
}

/** `✋Tipo de Carpinteria` y `✋ Color`, leídos de las columnas del subelemento. */
export const getOpcionesPresupuesto = memoGlobal(async (): Promise<OpcionesPresupuesto> => {
  const d = await mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    `query { boards(ids: [${BOARD_SUB_PRESUPUESTOS}]) { columns(ids: ${JSON.stringify([COL_SUB.tipo, COL_SUB.color])}) { id settings_str } } }`,
  )
  const cols = d.boards[0]?.columns ?? []
  const de = (id: string) => etiquetas(cols.find((c) => c.id === id)?.settings_str ?? '')
  return { tipos: de(COL_SUB.tipo), colores: de(COL_SUB.color) }
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Las bolsas abiertas ("Solicitud de Presupuesto")
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Un presupuesto ya enviado: un subelemento de la bolsa. */
export interface PresupuestoEnviado {
  id: string
  nombre: string
  tipo: string
  color: string
  /** `YYYY-MM-DD`. Vacío en los que no la tienen. */
  fechaEnvio: string
  estadoEnvio: string
  /** El PDF del presupuesto (`✋Presupuesto pdf`). `null` si no tiene. */
  pdf: ArchivoObra | null
}

/** Una bolsa de presupuestos, con a quién pertenece y lo que ya se le mandó. */
export interface BolsaPresupuesto {
  id: string
  nombre: string
  /** 🤖ID Presupuesto (IDPRES-846). */
  idPresupuesto: string
  creacion: string
  cliente: Contacto | null
  arquitecto: Contacto | null
  /** ✋Enviar a, tal cual: Ambos | Cliente | Arquitecto. */
  enviarA: string
  presupuestos: PresupuestoEnviado[]
}

export const CAMPOS_BOLSA = `
  id name
  column_values(ids: ${JSON.stringify([
    COL_PRES.cliente,
    COL_PRES.arquitecto,
    COL_PRES.celCliente,
    COL_PRES.celConstructor,
    COL_PRES.enviarA,
    COL_PRES.idPresupuesto,
    COL_PRES.creacion,
  ])}) {
    id text
    ... on MirrorValue { display_value }
    ... on BoardRelationValue { display_value linked_item_ids }
  }
  subitems {
    id name
    column_values(ids: ${JSON.stringify([COL_SUB.tipo, COL_SUB.color, COL_SUB.fechaEnvio, COL_SUB.estadoEnvio, COL_SUB.pdf])}) { id text value }
  }
`

export type ItemBolsa = { id: string; name: string; column_values: CV[]; subitems: { id: string; name: string; column_values: CV[] }[] | null }

/** El vínculo y su espejo de celular, como contacto. El e-mail no se espeja en la bolsa. */
const contactoDe = (rel?: CV, cel?: CV): Contacto | null => {
  const id = ids(rel)[0]
  if (!id) return null
  return { id, nombre: (rel?.display_value ?? rel?.text ?? '').split(',')[0]?.trim() ?? '', celular: primero(cel).replace(/\D/g, ''), email: '' }
}

/** El PDF de una columna file (si hay varios archivos, el primero que no es imagen). */
const pdfDe = (cv?: CV): ArchivoObra | null => {
  const a = archivosDeColumna(cv)
  return a.find((x) => !x.esImagen) ?? a[0] ?? null
}

export function bolsaDe(i: ItemBolsa): BolsaPresupuesto {
  const c = byId(i)
  return {
    id: String(i.id),
    nombre: i.name,
    idPresupuesto: valor(c[COL_PRES.idPresupuesto]),
    creacion: valor(c[COL_PRES.creacion]),
    cliente: contactoDe(c[COL_PRES.cliente], c[COL_PRES.celCliente]),
    arquitecto: contactoDe(c[COL_PRES.arquitecto], c[COL_PRES.celConstructor]),
    enviarA: valor(c[COL_PRES.enviarA]),
    presupuestos: (i.subitems ?? []).map((s) => {
      const sc = byId(s)
      return {
        id: String(s.id),
        nombre: s.name,
        tipo: valor(sc[COL_SUB.tipo]),
        color: valor(sc[COL_SUB.color]),
        fechaEnvio: valor(sc[COL_SUB.fechaEnvio]),
        estadoEnvio: valor(sc[COL_SUB.estadoEnvio]),
        pdf: pdfDe(sc[COL_SUB.pdf]),
      }
    }),
  }
}

/**
 * Las bolsas en "Solicitud de Presupuesto": las únicas a las que se les carga otro presupuesto. Se
 * filtran en Monday por el índice de la etiqueta, así no se trae el tablero entero (más de 700).
 */
export async function listarBolsasAbiertas(): Promise<BolsaPresupuesto[]> {
  interface PaginaBolsas {
    cursor: string | null
    items: ItemBolsa[]
  }
  const d = await mondayApi<{ boards: { items_page: PaginaBolsas }[] }>(
    `query {
      boards(ids: [${BOARD_PRESUPUESTOS}]) {
        items_page(limit: 200, query_params: { rules: [{ column_id: "${COL_PRES.estado}", compare_value: [${ETIQUETA_PRES.indiceSolicitud}], operator: any_of }] }) {
          cursor items { ${CAMPOS_BOLSA} }
        }
      }
    }`,
  )
  const todas: ItemBolsa[] = []
  let pagina: PaginaBolsas | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 10; vuelta++) {
    todas.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: PaginaBolsas } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${CAMPOS_BOLSA} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return todas.map(bolsaDe)
}

/** Una bolsa, releída del tablero (con su estado, para saber si sigue abierta). */
export async function leerBolsa(id: string): Promise<(BolsaPresupuesto & { estado: string }) | null> {
  const d = await mondayApi<{ items: (ItemBolsa & { board: { id: string }; estado: CV[] })[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { board { id } ${CAMPOS_BOLSA} estado: column_values(ids: ["${COL_PRES.estado}"]) { id text } }
    }`,
    { ids: [id] },
  )
  const i = d.items[0]
  if (!i || String(i.board.id) !== String(BOARD_PRESUPUESTOS)) return null
  return { ...bolsaDe(i), estado: i.estado[0]?.text ?? '' }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Escrituras
 * ──────────────────────────────────────────────────────────────────────────────── */

const relacion = (c: Contacto | null) => (c ? { item_ids: [Number(c.id)] } : undefined)

/**
 * Crea la bolsa: el ítem del presupuesto, con el cliente y/o el constructor, a quién se le envió y en
 * "Solicitud de Presupuesto" (abierta a recibir más presupuestos).
 */
export async function crearBolsa(a: {
  nombre: string
  cliente: Contacto | null
  arquitecto: Contacto | null
  enviarA: string
}): Promise<string> {
  const valores: Record<string, unknown> = {
    [COL_PRES.estado]: { label: ETIQUETA_PRES.solicitud },
  }
  if (a.cliente) valores[COL_PRES.cliente] = relacion(a.cliente)
  if (a.arquitecto) valores[COL_PRES.arquitecto] = relacion(a.arquitecto)
  if (a.enviarA) valores[COL_PRES.enviarA] = { label: a.enviarA }
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_PRESUPUESTOS}, group_id: "${GRUPO_PRESUPUESTOS}", item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: a.nombre, valores: JSON.stringify(valores) },
  )
  return String(d.create_item.id)
}

/** A quién se le mandó esta vez (✋Enviar a), en una bolsa que ya existía. */
export async function actualizarEnviarA(bolsaId: string, enviarA: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: bolsaId, valores: JSON.stringify({ [COL_PRES.enviarA]: { label: enviarA } }) },
  )
}

/**
 * Crea el subelemento del presupuesto enviado: tipo de carpintería, color, "Enviado", la fecha del
 * envío y la clave del enlace de confirmación. El PDF se sube aparte (`subirPdfPresupuesto`): por `column_values` sólo viaja JSON.
 */
export async function crearPresupuestoEnviado(a: {
  bolsaId: string
  tipo: string
  color: string
  /** `YYYY-MM-DD`. */
  fechaEnvio: string
  /** La clave del enlace de confirmación (`itemId` del enlace). */
  clave: string
}): Promise<string> {
  const valores = {
    [COL_SUB.tipo]: { labels: [a.tipo] },
    [COL_SUB.color]: { labels: [a.color] },
    [COL_SUB.estadoEnvio]: { label: ETIQUETA_PRES.enviado },
    [COL_SUB.fechaEnvio]: { date: a.fechaEnvio },
    [COL_SUB.clave]: a.clave,
  }
  const d = await mondayApi<{ create_subitem: { id: string } }>(
    `mutation ($padre: ID!, $valores: JSON!) {
      create_subitem(parent_item_id: $padre, item_name: "Presupuesto", column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { padre: a.bolsaId, valores: JSON.stringify(valores) },
  )
  return String(d.create_subitem.id)
}

export async function subirPdfPresupuesto(subitemId: string, archivo: File): Promise<void> {
  await subirArchivo(subitemId, COL_SUB.pdf, archivo)
}

/**
 * Le da al subelemento el nombre que usa el tablero: su `🤖ID PDF` (IDPDF-1221). El id recién existe
 * después de crearlo, por eso va en un segundo paso. Si no se puede leer, queda "Presupuesto".
 */
export async function nombrarPresupuestoEnviado(subitemId: string): Promise<void> {
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL_SUB.idPdf}"]) { id text } } }`,
    { ids: [subitemId] },
  )
  const nombre = (d.items[0]?.column_values[0]?.text ?? '').trim()
  if (!nombre) return
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_SUB_PRESUPUESTOS}, item_id: $id, column_values: $valores) { id }
    }`,
    { id: subitemId, valores: JSON.stringify({ name: nombre }) },
  )
}
