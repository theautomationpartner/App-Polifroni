import type { Proceso } from '@/types'

/** Un proceso del sistema, tal como se ve en la pantalla inicial y en el encabezado. */
export interface ProcesoDef {
  /** `null` mientras el proceso no está construido: se muestra, pero no se puede entrar. */
  id: Proceso | null
  icono: string
  titulo: string
  /** Pie de la tarjeta: cuántas etapas tiene, o que todavía no está. Nada más. */
  detalle: string
}

/**
 * Catálogo de procesos, fuera de la vista que los dibuja: agregar uno es agregar una entrada acá.
 *
 * Cada proceso es una VISTA propia con sus propias etapas. Hoy sólo está construido el de la Orden
 * de Producción; los otros dos se listan apagados a propósito, porque verlos dice que existen y que
 * todavía no están, que es más de lo que diría su ausencia.
 */
export const PROCESOS: ProcesoDef[] = [
  {
    id: 'obras',
    icono: 'fa-file-circle-plus',
    titulo: 'Orden de Producción',
    detalle: '5 etapas',
  },
  {
    id: null,
    icono: 'fa-file-invoice-dollar',
    titulo: 'Presupuestar',
    detalle: 'Próximamente',
  },
  {
    id: null,
    icono: 'fa-helmet-safety',
    titulo: 'Obra',
    detalle: 'Próximamente',
  },
]

/** El proceso en curso, para nombrarlo en el encabezado. */
export const procesoDe = (id: Proceso | null): ProcesoDef | undefined =>
  PROCESOS.find((p) => p.id !== null && p.id === id)
