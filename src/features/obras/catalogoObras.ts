import { useSyncExternalStore } from 'react'
import { buscarObras, siguientePaginaObras } from '@/services/monday'
import type { ObraFila } from '@/types'

/**
 * El tablero de obras, traído de a lotes y guardado en memoria.
 *
 * El problema que resuelve: el board tiene cientos de ítems y traerlos de una demora varios
 * segundos en los que la pantalla no muestra nada. Acá se pide un lote chico, se muestra, y los
 * demás siguen llegando por detrás mientras la persona ya está mirando la lista.
 *
 * Tres decisiones que conviene conocer:
 *
 * 1. **Primer lote de 25, después de a 50.** Medido contra el tablero, Monday tarda casi lo
 *    mismo con 10 que con 100 ítems (~1,3 s contra ~1,8 s): el tamaño del lote no es lo que hace
 *    esperar, es el viaje. Así que el primero va chico —lo único que importa es que aparezca algo—
 *    y los siguientes más grandes, para completar las ~570 obras en menos vueltas.
 *
 * 2. **La búsqueda tiene prioridad.** Mientras hay una búsqueda en curso, la carga de fondo NO
 *    pide la página siguiente: alguien que está tecleando espera respuesta ya, y no tiene por qué
 *    hacer cola detrás de un trabajo que nadie pidió. Al terminar, la carga sigue desde el cursor
 *    donde había quedado, sin repetir lo traído.
 *
 * 3. **Vive 8 minutos.** Alcanza para moverse por el proceso y volver a la lista sin esperas, y es
 *    lo bastante corto para no trabajar sobre un tablero viejo. Vencida, se vuelve a pedir.
 *
 * El estado vive en el módulo y no en un componente a propósito: salir de la lista para abrir una
 * obra desmonta la vista, y lo traído tiene que sobrevivir a eso.
 */

/** El primer lote: lo único que decide cuándo aparece la primera obra en pantalla. */
const PRIMER_LOTE = 25

/** Los siguientes, ya con la lista a la vista. */
const LOTE = 50

/** Cuánto vale lo ya traído antes de volver a pedirlo. */
const VIDA_MS = 8 * 60_000

export interface EstadoCatalogo {
  filas: ObraFila[]
  /** Siguen llegando obras. */
  cargando: boolean
  /** Ya está el tablero entero. */
  completo: boolean
  error: string
}

let filas: ObraFila[] = []
let cursor: string | null = null
let arranco = false
let completo = false
let cargando = false
let error = ''
let traidoEn = 0

/** Cuántas operaciones con prioridad hay en curso. Mientras sea > 0, la carga de fondo espera. */
let prioritarias = 0
/** Evita dos bucles de carga a la vez. */
let corriendo = false

const oyentes = new Set<() => void>()
let foto: EstadoCatalogo = { filas, cargando, completo, error }

function avisar(): void {
  foto = { filas, cargando, completo, error }
  for (const o of oyentes) o()
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function vencido(): boolean {
  return traidoEn > 0 && Date.now() - traidoEn > VIDA_MS
}

function reiniciar(): void {
  filas = []
  cursor = null
  arranco = false
  completo = false
  error = ''
  traidoEn = 0
}

/** Trae lote tras lote hasta completar el tablero, cediéndole el paso a lo prioritario. */
async function bucle(): Promise<void> {
  if (corriendo) return
  corriendo = true
  try {
    while (!completo) {
      /* La búsqueda primero. Lo que ya está pedido no se puede cancelar, pero nada nuevo sale
         hasta que termine: como mucho compite una consulta, no la cola entera. */
      while (prioritarias > 0) await esperar(120)

      const pagina =
        arranco && cursor
          ? await siguientePaginaObras(cursor, LOTE)
          : await buscarObras('', PRIMER_LOTE)

      filas = arranco ? [...filas, ...pagina.filas] : pagina.filas
      cursor = pagina.cursor
      arranco = true
      completo = !pagina.cursor
      traidoEn = Date.now()
      avisar()
    }
  } catch {
    error = 'No se pudo traer la lista de obras. Probá de nuevo en unos segundos.'
  } finally {
    corriendo = false
    cargando = false
    avisar()
  }
}

/** Arranca la carga si hace falta. Es idempotente: se puede llamar en cada montaje. */
export function asegurarCatalogo(): void {
  if (vencido() && !corriendo) reiniciar()
  if (completo || corriendo) return
  cargando = true
  error = ''
  avisar()
  void bucle()
}

/** Descarta lo traído y vuelve a pedirlo desde cero. */
export function refrescarCatalogo(): void {
  if (corriendo) return
  reiniciar()
  asegurarCatalogo()
}

/**
 * Corre algo ANTES que la carga de fondo.
 *
 * Envuelve a la búsqueda: mientras dura, el bucle no pide lotes nuevos, y al terminar sigue solo
 * desde donde estaba.
 */
export async function conPrioridad<T>(fn: () => Promise<T>): Promise<T> {
  prioritarias++
  try {
    return await fn()
  } finally {
    prioritarias--
  }
}

/** El catálogo, como estado de React. Se redibuja a medida que llegan los lotes. */
export function useCatalogoObras(): EstadoCatalogo {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },
    () => foto,
    () => foto,
  )
}
