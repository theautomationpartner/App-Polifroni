/**
 * La respuesta de la lectura de HETMO (`/api/hetmo`), puesta en la forma de la app: los vidrios como
 * viajan a la OP y las observaciones como cajas por abertura. Sin dependencias: se prueba en
 * `tests/produccion.test.ts`.
 */
import type { VidrioLeido } from '@/services/monday/ordenes'
import { normalizarNombre, type Abertura } from '@/features/op/observaciones'

export type ModoLectura = 'vidrios' | 'observaciones'

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
  observaciones: { nombre: string; observacion: string | null }[]
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

/** Las observaciones, como cajas por abertura. Un modelo sin nombre se numera por su posición. */
export const aAberturasOp = (observaciones: LecturaHetmo['observaciones']): Abertura[] =>
  observaciones.map((o, i) => ({
    nombre: normalizarNombre(o.nombre || '') || `V${i + 1}`,
    texto: typeof o.observacion === 'string' ? o.observacion.trim() : '',
  }))
