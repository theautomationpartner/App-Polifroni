import { mm, type Corte } from './vidrios'

/**
 * Cómo se llama una OP en Tempoglass, el sistema del proveedor de vidrio.
 *
 * Allá cada OP es una "obra" con el mismo nombre que la OP en Monday, sin la obra adelante:
 * `🤖ID OP` - `🤖Tipo` `N°` → "IDOP-053 - PVC 2282" (Aluminio: "IDOP-066 - Aluminio A3010"). Si la
 * obra no existe allá, el robot la crea con este nombre.
 *
 * El N° de PVC va sin puntos ("2.282" → "2282"); uno que no es número —el "TEST" de las OP de obras
 * de test— va tal cual.
 */
export function nombreObraTempoglass(op: { idOp: string; tipo: string; numero: string }): string {
  const tipo = op.tipo.trim()
  const crudo = op.numero.trim()
  const numero = tipo === 'PVC' ? crudo.replace(/\D/g, '') || crudo : crudo
  return [op.idOp.trim(), [tipo, numero].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
}

/* ── La planilla que se importa en Tempoglass ───────────────────────────────────────────────── */

/** Los encabezados de la "planilla modelo" de Tempoglass (PedidoDVH.xlsx), en su orden exacto. */
export const COLUMNAS_PEDIDO_TEMPOGLASS = [
  'CANTIDAD',
  'Ancho',
  'Alto',
  'Componente 1',
  'Camara',
  'Componente 2',
  'Referencia',
  'Comentario',
] as const

/**
 * La referencia de un corte: los modelos de donde salen sus piezas ("IDOP-071 · V1" → "V1"), como
 * en la planilla modelo. Si salen de varias OP, va la OP con cada modelo.
 */
export function referenciaDeCorte(origen: string[]): string {
  const partes = origen.map((o) => o.split('·').map((s) => s.trim()))
  const ops = new Set(partes.map(([op]) => op))
  const refs = partes.map(([op, modelo]) => (ops.size > 1 ? [op, modelo].filter(Boolean).join(' ') : modelo || op))
  return [...new Set(refs.filter(Boolean))].join(', ')
}

/** Como en la planilla modelo: lo que es sólo un número va como número ("12" → 12, "3 BRONCE" queda). */
const comoEnModelo = (s: string): string | number => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : s.trim())

/** Un renglón por corte, en el orden de `COLUMNAS_PEDIDO_TEMPOGLASS`. Las medidas, en milímetros. */
export function filasPedidoTempoglass(cortes: Corte[]): (string | number)[][] {
  return cortes.map((c) => [
    c.cantidad,
    mm(c.ancho) || c.ancho,
    mm(c.alto) || c.alto,
    comoEnModelo(c.comp1),
    comoEnModelo(c.camara),
    comoEnModelo(c.comp2),
    referenciaDeCorte(c.origen),
    '',
  ])
}

/* ── Los datos del pedido ───────────────────────────────────────────────────────────────────── */

/** Lo que se carga en la cabecera del pedido de Tempoglass, desde la solicitud de cortes. */
export interface DatosPedidoTempoglass {
  /** "Comentario" del pedido (`pedido.detalle`). Obligatorio. */
  comentario: string
  /** Fecha de entrega sugerida / colocación, `YYYY-MM-DD`. Obligatoria. */
  fecha: string
}

/** Hoy, `YYYY-MM-DD`, en la hora de Argentina (no en UTC: a la noche serían mañana). */
export function hoyIso(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora)
}

/** Qué falta o está mal en los datos del pedido; vacío si están completos. */
export function faltantesPedido(d: DatosPedidoTempoglass, hoy = hoyIso()): string[] {
  const faltan: string[] = []
  if (!d.comentario.trim()) faltan.push('el comentario')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) faltan.push('la fecha de entrega')
  else if (d.fecha < hoy) faltan.push('una fecha de entrega que no sea pasada')
  return faltan
}
