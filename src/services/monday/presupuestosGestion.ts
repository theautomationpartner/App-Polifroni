/**
 * Consultar y Gestionar Presupuestos: la lectura de los presupuestos que todavía se gestionan y lo que
 * escribe la app desde ahí (regla del usuario, 13/10/2026).
 *
 *  - Se listan los presupuestos (subelementos) de todas las bolsas que NO están Ganadas ni Perdidas.
 *  - Enviar / Reenviar: el subelemento queda "Enviado" con la fecha del envío (y la clave del enlace, si
 *    alguien lo tiene que confirmar). La bolsa, a quién se mandó y —en el primer envío— "Presupuesto
 *    Enviado".
 *  - Confirmar / Perdido: los hace el SERVIDOR (`/api/presupuesto-respuesta`), exactamente igual que la
 *    respuesta del cliente por el enlace de WhatsApp: el subelemento Confirmado (y los datos a la bolsa,
 *    la obra y la cuenta corriente) o Rechazado con el motivo.
 */
import type { CV } from './parse'
import { byId, valor } from './parse'
import { cabecerasPropias, mondayApi } from './sdk'
import {
  BOARD_PRESUPUESTOS,
  BOARD_SUB_PRESUPUESTOS,
  CAMPOS_BOLSA,
  COL_PRES,
  COL_SUB,
  ETIQUETA_PRES,
  bolsaDe,
  type BolsaPresupuesto,
  type ItemBolsa,
} from './presupuestos'

/** El recordatorio que manda Make a los 5 días del envío. */
const COL_RECORDATORIO = {
  /** 🤖Fecha Presupuesto Enviado (+5d): cuándo sale el recordatorio. */
  fecha: 'date_mm2tt1em',
  /** 🤖Estado Recordatorio (+5d): Enviar | Enviando | Enviado | Error de Envio | NO Enviado. */
  estado: 'color_mm2tz306',
} as const

/* ────────────────────────────────────────────────────────────────────────────────
 * Lectura
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Una bolsa en la consulta: con su estado (y su color en el tablero) y el recordatorio. */
export interface PresupuestoGestion extends BolsaPresupuesto {
  estado: string
  colorEstado: string
  /** `YYYY-MM-DD`: cuándo sale (o salió) el recordatorio. Vacío: sin recordatorio. */
  fechaRecordatorio: string
  /** El estado del recordatorio, tal cual (vacío: sin estado). */
  estadoRecordatorio: string
}

type ItemGestion = ItemBolsa & { gestion: CV[] }

const CAMPOS_GESTION = `${CAMPOS_BOLSA} gestion: column_values(ids: ${JSON.stringify([
  COL_PRES.estado,
  COL_RECORDATORIO.fecha,
  COL_RECORDATORIO.estado,
])}) { id text }`

const deItem = (i: ItemGestion, colores: Record<string, string>): PresupuestoGestion => {
  const g = byId({ column_values: i.gestion })
  const estado = valor(g[COL_PRES.estado])
  return {
    ...bolsaDe(i),
    estado,
    colorEstado: colores[estado] ?? '',
    fechaRecordatorio: valor(g[COL_RECORDATORIO.fecha]),
    estadoRecordatorio: valor(g[COL_RECORDATORIO.estado]),
  }
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
 * Las bolsas que se gestionan: todas menos las que están en estos estados (por índice: Ganado y
 * Perdido), filtradas en Monday. Viene también el color de cada etiqueta, para pintar la pastilla
 * igual que en el tablero.
 */
export async function listarPresupuestosGestion(indicesCerrados: number[]): Promise<PresupuestoGestion[]> {
  interface Pagina {
    cursor: string | null
    items: ItemGestion[]
  }
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[]; items_page: Pagina }[] }>(
    `query {
      boards(ids: [${BOARD_PRESUPUESTOS}]) {
        columns(ids: ["${COL_PRES.estado}"]) { settings_str }
        items_page(limit: 200, query_params: { rules: [{ column_id: "${COL_PRES.estado}", compare_value: ${JSON.stringify(indicesCerrados)}, operator: not_any_of }] }) {
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

/** Una bolsa releída antes de tocarla: otra persona (o el cliente) pudo haberla movido. */
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
 * Enviar / Reenviar
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Lo que deja en Monday un envío (o reenvío) desde la consulta, en UNA mutation:
 *  - el subelemento: "Enviado", la fecha del envío y, si alguien lo tiene que confirmar, la clave del
 *    enlace que salió (un reenvío reusa la que tenía).
 *  - la bolsa: a quién se mandó (✋Enviar a) y, en el primer envío, "Presupuesto Enviado".
 * Nunca toca `✋Enviar` (el botón del escenario de Make): el presupuesto saldría dos veces.
 */
export async function registrarEnvioGestion(a: {
  subId: string
  bolsaId: string
  /** `YYYY-MM-DD`. */
  fecha: string
  clave: string | null
  enviarA: string
  primerEnvio: boolean
}): Promise<void> {
  const sub: Record<string, unknown> = {
    [COL_SUB.estadoEnvio]: { label: ETIQUETA_PRES.enviado },
    [COL_SUB.fechaEnvio]: { date: a.fecha },
  }
  if (a.clave) sub[COL_SUB.clave] = a.clave
  const bolsa: Record<string, unknown> = {}
  if (a.enviarA) bolsa[COL_PRES.enviarA] = { label: a.enviarA }
  if (a.primerEnvio) bolsa[COL_PRES.estado] = { label: ETIQUETA_PRES.presupuestoEnviado }
  await mondayApi(
    `mutation ($sub: ID!, $vSub: JSON!, $bolsa: ID!, $vBolsa: JSON!) {
      sub: change_multiple_column_values(board_id: ${BOARD_SUB_PRESUPUESTOS}, item_id: $sub, column_values: $vSub, create_labels_if_missing: false) { id }
      bolsa: change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $bolsa, column_values: $vBolsa, create_labels_if_missing: false) { id }
    }`,
    { sub: a.subId, vSub: JSON.stringify(sub), bolsa: a.bolsaId, vBolsa: JSON.stringify(bolsa) },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Confirmar / Perdido: lo mismo que el enlace, en el servidor
 * ──────────────────────────────────────────────────────────────────────────────── */

/** El servidor no aceptó la respuesta: el texto es para mostrarle al usuario. */
export class RespuestaRechazada extends Error {
  /** 409: el presupuesto ya tiene respuesta (por el enlace o por otro usuario). */
  readonly yaRespondido: boolean
  constructor(message: string, yaRespondido: boolean) {
    super(message)
    this.yaRespondido = yaRespondido
  }
}

export type RespuestaPresupuesto =
  | { tipo: 'confirmar'; ubicacion: string; coordinador: string }
  | { tipo: 'rechazar'; motivo: string }

/**
 * Confirma o rechaza un presupuesto desde la app, por el MISMO camino que el cliente en el enlace
 * (`/api/presupuesto-respuesta` → `registrarRespuesta`). Vuelve apenas el presupuesto quedó
 * Confirmado (con los datos en la bolsa) o Rechazado: la obra y la cuenta corriente siguen en el
 * servidor. `autor`: sólo cuenta en desarrollo (sin sesión); en producción el servidor lo saca de la
 * sesión.
 */
export async function responderPresupuesto(subId: string, r: RespuestaPresupuesto, autor: string): Promise<void> {
  const res = await fetch('/api/presupuesto-respuesta', {
    method: 'POST',
    headers: await cabecerasPropias({ 'content-type': 'application/json' }),
    body: JSON.stringify({ subId, ...r, autor }),
    signal: AbortSignal.timeout(90_000),
  })
  if (res.ok) return
  const cuerpo = (await res.json().catch(() => ({}))) as { error?: string }
  throw new RespuestaRechazada(
    cuerpo.error || 'No se pudo registrar la respuesta. Probá de nuevo en unos segundos.',
    res.status === 409,
  )
}
