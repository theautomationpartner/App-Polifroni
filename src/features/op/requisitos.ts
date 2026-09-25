import { COL } from '@/services/monday/columns'
import type { Obra } from '@/types'
import { parsear } from './observaciones'

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
      /* Las observaciones NUNCA frenan la generación: una obra puede no tener ninguna nota de
         fabricación, y el escenario ya resuelve el caso por su cuenta. Este renglón está para
         decir con qué se va a generar, no para pedir permiso. */
      ok: true,
      titulo: 'Observaciones',
      detalle: !observacion
        ? 'Sin observaciones. La orden se genera igual.'
        : aberturas.length > 0
          ? `${escritas} ${escritas === 1 ? 'abertura' : 'aberturas'} con observación`
          : observacion.split('\n')[0],
      columna: COL.observaciones,
    },
  ]
}

/** Se puede pedir la generación cuando se cumplen TODOS los requisitos. */
export const puedeGenerar = (obra: Obra): boolean => requisitosOp(obra).every((r) => r.ok)

/**
 * Lo que el escenario de LECTURA necesita para no cortarse.
 *
 * Su router filtra por dirección, celular a coordinar y archivo adjunto —los tres tienen que
 * existir— y cuando el filtro corta, el escenario no llega a su módulo de respuesta: Make contesta
 * "Accepted" y la app se queda sin lista, sin saber por qué. Peor todavía: el escenario cambia el
 * estado de la obra ANTES del filtro, así que una corrida que no sirvió para nada igual dejó rastro.
 *
 * Por eso se verifica acá primero. Es la misma idea que con la generación: no gastar una corrida
 * por algo que se veía de entrada.
 */
export function requisitosLectura(obra: Obra, tieneEtmo = obra.ordenEtmo.length > 0): Requisito[] {
  return [
    {
      ok: tieneEtmo,
      titulo: 'Orden ETMO adjunta',
      detalle: 'Es el documento que se lee.',
      columna: COL.ordenEtmo,
    },
    {
      ok: obra.ubicacion.trim().length > 0,
      titulo: 'Ubicación de la obra',
      detalle: 'El escenario la exige para correr.',
      columna: COL.ubicacion,
    },
    {
      ok: obra.celCoordinar.trim().length > 0,
      titulo: 'Cel a coordinar',
      detalle: 'El escenario lo exige para correr.',
      columna: COL.celCoordinar,
    },
  ]
}

/** Qué falta para poder leer el documento; vacío si no falta nada. */
export function faltaParaLeer(obra: Obra, tieneEtmo?: boolean): string {
  const falta = requisitosLectura(obra, tieneEtmo)
    .filter((r) => !r.ok)
    .map((r) => r.titulo.toLowerCase())
  if (falta.length === 0) return ''
  return `Falta cargar en la obra: ${falta.join(', ')}.`
}
