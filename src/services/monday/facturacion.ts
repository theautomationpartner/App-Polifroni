/**
 * Obras · "Facturar una Obra": la cuenta corriente de la obra, sus importes y su comprobante.
 *
 * Tableros:
 *  - 🔄 Cuentas Corrientes Cliente (9617990272) y sus movimientos (subelementos, 9617990698). Una
 *    cuenta dada de baja vive en ARCHIVADOS (18425935891), con las mismas columnas.
 *  - 👤 Clientes (9617181550): los datos fiscales y de contacto del cliente de la cuenta.
 *  - 🪟 Obras (9617181553): los importes (total pactado, diferencia, cancelado, facturado) y lo
 *    pendiente de facturar.
 *  - 🧾 Facturación obra (18411065225) y su renglón (subelementos, 18411065228): el comprobante.
 *
 * El comprobante se arma COMO LO ARMA HOY el botón "Emitir Factura" de la obra, y la emisión la sigue
 * haciendo la integración con ARCA del tablero. Lo que se vio en el registro de actividad (08/10/2026):
 *  1. El ítem nace ("fact") y las automatizaciones del tablero le ponen las fechas, la moneda, la
 *     condición de venta y un renglón vacío "Fabricacion de Aberturas para Obra".
 *  2. Al vincularle la obra, el escenario del tablero completa el precio del renglón con TODO lo
 *     pendiente de facturar de la obra (y el CUIT de la cuenta, o deja un aviso si no lo tiene).
 *  3. "✋ Emitir Comprobante" pone `🤖 Estado Comprobante` en "Crear Comprobante" (3), y la integración
 *     emite en ARCA: "Creando" (0) y "Comprobante Creado" (1) con el PDF, el número, la letra y el CAE
 *     —o "Error - Mirar Comentarios" (2), con el motivo en una actualización—.
 *  4. Con "Comprobante Creado" el tablero registra la factura en la obra (`🤖 $ Facturado`).
 * La app hace el 1 y el 2, espera que el renglón tenga precio, lo cambia por el monto elegido (puede
 * ser una parte de lo pendiente), y recién ahí pide la emisión (3) y la espera.
 *
 * El envío NO pasa por el escenario: la app manda el WhatsApp (`/api/whatsapp`) y deja
 * `🤖Estado Envio` en "Enviado". Nunca escribe "Enviar" (3): eso dispara el envío de Make.
 */
import { CONCEPTO_FACTURA, INDICE_COMPROBANTE, INDICE_ENVIO_FACTURA, aCentavos, fechasComprobante } from '@/lib/facturacion'
import type { ArchivoObra, EstadoObra } from '@/types'
import { archivosDeColumna, getUrlArchivo } from './obras'
import { byId, num, sumaMirror, valor, type CV } from './parse'
import { COL_CONTACTO } from './presupuestos'
import { mondayApi } from './sdk'

export const BOARD_CUENTAS_ACTIVAS = 9617990272
export const BOARD_CUENTAS_ARCHIVADAS = 18425935891
export const BOARD_FACTURACION_OBRA = 18411065225
export const BOARD_RENGLON_FACTURA = 18411065228
const GRUPO_FACTURAS = 'group_title'

/** Columnas de 🔄 Cuentas Corrientes Cliente. */
const COL_CUENTA = {
  clasificacion: 'color_mkt51yxc',
  saldo: 'formula_mksevny',
  estadoSaldo: 'formula_mm4vqn32',
  ventasPendCobro: 'numeric_mm6vmq7t',
  anticiposPendAplicar: 'numeric_mm6vks8b',
  asignada: 'multiple_person_mkt5bxvw',
  cliente: 'board_relation_mkt5evd4',
  documento: 'lookup_mm32amnm',
  codigo: 'pulse_id_mkt57ccx',
  obras: 'board_relation_mkthanr',
  email: 'lookup_mktz54ac',
  celular: 'lookup_mktz3drh',
  direccion: 'lookup_mkvyz22x',
} as const

/** Columnas de los movimientos de la cuenta. */
const COL_MOV = {
  tipo: 'status',
  vencimiento: 'date_mkse7myg',
  saldoInicial: 'numeric_mksekr2c',
  ventas: 'numeric_mkse7apk',
  cobros: 'numeric_mksegwwc',
  saldoFinal: 'formula_mkse3h2h',
  codigo: 'pulse_id_mksekh0e',
} as const

/** Columnas de 👤 Clientes y de 👤 Constructor/Arquitecto que se leen. */
const COL_CLIENTE = {
  documento: 'text_mkwzq9z4',
  condicionFiscal: 'color_mkszas2x',
  direccion: 'location_mkt9ewya',
} as const

/** Columnas de 🪟 Obras. */
const COL_OBRA = {
  idObra: 'pulse_id_mktm8dq9',
  cuenta: 'board_relation_mkthtd70',
  constructor: 'board_relation_mksz3v0h',
  celConstructor: 'lookup_mkv0rg18',
  tipo: 'color_mkw92ypr',
  etapaProduccion: 'color_mm1kddt0',
  total: 'deal_value',
  cancelado: 'lookup_mktm9fe2',
  diferencia: 'lookup_mkxc198q',
  pctCancelado: 'formula_mkty8qcx',
  facturado: 'lookup_mm3k9274',
  pendiente: 'formula_mm3k561m',
} as const

/** Columnas de 🧾 Facturación obra. */
const COL_FACT = {
  tipo: 'dropdown_mm3kvrc',
  moneda: 'dropdown_mm3kfhwj',
  cuitAFacturar: 'numeric_mm3sx8d6',
  emision: 'date',
  desde: 'date_mm2gyjvw',
  hasta: 'date_mm2g8n2n',
  vencimiento: 'date_mm2gp00f',
  condicionVenta: 'dropdown_mm2ged22',
  estado: 'status',
  pdf: 'file_mm1tg5w5',
  letra: 'text_mm3ks67s',
  numero: 'text_mm3krf4m',
  razonSocial: 'text_mm48dwc6',
  iva: 'dropdown_mm48c9m4',
  cae: 'text_mm3k93vs',
  obra: 'board_relation_mm3ksj4p',
  estadoEnvio: 'color_mm3kg5dm',
  sobre: 'color_mm3x1kd',
} as const

/** Columnas del renglón del comprobante. */
const COL_RENGLON = {
  unidad: 'dropdown_mm2gk2mv',
  cantidad: 'numeric_mm1srkr2',
  precioFinal: 'numeric_mm1swnhz',
  precioSinIva: 'numeric_mm3x80tn',
  prodServ: 'dropdown_mm2fyez4',
  alicuota: 'dropdown_mm2g198w',
} as const

/** Los ids de las etiquetas de los desplegables del tablero (Factura, Pesos, Cuenta Corriente…). */
const OPCION = {
  factura: 1,
  pesos: 2,
  cuentaCorriente: 2,
  unidades: 1,
  producto: 1,
  /** "21" en Alícuota IVA %. */
  iva21: 5,
  /** "Obra" en 🤖 Comprobante Sobre:. */
  sobreObra: 1,
} as const

/* Las variantes que piden los valores reales de cada tipo de columna. */
const CAMPOS = `id text value
  ... on StatusValue { index label_style { color } }
  ... on MirrorValue { display_value }
  ... on FormulaValue { display_value }
  ... on BoardRelationValue { linked_item_ids display_value }`

type CVx = CV & { label_style?: { color?: string } | null }

const ids = (cv?: CV) => (cv?.linked_item_ids ?? []).map(String)
const etiqueta = (cv?: CV): EstadoObra => ({
  texto: (cv?.text ?? '').trim(),
  color: (cv as CVx | undefined)?.label_style?.color ?? '',
})
/** Un número de una columna numérica: `null` si está vacía. */
const numONull = (cv?: CV): number | null => (valor(cv).trim() ? num(valor(cv)) : null)
/** El primero de un espejo con varios valores ("549…, 549…"). */
const primero = (cv?: CV) => valor(cv).split(',')[0]?.trim() ?? ''

/* ────────────────────────────────────────────────────────────────────────────────
 * Etapa 1 · la cuenta corriente
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Un movimiento de la cuenta (una venta, un cobro, una nota de crédito…). */
export interface MovimientoCuenta {
  id: string
  nombre: string
  /** ✋Movimiento, con el color del tablero. */
  tipo: EstadoObra
  /** "2026-10-08": cuándo se registró. */
  fecha: string
  vencimiento: string
  saldoInicial: number
  ventas: number
  cobros: number
  saldoFinal: number
}

/** El cliente de la cuenta: a quién se factura y a quién le llega el WhatsApp. */
export interface ClienteCuenta {
  id: string
  nombre: string
  celular: string
  email: string
  /** ✋Cuit/CUIL/DNI del cliente (o el espejo de la cuenta). */
  documento: string
  /** ✋Condicion Fiscal: Responsable Inscripto, Monotributista, Consumidor Final… */
  condicionFiscal: string
  direccion: string
}

/** La cuenta corriente completa, como la muestra la etapa 1. */
export interface CuentaCorriente {
  id: string
  nombre: string
  /** 🤖ID Cta Cte Cliente (IDCTACTE-…). */
  codigo: string
  archivada: boolean
  clasificacion: EstadoObra
  /** 🤖Cta Cte Saldo: "A COBRAR", "SALDO CERO" o "A FAVOR". */
  estadoSaldo: string
  /** Ventas − Cobros (la fórmula 🤖Saldo del tablero, con los movimientos). */
  saldo: number
  totalVentas: number
  totalCobros: number
  ventasPendCobro: number | null
  anticiposPendAplicar: number | null
  asignada: string
  cliente: ClienteCuenta | null
  obraIds: string[]
  /** Del más nuevo al más viejo. */
  movimientos: MovimientoCuenta[]
}

const COLS_CUENTA = Object.values(COL_CUENTA)
const COLS_MOV = Object.values(COL_MOV)

/** La cuenta corriente con sus movimientos y los datos fiscales de su cliente. `null`: no existe. */
export async function getCuentaCorriente(id: string): Promise<CuentaCorriente | null> {
  const d = await mondayApi<{
    items: {
      id: string
      name: string
      board: { id: string }
      column_values: CV[]
      subitems: { id: string; name: string; created_at: string; column_values: CV[] }[]
    }[]
  }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        id name board { id }
        column_values(ids: ${JSON.stringify(COLS_CUENTA)}) { ${CAMPOS} }
        subitems { id name created_at column_values(ids: ${JSON.stringify(COLS_MOV)}) { ${CAMPOS} } }
      }
    }`,
    { ids: [id] },
  )
  const i = d.items[0]
  if (!i) return null
  const c = byId(i)

  const movimientos: MovimientoCuenta[] = (i.subitems ?? [])
    .map((s) => {
      const m = byId(s)
      const saldoInicial = num(valor(m[COL_MOV.saldoInicial]))
      const ventas = num(valor(m[COL_MOV.ventas]))
      const cobros = num(valor(m[COL_MOV.cobros]))
      return {
        id: String(s.id),
        nombre: s.name,
        tipo: etiqueta(m[COL_MOV.tipo]),
        fecha: (s.created_at ?? '').slice(0, 10),
        vencimiento: valor(m[COL_MOV.vencimiento]).slice(0, 10),
        saldoInicial,
        ventas,
        cobros,
        saldoFinal: aCentavos(saldoInicial + ventas - cobros),
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(b.id) - Number(a.id))

  const totalVentas = aCentavos(movimientos.reduce((s, m) => s + m.ventas, 0))
  const totalCobros = aCentavos(movimientos.reduce((s, m) => s + m.cobros, 0))
  const clienteId = ids(c[COL_CUENTA.cliente])[0] ?? null

  return {
    id: String(i.id),
    nombre: i.name,
    codigo: valor(c[COL_CUENTA.codigo]),
    archivada: String(i.board.id) === String(BOARD_CUENTAS_ARCHIVADAS),
    clasificacion: etiqueta(c[COL_CUENTA.clasificacion]),
    estadoSaldo: valor(c[COL_CUENTA.estadoSaldo]).trim(),
    saldo: aCentavos(totalVentas - totalCobros),
    totalVentas,
    totalCobros,
    ventasPendCobro: numONull(c[COL_CUENTA.ventasPendCobro]),
    anticiposPendAplicar: numONull(c[COL_CUENTA.anticiposPendAplicar]),
    asignada: valor(c[COL_CUENTA.asignada]).trim(),
    cliente: clienteId
      ? await getClienteFiscal(clienteId, {
          nombre: valor(c[COL_CUENTA.cliente]),
          celular: primero(c[COL_CUENTA.celular]).replace(/\D/g, ''),
          email: primero(c[COL_CUENTA.email]),
          documento: primero(c[COL_CUENTA.documento]),
          direccion: valor(c[COL_CUENTA.direccion]).trim(),
        })
      : null,
    obraIds: ids(c[COL_CUENTA.obras]),
    movimientos,
  }
}

/** Los datos fiscales y de contacto del cliente, desde su ficha (lo espejado de la cuenta, de reserva). */
async function getClienteFiscal(id: string, espejo: Omit<ClienteCuenta, 'id' | 'condicionFiscal'>): Promise<ClienteCuenta> {
  const cols = [COL_CONTACTO.celular, COL_CONTACTO.email, COL_CLIENTE.documento, COL_CLIENTE.condicionFiscal, COL_CLIENTE.direccion]
  const d = await mondayApi<{ items: { id: string; name: string; column_values: CV[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { id name column_values(ids: ${JSON.stringify(cols)}) { ${CAMPOS} } } }`,
    { ids: [id] },
  )
  const i = d.items[0]
  if (!i) return { id, condicionFiscal: '', ...espejo }
  const c = byId(i)
  return {
    id,
    nombre: i.name || espejo.nombre,
    celular: valor(c[COL_CONTACTO.celular]).replace(/\D/g, '') || espejo.celular,
    email: valor(c[COL_CONTACTO.email]).trim() || espejo.email,
    documento: valor(c[COL_CLIENTE.documento]).trim() || espejo.documento,
    condicionFiscal: valor(c[COL_CLIENTE.condicionFiscal]).trim(),
    direccion: valor(c[COL_CLIENTE.direccion]).trim() || espejo.direccion,
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Etapa 2 · las obras de la cuenta
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Una obra de la cuenta, con los importes de la tabla de la etapa 2. */
export interface ObraFacturable {
  id: string
  nombre: string
  /** 🤖ID Obra (IDOBRA-725). */
  idObra: string
  tipo: EstadoObra
  etapaProduccion: EstadoObra
  total: number
  diferencia: number
  cancelado: number
  facturado: number
  /** El texto de la fórmula 🤖 % Cancelado ("96%"), para `porcentajeCanceladoObra`. */
  pctTexto: string
  /** El constructor/arquitecto de la obra (sin el comodín "SIN ARQUITECTO"). */
  constructor: { id: string; nombre: string; celular: string } | null
}

const COLS_OBRA = Object.values(COL_OBRA)
const esComodin = (nombre: string) => /^sin\s+(arquitecto|constructor)/i.test(nombre.trim())

/**
 * Las obras de la cuenta, con sus importes. Las del constructor (si se buscó un constructor): sólo las
 * suyas. Los espejos de los subelementos (cancelado, diferencia, facturado) se suman.
 */
export async function obrasDeCuenta(obraIds: string[], constructorId: string | null = null): Promise<ObraFacturable[]> {
  const obras: ObraFacturable[] = []
  for (const lote of lotes(obraIds, 100)) {
    const d = await mondayApi<{ items: { id: string; name: string; column_values: CV[] }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids, limit: 100) { id name column_values(ids: ${JSON.stringify(COLS_OBRA)}) { ${CAMPOS} } } }`,
      { ids: lote },
    )
    for (const i of d.items) {
      const c = byId(i)
      const consId = ids(c[COL_OBRA.constructor])[0] ?? null
      const consNombre = valor(c[COL_OBRA.constructor]).trim()
      if (constructorId && consId !== constructorId) continue
      obras.push({
        id: String(i.id),
        nombre: i.name,
        idObra: valor(c[COL_OBRA.idObra]),
        tipo: etiqueta(c[COL_OBRA.tipo]),
        etapaProduccion: etiqueta(c[COL_OBRA.etapaProduccion]),
        total: num(valor(c[COL_OBRA.total])),
        diferencia: sumaMirror(c[COL_OBRA.diferencia]),
        cancelado: sumaMirror(c[COL_OBRA.cancelado]),
        facturado: sumaMirror(c[COL_OBRA.facturado]),
        pctTexto: valor(c[COL_OBRA.pctCancelado]),
        constructor:
          consId && consNombre && !esComodin(consNombre)
            ? { id: consId, nombre: consNombre, celular: primero(c[COL_OBRA.celConstructor]).replace(/\D/g, '') }
            : null,
      })
    }
  }
  return obras.sort((a, b) => Number(b.id) - Number(a.id))
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Etapa 3 · el comprobante
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * 1. El ítem del comprobante, como lo crea el botón "Emitir Factura": Factura, en Pesos, Cuenta
 *    Corriente, sobre una Obra, con las fechas del día (vencimiento a 30). Las automatizaciones del
 *    tablero ponen lo mismo; escribirlo acá asegura que esté aunque alguna no corra.
 * 2. Recién después se le vincula la obra: es el cambio que dispara el escenario que completa el
 *    renglón (igual que hoy, donde el vínculo llega después de crear el ítem).
 */
export async function crearComprobante(obraId: string, hoy = new Date()): Promise<string> {
  const f = fechasComprobante(hoy)
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($board: ID!, $grupo: String!, $nombre: String!, $valores: JSON!) {
      create_item(board_id: $board, group_id: $grupo, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    {
      board: String(BOARD_FACTURACION_OBRA),
      grupo: GRUPO_FACTURAS,
      nombre: 'fact',
      valores: JSON.stringify({
        [COL_FACT.tipo]: { ids: [OPCION.factura] },
        [COL_FACT.moneda]: { ids: [OPCION.pesos] },
        [COL_FACT.condicionVenta]: { ids: [OPCION.cuentaCorriente] },
        [COL_FACT.sobre]: { index: OPCION.sobreObra },
        [COL_FACT.emision]: { date: f.emision },
        [COL_FACT.desde]: { date: f.desde },
        [COL_FACT.hasta]: { date: f.hasta },
        [COL_FACT.vencimiento]: { date: f.vencimiento },
      }),
    },
  )
  const id = String(d.create_item.id)
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    { board: String(BOARD_FACTURACION_OBRA), id, valores: JSON.stringify({ [COL_FACT.obra]: { item_ids: [Number(obraId)] } }) },
  )
  return id
}

/** El renglón del comprobante: su id y el precio final que tiene (`null`: todavía vacío). */
export interface RenglonFactura {
  id: string
  precio: number | null
}

/** Los renglones del comprobante, como están ahora en el tablero. */
export async function renglonesDe(facturaId: string): Promise<RenglonFactura[]> {
  const d = await mondayApi<{ items: { subitems: { id: string; column_values: CV[] }[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { subitems { id column_values(ids: ["${COL_RENGLON.precioFinal}"]) { id text } } } }`,
    { ids: [facturaId] },
  )
  return (d.items[0]?.subitems ?? []).map((s) => ({ id: String(s.id), precio: numONull(s.column_values[0]) }))
}

/**
 * Espera a que el tablero arme el renglón y le ponga el precio (hoy tarda unos 20 s). Devuelve el
 * renglón que haya al vencer el plazo —con o sin precio—, o `null` si no apareció ninguno.
 */
export async function esperarRenglon(facturaId: string, plazoMs = 50_000, cadaMs = 2_500): Promise<RenglonFactura | null> {
  const hasta = Date.now() + plazoMs
  let ultimo: RenglonFactura | null = null
  for (;;) {
    const r = await renglonesDe(facturaId)
    ultimo = r[0] ?? null
    if (ultimo && ultimo.precio !== null) return ultimo
    if (Date.now() >= hasta) return ultimo
    await esperar(cadaMs)
  }
}

/** Los valores del renglón con el monto a facturar (precio final con IVA y sin IVA). */
const valoresRenglon = (monto: number) => ({
  [COL_RENGLON.unidad]: { ids: [OPCION.unidades] },
  [COL_RENGLON.cantidad]: '1',
  [COL_RENGLON.precioFinal]: String(aCentavos(monto)),
  [COL_RENGLON.precioSinIva]: String(aCentavos(monto) / 1.21),
  [COL_RENGLON.prodServ]: { ids: [OPCION.producto] },
  [COL_RENGLON.alicuota]: { ids: [OPCION.iva21] },
})

/** El renglón, si el tablero no lo armó: "Fabricacion de Aberturas para Obra", 1 unidad, IVA 21 %. */
export async function crearRenglon(facturaId: string, monto: number): Promise<string> {
  const d = await mondayApi<{ create_subitem: { id: string } }>(
    `mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
      create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
    }`,
    { padre: facturaId, nombre: CONCEPTO_FACTURA, valores: JSON.stringify(valoresRenglon(monto)) },
  )
  return String(d.create_subitem.id)
}

/** El monto elegido en el renglón (el tablero había puesto todo lo pendiente). */
export async function fijarMontoRenglon(renglonId: string, monto: number): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    { board: String(BOARD_RENGLON_FACTURA), id: renglonId, valores: JSON.stringify(valoresRenglon(monto)) },
  )
}

/** El CUIT/DNI a facturar (`Cuit a Fact`), en dígitos. */
export async function fijarDocumentoComprobante(facturaId: string, documento: string): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    { board: String(BOARD_FACTURACION_OBRA), id: facturaId, valores: JSON.stringify({ [COL_FACT.cuitAFacturar]: documento }) },
  )
}

/** Pide la emisión en ARCA: `🤖 Estado Comprobante` → "Crear Comprobante" (3), lo que hace el botón. */
export async function pedirEmision(facturaId: string): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    { board: String(BOARD_FACTURACION_OBRA), id: facturaId, valores: JSON.stringify({ [COL_FACT.estado]: { index: INDICE_COMPROBANTE.crear } }) },
  )
}

/** El comprobante como está en el tablero. */
export interface ComprobanteLeido {
  id: string
  /** "Factura A N° 0007-00000336" (mientras no se emite, "fact"). */
  nombre: string
  /** Índice de `🤖 Estado Comprobante` (ver `faseComprobante`). */
  indice: number | null
  tipo: string
  letra: string
  /** "0007-00000336". */
  numero: string
  cae: string
  razonSocial: string
  iva: string
  pdf: ArchivoObra | null
  /** El precio final del renglón: lo que se facturó. */
  monto: number | null
  /** La última actualización del ítem: con "Error - Mirar Comentarios", el motivo. */
  ultimaNota: string
}

const COLS_LEER = [COL_FACT.estado, COL_FACT.tipo, COL_FACT.letra, COL_FACT.numero, COL_FACT.cae, COL_FACT.razonSocial, COL_FACT.iva, COL_FACT.pdf]

export async function leerComprobante(facturaId: string): Promise<ComprobanteLeido | null> {
  const d = await mondayApi<{
    items: {
      id: string
      name: string
      column_values: CV[]
      subitems: { column_values: CV[] }[]
      updates: { text_body?: string; body: string }[]
    }[]
  }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        id name
        column_values(ids: ${JSON.stringify(COLS_LEER)}) { ${CAMPOS} }
        subitems { column_values(ids: ["${COL_RENGLON.precioFinal}"]) { id text } }
        updates(limit: 1) { body text_body }
      }
    }`,
    { ids: [facturaId] },
  )
  const i = d.items[0]
  if (!i) return null
  const c = byId(i)
  const montos = (i.subitems ?? []).map((s) => numONull(s.column_values[0])).filter((n): n is number => n !== null)
  const u = i.updates?.[0]
  return {
    id: String(i.id),
    nombre: i.name,
    indice: (c[COL_FACT.estado] as CV | undefined)?.index ?? null,
    tipo: valor(c[COL_FACT.tipo]).trim() || 'Factura',
    letra: valor(c[COL_FACT.letra]).trim(),
    numero: valor(c[COL_FACT.numero]).trim(),
    cae: valor(c[COL_FACT.cae]).trim(),
    razonSocial: valor(c[COL_FACT.razonSocial]).trim(),
    iva: valor(c[COL_FACT.iva]).trim(),
    pdf: archivosDeColumna(c[COL_FACT.pdf])[0] ?? null,
    monto: montos.length ? aCentavos(montos.reduce((s, n) => s + n, 0)) : null,
    ultimaNota: (u?.text_body ?? u?.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El registro en la obra
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Los subelementos de 🪟 Obras ("Tareas", 9617181747): cada movimiento de la obra. */
export const BOARD_SUB_OBRAS = 9617181747
const COL_SUB_OBRA = {
  /** 🤖Tipo De Movimiento: 0 Diferencia, 1 Recibo, 2 Factura, 3 Nota de Credito, 4 Nota de Debito. */
  tipo: 'color_mkw588ap',
  /** 🤖 $ Fact Obra: lo facturado (lo suma el espejo 🤖 $ Facturado de la obra). */
  facturado: 'numeric_mm3ksqcg',
  /** Facturación obra: el comprobante del movimiento. */
  factura: 'board_relation_mm3tv960',
} as const
/** Índice de "Factura" en 🤖Tipo De Movimiento. */
export const INDICE_MOV_OBRA_FACTURA = 2

/**
 * Registra la factura en la obra: un subelemento "Obra - Factura B N° 0007-00000157" con 🤖Tipo De
 * Movimiento "Factura", lo facturado (🤖 $ Fact Obra) y el comprobante vinculado (Facturación obra).
 *
 * El escenario del tablero ya crea ese subelemento al pasar el comprobante a "Comprobante Creado" (sin
 * el vínculo). Crear otro duplicaría lo facturado de la obra (el espejo suma los dos), así que primero se
 * busca el suyo —el que ya vincula el comprobante, o el del mismo nombre— y se completa; recién si no
 * aparece en `esperaMs` se crea. Un reintento encuentra el que ya vincula el comprobante y no hace nada.
 */
export async function registrarFacturaEnObra(
  { obraId, facturaId, nombre, monto }: { obraId: string; facturaId: string; nombre: string; monto: number },
  esperaMs = 15_000,
): Promise<string> {
  const titulo = `Obra - ${nombre}`
  const valores = JSON.stringify({
    [COL_SUB_OBRA.tipo]: { index: INDICE_MOV_OBRA_FACTURA },
    [COL_SUB_OBRA.facturado]: String(aCentavos(monto)),
    [COL_SUB_OBRA.factura]: { item_ids: [Number(facturaId)] },
  })
  const hasta = Date.now() + esperaMs
  for (;;) {
    const d = await mondayApi<{ items: { subitems: { id: string; name: string; column_values: CV[] }[] }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { subitems { id name column_values(ids: ["${COL_SUB_OBRA.factura}"]) { ${CAMPOS} } } } }`,
      { ids: [obraId] },
    )
    const subs = d.items[0]?.subitems ?? []
    const vinculado = subs.find((s) => ids(s.column_values[0]).includes(String(facturaId)))
    if (vinculado) return String(vinculado.id)
    const delTablero = subs.find((s) => s.name.trim() === titulo)
    if (delTablero) {
      await mondayApi(
        `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
          change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
        }`,
        { board: String(BOARD_SUB_OBRAS), id: String(delTablero.id), valores },
      )
      return String(delTablero.id)
    }
    if (Date.now() >= hasta) break
    await esperar(2_500)
  }
  const c = await mondayApi<{ create_subitem: { id: string } }>(
    `mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
      create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
    }`,
    { padre: obraId, nombre: titulo, valores },
  )
  return String(c.create_subitem.id)
}

/** Deja constancia del envío por WhatsApp: `🤖Estado Envio` → "Enviado" (1). NUNCA "Enviar" (3). */
export async function marcarComprobanteEnviado(facturaId: string): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    {
      board: String(BOARD_FACTURACION_OBRA),
      id: facturaId,
      valores: JSON.stringify({ [COL_FACT.estadoEnvio]: { index: INDICE_ENVIO_FACTURA.enviado } }),
    },
  )
}

/** El PDF del comprobante, bajado de Monday para mandarlo por WhatsApp. */
export async function pdfDelComprobante(pdf: ArchivoObra): Promise<File> {
  const r = await fetch(await getUrlArchivo(pdf.assetId))
  if (!r.ok) throw new Error(`No se pudo bajar el PDF del comprobante (HTTP ${r.status}).`)
  return new File([await r.blob()], pdf.nombre || 'Factura.pdf', { type: 'application/pdf' })
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lotes<T>(lista: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n))
  return out
}
