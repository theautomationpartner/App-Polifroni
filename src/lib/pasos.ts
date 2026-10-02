import { ETIQUETA } from '@/services/monday/columns'
import { tipoDeObra, type TipoOrden } from '@/lib/tipoObra'
import { ETIQUETA_OP, type EstadoOrden } from '@/lib/estadosOp'
import type { Destino, Obra, Paso } from '@/types'

/**
 * El tipo de la obra, o `null` si todavía no hay obra elegida o no tiene el tipo cargado.
 *
 * Sin tipo NO se adivina: el flujo de PVC y el de Aluminio son distintos, y tomar uno por el otro
 * pedía la lectura con IA de un documento que no la lleva (o al revés).
 */
export function tipoDe(obra: Obra | null): TipoOrden | null {
  const t = obra?.tipo.texto.trim() ?? ''
  return t ? tipoDeObra(t) : null
}

/**
 * Cómo se llama cada etapa. Depende de a quién se envía y del tipo de obra:
 *
 * | Etapa | Cliente · PVC | Cliente · Aluminio | Taller |
 * | --- | --- | --- | --- |
 * | 1 | Seleccionar Obra | Seleccionar Obra | Seleccionar Obra |
 * | 2 | Cargar OP Hetmo | Cargar OP | Seleccionar OP A Enviar |
 * | 3 | Emitir y Enviar OP | Enviar OP | Enviar OP |
 *
 * Sin obra elegida todavía no se sabe el tipo: se muestran los nombres genéricos.
 */
export function etiquetaPaso(paso: Paso, destino: Destino | null, tipo: TipoOrden | null): string {
  if (paso === 'obra') return 'Seleccionar Obra'
  if (paso === 'carga') {
    if (destino === 'taller') return 'Seleccionar OP A Enviar'
    return tipo === 'PVC' ? 'Cargar OP Hetmo' : 'Cargar OP'
  }
  return destino === 'cliente' && tipo === 'PVC' ? 'Emitir y Enviar OP' : 'Enviar OP'
}

export const etiquetasPasos = (destino: Destino | null, tipo: TipoOrden | null): string[] =>
  (['obra', 'carga', 'envio'] as const).map((p) => etiquetaPaso(p, destino, tipo))

/** Cuántas OP de la obra están en un estado. */
export const cuantasEn = (obra: Obra, estado: EstadoOrden): number =>
  obra.ordenes.filter((o) => o.estado === estado).length

/** Las OP que siguen en juego (ni canceladas ni borradores a medio cargar). */
export const ordenesVivas = (obra: Obra) =>
  obra.ordenes.filter((o) => o.estado !== 'cancelada' && o.estado !== 'borrador')

export type RespuestaCliente = 'confirmada' | 'rechazada' | 'pendiente'

/**
 * La respuesta del cliente a una OP enviada.
 *
 * Manda el estado de la OP cuando ya tiene respuesta: es la de ESTA orden. La columna de la obra
 * se mira sólo para la ÚLTIMA OP enviada y mientras la está esperando, porque puede traer la
 * respuesta a una orden anterior.
 */
export function respuestaCliente(obra: Obra, estadoOp: string | null): RespuestaCliente {
  if (estadoOp === ETIQUETA_OP.confirmada) return 'confirmada'
  if (estadoOp === ETIQUETA_OP.rechazada) return 'rechazada'
  if (obra.confirmacionOp.texto === ETIQUETA.confirmado) return 'confirmada'
  if (obra.confirmacionOp.texto === ETIQUETA.noConfirmado) return 'rechazada'
  return 'pendiente'
}

/**
 * En qué está la obra respecto de sus órdenes, visto desde la ficha y al continuar. Son tres, y
 * nada más:
 *
 *  - `sin`        la obra no tiene ninguna OP vinculada (gris). Se sigue sin preguntar.
 *  - `asignadas`  tiene `n` OP vinculadas y ninguna confirmada (amarillo). Se pregunta si se carga
 *                 una nueva.
 *  - `confirmada` alguna de sus OP ya fue confirmada —o ya salió al taller— (verde). Se avisa y
 *                 se pregunta si se carga otra.
 *
 * Las CANCELADAS no cuentan para ninguno de los tres: una obra con todas sus órdenes canceladas está
 * "sin orden asignada". `n` son las OP de la obra en el tablero de órdenes que no están canceladas.
 */
export type SituacionOrdenes = { tipo: 'sin' } | { tipo: 'asignadas'; n: number } | { tipo: 'confirmada' }

export function situacionOrdenes(obra: Obra): SituacionOrdenes {
  const vigentes = obra.ordenes.filter((o) => o.estado !== 'cancelada')
  if (vigentes.some((o) => o.estado === 'confirmada' || o.estado === 'taller')) return { tipo: 'confirmada' }
  const n = vigentes.length
  return n === 0 ? { tipo: 'sin' } : { tipo: 'asignadas', n }
}

export const VISTA_SITUACION = {
  sin: { color: '#c4c4c4', texto: () => 'Sin Orden de Producción asignada' },
  asignadas: {
    color: '#fdab3d',
    texto: (n: number) => `${n} ${n === 1 ? 'Orden de Producción asignada' : 'Órdenes de Producción asignadas'}`,
  },
  confirmada: { color: '#00c875', texto: () => 'Con Orden de Producción confirmada' },
} as const

export const textoSituacion = (s: SituacionOrdenes): string =>
  s.tipo === 'asignadas' ? VISTA_SITUACION.asignadas.texto(s.n) : VISTA_SITUACION[s.tipo].texto()
