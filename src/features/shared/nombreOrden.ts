import type { ResumenOrden } from '@/services/monday'

/** "IDOP-025 · N° A3003 · Aluminio": cómo se nombra una OP en los avisos y en las tablas. */
export const nombreOrden = (o: ResumenOrden) =>
  [o.idOp || 'OP', o.numero ? `N° ${o.numero}` : '', o.tipo].filter(Boolean).join(' · ')
