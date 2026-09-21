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
 * Los nombres son ACCIONES, no tableros: quien entra elige qué va a hacer ("Cargar Orden de
 * Producción"), no en qué tablero de Monday se guarda. En 🪟 Obras va a haber más de un proceso, y
 * nombrarlos por el tablero los volvería indistinguibles.
 */
export const PROCESOS: ProcesoDef[] = [
  {
    id: 'obras',
    icono: 'fa-file-circle-plus',
    titulo: 'Cargar Orden de Producción',
    detalle: '5 etapas',
  },
  {
    id: null,
    icono: 'fa-file-invoice-dollar',
    titulo: 'Cuentas corrientes',
    detalle: 'Próximamente',
  },
  {
    id: null,
    icono: 'fa-truck-fast',
    titulo: 'Entregas y colocación',
    detalle: 'Próximamente',
  },
]

/** El proceso en curso, para nombrarlo en el encabezado. */
export const procesoDe = (id: Proceso | null): ProcesoDef | undefined =>
  PROCESOS.find((p) => p.id !== null && p.id === id)
