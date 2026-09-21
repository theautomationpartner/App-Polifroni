import { COL } from '@/services/monday'
import type { Obra } from '@/types'
import { parsear, tieneAlgunaObservacion } from './observaciones'

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
  /** Qué falta, o qué se leyó. Lo justo para poder arreglarlo. */
  detalle: string
  /** Sirve de clave; no se muestra. */
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
  const aberturas = parsear(observacion)
  /* No alcanza con que el texto EMPIECE bien: un documento leído deja una línea por abertura y
     todas pueden estar vacías. Eso pasa el formato y no tiene nada que volcar en la orden. */
  const conTexto = aberturas.length > 0 ? tieneAlgunaObservacion(aberturas) : observacion.length > 0
  const formatoOk = FORMATO_OBSERVACION.test(observacion) && conTexto

  const escritas = aberturas.filter((a) => a.texto.trim()).length

  return [
    {
      ok: obra.ordenEtmo.length > 0,
      titulo: 'Orden ETMO adjunta',
      detalle:
        obra.ordenEtmo.length > 0
          ? obra.ordenEtmo.map((a) => a.nombre).join(' · ')
          : 'Falta el archivo. Se carga en el paso anterior.',
      columna: COL.ordenEtmo,
    },
    {
      ok: formatoOk,
      titulo: 'Observaciones cargadas',
      detalle: formatoOk
        ? aberturas.length > 0
          ? `${escritas} de ${aberturas.length} aberturas con observación`
          : observacion.split('\n')[0]
        : !observacion
          ? 'Todavía no hay ninguna. Se escriben en el paso anterior.'
          : !conTexto
            ? 'Las aberturas están listadas pero ninguna tiene observación.'
            : 'Tienen que empezar con "Modelo V1:".',
      columna: COL.observaciones,
    },
  ]
}

/** Se puede pedir la generación cuando se cumplen TODOS los requisitos. */
export const puedeGenerar = (obra: Obra): boolean => requisitosOp(obra).every((r) => r.ok)
