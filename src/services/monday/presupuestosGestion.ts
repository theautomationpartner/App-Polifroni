/**
 * Consultar y Gestionar Presupuestos: la lectura de las bolsas y sus presupuestos, y lo que escribe la
 * app desde ahí (reglas del usuario, 13/10 y 15/10/2026).
 *
 *  - Se listan las bolsas (el ítem) menos las Perdidas y las vencidas, sin sus presupuestos. Los presupuestos (subelementos) de una
 *    bolsa se leen de Monday al abrirla.
 *  - Enviar / Reenviar: el subelemento queda "Enviado" con la fecha del envío (y la clave del enlace, si
 *    alguien lo tiene que confirmar). La bolsa, a quién se mandó y —en el primer envío— "Presupuesto
 *    Enviado".
 *  - Perdido (de la bolsa): la app deja la bolsa en "Perdido" y sale de la lista.
 *  - Confirmar / Ganar: los hace el SERVIDOR (`/api/presupuesto-respuesta`), exactamente igual que la
 *    respuesta del cliente por el enlace de WhatsApp: el subelemento Confirmado (y los datos a la bolsa,
 *    la obra y la cuenta corriente) o Rechazado con el motivo.
 */
import { ETIQUETA_PERDIDO, seLista } from '@/lib/presupuesto'
import type { CV } from './parse'
import { byId, valor } from './parse'
import { cabecerasPropias, mondayApi } from './sdk'
import {
  BOARD_PRESUPUESTOS,
  BOARD_SUB_PRESUPUESTOS,
  CAMPOS_CABECERA_BOLSA,
  CAMPOS_SUBELEMENTO,
  COL_PRES,
  COL_SUB,
  ETIQUETA_PRES,
  bolsaDe,
  presupuestoDe,
  type BolsaPresupuesto,
  type ItemBolsa,
  type PresupuestoEnviado,
} from './presupuestos'

/** Lo que deja la confirmación en la bolsa y lo que completa Ganar (regla del usuario, 15/10/2026). */
const COL_CIERRE = {
  /** ✋Total Pactado: se ingresa al ganar. */
  total: 'numeric_mkvgy282',
  /** 🤖Ubicación de la obra y 🤖Coordinador de la obra: los que indicó quien confirmó. */
  ubicacionObra: 'text_mm85trcv',
  coordinadorObra: 'text_mm85ye3y',
} as const

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
  /** ✋Total Pactado de la bolsa (`null`: todavía no se ganó). */
  total: number | null
  /** La dirección de la obra y quién la coordina, como los dejó la confirmación. */
  ubicacionObra: string
  coordinadorObra: string
}

type ItemGestion = ItemBolsa & { gestion: CV[] }

const CAMPOS_GESTION = `${CAMPOS_CABECERA_BOLSA} gestion: column_values(ids: ${JSON.stringify([
  COL_PRES.estado,
  COL_RECORDATORIO.fecha,
  COL_RECORDATORIO.estado,
  COL_CIERRE.total,
  COL_CIERRE.ubicacionObra,
  COL_CIERRE.coordinadorObra,
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
    total: valor(g[COL_CIERRE.total]).trim() ? Number(valor(g[COL_CIERRE.total])) : null,
    ubicacionObra: valor(g[COL_CIERRE.ubicacionObra]),
    coordinadorObra: valor(g[COL_CIERRE.coordinadorObra]),
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
 * Las bolsas del tablero (regla del usuario, 15/10/2026) menos las Perdidas y las vencidas, sin sus presupuestos: de la más nueva a
 * la más vieja (por su ID Presupuesto). Viene también el color de cada etiqueta, para pintar la pastilla igual que en el
 * tablero.
 */
export async function listarPresupuestosGestion(): Promise<PresupuestoGestion[]> {
  interface Pagina {
    cursor: string | null
    items: ItemGestion[]
  }
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[]; items_page: Pagina }[] }>(
    `query {
      boards(ids: [${BOARD_PRESUPUESTOS}]) {
        columns(ids: ["${COL_PRES.estado}"]) { settings_str }
        items_page(limit: 200) {
          cursor items { ${CAMPOS_GESTION} }
        }
      }
    }`,
  )
  const colores = coloresDe(d.boards[0]?.columns[0]?.settings_str ?? '')
  const todas: ItemGestion[] = []
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 40; vuelta++) {
    todas.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${CAMPOS_GESTION} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  /* Por el número del 🤖ID Presupuesto (IDPRES-882): el id de Monday no sigue el orden de alta (hubo
     bolsas importadas después). */
  const numero = (b: PresupuestoGestion) => Number(/\d+/.exec(b.idPresupuesto)?.[0] ?? 0)
  return todas
    .map((i) => deItem(i, colores))
    .filter((b) => seLista(b.estado))
    .sort((a, b) => numero(b) - numero(a) || Number(b.id) - Number(a.id))
}

/** Los presupuestos (subelementos) de una bolsa, leídos de Monday al abrirla: del más viejo al más nuevo. */
export async function leerPresupuestosDeBolsa(bolsaId: string): Promise<PresupuestoEnviado[]> {
  const d = await mondayApi<{ items: { subitems: ItemBolsa['subitems'] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { subitems { ${CAMPOS_SUBELEMENTO} } } }`,
    { ids: [bolsaId] },
  )
  return (d.items[0]?.subitems ?? []).map(presupuestoDe).sort((a, b) => Number(a.id) - Number(b.id))
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

/** Da la bolsa por perdida: su `🤖Estado Presupuesto` pasa a "Perdido" (regla del usuario, 15/10/2026). */
export async function marcarBolsaPerdida(bolsaId: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $v: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_PRESUPUESTOS}, item_id: $id, column_values: $v, create_labels_if_missing: false) { id }
    }`,
    { id: bolsaId, v: JSON.stringify({ [COL_PRES.estado]: { label: ETIQUETA_PERDIDO } }) },
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Confirmar / Ganar: lo mismo que el enlace, en el servidor
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
  /** Desde la app, Confirmar pide el total y gana el presupuesto en el mismo paso. */
  | { tipo: 'confirmar'; ubicacion: string; coordinador: string; total: number }
  /** Uno que el cliente confirmó por WhatsApp ("Confirmado - Pend de Cerrar"): el total, y si se corrigen, dirección y coordinador. */
  | { tipo: 'ganar'; total: number; ubicacion: string; coordinador: string }

/**
 * Confirma o gana un presupuesto desde la app, por el MISMO camino que el cliente en el
 * enlace (`/api/presupuesto-respuesta`). Vuelve apenas el presupuesto quedó escrito: la obra y la
 * cuenta corriente siguen en el servidor. `autor`: sólo cuenta en desarrollo (sin sesión); en producción el servidor lo saca de la
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
