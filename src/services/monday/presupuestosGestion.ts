/**
 * Consultar y Gestionar Presupuestos: la lectura de los presupuestos que todavía se gestionan y lo
 * que escribe ganar uno (la obra, su registro en la cuenta corriente y el cierre del presupuesto) o
 * darlo por perdido.
 *
 * Ganar reemplaza al escenario de Make del botón "✋Crear Obra" (que la app NUNCA aprieta, o la obra se
 * crearía dos veces). Hace lo mismo que hacía el escenario:
 *  - 🪟 Obras (9617181553): la obra, en "Ganado/Aceptado/Anticipo" y "A Medir".
 *  - 🔄 Movimientos de la cuenta (9617990698, subelementos de la cuenta corriente): una venta
 *    "Venta-Sin Fact" con el total pactado. La obra queda "Registrado en Cta Cte".
 *  - 📄 Presupuestos: "Ganado", con tipo, color, PDF final, total, plano, "Creado" y la obra.
 */
import type { CV } from './parse'
import { byId, valor } from './parse'
import { subirArchivo } from './obras'
import { mondayApi } from './sdk'
import {
  BOARD_PRESUPUESTOS,
  BOARD_SUB_PRESUPUESTOS,
  CAMPOS_BOLSA,
  COL_CONTACTO,
  COL_PRES,
  bolsaDe,
  type BolsaPresupuesto,
  type ItemBolsa,
} from './presupuestos'

/** Columnas del ítem que completa "Ganar". */
const COL_GANAR = {
  tipo: 'dropdown_mkvgj7nt',
  color: 'dropdown_mkvgb6sb',
  presupFinal: 'file_mkvg36ph',
  total: 'numeric_mkvgy282',
  plano: 'file_mkvgzwge',
  estadoCreacionObra: 'color_mkvgdrvv',
  obras: 'board_relation_mm1z59qx',
} as const

/** `Estado` del subelemento: el presupuesto que se ganó queda "Confirmado". */
const COL_SUB_ESTADO = 'color_mm0dsv6p'

/* ────────────────────────────────────────────────────────────────────────────────
 * Lectura
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Una bolsa en la consulta: con su estado y el color de la etiqueta en el tablero. */
export interface PresupuestoGestion extends BolsaPresupuesto {
  estado: string
  colorEstado: string
}

type ItemGestion = ItemBolsa & { estado: CV[] }

const CAMPOS_GESTION = `${CAMPOS_BOLSA} estado: column_values(ids: ["${COL_PRES.estado}"]) { id text }`

const deItem = (i: ItemGestion, colores: Record<string, string>): PresupuestoGestion => {
  const estado = i.estado[0]?.text ?? ''
  return { ...bolsaDe(i), estado, colorEstado: colores[estado] ?? '' }
}

/** Las etiquetas de `🤖Estado Presupuesto` con su color del tablero. */
function coloresDe(settings: string): Record<string, string> {
  try {
    const s = JSON.parse(settings || '{}') as { labels?: Record<string, string>; labels_colors?: Record<string, { color: string }> }
    return Object.fromEntries(Object.entries(s.labels ?? {}).map(([i, t]) => [t, s.labels_colors?.[i]?.color ?? '']))
  } catch {
    return {}
  }
}

/**
 * Los presupuestos en estos estados (por su índice), filtrados en Monday. Viene también el color de
 * cada etiqueta, para pintar la pastilla igual que en el tablero.
 */
export async function listarPresupuestosGestion(indices: number[]): Promise<PresupuestoGestion[]> {
  interface Pagina {
    cursor: string | null
    items: ItemGestion[]
  }
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[]; items_page: Pagina }[] }>(
    `query {
      boards(ids: [${BOARD_PRESUPUESTOS}]) {
        columns(ids: ["${COL_PRES.estado}"]) { settings_str }
        items_page(limit: 200, query_params: { rules: [{ column_id: "${COL_PRES.estado}", compare_value: ${JSON.stringify(indices)}, operator: any_of }] }) {
          cursor items { ${CAMPOS_GESTION} }
        }
      }
    }`,
  )
  const colores = coloresDe(d.boards[0]?.columns[0]?.settings_str ?? '')
  const todas: ItemGestion[] = []
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 20; vuelta++) {
    todas.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${CAMPOS_GESTION} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return todas.map((i) => deItem(i, colores))
}

/** Un presupuesto releído antes de tocarlo: otra persona pudo haberlo movido. */
export async function leerPresupuestoGestion(id: string): Promise<PresupuestoGestion | null> {
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[] }[]; items: (ItemGestion & { board: { id: string } })[] }>(
    `query ($ids: [ID!]) {
      boards(ids: [${BOARD_PRESUPUESTOS}]) { columns(ids: ["${COL_PRES.estado}"]) { settings_str } }
      items(ids: $ids) { board { id } ${CAMPOS_GESTION} }
    }`,
    { ids: [id] },
  )
  const i = d.items[0]
  if (!i || String(i.board.id) !== String(BOARD_PRESUPUESTOS)) return null
  return deItem(i, coloresDe(d.boards[0]?.columns[0]?.settings_str ?? ''))
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El cliente: dónde se registra la obra
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface CuentaCliente {
  id: string
  nombre: string
}

/** Lo que hace falta del cliente para crear la obra. */
export interface DatosClienteObra {
  /** Sus cuentas corrientes ACTIVAS (las dadas de baja viven en ARCHIVADOS). */
  cuentas: CuentaCliente[]
  celular: string
  /** `✋ Ubicación - Direccion` del cliente, para copiarla a la obra. */
  ubicacion: { lat: string; lng: string; address: string } | null
}

const BOARD_CUENTAS_ACTIVAS = 9617990272
const COL_CLIENTE = { cuentas: 'board_relation_mkt5f7n4', ubicacion: 'location_mkt9ewya' } as const

type CuentaVinculada = { id: string; name: string; state: string; board: { id: string } }

export async function datosClienteObra(clienteId: string): Promise<DatosClienteObra> {
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ${JSON.stringify([COL_CLIENTE.cuentas, COL_CONTACTO.celular, COL_CLIENTE.ubicacion])}) {
          id text value
          ... on BoardRelationValue { linked_items { id name state board { id } } }
        }
      }
    }`,
    { ids: [clienteId] },
  )
  const cols = d.items[0]?.column_values ?? []
  const c = byId({ column_values: cols })
  const vinculadas = (cols.find((x) => x.id === COL_CLIENTE.cuentas)?.linked_items ?? []) as unknown as CuentaVinculada[]
  const cuentas = vinculadas
    .filter((i) => i.state === 'active' && String(i.board.id) === String(BOARD_CUENTAS_ACTIVAS))
    .map((i) => ({ id: String(i.id), nombre: i.name }))
  let ubicacion: DatosClienteObra['ubicacion'] = null
  try {
    const v = JSON.parse(c[COL_CLIENTE.ubicacion]?.value ?? 'null') as { lat?: string | number; lng?: string | number; address?: string } | null
    if (v?.lat != null && v.lng != null) ubicacion = { lat: String(v.lat), lng: String(v.lng), address: v.address ?? '' }
  } catch {
    /* Sin ubicación: la obra se crea sin ella. */
  }
  return { cuentas, celular: valor(c[COL_CONTACTO.celular]).replace(/\D/g, ''), ubicacion }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * La obra
 * ──────────────────────────────────────────────────────────────────────────────── */

const BOARD_OBRAS = 9617181553
/** El grupo "Obras" del tablero. */
const GRUPO_OBRAS = 'closed'
const COL_OBRA = {
  ctaCte: 'board_relation_mkthtd70',
  arquitecto: 'board_relation_mksz3v0h',
  asignado: 'multiple_person_mktj4r09',
  celCoordinar: 'phone_mktkekah',
  ubicacion: 'location_mksz7r97',
  presupuestoAceptado: 'file_mktkp9dp',
  planoAberturas: 'file_mktj9hsc',
  etapaVenta: 'deal_stage',
  etapaProduccion: 'color_mm1kddt0',
  tipo: 'color_mkw92ypr',
  total: 'deal_value',
  aceptacion: 'deal_expected_close_date',
  presupuestos: 'board_relation_mm1zmz3k',
  movimientos: 'board_relation_mm1zka50',
  validacionCtaCte: 'color_mm1z5tfm',
  idObra: 'pulse_id_mktm8dq9',
} as const

/** El ítem comodín "SIN ARQUITECTO" de 👤 Constructor/Arquitecto: el que usa el tablero sin constructor. */
export const SIN_ARQUITECTO_ID = '10910009068'

export interface AltaObra {
  nombre: string
  cuentaId: string
  arquitectoId: string
  responsableId: string | null
  celular: string
  ubicacion: DatosClienteObra['ubicacion']
  /** ✋Tipo: PVC | Aluminio. */
  tipo: string
  total: number
  /** `YYYY-MM-DD`: la aceptación. */
  hoy: string
  presupuestoId: string
}

/** Crea la obra: "Ganado/Aceptado/Anticipo", "A Medir" y todo lo que se sabe del presupuesto. */
export async function crearObraDePresupuesto(a: AltaObra): Promise<string> {
  const v: Record<string, unknown> = {
    [COL_OBRA.ctaCte]: { item_ids: [Number(a.cuentaId)] },
    [COL_OBRA.arquitecto]: { item_ids: [Number(a.arquitectoId)] },
    [COL_OBRA.etapaVenta]: { label: 'Ganado/Aceptado/Anticipo' },
    [COL_OBRA.etapaProduccion]: { label: 'A Medir' },
    [COL_OBRA.total]: String(a.total),
    [COL_OBRA.aceptacion]: { date: a.hoy },
    [COL_OBRA.presupuestos]: { item_ids: [Number(a.presupuestoId)] },
    [COL_OBRA.validacionCtaCte]: { label: 'Pend de Registrar' },
  }
  if (a.tipo) v[COL_OBRA.tipo] = { label: a.tipo }
  if (a.responsableId) v[COL_OBRA.asignado] = { personsAndTeams: [{ id: Number(a.responsableId), kind: 'person' }] }
  if (a.celular) v[COL_OBRA.celCoordinar] = { phone: a.celular, countryShortName: 'AR' }
  if (a.ubicacion) v[COL_OBRA.ubicacion] = a.ubicacion
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_OBRAS}, group_id: "${GRUPO_OBRAS}", item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: a.nombre, valores: JSON.stringify(v) },
  )
  return String(d.create_item.id)
}

/** `✋Presupuesto Final Aceptado` y, si se cargó, `✋Plano de Aberturas Pdf`. */
export async function subirArchivosObra(obraId: string, a: { presupuesto: File; plano: File | null }): Promise<void> {
  await subirArchivo(obraId, COL_OBRA.presupuestoAceptado, a.presupuesto)
  if (a.plano) await subirArchivo(obraId, COL_OBRA.planoAberturas, a.plano)
}

/** El `🤖ID Obra` (IDOBRA-787) de la obra recién creada. */
export async function idDeObra(obraId: string): Promise<string> {
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL_OBRA.idObra}"]) { id text } } }`,
    { ids: [obraId] },
  )
  return (d.items[0]?.column_values[0]?.text ?? '').trim()
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El registro en la cuenta corriente
 * ──────────────────────────────────────────────────────────────────────────────── */

const COL_MOV = {
  movimiento: 'status',
  saldoInicial: 'numeric_mksekr2c',
  ventas: 'numeric_mkse7apk',
  pdfPresupuesto: 'file_mktd8tc6',
  obras: 'board_relation_mm1z4t8n',
} as const

/**
 * El movimiento de la venta en la cuenta corriente, como lo deja hoy el escenario de Make: un
 * subelemento de la cuenta, "Venta-Sin Fact", con el total pactado, saldo inicial 0 y la obra.
 */
export async function crearMovimientoVenta(a: { cuentaId: string; nombre: string; total: number; obraId: string }): Promise<string> {
  const v = {
    [COL_MOV.movimiento]: { label: 'Venta-Sin Fact' },
    [COL_MOV.saldoInicial]: '0',
    [COL_MOV.ventas]: String(a.total),
    [COL_MOV.obras]: { item_ids: [Number(a.obraId)] },
  }
  const d = await mondayApi<{ create_subitem: { id: string } }>(
    `mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
      create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { padre: a.cuentaId, nombre: a.nombre, valores: JSON.stringify(v) },
  )
  return String(d.create_subitem.id)
}

export async function subirPdfMovimiento(movimientoId: string, pdf: File): Promise<void> {
  await subirArchivo(movimientoId, COL_MOV.pdfPresupuesto, pdf)
}

/** La obra queda vinculada a su movimiento y "Registrado en Cta Cte". */
export async function marcarObraRegistrada(obraId: string, movimientoId: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_OBRAS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    {
      id: obraId,
      valores: JSON.stringify({
        [COL_OBRA.movimientos]: { item_ids: [Number(movimientoId)] },
        [COL_OBRA.validacionCtaCte]: { label: 'Registrado en Cta Cte' },
      }),
    },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El presupuesto
 * ──────────────────────────────────────────────────────────────────────────────── */

/** `🤖 Presup Final pdf` (reemplaza lo que hubiera) y, si se cargó, `✋ Plano de Aberturas`. */
export async function subirArchivosGanado(bolsaId: string, a: { presupuesto: File; plano: File | null }): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores) { id }
    }`,
    { id: bolsaId, valores: JSON.stringify({ [COL_GANAR.presupFinal]: { clear_all: true } }) },
  ).catch(() => {})
  await subirArchivo(bolsaId, COL_GANAR.presupFinal, a.presupuesto)
  if (a.plano) await subirArchivo(bolsaId, COL_GANAR.plano, a.plano)
}

/**
 * Cierra el presupuesto como ganado: tipo y color del presupuesto elegido, total pactado, "Creado",
 * el vínculo a la obra y "Ganado". Los dropdowns del ítem tienen etiquetas propias: si la del
 * subelemento no está, se crea (es lo que hace hoy el escenario de Make: así nacieron "BLANCO",
 * "NEGRO", ... junto a "Blanco").
 */
export async function cerrarGanado(a: { bolsaId: string; tipo: string; color: string; total: number; obraId: string }): Promise<void> {
  const v: Record<string, unknown> = {
    [COL_GANAR.total]: String(a.total),
    [COL_GANAR.estadoCreacionObra]: { label: 'Creado' },
    [COL_GANAR.obras]: { item_ids: [Number(a.obraId)] },
    [COL_PRES.estado]: { label: 'Ganado' },
  }
  if (a.tipo) v[COL_GANAR.tipo] = { labels: [a.tipo] }
  if (a.color) v[COL_GANAR.color] = { labels: [a.color] }
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: true) { id }
    }`,
    { id: a.bolsaId, valores: JSON.stringify(v) },
  )
}

/** El subelemento ganado queda "Confirmado". */
export async function confirmarPresupuestoEnviado(subitemId: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_SUB_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: subitemId, valores: JSON.stringify({ [COL_SUB_ESTADO]: { label: 'Confirmado' } }) },
  )
}

/** Dar el presupuesto por perdido. */
export async function perderPresupuesto(bolsaId: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: bolsaId, valores: JSON.stringify({ [COL_PRES.estado]: { label: 'Perdido' } }) },
  )
}
