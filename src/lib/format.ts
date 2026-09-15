/** Formato de los valores que llegan del tablero. */

const AR = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Importe con el formato de la casa: "$ 10.000,00".
 *
 * Sólo se aplica cuando el valor ES un número: las columnas fórmula del tablero devuelven de todo
 * —"2%", un texto, o nada—, y convertir a la fuerza mostraría un importe donde no lo hay. Si no es
 * un número, se devuelve tal cual vino.
 */
export function importe(texto: string): string {
  const limpio = texto.trim()
  if (!limpio) return ''
  // Acepta la coma decimal y los puntos de miles, que es como los manda Monday cuando formatea.
  const n = Number(limpio.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return limpio
  return `$ ${AR.format(n)}`
}
