/**
 * La respuesta de la lectura de HETMO (`/api/hetmo`), puesta en la forma de la app: los vidrios como
 * viajan a la OP y las aberturas como cajas de observación (vacías: las carga el usuario). Sin dependencias: se prueba en
 * `tests/produccion.test.ts`.
 */
import type { VidrioLeido } from '@/services/monday/ordenes'
import { normalizarNombre, type Abertura } from '@/features/op/observaciones'

/** Una abertura tal cual la devuelve la lectura: un bloque "Modelo:" del documento. */
export interface AberturaHetmo {
  nombre: string
  descripcion?: string | null
  color?: string | null
  ancho?: string | null
  alto?: string | null
  cantidad?: number | null
}

/** Un vidrio tal cual lo devuelve la lectura: una línea "Vid:" del documento. */
export interface VidrioHetmo {
  modelo: string | null
  composicion: string | null
  comp1: string | null
  camara: string | null
  comp2: string | null
  terminacion: string | null
  ancho: string | null
  alto: string | null
  cant: number | null
}

export interface LecturaHetmo {
  /** Una por "Modelo:" del documento, tenga o no vidrio. */
  aberturas: AberturaHetmo[]
  vidrios: VidrioHetmo[]
}

const txt = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim())

/** Los vidrios, con la forma con la que viajan a la OP (subelementos). */
export const aVidriosOp = (vidrios: VidrioHetmo[]): VidrioLeido[] =>
  vidrios.map((v) => ({
    modelo: v.modelo ? normalizarNombre(v.modelo) : '',
    /* Una composición que no se pudo partir (vidrio simple, triple) queda entera en Comp 1: es lo
       que hay que pedir, y así no se pierde. */
    comp1: txt(v.comp1) ?? (txt(v.camara) || txt(v.comp2) ? null : txt(v.composicion)),
    camara: txt(v.camara),
    comp2: txt(v.comp2),
    ancho: txt(v.ancho),
    alto: txt(v.alto),
    cant: typeof v.cant === 'number' && Number.isFinite(v.cant) ? v.cant : null,
  }))

/**
 * Las aberturas leídas, como cajas de observación vacías. Un modelo sin nombre se numera por su
 * posición; un nombre repetido (la IA lo leyó dos veces) queda una sola vez.
 */
export const aAberturasOp = (aberturas: LecturaHetmo['aberturas']): Abertura[] => {
  const vistas = new Set<string>()
  return aberturas.flatMap((a, i) => {
    const nombre = normalizarNombre(a.nombre || '') || `V${i + 1}`
    const clave = nombre.toUpperCase()
    if (vistas.has(clave)) return []
    vistas.add(clave)
    return [
      {
        nombre,
        texto: '',
        datos: {
          descripcion: txt(a.descripcion),
          /* El color va en mayúsculas en el tablero, aunque la IA no lo haya pasado. */
          color: txt(a.color)?.toUpperCase() ?? null,
          ancho: txt(a.ancho),
          alto: txt(a.alto),
          cantidad: typeof a.cantidad === 'number' && Number.isFinite(a.cantidad) ? a.cantidad : null,
        },
      },
    ]
  })
}
