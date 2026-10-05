/**
 * 📅 Agenda (18396064987): un ítem por turno de trabajo con un cliente.
 *
 * El tablero ya existía y lo usa la gente —tiene sus botones de notificación y sus escenarios—, así
 * que la app escribe en SUS columnas y con SUS etiquetas; no se crea nada nuevo.
 *
 * Para armar un turno se leen además:
 *  - 🔄 Cuentas Corrientes Cliente (9617990272): lo que se busca. La obra y el pendiente vinculan la
 *    CUENTA, no el cliente: de la cuenta salen las obras, los pendientes y el cliente asignado.
 *  - 👤 Clientes (9617181550): el cliente asignado en la cuenta queda vinculado en el turno.
 *  - 🪟 Obras (9617181553): etapa de producción, saldo y sus OP.
 *  - 🏭 Orden de Produccion (18432207111): los subelementos "Observacion" de cada OP —uno por
 *    abertura— son las aberturas a colocar. Los subelementos de la OBRA no sirven: son recibos.
 *  - 🚚 Pend de Entrega Vta (9900503036): los pendientes a entregar.
 */
import {
  ETIQUETA_APROBACION,
  ETIQUETA_TURNO,
  aColumnaFecha,
  deColumnaFecha,
  defTipo,
  estadoDeTurno,
  tipoDeEtiqueta,
  type Aprobacion,
  type EstadoTurno,
  type ObraDeCliente,
  type PendienteDeCliente,
  type TipoTurno,
} from '@/lib/agenda'
import { estadoDeOrden } from '@/lib/estadosOp'
import { memoGlobal } from './cache'
import { BOARD_OBRAS, BOARD_ORDENES, COL } from './columns'
import { getEstructuraBoard } from './obras'
import { COL_OBS, COL_OP } from './ordenes'
import { byId, num, sumaMirror, valor, type CV } from './parse'
import { mondayApi } from './sdk'

export const BOARD_AGENDA = 18396064987
export const BOARD_CLIENTES = 9617181550
export const BOARD_CUENTAS = 9617990272
export const BOARD_PENDIENTES = 9900503036

/** Columnas de 📅 Agenda que usa la app. */
export const COL_TURNO = {
  cliente: 'board_relation_mkzzn92p',
  estado: 'color_mm03kdeh',
  tipo: 'color_mkzr218h',
  /** ✋ SIN O CON OBRA: "Con Obra" | "Sin Obra". */
  conObra: 'color_mm3f1s26',
  /** ✋ Fecha Entrega-Colocacion: la fecha del turno. */
  fecha: 'date',
  cantAberturas: 'numeric_mm0dpp0a',
  /** ✋ Tipo de Reparacion (dropdown): de la Reparación. */
  tipoReparacion: 'dropdown_mm0dacrh',
  /** ✋Ubicacion: espejo de la ubicación de la obra vinculada. */
  ubicacionObra: 'lookup_mkzpbth9',
  /** ✋Cta Cte Cliente (espejo de la obra): a quién se saluda en los avisos de una colocación. */
  ctaCteObra: 'lookup_mm12qp0r',
  /** 🤖Responsable (people): quien registró el turno desde la app. */
  responsable: 'multiple_person_mm7vybs1',
  /** ✋ Ubicación Entrega: la dirección del turno, cuando no sale de una obra. */
  ubicacion: 'location_mm01fgc5',
  obra: 'board_relation_mkzpjn4r',
  pendiente: 'board_relation_mkzrmbn9',
  material: 'color_mm1tn7qm',
  aprobacion: 'color_mm0pjxfg',
  /** 🤖 Estado 1ª Notificacion: el mensaje de asignación. */
  notifAsignacion: 'color_mkzrxync',
  fechaNotifAsignacion: 'date_mkzr73ax',
  motivoCancelacion: 'color_mm0dps9w',
  notifCancelacion: 'color_mm07xz96',
  fechaCancelacion: 'date_mm0d6rxd',
  /** ✋ Colocacion/Entrega: Colocacion Total | Colocacion Parcial | Entrega Total | Entrega Parcial. */
  resultado: 'color_mm0dybxg',
  notifConfirmacion: 'color_mkzwn88f',
  /** 🤖Fecha Entrega: el día en que se confirmó el turno. */
  fechaCumplido: 'date_mkzwhx9w',
  creacion: 'pulse_log_mm0d3y2n',
} as const

/** Etiquetas de las columnas de notificación del tablero. */
export const NOTIF = { enviado: 'Enviado', error: 'Error de Envio' } as const

/**
 * 🔄 Cuentas Corrientes Cliente. Es lo que la obra vincula (`✋Cta Cte Cliente`) y lo que el
 * pendiente de entrega vincula (`🤖Cta Cte Cliente`): por eso el turno se arma desde la CUENTA, y
 * el cliente del turno es el que la cuenta tiene asignado (`🤖Cliente`). Buscar en 👤 Clientes y
 * bajar a sus cuentas dejaba afuera las obras de una cuenta vinculada a otro cliente.
 */
const COL_CUENTA = {
  cliente: 'board_relation_mkt5evd4',
  obras: 'board_relation_mkthanr',
  pendientes: 'board_relation_mkv62vjb',
  /** Espejos del cliente asignado. */
  celular: 'lookup_mktz3drh',
  email: 'lookup_mktz54ac',
  ubicacion: 'lookup_mkvyz22x',
} as const

/** 👤 Clientes: de acá sale sólo el celular cuando la gestión le escribe al cliente de un turno. */
const COL_CLIENTE = {
  celular: 'phone_mksydcv6',
  cuentas: 'board_relation_mkt5f7n4',
} as const

const COL_PEND = {
  producto: 'board_relation_mkv64b2y',
  vendido: 'numeric_mkv6zybe',
  pendiente: 'formula_mkv6bfme',
  estado: 'color_mm3gzdt1',
  cuenta: 'board_relation_mkv6m4qw',
} as const

/** `null` y "null" de las fórmulas sin resolver son lo mismo: falta el dato. */
const limpio = (t: string | null | undefined) => {
  const v = (t ?? '').trim()
  return v === 'null' || v === 'undefined' ? '' : v
}

const ids = (cv?: CV) => (cv?.linked_item_ids ?? []).map(String)

/** Un espejo que refleja varios valores ("549…, 549…"): el primero. */
const primero = (cv?: CV) => limpio(valor(cv)).split(',')[0]?.trim() ?? ''

/* ────────────────────────────────────────────────────────────────────────────────
 * El cliente del turno: una cuenta corriente y el cliente asignado en ella
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface ClienteTurno {
  /** La cuenta corriente elegida (🔄 Cuentas Corrientes Cliente). */
  id: string
  /** El nombre de la cuenta. */
  nombre: string
  /** El cliente asignado en la cuenta (👤 Clientes): es el que queda vinculado en el turno. */
  clienteId: string
  clienteNombre: string
  /** Espejos del cliente asignado, leídos desde la cuenta. */
  celular: string
  email: string
  ubicacion: string
  /** De la cuenta cuelgan las obras y los pendientes: es una sola, la elegida. */
  cuentasIds: string[]
}

/** Una cuenta del índice del buscador rápido. */
export interface ClienteIndice {
  id: string
  nombre: string
}

/**
 * El índice de cuentas corrientes (id + nombre) para el buscador rápido, una vez por sesión.
 *
 * Son ~3.200 cuentas: siete páginas de 500, unos 9 segundos en total. Esperar a tenerlas todas
 * dejaba el buscador mudo ese rato, así que el índice se entrega a medida que llega cada página
 * (`onAvance` recibe siempre lo acumulado). Lo ya leído queda en memoria: volver a la etapa no lo
 * vuelve a pedir.
 */
let indiceClientes: ClienteIndice[] = []
let indiceCompleto = false
let indiceEnCurso: Promise<void> | null = null
const avisarIndice = new Set<(lista: ClienteIndice[]) => void>()

export function cargarIndiceClientes(onAvance: (lista: ClienteIndice[]) => void): () => void {
  avisarIndice.add(onAvance)
  if (indiceClientes.length) onAvance(indiceClientes)
  if (!indiceCompleto && !indiceEnCurso) {
    indiceEnCurso = leerIndiceClientes()
      .then(() => {
        indiceCompleto = true
      })
      .catch(() => {
        /* Un fallo no se guarda: la próxima visita reintenta. Lo leído hasta acá sigue sirviendo. */
      })
      .finally(() => {
        indiceEnCurso = null
      })
  }
  return () => {
    avisarIndice.delete(onAvance)
  }
}

async function leerIndiceClientes(): Promise<void> {
  interface Pagina {
    cursor: string | null
    items: { id: string; name: string }[]
  }
  const acumulado: ClienteIndice[] = []
  const publicar = (p: Pagina) => {
    for (const i of p.items) acumulado.push({ id: String(i.id), nombre: i.name })
    indiceClientes = [...acumulado]
    avisarIndice.forEach((f) => f(indiceClientes))
  }
  const d = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query { boards(ids: [${BOARD_CUENTAS}]) { items_page(limit: 500) { cursor items { id name } } } }`,
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

/** El botón Buscar: las cuentas cuyo nombre contiene lo escrito, o la que tiene ese id. */
export async function buscarClientes(texto: string, limite = 30): Promise<{ id: string; nombre: string }[]> {
  const t = texto.trim()
  if (/^\d{6,}$/.test(t)) {
    const d = await mondayApi<{ items: { id: string; name: string; board: { id: string } }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { id name board { id } } }`,
      { ids: [t] },
    )
    return d.items.filter((i) => String(i.board.id) === String(BOARD_CUENTAS)).map((i) => ({ id: String(i.id), nombre: i.name }))
  }
  const d = await mondayApi<{ boards: { items_page: { items: { id: string; name: string }[] } }[] }>(
    /* `compare_value` es de tipo `CompareValue!`: declararlo `[String]` hace que Monday rechace la
       consulta entera. */
    `query ($t: CompareValue!, $lim: Int!) {
      boards(ids: [${BOARD_CUENTAS}]) {
        items_page(limit: $lim, query_params: { rules: [{ column_id: "name", compare_value: $t, operator: contains_text }] }) { items { id name } }
      }
    }`,
    { t: [t], lim: limite },
  )
  return (d.boards[0]?.items_page.items ?? []).map((i) => ({ id: String(i.id), nombre: i.name }))
}

/** La cuenta corriente, con el cliente asignado y sus datos de contacto. */
export async function getCliente(cuentaId: string): Promise<ClienteTurno | null> {
  const d = await mondayApi<{ items: { id: string; name: string; board: { id: string }; column_values: CV[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        id name board { id }
        column_values(ids: ${JSON.stringify([COL_CUENTA.cliente, COL_CUENTA.celular, COL_CUENTA.email, COL_CUENTA.ubicacion])}) {
          id text
          ... on MirrorValue { display_value }
          ... on BoardRelationValue { display_value linked_item_ids }
        }
      }
    }`,
    { ids: [cuentaId] },
  )
  const i = d.items[0]
  if (!i || String(i.board.id) !== String(BOARD_CUENTAS)) return null
  const c = byId(i)
  return {
    id: String(i.id),
    nombre: i.name,
    clienteId: ids(c[COL_CUENTA.cliente])[0] ?? '',
    clienteNombre: limpio(c[COL_CUENTA.cliente]?.display_value),
    celular: primero(c[COL_CUENTA.celular]).replace(/\D/g, ''),
    email: primero(c[COL_CUENTA.email]),
    ubicacion: limpio(valor(c[COL_CUENTA.ubicacion])),
    cuentasIds: [String(i.id)],
  }
}

/**
 * La cuenta corriente de un turno ya registrado, para reprogramarlo: la de su obra, la de su
 * pendiente o, en un turno viejo sin ninguno de los dos, la primera del cliente.
 */
export async function cuentaDeTurno(t: { obraId: string; pendienteId: string; clienteId: string }): Promise<string | null> {
  const leer = async (id: string, col: string) => {
    const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${col}"]) { id ... on BoardRelationValue { linked_item_ids } } } }`,
      { ids: [id] },
    )
    return ids(d.items[0]?.column_values[0])[0] ?? null
  }
  if (t.obraId) {
    const c = await leer(t.obraId, COL.ctaCteCliente)
    if (c) return c
  }
  if (t.pendienteId) {
    const c = await leer(t.pendienteId, COL_PEND.cuenta)
    if (c) return c
  }
  return t.clienteId ? leer(t.clienteId, COL_CLIENTE.cuentas) : null
}

/**
 * El contacto del cliente de un turno ya registrado (👤 Clientes): el celular, para escribirle desde
 * la gestión, y la dirección, que es la "Ubicación" de los avisos de una reparación.
 */
export async function contactoDeCliente(clienteId: string): Promise<{ celular: string; ubicacion: string }> {
  if (!clienteId) return { celular: '', ubicacion: '' }
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL_CLIENTE.celular}", "location_mkt9ewya"]) { id text } } }`,
    { ids: [clienteId] },
  )
  const c = byId(d.items[0] ?? { column_values: [] })
  return {
    celular: limpio(c[COL_CLIENTE.celular]?.text).replace(/\D/g, ''),
    ubicacion: limpio(c['location_mkt9ewya']?.text),
  }
}

/** El celular del cliente de un turno ya registrado (👤 Clientes), para escribirle desde la gestión. */
export async function celularDeCliente(clienteId: string): Promise<string> {
  if (!clienteId) return ''
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL_CLIENTE.celular}"]) { id text } } }`,
    { ids: [clienteId] },
  )
  return limpio(d.items[0]?.column_values[0]?.text).replace(/\D/g, '')
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Obras y pendientes del cliente
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface ElementosCliente {
  obras: ObraDeCliente[]
  pendientes: PendienteDeCliente[]
}

/** De a 100 ids por consulta: el tope de `items(ids:)`. */
async function porTandas<T>(todos: string[], leer: (tanda: string[]) => Promise<T[]>): Promise<T[]> {
  const salida: T[] = []
  for (let i = 0; i < todos.length; i += 100) salida.push(...(await leer(todos.slice(i, i + 100))))
  return salida
}

const COLS_OBRA = [
  COL.etapaProduccion,
  COL.tipo,
  COL.ubicacion,
  COL.celCoordinar,
  COL.saldo,
  COL.totalPactado,
  COL.canceladoEspejo,
  COL.ordenes,
]

/**
 * Las obras y los pendientes de entrega del cliente, siguiendo sus cuentas corrientes: el cliente
 * no está vinculado directo a la obra, la obra cuelga de la cuenta. Las archivadas o borradas no se
 * ofrecen.
 */
export async function getElementosCliente(cliente: ClienteTurno): Promise<ElementosCliente> {
  if (cliente.cuentasIds.length === 0) return { obras: [], pendientes: [] }

  const cuentas = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { column_values(ids: ${JSON.stringify(Object.values(COL_CUENTA))}) { id ... on BoardRelationValue { linked_item_ids } } }
    }`,
    { ids: cliente.cuentasIds },
  )
  const obrasIds = new Set<string>()
  const pendIds = new Set<string>()
  for (const cta of cuentas.items) {
    const c = byId(cta)
    ids(c[COL_CUENTA.obras]).forEach((x) => obrasIds.add(x))
    ids(c[COL_CUENTA.pendientes]).forEach((x) => pendIds.add(x))
  }

  const [estructura, obras, pendientes] = await Promise.all([
    getEstructuraBoard(),
    porTandas([...obrasIds], async (tanda) => {
      const d = await mondayApi<{
        items: { id: string; name: string; state: string; board: { id: string }; column_values: CV[] }[]
      }>(
        `query ($ids: [ID!]) {
          items(ids: $ids) {
            id name state board { id }
            column_values(ids: ${JSON.stringify(COLS_OBRA)}) {
              id text
              ... on FormulaValue { display_value }
              ... on MirrorValue { display_value }
              ... on BoardRelationValue { linked_item_ids }
            }
          }
        }`,
        { ids: tanda },
      )
      return d.items.filter((i) => i.state === 'active' && String(i.board.id) === String(BOARD_OBRAS))
    }),
    porTandas([...pendIds], async (tanda) => {
      const d = await mondayApi<{
        items: { id: string; name: string; state: string; board: { id: string }; column_values: CV[] }[]
      }>(
        `query ($ids: [ID!]) {
          items(ids: $ids) {
            id name state board { id }
            column_values(ids: ${JSON.stringify(Object.values(COL_PEND))}) {
              id text
              ... on FormulaValue { display_value }
              ... on BoardRelationValue { display_value }
            }
          }
        }`,
        { ids: tanda },
      )
      /* El vínculo de la cuenta también admite otro tablero de pendientes; la Agenda trabaja con
         el de entrega-venta (RN-06). */
      return d.items.filter((i) => i.state === 'active' && String(i.board.id) === String(BOARD_PENDIENTES))
    }),
  ])

  const colores = estructura[COL.etapaProduccion]?.colores ?? {}

  return {
    obras: obras
      .map((i): ObraDeCliente => {
        const c = byId(i)
        const etapa = limpio(c[COL.etapaProduccion]?.text)
        const saldoTxt = limpio(valor(c[COL.saldo]))
        let saldo: number | null = saldoTxt ? num(saldoTxt) : null
        /* La fórmula a veces viene vacía mientras Monday recalcula: se reconstruye con el total y
           lo cobrado, igual que en la ficha de la obra. */
        if (saldo === null) {
          const total = num(valor(c[COL.totalPactado]))
          if (total) saldo = total - sumaMirror(c[COL.canceladoEspejo])
        }
        return {
          id: String(i.id),
          nombre: i.name,
          etapa,
          etapaColor: colores[etapa] ?? '',
          material: limpio(c[COL.tipo]?.text),
          ubicacion: limpio(c[COL.ubicacion]?.text),
          celCoordinar: limpio(c[COL.celCoordinar]?.text).replace(/\D/g, ''),
          saldo,
          ordenesIds: ids(c[COL.ordenes]),
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    pendientes: pendientes
      .map((i): PendienteDeCliente => {
        const c = byId(i)
        return {
          id: String(i.id),
          nombre: i.name,
          producto: limpio(c[COL_PEND.producto]?.display_value) || i.name,
          vendido: num(limpio(c[COL_PEND.vendido]?.text)),
          pendiente: num(limpio(valor(c[COL_PEND.pendiente]))),
          estado: limpio(c[COL_PEND.estado]?.text),
        }
      })
      /* Lo que todavía falta entregar, primero. */
      .sort((a, b) => Number(b.pendiente > 0) - Number(a.pendiente > 0) || a.producto.localeCompare(b.producto)),
  }
}

/**
 * Las aberturas a colocar de cada obra (RN-07): los subelementos "Observacion" —uno por abertura—
 * de sus OP vigentes. Las canceladas y los borradores no cuentan. Una obra sin OP en el tablero de
 * órdenes (anterior a la app) devuelve `null`: no se sabe, y no es lo mismo que cero.
 */
export async function aberturasDeObras(obras: readonly ObraDeCliente[]): Promise<Record<string, number | null>> {
  const todas = obras.flatMap((o) => o.ordenesIds)
  const salida: Record<string, number | null> = Object.fromEntries(obras.map((o) => [o.id, null]))
  if (todas.length === 0) return salida

  const ops = await porTandas(todas, async (tanda) => {
    const d = await mondayApi<{
      items: {
        id: string
        state: string
        board: { id: string }
        column_values: CV[]
        subitems: { column_values: { id: string; text: string | null }[] }[] | null
      }[]
    }>(
      `query ($ids: [ID!]) {
        items(ids: $ids) {
          id state board { id }
          column_values(ids: ["${COL_OP.estado}", "${COL_OP.opFinal}", "${COL_OP.etmo}"]) { id text value }
          subitems { column_values(ids: ["${COL_OBS.estado}"]) { id text } }
        }
      }`,
      { ids: tanda },
    )
    return d.items.filter((i) => i.state === 'active' && String(i.board.id) === String(BOARD_ORDENES))
  })

  const porOp = new Map(ops.map((op) => [String(op.id), op]))
  for (const obra of obras) {
    let total: number | null = null
    for (const id of obra.ordenesIds) {
      const op = porOp.get(id)
      if (!op) continue
      const c = byId(op)
      const tieneDoc = Boolean(limpio(c[COL_OP.opFinal]?.text) || limpio(c[COL_OP.etmo]?.text))
      const estado = estadoDeOrden(limpio(c[COL_OP.estado]?.text), tieneDoc)
      if (estado === 'cancelada' || estado === 'borrador') continue
      const n = (op.subitems ?? []).filter((s) => (s.column_values[0]?.text ?? '').trim() === 'Observacion').length
      total = (total ?? 0) + n
    }
    salida[obra.id] = total
  }
  return salida
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Turnos
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface Turno {
  id: string
  nombre: string
  /** La etiqueta de `✋ Tipo de Turno` tal cual (los tipos viejos no tienen `tipo`). */
  etiquetaTipo: string
  tipo: TipoTurno | null
  /** La etiqueta de `🤖 Estado Turno` tal cual. */
  etiquetaEstado: string
  estado: EstadoTurno
  /** `YYYY-MM-DD`, o vacío. */
  fecha: string
  /** `HH:MM` en la hora local, o vacío (los turnos viejos no tienen hora: las 00:00). */
  hora: string
  clienteId: string
  cliente: string
  obraId: string
  obra: string
  pendienteId: string
  pendiente: string
  cantAberturas: string
  /** `🤖Responsable`: el nombre de quien registró el turno, o vacío. */
  responsable: string
  aprobacion: string
  /** `✋Material` del turno (PVC / Aluminio), o vacío. */
  material: string
  /** La ubicación: la de la obra (espejo) o la del propio turno. */
  ubicacion: string
  /** La cuenta corriente de la obra (espejo), o vacío. */
  ctaCte: string
  motivoCancelacion: string
  resultado: string
  notifAsignacion: string
  /** ISO. */
  creado: string
}

const COLS_TURNO = [
  COL_TURNO.responsable,
  COL_TURNO.cliente,
  COL_TURNO.estado,
  COL_TURNO.tipo,
  COL_TURNO.fecha,
  COL_TURNO.obra,
  COL_TURNO.pendiente,
  COL_TURNO.cantAberturas,
  COL_TURNO.aprobacion,
  COL_TURNO.material,
  COL_TURNO.ubicacionObra,
  COL_TURNO.ubicacion,
  COL_TURNO.ctaCteObra,
  COL_TURNO.motivoCancelacion,
  COL_TURNO.resultado,
  COL_TURNO.notifAsignacion,
]

const CAMPOS_TURNO = `
  id name state created_at
  column_values(ids: ${JSON.stringify(COLS_TURNO)}) {
    id text value
    ... on BoardRelationValue { display_value linked_item_ids }
    ... on MirrorValue { display_value }
  }
`

type ItemTurno = { id: string; name: string; state?: string; created_at?: string; column_values: CV[] }

/** La fecha y la hora locales del turno, desde el `value` de la columna (la hora va en UTC). */
function fechaYHora(cv: CV | undefined, texto: string): { fecha: string; hora: string } {
  try {
    const v = JSON.parse(cv?.value ?? 'null') as { date?: string; time?: string | null } | null
    if (v?.date) return deColumnaFecha(v)
  } catch {
    /* Sin un valor legible, el texto: al menos el día. */
  }
  return { fecha: texto.slice(0, 10), hora: '' }
}

function aTurno(i: ItemTurno): Turno {
  const c = byId(i)
  const t = (id: string) => limpio(c[id]?.text)
  const etiquetaTipo = t(COL_TURNO.tipo)
  const etiquetaEstado = t(COL_TURNO.estado)
  return {
    id: String(i.id),
    nombre: i.name,
    etiquetaTipo,
    tipo: tipoDeEtiqueta(etiquetaTipo),
    etiquetaEstado,
    estado: estadoDeTurno(etiquetaEstado),
    ...fechaYHora(c[COL_TURNO.fecha], t(COL_TURNO.fecha)),
    clienteId: ids(c[COL_TURNO.cliente])[0] ?? '',
    cliente: limpio(c[COL_TURNO.cliente]?.display_value),
    obraId: ids(c[COL_TURNO.obra])[0] ?? '',
    obra: limpio(c[COL_TURNO.obra]?.display_value),
    pendienteId: ids(c[COL_TURNO.pendiente])[0] ?? '',
    pendiente: limpio(c[COL_TURNO.pendiente]?.display_value),
    cantAberturas: t(COL_TURNO.cantAberturas),
    responsable: t(COL_TURNO.responsable),
    aprobacion: t(COL_TURNO.aprobacion),
    material: t(COL_TURNO.material),
    ubicacion: limpio(c[COL_TURNO.ubicacionObra]?.display_value) || t(COL_TURNO.ubicacion),
    ctaCte: limpio(c[COL_TURNO.ctaCteObra]?.display_value),
    motivoCancelacion: t(COL_TURNO.motivoCancelacion),
    resultado: t(COL_TURNO.resultado),
    notifAsignacion: t(COL_TURNO.notifAsignacion),
    creado: i.created_at ?? '',
  }
}

const vigente = (i: ItemTurno) => i.state !== 'archived' && i.state !== 'deleted'

/** Todos los turnos del tablero, de a páginas de 500. El tope de 20 páginas es contra un cursor roto. */
/**
 * Los índices de `🤖 Estado Turno` que se gestionan: Asignada (0) y Pendiente (5). El 5 es además la
 * etiqueta por defecto del tablero, así que también trae los turnos sin estado.
 */
const INDICES_ACTIVOS = [0, 5]

/**
 * Las columnas del LISTADO: las mismas del turno menos los espejos de la obra. Los espejos son lo que
 * hace lenta la consulta (con ellos, 131 turnos tardaban 12 s; sin ellos, 2 a 5 s), y sólo los
 * necesitan los mensajes, que salen de `leerTurno` —el turno releído antes de cada acción—.
 */
const CAMPOS_LISTA = `
  id name state created_at
  column_values(ids: ${JSON.stringify(COLS_TURNO.filter((c) => c !== COL_TURNO.ubicacionObra && c !== COL_TURNO.ctaCteObra))}) {
    id text value
    ... on BoardRelationValue { display_value linked_item_ids }
  }
`

/**
 * Los turnos que se gestionan —Asignada y Pendiente (o sin estado)—, filtrados por Monday: no se
 * trae el tablero entero para descartar los cumplidos y cancelados. De a páginas de 500; el tope de
 * 20 páginas es contra un cursor roto.
 */
export async function listarTurnos(): Promise<Turno[]> {
  interface Pagina {
    cursor: string | null
    items: ItemTurno[]
  }
  const salida: Turno[] = []
  const d = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query {
      boards(ids: [${BOARD_AGENDA}]) {
        items_page(limit: 500, query_params: { rules: [{ column_id: "${COL_TURNO.estado}", compare_value: ${JSON.stringify(INDICES_ACTIVOS)}, operator: any_of }] }) {
          cursor items { ${CAMPOS_LISTA} }
        }
      }
    }`,
  )
  let pagina: Pagina | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 20; vuelta++) {
    salida.push(...pagina.items.filter(vigente).map(aTurno))
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${CAMPOS_LISTA} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return salida
}

/** UN turno, leído en el momento: antes de cada acción se relee, por si otro lo movió. */
export async function leerTurno(id: string): Promise<Turno | null> {
  const d = await mondayApi<{ items: ItemTurno[] }>(`query ($ids: [ID!]) { items(ids: $ids) { ${CAMPOS_TURNO} } }`, {
    ids: [id],
  })
  const i = d.items?.[0]
  return i && vigente(i) ? aTurno(i) : null
}

/** El catálogo de `✋ Motivo de Cancelacion`, en el orden del tablero. */
export const getMotivosCancelacion = memoGlobal(async (): Promise<string[]> => {
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[] }[] }>(
    `query { boards(ids: [${BOARD_AGENDA}]) { columns(ids: ["${COL_TURNO.motivoCancelacion}"]) { settings_str } } }`,
  )
  try {
    const s = JSON.parse(d.boards[0]?.columns[0]?.settings_str ?? '{}') as {
      labels?: Record<string, string>
      labels_positions_v2?: Record<string, number>
    }
    const pos = s.labels_positions_v2 ?? {}
    return Object.entries(s.labels ?? {})
      .filter(([, texto]) => texto.trim())
      .sort(([a], [b]) => (pos[a] ?? Number(a)) - (pos[b] ?? Number(b)))
      .map(([, texto]) => texto)
  } catch {
    return []
  }
})

/** Una etiqueta de `✋ Tipo de Reparacion`: su id (para escribirla) y su nombre. */
export interface TipoReparacion {
  id: number
  nombre: string
}

/**
 * Las etiquetas de `✋ Tipo de Reparacion`, en el orden del tablero. Un nombre repetido (el tablero
 * tiene dos "SOLO ENTREGA") se ofrece una sola vez: elegir uno u otro es lo mismo.
 */
export const getTiposReparacion = memoGlobal(async (): Promise<TipoReparacion[]> => {
  const d = await mondayApi<{ boards: { columns: { settings_str: string }[] }[] }>(
    `query { boards(ids: [${BOARD_AGENDA}]) { columns(ids: ["${COL_TURNO.tipoReparacion}"]) { settings_str } } }`,
  )
  try {
    const s = JSON.parse(d.boards[0]?.columns[0]?.settings_str ?? '{}') as {
      labels?: { id: number; name: string }[] | Record<string, string>
      deactivated_labels?: number[]
    }
    const apagadas = new Set(s.deactivated_labels ?? [])
    const lista = Array.isArray(s.labels)
      ? s.labels
      : Object.entries(s.labels ?? {}).map(([id, name]) => ({ id: Number(id), name }))
    const vistos = new Set<string>()
    return lista
      .filter((l) => l.name?.trim() && !apagadas.has(l.id))
      .filter((l) => {
        const clave = l.name.trim().toLowerCase()
        if (vistos.has(clave)) return false
        vistos.add(clave)
        return true
      })
      .map((l) => ({ id: l.id, nombre: l.name.trim() }))
  } catch {
    return []
  }
})

async function cambiarTurno(id: string, valores: Record<string, unknown>): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_AGENDA}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id, valores: JSON.stringify(valores) },
  )
}

/** Una constancia en el historial del turno (el dato de finalización, el detalle de la cancelación). */
async function dejarConstancia(id: string, texto: string): Promise<void> {
  const html = texto
    .split('\n')
    .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>')
  await mondayApi(`mutation ($id: ID!, $body: String!) { create_update(item_id: $id, body: $body) { id } }`, {
    id,
    body: html,
  })
}

const fechaCol = (iso: string) => ({ date: iso })

export interface AltaTurno {
  cliente: ClienteTurno
  tipo: TipoTurno
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`, hora local. */
  hora?: string
  obra?: ObraDeCliente | null
  pendiente?: PendienteDeCliente | null
  /** Colocación. `null` = no se pudo calcular: la columna queda vacía. */
  aberturas?: number | null
  aprobacion?: Aprobacion | null
  /** Reparación: la etiqueta de `✋ Tipo de Reparacion`. */
  tipoReparacion?: TipoReparacion | null
  /**
   * Se le mandó el mensaje de asignación antes de crearlo: nace "Asignada", con la notificación
   * enviada y su fecha (`YYYY-MM-DD`). Sin esto, nace "Pendiente".
   */
  asignadoEl?: string | null
  /** El usuario de Monday logueado en la app: queda como responsable del turno. */
  responsableId?: string | null
}

/** El nombre del ítem: el cliente y lo que se va a hacer, como se lee en el tablero. */
export function nombreTurno(a: AltaTurno): string {
  const que = a.obra?.nombre ?? a.pendiente?.producto ?? ''
  const quien = a.cliente.clienteNombre || a.cliente.nombre
  return [defTipo(a.tipo).titulo.toUpperCase(), quien, que && que !== quien ? que : '']
    .filter(Boolean)
    .join(' - ')
    .slice(0, 255)
}

/**
 * Registra el turno en la Agenda con todos sus datos MENOS el tipo de turno. Nace "Asignada" si ya
 * se le mandó el mensaje de asignación (`asignadoEl`), y "Pendiente" si no. Devuelve el id del ítem.
 *
 * El tipo NO va en la creación: lo pone `asignarTipoTurno` después, cuando Monday ya devolvió el
 * ítem. Ese cambio de `✋ Tipo de Turno` dispara una automatización nativa del tablero, y una
 * etiqueta cargada al crear el ítem no cuenta como cambio.
 */
export async function crearTurno(a: AltaTurno): Promise<string> {
  const valores: Record<string, unknown> = {
    [COL_TURNO.estado]:{ label: a.asignadoEl ? ETIQUETA_TURNO.asignado : ETIQUETA_TURNO.pendiente },
    [COL_TURNO.fecha]: aColumnaFecha(a.fecha, a.hora),
    [COL_TURNO.conObra]: { label: a.obra ? 'Con Obra' : 'Sin Obra' },
  }
  if (a.cliente.clienteId) valores[COL_TURNO.cliente] = { item_ids: [Number(a.cliente.clienteId)] }
  if (a.responsableId) valores[COL_TURNO.responsable] = { personsAndTeams: [{ id: Number(a.responsableId), kind: 'person' }] }
  if (a.obra) {
    valores[COL_TURNO.obra] = { item_ids: [Number(a.obra.id)] }
    /* Sólo con una etiqueta que exista tal cual: sin `create_labels_if_missing`, otra la rechaza. */
    if (a.obra.material === 'PVC' || a.obra.material === 'Aluminio') valores[COL_TURNO.material] = { label: a.obra.material }
  }
  if (a.pendiente) valores[COL_TURNO.pendiente] = { item_ids: [Number(a.pendiente.id)] }
  if (a.asignadoEl) {
    valores[COL_TURNO.notifAsignacion] = { label: NOTIF.enviado }
    valores[COL_TURNO.fechaNotifAsignacion] = fechaCol(a.asignadoEl)
  }
  if (a.tipo === 'reparacion' && a.tipoReparacion) valores[COL_TURNO.tipoReparacion] = { ids: [a.tipoReparacion.id] }
  if (a.tipo === 'colocacion') {
    if (a.aberturas != null) valores[COL_TURNO.cantAberturas] = String(a.aberturas)
    if (a.aprobacion) valores[COL_TURNO.aprobacion] = { label: ETIQUETA_APROBACION[a.aprobacion] }
  }
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_AGENDA}, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: nombreTurno(a), valores: JSON.stringify(valores) },
  )
  return String(d.create_item.id)
}

/**
 * El tipo de turno del ítem ya creado. Va aparte, después de `crearTurno`, a propósito: el cambio
 * de `✋ Tipo de Turno` es el que dispara la automatización nativa de la Agenda.
 */
export async function asignarTipoTurno(id: string, tipo: TipoTurno): Promise<void> {
  await escribirEtiquetaTipo(id, defTipo(tipo).etiqueta)
}

/** Lo mismo con la etiqueta tal cual: el turno reprogramado de un tipo viejo (SELLAR) conserva el suyo. */
export async function escribirEtiquetaTipo(id: string, etiqueta: string): Promise<void> {
  await cambiarTurno(id, { [COL_TURNO.tipo]: { label: etiqueta } })
}

/** Asigna un turno Pendiente desde la gestión: pasa a "Asignada", sin mensaje (se pregunta después). */
export async function asignarTurno(id: string): Promise<void> {
  await cambiarTurno(id, { [COL_TURNO.estado]: { label: ETIQUETA_TURNO.asignado } })
}

/** Resultado del mensaje de asignación: "Asignada" si salió; si no, queda Pendiente con el error. */
export async function registrarAsignacion(id: string, enviado: boolean, hoy: string): Promise<void> {
  await cambiarTurno(
    id,
    enviado
      ? {
          [COL_TURNO.estado]: { label: ETIQUETA_TURNO.asignado },
          [COL_TURNO.notifAsignacion]: { label: NOTIF.enviado },
          [COL_TURNO.fechaNotifAsignacion]: fechaCol(hoy),
        }
      : { [COL_TURNO.notifAsignacion]: { label: NOTIF.error } },
  )
}

/** Cancela el turno: "Cancelado", con el motivo del catálogo, la fecha y el detalle como constancia. */
export async function cancelarTurno(
  id: string,
  c: { motivo: string; detalle: string; autor: string; hoy: string },
): Promise<void> {
  const valores: Record<string, unknown> = {
    [COL_TURNO.estado]: { label: ETIQUETA_TURNO.cancelado },
    [COL_TURNO.motivoCancelacion]: { label: c.motivo },
    [COL_TURNO.fechaCancelacion]: fechaCol(c.hoy),
  }
  await cambiarTurno(id, valores)
  await dejarConstancia(
    id,
    [`Turno cancelado por ${c.autor || 'la app'} desde la app.`, `Motivo: ${c.motivo}`, c.detalle.trim() ? `Detalle: ${c.detalle.trim()}` : '']
      .filter(Boolean)
      .join('\n'),
  )
}

/** Confirma el turno: "Cumplido", con el resultado y la fecha, y el dato de finalización como constancia. */
export async function confirmarTurno(
  id: string,
  c: { etiquetaResultado: string | null; resultado: string; autor: string; hoy: string; obraId?: string },
): Promise<void> {
  const valores: Record<string, unknown> = {
    [COL_TURNO.estado]: { label: ETIQUETA_TURNO.cumplido },
    [COL_TURNO.fechaCumplido]: fechaCol(c.hoy),
  }
  if (c.etiquetaResultado) valores[COL_TURNO.resultado] = { label: c.etiquetaResultado }
  await cambiarTurno(id, valores)
  await dejarConstancia(
    id,
    [`Turno confirmado por ${c.autor || 'la app'} desde la app.`, c.resultado].filter(Boolean).join('\n'),
  )
  /* Colocación: el resultado va también a la `✋Etapa de Produccion` de la obra, que es lo que
     refleja el espejo "Etapa de Porduccion" (`lookup_mm2t4yss`) del turno. Un espejo no se escribe. */
  if (c.etiquetaResultado && c.obraId) {
    await mondayApi(
      `mutation ($id: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: ${BOARD_OBRAS}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
      }`,
      { id: c.obraId, valores: JSON.stringify({ [COL.etapaProduccion]: { label: c.etiquetaResultado } }) },
    )
  }
}

/** Lo pendiente de entrega de un pendiente, leído en el momento (para validar la cantidad entregada). */
export async function pendienteDeEntrega(pendienteId: string): Promise<number | null> {
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL_PEND.pendiente}"]) { id text ... on FormulaValue { display_value } } } }`,
    { ids: [pendienteId] },
  )
  const t = limpio(valor(d.items[0]?.column_values[0]))
  return t ? num(t) : null
}


/** Cómo salió un mensaje que se mandó después de escribir el estado (cancelación, confirmación). */
export async function marcarNotificacion(id: string, mensaje: 'cancelacion' | 'confirmacion', enviado: boolean): Promise<void> {
  const col = mensaje === 'cancelacion' ? COL_TURNO.notifCancelacion : COL_TURNO.notifConfirmacion
  await cambiarTurno(id, { [col]: { label: enviado ? NOTIF.enviado : NOTIF.error } })
}

/**
 * El saldo de una obra (`🤖 Saldo`), para el aviso de saldo pendiente cuando la gestión manda la
 * asignación de una colocación No aprobada. `null` si no se puede leer.
 */
export async function saldoDeObra(obraId: string): Promise<number | null> {
  if (!obraId) return null
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL.saldo}"]) { id text ... on FormulaValue { display_value } } } }`,
    { ids: [obraId] },
  )
  const texto = limpio(valor(d.items?.[0]?.column_values?.[0]))
  return texto ? num(texto) : null
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Actividades (Emails & Activities) del turno
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Las actividades personalizadas de la cuenta que usan los turnos (query `custom_activity`). Se
 * reutilizan las que ya existían: la operación va como TÍTULO de la actividad.
 */
export const ACTIVIDAD_TURNO = {
  /** "Turno Agenda": la asignación y la confirmación. */
  agenda: '7ff2f6a3-3236-4d67-823c-8ff91ec4b8cb',
  /** "Turno Cancelado". */
  cancelado: '258e4093-24b5-4d01-a240-2efb612490e0',
  /** "Turno Reprogramado": la cancelación que da lugar a un turno nuevo. */
  reprogramado: 'a10108ac-b65d-41c7-9108-25c708833651',
} as const

/** Escapa texto para meterlo dentro del HTML del contenido de una actividad. */
export const html = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Registra una actividad en la línea de tiempo (Emails & Activities) del turno. `contenido` va en
 * HTML simple (`<p>`, `<b>`): Monday lo muestra con formato.
 */
export async function registrarActividadTurno(a: {
  turnoId: string
  actividadId: string
  titulo: string
  resumen: string
  contenido: string
}): Promise<void> {
  await mondayApi(
    `mutation ($item: ID!, $act: String!, $title: String!, $summary: String, $content: String, $ts: ISO8601DateTime!) {
      create_timeline_item(item_id: $item, custom_activity_id: $act, title: $title, summary: $summary, content: $content, timestamp: $ts) { id }
    }`,
    {
      item: a.turnoId,
      act: a.actividadId,
      title: a.titulo,
      summary: a.resumen,
      content: a.contenido,
      ts: new Date().toISOString(),
    },
  )
}

/** Las órdenes de producción de una obra (sus nombres, "Obra - IDOP-059 - Aluminio A1"). */
export async function ordenesDeLaObra(obraId: string): Promise<string[]> {
  if (!obraId) return []
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["${COL.ordenes}"]) { id ... on BoardRelationValue { display_value } } } }`,
    { ids: [obraId] },
  )
  return limpio(d.items[0]?.column_values[0]?.display_value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Reprogramar: el turno nuevo, con los datos del cancelado
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Crea el turno que reemplaza a uno reprogramado: el mismo cliente, obra o pendiente, material,
 * aprobación, Con/Sin Obra, tipo de reparación y ubicación de entrega, con la fecha NUEVA (y, en una
 * colocación, la cantidad de aberturas que se volvió a pedir). Nace "Pendiente", con quien lo
 * reprogramó como responsable.
 *
 * Como al crear un turno, el tipo NO va en la creación: lo escribe `asignarTipoTurno` después,
 * porque ese cambio dispara la automatización nativa del tablero. Devuelve el id del turno nuevo.
 */
export async function crearTurnoReprogramado(
  viejo: Turno,
  n: { fecha: string; hora: string; aberturas: number | null; responsableId: string | null },
): Promise<string> {
  const copiar = [
    COL_TURNO.cliente,
    COL_TURNO.obra,
    COL_TURNO.pendiente,
    COL_TURNO.material,
    COL_TURNO.aprobacion,
    COL_TURNO.conObra,
    COL_TURNO.tipoReparacion,
    COL_TURNO.ubicacion,
  ]
  const d = await mondayApi<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { column_values(ids: ${JSON.stringify(copiar)}) { id text value ... on BoardRelationValue { linked_item_ids } } }
    }`,
    { ids: [viejo.id] },
  )
  const c = byId(d.items[0] ?? { column_values: [] })
  const valores: Record<string, unknown> = {
    [COL_TURNO.estado]: { label: ETIQUETA_TURNO.pendiente },
    [COL_TURNO.fecha]: aColumnaFecha(n.fecha, n.hora),
  }
  for (const col of [COL_TURNO.cliente, COL_TURNO.obra, COL_TURNO.pendiente]) {
    const linkeados = ids(c[col])
    if (linkeados.length) valores[col] = { item_ids: linkeados.map(Number) }
  }
  for (const col of [COL_TURNO.material, COL_TURNO.aprobacion, COL_TURNO.conObra]) {
    const etiqueta = limpio(c[col]?.text)
    if (etiqueta) valores[col] = { label: etiqueta }
  }
  /* El desplegable y la ubicación se copian con su valor crudo (ids de las etiquetas; lat/lng). */
  try {
    const rep = JSON.parse(c[COL_TURNO.tipoReparacion]?.value ?? 'null') as { ids?: number[] } | null
    if (rep?.ids?.length) valores[COL_TURNO.tipoReparacion] = { ids: rep.ids }
  } catch {
    /* Sin tipo de reparación legible: el turno nuevo queda sin él. */
  }
  try {
    const ubi = JSON.parse(c[COL_TURNO.ubicacion]?.value ?? 'null') as { lat?: number; lng?: number; address?: string } | null
    if (ubi?.lat != null && ubi?.lng != null) valores[COL_TURNO.ubicacion] = { lat: ubi.lat, lng: ubi.lng, address: ubi.address ?? '' }
  } catch {
    /* Sin ubicación legible: el turno nuevo queda sin ella. */
  }
  if (viejo.tipo === 'colocacion' && n.aberturas != null) valores[COL_TURNO.cantAberturas] = String(n.aberturas)
  if (n.responsableId) valores[COL_TURNO.responsable] = { personsAndTeams: [{ id: Number(n.responsableId), kind: 'person' }] }

  const creado = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_AGENDA}, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: viejo.nombre.slice(0, 255), valores: JSON.stringify(valores) },
  )
  return String(creado.create_item.id)
}
