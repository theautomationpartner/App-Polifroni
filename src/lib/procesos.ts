import type { Proceso } from '@/types'

/** Una sección del sistema, tal como se ve en la pantalla inicial y en el encabezado. */
export interface ProcesoDef {
  /** `null` mientras la sección no está construida: se muestra, pero no se puede entrar. */
  id: Proceso | null
  icono: string
  titulo: string
  /** Qué se hace en la sección, en una línea, debajo del título. Sin ella la tarjeta no la muestra. */
  descripcion?: string
  /** Pie de la tarjeta: cuántas operaciones tiene, o que todavía no está. Nada más. */
  detalle: string
}

/**
 * Catálogo de secciones, fuera de la vista que las dibuja: agregar una es agregar una entrada acá.
 * Hoy sólo está construida Producción; las otras dos se listan apagadas a propósito, porque verlas
 * dice que existen y que todavía no están.
 */
export const PROCESOS: ProcesoDef[] = [
  { id: null, icono: 'fa-file-invoice-dollar', titulo: 'Presupuesto', detalle: 'Próximamente' },
  { id: null, icono: 'fa-helmet-safety', titulo: 'Obras', detalle: 'Próximamente' },
  {
    id: 'obras',
    icono: 'fa-industry',
    titulo: 'Producción',
    descripcion:
      'Carga órdenes de producción, envíalas a tus clientes/constructores o a la fábrica, y gestiona los estados de cada una de ellas.',
    detalle: '2 operaciones',
  },
]

/** La sección en curso, para nombrarla en el encabezado. */
export const procesoDe = (id: Proceso | null): ProcesoDef | undefined =>
  PROCESOS.find((p) => p.id !== null && p.id === id)
