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
  /** Los `buscables` de la obra (cliente, IDOP, N° de orden), ya normalizados. */
  extras: { compacto: string; palabras: string[] }[]
}

const partes = (texto: string) => {
  const t = normalizar(texto)
  return { compacto: compactar(t), palabras: t.split(/[^a-z0-9]+/).filter(Boolean) }
}

/** Se arma UNA vez por índice: normalizar en cada tecla sería repetir el mismo trabajo 600 veces. */
export function indexar(obras: readonly ObraIndice[]): EntradaIndice[] {
  return obras.map((obra) => {
    const nombre = normalizar(obra.nombre)
    return {
      obra,
      nombre,
      ...partes(obra.nombre),
      extras: (obra.buscables ?? []).filter(Boolean).map(partes),
    }
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
  /* Un IDOP o un N° de orden escrito entero es tan preciso como el id. */
  if (e.extras.some((x) => x.compacto === tCompacto)) return 900
  if (e.compacto.startsWith(tCompacto)) return 700
  if (e.palabras.some((p) => p.startsWith(t))) return 600
  if (e.extras.some((x) => x.compacto.startsWith(tCompacto) || x.palabras.some((p) => p.startsWith(t)))) return 550
  if (e.compacto.includes(tCompacto)) return 500
  if (e.extras.some((x) => x.compacto.includes(tCompacto))) return 400
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
