import type { ObraIndice } from '@/services/monday/indiceObras'

/** Cuántas sugerencias se muestran como máximo mientras se escribe. */
export const TOPE_SUGERENCIAS = 30

/** Minúsculas, sin tildes y con los espacios colapsados. */
const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Sin espacios ni puntuación: "garcia  juan" y "garciajuan" son la misma búsqueda. */
const compactar = (s: string): string => s.replace(/[^a-z0-9]/g, '')

export interface EntradaIndice {
  obra: ObraIndice
  nombre: string
  compacto: string
  palabras: string[]
}

/** Se arma UNA vez por índice: normalizar en cada tecla sería repetir el mismo trabajo 600 veces. */
export function indexar(obras: readonly ObraIndice[]): EntradaIndice[] {
  return obras.map((obra) => {
    const nombre = normalizar(obra.nombre)
    return { obra, nombre, compacto: compactar(nombre), palabras: nombre.split(/[^a-z0-9]+/).filter(Boolean) }
  })
}

/**
 * Qué tan bien coincide una obra con lo escrito. 0 = no coincide.
 *
 * Mismo orden que el buscador de La Batea: primero el id exacto (pegado del chat), después el
 * nombre que EMPIEZA con lo escrito, después una palabra del medio que empieza con lo escrito
 * ("martinez" encuentra "LOPEZ MARTINEZ") y por último el nombre que lo contiene.
 */
function puntuar(e: EntradaIndice, t: string, tCompacto: string): number {
  if (e.obra.id === t) return 1000
  if (e.compacto.startsWith(tCompacto)) return 700
  if (e.palabras.some((p) => p.startsWith(t))) return 600
  if (e.compacto.includes(tCompacto)) return 500
  return 0
}

export function sugerir(
  indice: readonly EntradaIndice[],
  termino: string,
  tope = TOPE_SUGERENCIAS,
): { obras: ObraIndice[]; truncado: boolean } {
  const t = normalizar(termino)
  const tCompacto = compactar(t)
  if (!tCompacto) return { obras: [], truncado: false }

  const con: { e: EntradaIndice; p: number }[] = []
  for (const e of indice) {
    const p = puntuar(e, t, tCompacto)
    if (p > 0) con.push({ e, p })
  }
  con.sort((a, b) => b.p - a.p || a.e.nombre.localeCompare(b.e.nombre))
  return { obras: con.slice(0, tope).map((x) => x.e.obra), truncado: con.length > tope }
}
