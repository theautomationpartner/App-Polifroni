import { useCallback, useRef } from 'react'
import { useCorrida, type Veredicto } from '@/features/shared/useCorrida'
import { ESCENARIO } from '@/services/make'
import { ETIQUETA, getActividadDesde, getEstadoOp } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * Generación de la OP final: dispara el escenario y espera el documento.
 *
 * Lo único propio de este paso es cómo se reconoce el final mirando el tablero: aparece un archivo
 * en `🤖OP Final` que NO estaba antes de apretar. Esperar "que haya archivo" daría por buena la OP
 * de una corrida anterior en el primer latido. Todo lo demás —el reloj, las dos vías de aviso, el
 * corte a los 5 minutos— es el motor común.
 */
export function useGenerarOp(obra: Obra) {
  /** Los archivos que ya estaban al apretar. Se fotografían en `antes`, no al construir el hook. */
  const previos = useRef<Set<string>>(new Set())

  const antes = useCallback(() => {
    previos.current = new Set(obra.opFinal.map((a) => a.assetId))
  }, [obra.opFinal])

  const mirar = useCallback(
    async (desdeMs: number): Promise<Veredicto> => {
      const { estado, opFinal } = await getEstadoOp(obra.id)

      if (opFinal.some((a) => !previos.current.has(a.assetId))) {
        return { fin: 'listo', arranco: true }
      }
      if (estado === ETIQUETA.opError) {
        /* Sin id del update (el tablero no lo da), se busca el más nuevo posterior al disparo. Es
           el plan B: cuando el escenario contesta, el motor usa el id exacto que devuelve. */
        const update = await getActividadDesde(obra.id, desdeMs).catch(() => null)
        return { fin: 'error', arranco: true, update }
      }
      return { fin: null, arranco: estado === ETIQUETA.opGenerando }
    },
    [obra.id],
  )

  return useCorrida({
    escenario: ESCENARIO.leerDocumento,
    itemId: obra.id,
    extra: {
      obra: obra.nombre,
      observaciones: obra.observaciones,
      accion: 'leer-documento-etmo',
    },
    antes,
    mirar,
  })
}
