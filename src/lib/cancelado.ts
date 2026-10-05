/**
 * El porcentaje cancelado de la obra (`🤖 % Cancelado`), para la torta de la ficha.
 *
 * La fórmula del tablero devuelve un texto ("96%"). Si vino vacía —Monday la deja en blanco cada
 * tanto mientras recalcula— se reconstruye con los importes: cancelado / total pactado.
 */
export function porcentajeCancelado(texto: string, cancelado: number | null, total: number | null): number | null {
  const n = Number(String(texto).replace('%', '').replace(',', '.').trim())
  if (String(texto).trim() && Number.isFinite(n)) return n
  if (cancelado != null && total) return Math.round((cancelado / total) * 1000) / 10
  return null
}

/**
 * El color de la torta según cuánto se canceló:
 *  - menos del 70 %, rojo;
 *  - del 70 % al 90 %, amarillo anaranjado;
 *  - del 90 % al 100 %, verde.
 */
export function colorCancelado(pct: number): string {
  if (pct >= 90) return '#00c875'
  if (pct >= 70) return '#ff9f1c'
  return '#e2445c'
}
