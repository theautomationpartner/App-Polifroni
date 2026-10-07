/**
 * Los vidrios de las OP, puestos como se los pide al proveedor.
 *
 * Un vidrio de la OP trae sus partes sueltas (Vidrio Comp 1, Cámara, Vidrio Comp 2) y sus medidas.
 * Para leerlo de un vistazo se arma su composición ("4 + 12 + 4", un DVH; "3+3", un laminado
 * simple), y para pedirlo se juntan los cortes IGUALES —misma composición y mismas medidas— de todas
 * las OP elegidas, sumando sus cantidades: el proveedor corta piezas, no aberturas.
 */

/** La etiqueta de `🤖Estado Vidrios` de una OP cuyos vidrios todavía no se pidieron. */
export const PEND_SOLICITAR = 'Pend de Solicitar'

/** La etiqueta de `🤖Estado Vidrios` de una OP cuyos vidrios ya se pidieron (al finalizar la solicitud). */
export const SOLICITADOS = 'Solicitados'

/**
 * Qué órdenes entran en una solicitud de cortes: las que ya salieron al taller, cuyos vidrios
 * todavía no se pidieron (`🤖Estado Vidrios` = "Pend de Solicitar"; las Solicitadas, Colocadas o
 * Canceladas quedan afuera) y que tienen al menos un vidrio.
 */
export const ordenParaCortes = (o: { enTaller: boolean; estadoVidrios: string; vidrios: number }): boolean =>
  o.enTaller && o.estadoVidrios.trim() === PEND_SOLICITAR && o.vidrios > 0

/**
 * Qué órdenes se MUESTRAN en la solicitud: las que se pueden pedir (`ordenParaCortes`) y, además,
 * las del taller que no tienen vidrios. Éstas se ven para que se sepa que la orden está, pero no se
 * pueden elegir: no hay nada que pedir de ellas.
 */
export const ordenVisibleEnCortes = (o: { enTaller: boolean; estadoVidrios: string; vidrios: number }): boolean =>
  ordenParaCortes(o) || (o.enTaller && o.vidrios === 0)

/** Lo mínimo de un vidrio para pedirlo (ver `VidrioDeOrden`). */
export interface VidrioPedido {
  modelo: string
  comp1: string
  camara: string
  comp2: string
  ancho: string
  alto: string
  cantidad: number | null
}

/** Con cámara es un doble vidriado hermético; sin ella, un vidrio simple (o laminado). */
export const esDvh = (v: Pick<VidrioPedido, 'camara' | 'comp2'>): boolean => !!(v.camara || v.comp2)

/** "4 + 12 + 4" para un DVH, "3+3" para un simple. Lo que falte, con una raya. */
export function composicion(v: Pick<VidrioPedido, 'comp1' | 'camara' | 'comp2'>): string {
  const o = (s: string) => s || '—'
  return esDvh(v) ? `${o(v.comp1)} + ${o(v.camara)} + ${o(v.comp2)}` : o(v.comp1)
}

/** "843", "1.013" → 843, 1013: las medidas vienen con el punto de miles del listado. */
export const mm = (s: string): number => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

/** Una medida escrita a mano: mm enteros, con o sin punto de miles ("843", "1013", "1.013"). */
export const medidaValida = (s: string): boolean => /^(\d+|\d{1,3}(\.\d{3})+)$/.test(s.trim()) && mm(s) > 0

/** Una cantidad escrita a mano: un entero de 1 en adelante. */
export const cantidadValida = (s: string): boolean => /^\d+$/.test(s.trim()) && Number(s) >= 1

/** Un corte para el proveedor: una composición, unas medidas y cuántas piezas. */
export interface Corte {
  composicion: string
  dvh: boolean
  /** Las capas sueltas, como van en la orden de compra: Vidrio Comp 1, Cámara y Vidrio Comp 2. */
  comp1: string
  camara: string
  comp2: string
  ancho: string
  alto: string
  cantidad: number
  /** De qué OP y modelo sale cada pieza: "IDOP-071 · V1". */
  origen: string[]
  /** Algún vidrio de este corte no trae la cantidad: hay que revisarla antes de pedir. */
  sinCantidad: boolean
}

/**
 * Junta los cortes iguales de todas las OP elegidas. Ordenados por composición y, dentro de cada
 * una, de la pieza más grande a la más chica: es como se cargan en una planilla de corte.
 */
export function consolidar(lista: { op: string; vidrio: VidrioPedido }[]): Corte[] {
  const porClave = new Map<string, Corte>()
  for (const { op, vidrio } of lista) {
    const comp = composicion(vidrio)
    const clave = `${comp}|${mm(vidrio.ancho)}|${mm(vidrio.alto)}`
    const c = porClave.get(clave) ?? {
      composicion: comp,
      dvh: esDvh(vidrio),
      comp1: vidrio.comp1,
      camara: vidrio.camara,
      comp2: vidrio.comp2,
      ancho: vidrio.ancho,
      alto: vidrio.alto,
      cantidad: 0,
      origen: [],
      sinCantidad: false,
    }
    c.cantidad += vidrio.cantidad ?? 0
    if (vidrio.cantidad == null) c.sinCantidad = true
    c.origen.push(`${op} · ${vidrio.modelo || 'sin modelo'}`)
    porClave.set(clave, c)
  }
  return [...porClave.values()].sort(
    (a, b) =>
      a.composicion.localeCompare(b.composicion, 'es', { numeric: true }) ||
      mm(b.ancho) * mm(b.alto) - mm(a.ancho) * mm(a.alto),
  )
}

/** La solicitud en texto plano, para pegarla en el sistema del proveedor o en un mensaje. */
export function textoSolicitud(obra: string, cortes: Corte[]): string {
  const lineas = cortes.map(
    (c) => `- ${c.cantidad} u. · ${c.dvh ? 'DVH ' : ''}${c.composicion} · ${c.ancho} x ${c.alto} mm${c.sinCantidad ? ' (revisar cantidad)' : ''}`,
  )
  const total = cortes.reduce((n, c) => n + c.cantidad, 0)
  return [`Solicitud de cortes de vidrio — ${obra}`, '', ...lineas, '', `Total: ${total} piezas`].join('\n')
}
