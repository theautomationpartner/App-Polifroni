/**
 * 📄 Presupuestos (9984126961): un ítem por cliente o constructor —la "bolsa" de sus presupuestos— y,
 * adentro, un SUBELEMENTO por cada presupuesto que se le mandó (tablero 9984270591).
 *
 * El tablero ya existía y lo usa la gente —tiene su botón "✋Crear Obra" y sus escenarios—, así que la
 * app escribe en SUS columnas y con SUS etiquetas; no se crea nada nuevo.
 *
 *  - La bolsa vincula al cliente (👤 Clientes 9617181550) y/o al constructor/arquitecto
 *    (👤 Constructor/Arquitecto 9618146225). No pasa por las cuentas corrientes.
 *  - El tipo de carpintería, el color, el PDF y la fecha de envío son de cada SUBELEMENTO.
 */
import type { ArchivoObra } from '@/types'
import { normalizarCelular } from '@/lib/destinatario'
import { indiceDeValor } from '@/lib/estadosOp'
import { CAMPOS_FICHA, valoresMonday } from '@/lib/fichaContacto'
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
  /** 🤖Creado por: el usuario de la app que creó la bolsa (columna creada el 13/10/2026). La obra que
      nace de su confirmación lo toma como ✋Asignado a:. */
  creadoPor: 'multiple_person_mm83jvyr',
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
  /** 🤖 Estado de Confirmacion: Confirmado | Rechazado | Error de Confirmacion (vacío: sin respuesta). */
  confirmacion: 'color_mm0dsv6p',
  /** 🤖Motivo: por qué se rechazó. */
  motivo: 'text_mm7wmv13',
} as const

/** Etiquetas del tablero que escribe la app. */
export const ETIQUETA_PRES = {
  /** El estado del ítem cuando se envía su primer presupuesto (regla del usuario, 13/10/2026). */
  presupuestoEnviado: 'Presupuesto Enviado',
  solicitud: 'Solicitud de Presupuesto',
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

/** La columna del CUIT/CUIL/DNI de cada tablero: texto en Clientes, número en Constructor/Arquitecto. */
const COL_CUIT = { Cliente: 'text_mkwzq9z4', Constructor: 'numeric_mksy21gb' } as const

/** Los contactos cuyo CUIT/CUIL es éste. En Clientes hay valores cargados con guiones. */
async function buscarPorCuit(tipo: TipoContacto, digitos: string, limite: number): Promise<{ id: string; nombre: string }[]> {
  const valores = [digitos]
  if (tipo === 'Cliente' && digitos.length === 11) valores.push(`${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`)
  const d = await mondayApi<{ boards: { items_page: { items: { id: string; name: string }[] } }[] }>(
    `query ($v: CompareValue!, $lim: Int!) {
      boards(ids: [${BOARD_CONTACTO[tipo]}]) {
        items_page(limit: $lim, query_params: { rules: [{ column_id: "${COL_CUIT[tipo]}", compare_value: $v, operator: any_of }] }) { items { id name } }
      }
    }`,
    { v: valores, lim: limite },
  )
  return (d.boards[0]?.items_page.items ?? []).map((i) => ({ id: String(i.id), nombre: i.name }))
}

/** El contacto de ese id de ítem, si es de este tablero. */
async function buscarPorId(tipo: TipoContacto, id: string): Promise<{ id: string; nombre: string }[]> {
  const d = await mondayApi<{ items: { id: string; name: string; board: { id: string } }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { id name board { id } } }`,
    { ids: [id] },
  )
  return d.items.filter((i) => String(i.board.id) === String(BOARD_CONTACTO[tipo])).map((i) => ({ id: String(i.id), nombre: i.name }))
}

/**
 * El botón Buscar: los contactos cuyo nombre contiene lo escrito, el que tiene ese CUIT/CUIL (con o sin
 * guiones) o el que tiene ese id. Un número de 11 dígitos puede ser un CUIT o un id de ítem (ya los hay de
 * 11 dígitos): se prueba con los dos.
 */
export async function buscarContactos(tipo: TipoContacto, texto: string, limite = 50): Promise<{ id: string; nombre: string }[]> {
  const t = texto.trim()
  const numero = /^[\d.\-\s]+$/.test(t) ? t.replace(/\D/g, '') : ''
  if (numero.length === 11) {
    const [porCuit, porId] = await Promise.all([buscarPorCuit(tipo, numero, limite), /^\d+$/.test(t) ? buscarPorId(tipo, t) : []])
    return [...porCuit, ...porId.filter((i) => !porCuit.some((c) => c.id === i.id))]
  }
  if (/^\d{6,}$/.test(t)) return buscarPorId(tipo, t)
  const d = await mondayApi<{ boards: { items_page: { items: { id: string; name: string }[] } }[] }>(
    `query ($t: CompareValue!, $lim: Int!) {
      boards(ids: [${BOARD_CONTACTO[tipo]}]) {
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

/** Lo que muestra el formulario de edición de un contacto: sus valores y las opciones de cada estado. */
export interface FichaContacto {
  /** Por columna (`name` = el nombre). El celular, en dígitos. */
  valores: Record<string, string>
  /** Las etiquetas vigentes de cada columna de estado, en el orden del tablero. */
  opciones: Record<string, string[]>
}

/** Las etiquetas de un status, en el orden del tablero (las desactivadas no se ofrecen). */
function etiquetasEstado(settings: string): string[] {
  try {
    const s = JSON.parse(settings || '{}') as {
      labels?: Record<string, string>
      labels_positions_v2?: Record<string, number>
      deactivated_labels?: number[]
    }
    const fuera = new Set((s.deactivated_labels ?? []).map(String))
    return Object.entries(s.labels ?? {})
      .filter(([i, t]) => t.trim() && !fuera.has(i))
      .sort(([a], [b]) => (s.labels_positions_v2?.[a] ?? 0) - (s.labels_positions_v2?.[b] ?? 0))
      .map(([, t]) => t)
  } catch {
    return []
  }
}

/**
 * Los datos de un cliente o de un constructor/arquitecto, recién leídos de Monday, para editarlos
 * (regla del usuario, 14/10/2026). Ver `CAMPOS_FICHA`.
 */
export async function leerFichaContacto(tipo: TipoContacto, id: string): Promise<FichaContacto> {
  const campos = CAMPOS_FICHA[tipo]
  const columnas = campos.filter((c) => c.id !== 'name').map((c) => c.id)
  const estados = campos.filter((c) => c.tipo === 'estado').map((c) => c.id)
  const d = await mondayApi<{
    items: { name: string; column_values: CV[] }[]
    boards: { columns: { id: string; settings_str: string }[] }[]
  }>(
    `query ($ids: [ID!], $cols: [String!], $estados: [String!]) {
      items(ids: $ids) { name column_values(ids: $cols) { id text } }
      boards(ids: [${BOARD_CONTACTO[tipo]}]) { columns(ids: $estados) { id settings_str } }
    }`,
    { ids: [id], cols: columnas, estados },
  )
  const i = d.items[0]
  if (!i) throw new Error('El contacto ya no está en el tablero.')
  const c = byId(i)
  const valores: Record<string, string> = {}
  for (const campo of campos) {
    const v = campo.id === 'name' ? i.name : valor(c[campo.id])
    valores[campo.id] = campo.tipo === 'celular' ? v.replace(/\D/g, '') : v.trim()
  }
  const opciones = Object.fromEntries((d.boards[0]?.columns ?? []).map((col) => [col.id, etiquetasEstado(col.settings_str)]))
  return { valores, opciones }
}

/**
 * Guarda lo que se editó del contacto, en UNA mutation y sólo con lo que cambió (`valoresMonday`).
 * Devuelve el contacto como queda, para la card.
 */
export async function guardarFichaContacto(
  tipo: TipoContacto,
  id: string,
  antes: Record<string, string>,
  despues: Record<string, string>,
): Promise<Contacto> {
  const valores = valoresMonday(CAMPOS_FICHA[tipo], antes, despues)
  if (Object.keys(valores).length) {
    await mondayApi(
      `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
      }`,
      { board: String(BOARD_CONTACTO[tipo]), id, valores: JSON.stringify(valores) },
    )
  }
  return {
    id,
    nombre: (despues.name ?? '').trim(),
    celular: normalizarCelular(despues[COL_CONTACTO.celular] ?? ''),
    email: (despues[COL_CONTACTO.email] ?? '').trim(),
  }
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
 * Las bolsas y sus presupuestos
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
  /** 🤖 Estado de Confirmacion, tal cual (vacío: todavía sin respuesta). */
  confirmacion: string
  /** 🤖Clave Confirmacion: la del enlace que salió (un reenvío la reusa). */
  clave: string
  /** 🤖Motivo del rechazo. */
  motivo: string
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

/** La bolsa sin sus presupuestos: lo que lista la consulta (los presupuestos se leen al abrirla). */
export const CAMPOS_CABECERA_BOLSA = `
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
`

/** Un presupuesto (subelemento) de la bolsa. */
export const CAMPOS_SUBELEMENTO = `
    id name
    column_values(ids: ${JSON.stringify([
      COL_SUB.tipo,
      COL_SUB.color,
      COL_SUB.fechaEnvio,
      COL_SUB.estadoEnvio,
      COL_SUB.pdf,
      COL_SUB.confirmacion,
      COL_SUB.clave,
      COL_SUB.motivo,
    ])}) { id text value }
`

export type ItemBolsa = { id: string; name: string; column_values: CV[]; subitems?: { id: string; name: string; column_values: CV[] }[] | null }

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

/** Un presupuesto (subelemento) tal como lo usa la app. */
export function presupuestoDe(s: { id: string; name: string; column_values: CV[] }): PresupuestoEnviado {
  const sc = byId(s)
  return {
    id: String(s.id),
    nombre: s.name,
    tipo: valor(sc[COL_SUB.tipo]),
    color: valor(sc[COL_SUB.color]),
    fechaEnvio: valor(sc[COL_SUB.fechaEnvio]),
    estadoEnvio: valor(sc[COL_SUB.estadoEnvio]),
    pdf: pdfDe(sc[COL_SUB.pdf]),
    /* Sin respuesta: vacío. El tablero le puso nombre a esa etiqueta (índice 5, "Pend de Confirmar"),
       así que se decide por el índice y no por el texto. */
    confirmacion: [null, 5].includes(indiceDeValor(sc[COL_SUB.confirmacion]?.value)) ? '' : valor(sc[COL_SUB.confirmacion]),
    clave: valor(sc[COL_SUB.clave]),
    motivo: valor(sc[COL_SUB.motivo]),
  }
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
    presupuestos: (i.subitems ?? []).map(presupuestoDe),
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Escrituras
 * ──────────────────────────────────────────────────────────────────────────────── */

const relacion = (c: Contacto | null) => (c ? { item_ids: [Number(c.id)] } : undefined)

/**
 * Crea la bolsa: el ítem del presupuesto, con el cliente y/o el constructor, a quién se le envió y en
 * "Presupuesto Enviado" (se crea al enviar el primero). El estado es sólo informativo.
 */
export async function crearBolsa(a: {
  nombre: string
  cliente: Contacto | null
  arquitecto: Contacto | null
  enviarA: string
  /** El id de Monday del usuario logueado en la app. */
  creadoPor: string | null
}): Promise<string> {
  const valores: Record<string, unknown> = {
    [COL_PRES.estado]: { label: ETIQUETA_PRES.presupuestoEnviado },
  }
  if (a.creadoPor) valores[COL_PRES.creadoPor] = { personsAndTeams: [{ id: Number(a.creadoPor), kind: 'person' }] }
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

/**
 * Cierra el alta de una bolsa nueva: "Presupuesto Enviado" y quién la creó. Va al FINAL, con los
 * subelementos ya creados: una automatización del tablero pasa la bolsa a "Solicitud de Presupuesto"
 * apenas se le crea un subelemento, y esta escritura tiene que quedar después.
 */
export async function marcarBolsaEnviada(bolsaId: string, creadoPor: string | null): Promise<void> {
  const valores: Record<string, unknown> = { [COL_PRES.estado]: { label: ETIQUETA_PRES.presupuestoEnviado } }
  if (creadoPor) valores[COL_PRES.creadoPor] = { personsAndTeams: [{ id: Number(creadoPor), kind: 'person' }] }
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: bolsaId, valores: JSON.stringify(valores) },
  )
}

/**
 * Lo que deja en una bolsa que ya existía un presupuesto nuevo («+Nuevo» de la consulta): a quién se
 * le mandó esta vez (✋Enviar a) y su estado DE ANTES. El estado del ítem es sólo informativo y no se
 * cambia; se vuelve a escribir porque una automatización del tablero lo pasa a "Solicitud de
 * Presupuesto" apenas se le crea un subelemento. Sin nada que escribir, no hace nada.
 */
export async function actualizarBolsa(bolsaId: string, a: { enviarA?: string; estado?: string }): Promise<void> {
  const valores: Record<string, unknown> = {}
  if (a.enviarA) valores[COL_PRES.enviarA] = { label: a.enviarA }
  if (a.estado?.trim()) valores[COL_PRES.estado] = { label: a.estado.trim() }
  if (!Object.keys(valores).length) return
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: bolsaId, valores: JSON.stringify(valores) },
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
  /**
   * La clave del enlace de confirmación, sólo si se pidió confirmar este presupuesto. Sin ella la
   * columna queda vacía: nadie puede confirmarlo por enlace.
   */
  clave: string | null
}): Promise<string> {
  const valores: Record<string, unknown> = {
    [COL_SUB.tipo]: { labels: [a.tipo] },
    [COL_SUB.color]: { labels: [a.color] },
    [COL_SUB.estadoEnvio]: { label: ETIQUETA_PRES.enviado },
    [COL_SUB.fechaEnvio]: { date: a.fechaEnvio },
  }
  if (a.clave) valores[COL_SUB.clave] = a.clave
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
