/**
 * Las observaciones, por abertura.
 *
 * En el tablero son UN texto (`Observaciones OP`, `text_mm73nvda`), porque así lo lee el escenario
 * que arma la OP final. En pantalla son una caja por abertura, que es como se piensan: cada dibujo
 * del ETMO tiene —o no— su nota de fabricación.
 *
 * Este módulo es el traductor entre las dos formas. El formato de la línea es el que el escenario
 * ya espera (`Modelo V1: …`), así que no se inventa nada: se escribe lo mismo que se escribía a
 * mano, ordenado.
 */

/** Una abertura del documento, con su observación. */
export interface Abertura {
  /** Cómo la nombra el ETMO, normalizado en mayúscula: "V1", "V6", "M6". */
  nombre: string
  texto: string
}

/**
 * Una línea del campo del tablero.
 *
 * Se acepta cualquier prefijo de letras + número ("V1", "M6") aunque el formato de la casa sea
 * "V<n>": el documento manda, y perder una observación por no reconocer su nombre sería peor que
 * mostrarla con un nombre raro.
 */
const RENGLON = /^\s*Modelo\s+([A-Za-z]{0,3}\d+)\s*:\s?(.*)$/

/** "v1" → "V1". El ETMO alterna mayúsculas y minúsculas para el mismo modelo. */
export const normalizarNombre = (nombre: string): string => nombre.trim().toUpperCase()

/** Cómo se llama la abertura en pantalla. */
export const rotuloAbertura = (nombre: string): string => `Modelo ${normalizarNombre(nombre)}`

/**
 * De las cajas al campo del tablero.
 *
 * Se escriben TODAS las aberturas, también las que quedaron sin observación: son el índice de lo
 * que el documento tiene, y borrarlas haría perder la lista al recargar.
 */
export function serializar(aberturas: Abertura[]): string {
  return aberturas
    .map((a) => `Modelo ${normalizarNombre(a.nombre)}: ${a.texto.trim()}`.trimEnd())
    .join('\n')
}

/**
 * Del campo del tablero a las cajas.
 *
 * Un renglón que no empieza con "Modelo X:" se considera continuación del anterior: una
 * observación larga puede ocupar varias líneas y cortarla sería mutilarla. Si el texto no tiene
 * ningún renglón con ese formato, devuelve vacío: no hay aberturas que mostrar y la vista cae al
 * campo libre.
 */
export function parsear(texto: string): Abertura[] {
  const aberturas: Abertura[] = []
  for (const linea of texto.split('\n')) {
    const m = RENGLON.exec(linea)
    if (m) {
      aberturas.push({ nombre: normalizarNombre(m[1]), texto: m[2].trim() })
    } else if (aberturas.length > 0 && linea.trim()) {
      const ultima = aberturas[aberturas.length - 1]
      ultima.texto = ultima.texto ? `${ultima.texto}\n${linea.trim()}` : linea.trim()
    }
  }
  return aberturas
}

/**
 * Lo que devolvió el escenario, cruzado con lo que ya estaba guardado.
 *
 * La lista de aberturas la manda el documento; el texto, la persona. Al releer el ETMO no se pisa
 * lo ya escrito: si una abertura ya tenía observación, se conserva, y la del escenario sólo llena
 * las que están vacías.
 */
export function fusionar(
  delDocumento: Abertura[],
  guardadas: Abertura[],
): Abertura[] {
  const previo = new Map(guardadas.map((a) => [a.nombre, a.texto]))
  return delDocumento.map((a) => ({
    nombre: a.nombre,
    texto: previo.get(a.nombre)?.trim() || a.texto,
  }))
}

/** Hay algo escrito en alguna abertura. */
export const tieneAlgunaObservacion = (aberturas: Abertura[]): boolean =>
  aberturas.some((a) => a.texto.trim().length > 0)
