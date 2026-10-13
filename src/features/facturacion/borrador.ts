import type { Rol } from '@/lib/destinatario'
import type { FaseComprobante, TipoFacturacion } from '@/lib/facturacion'
import type { ComprobanteLeido, CuentaCorriente, FacturaEmitida, ObraFacturable } from '@/services/monday'
import type { Obra } from '@/types'

/** La obra que se factura, con el monto (tal como se escribe: "1.297.684,50"). */
export interface ObraElegida {
  obraId: string
  monto: string
}

/**
 * El comprobante de UNA obra, mientras se emite. Lo que ya quedó en Monday se anota acá: un reintento
 * sigue desde donde quedó y no crea otro comprobante.
 */
export interface ComprobanteEnCurso {
  obraId: string
  /** El monto a facturar, ya en número. */
  monto: number
  /** El ítem de 🧾 Facturación obra. `null` hasta que se crea. */
  facturaId: string | null
  /** El renglón ya tiene el monto elegido (y el CUIT/DNI ya se escribió). */
  montoFijado: boolean
  fase: FaseComprobante
  /** Por qué no se pudo (el motivo que dejó ARCA, o el de la app). */
  error: string | null
  /** Lo que devolvió el tablero al emitirse: número, CAE, PDF… */
  leido: ComprobanteLeido | null
}

/**
 * Lo que se va cargando en "Facturar una Obra" entre sus tres etapas: la obra, qué se le factura y por
 * cuánto, y su comprobante.
 *
 * Vive en el estado global —como el borrador de la OP y el del presupuesto— porque el stepper deja ir y
 * volver entre etapas.
 *
 * En Monday no se escribe nada hasta "Confirmar y emitir factura".
 */
export interface BorradorFactura {
  /** La obra elegida en la etapa 1, completa (la de la ficha de Producción). */
  obra: Obra | null
  /** La cuenta corriente de la obra: a quién se factura y a quién le llega el WhatsApp. */
  cuenta: CuentaCorriente | null
  /** Los importes de la obra (total, diferencia, cancelado, facturado), leídos al continuar. */
  obras: ObraFacturable[]
  /** Qué se factura (etapa 2). */
  tipo: TipoFacturacion | null
  /** Nota de crédito: la factura de la obra que anula (su CAE va en el comprobante). */
  asociada: FacturaEmitida | null
  /** La obra que se factura, con su monto. Vacío mientras no se eligió qué facturar. */
  elegidas: ObraElegida[]
  /** El CUIT/CUIL/DNI a facturar. Arranca con el del cliente; vacío = Consumidor Final. */
  documento: string
  /** Un comprobante por obra, desde que se confirma la emisión. */
  comprobantes: ComprobanteEnCurso[]
  /** El WhatsApp ya salió: a quiénes y cuándo. Se registra al finalizar. */
  envio: { roles: Rol[]; cuando: string } | null
}

export const facturaInicial = (): BorradorFactura => ({
  obra: null,
  cuenta: null,
  obras: [],
  tipo: null,
  asociada: null,
  elegidas: [],
  documento: '',
  comprobantes: [],
  envio: null,
})

/** Hay algo elegido: salir lo descarta, y se pregunta antes. */
export const facturaEnCurso = (f: BorradorFactura): boolean => !!(f.obra || f.tipo || f.elegidas.length)

/**
 * La emisión ya empezó: hay un comprobante creado en Monday. Desde acá no se cambia la obra, ni qué se
 * factura, ni el monto: el comprobante ya existe con esos datos.
 */
export const emisionIniciada = (f: BorradorFactura): boolean => f.comprobantes.some((c) => c.facturaId)

/** Todos los comprobantes salieron de ARCA: hay qué enviar. */
export const todosEmitidos = (f: BorradorFactura): boolean =>
  f.comprobantes.length > 0 && f.comprobantes.every((c) => c.fase === 'emitido' && c.leido?.pdf)
