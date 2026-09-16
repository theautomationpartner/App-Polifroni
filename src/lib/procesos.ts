import type { Proceso } from '@/types'

/** Un proceso del sistema, tal como se ve en la pantalla inicial y en el selector del encabezado. */
export interface ProcesoDef {
  /** `null` mientras el proceso no está construido: se muestra, pero no se puede entrar. */
  id: Proceso | null
  icono: string
  titulo: string
  descripcion: string
  detalle: string
}

/**
 * Catálogo de procesos. Vive acá y no dentro de una vista porque lo usan DOS lugares —la pantalla
 * inicial y el selector del encabezado— y tienen que decir lo mismo: si mañana se agrega un
 * proceso, aparece en los dos sin tocar ninguno.
 *
 * Hoy sólo 🪟 Obras está construido. Los demás se listan igual: la pantalla es el mapa del
 * sistema, y ver dónde va a vivir lo que falta vale más que esconderlo.
 */
export const PROCESOS: ProcesoDef[] = [
  {
    id: 'obras',
    icono: 'fa-window-maximize',
    titulo: '🪟 Obras',
    descripcion:
      'Orden de producción: ingesta del ETMO, observaciones por ítem, generación de la OP final, envío al cliente y despacho al taller.',
    detalle: '5 etapas',
  },
  {
    id: null,
    icono: 'fa-file-invoice-dollar',
    titulo: 'Cuentas corrientes',
    descripcion: 'Movimientos y saldos de la cuenta corriente del cliente.',
    detalle: 'Próximamente',
  },
  {
    id: null,
    icono: 'fa-truck-fast',
    titulo: 'Entregas y colocación',
    descripcion: 'Coordinación de entrega, premarcos y colocación en obra.',
    detalle: 'Próximamente',
  },
]

/** El proceso en curso, para mostrarlo en el selector del encabezado. */
export const procesoDe = (id: Proceso | null): ProcesoDef | undefined =>
  PROCESOS.find((p) => p.id !== null && p.id === id)
