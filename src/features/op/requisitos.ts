import { COL } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * Formato que el escenario le exige a la observación.
 *
 * Es la MISMA expresión que valida el módulo de IA del escenario (`^Modelo V\d+:`), copiada tal
 * cual. Si allá cambia, acá tiene que cambiar: dos reglas distintas para la misma cosa serían peor
 * que no validar nada, porque la app diría que está bien algo que después falla.
 */
export const FORMATO_OBSERVACION = /^Modelo V\d+:/

/** Un requisito para poder pedir la generación de la OP final. */
export interface Requisito {
  /** Si se cumple. Mientras alguno esté en `false`, el botón no se habilita. */
  ok: boolean
  titulo: string
  /** Qué falta, o qué se leyó. Lo que el usuario necesita para poder arreglarlo. */
  detalle: string
  /** La columna del tablero donde se corrige. */
  columna: string
}

/**
 * Lo que la app verifica ANTES de disparar el escenario.
 *
 * Son las mismas condiciones que el escenario corta por su cuenta. Verificarlas acá no reemplaza
 * esa validación —el botón del tablero sigue existiendo y ahí sigue haciendo falta—: evita gastar
 * una corrida y que el ítem termine con un update de error por algo que se veía de entrada.
 */
export function requisitosOp(obra: Obra): Requisito[] {
  const observacion = obra.observaciones.trim()

  return [
    {
      ok: obra.ordenEtmo.length > 0,
      titulo: 'Orden ETMO adjunta',
      detalle:
        obra.ordenEtmo.length > 0
          ? obra.ordenEtmo.map((a) => a.nombre).join(' · ')
          : 'Sin archivo. Cargalo en el paso anterior: es el documento que lee la automatización.',
      columna: COL.ordenEtmo,
    },
    {
      ok: FORMATO_OBSERVACION.test(observacion),
      titulo: 'Observación con el formato esperado',
      detalle: FORMATO_OBSERVACION.test(observacion)
        ? observacion.split('\n')[0]
        : observacion
          ? `Tiene que empezar con "Modelo V1:" (la V y el número del modelo). Hoy empieza con: "${observacion.slice(0, 40)}${observacion.length > 40 ? '…' : ''}"`
          : 'Vacía. Escribila en el paso anterior con el formato "Modelo V1: …".',
      columna: COL.observaciones,
    },
  ]
}

/** Se puede pedir la generación cuando se cumplen TODOS los requisitos. */
export const puedeGenerar = (obra: Obra): boolean => requisitosOp(obra).every((r) => r.ok)
