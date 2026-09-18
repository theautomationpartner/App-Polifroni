import { useCallback } from 'react'
import { useCorrida, type Veredicto } from '@/features/shared/useCorrida'
import { ESCENARIO } from '@/services/make'
import { ETIQUETA, getActividadDesde, getEstadoTaller } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * Envío de la OP al taller de fabricación.
 *
 * Igual que el envío al cliente: el final se reconoce por un CAMBIO de `🤖Estado Envio OP TALLER`
 * posterior al click, no por lo que la columna diga. Una obra que ya salió al taller alguna vez
 * arrastra el "Enviado", y darlo por bueno sería informar un despacho que no pasó.
 *
 * La app no escribe NADA en el tablero en este paso: no toca el estado ni deja updates. Lo único
 * que hace es tocar el timbre y mirar; el estado lo pone el escenario, que es el que sabe si el
 * mensaje salió. Así, un disparo que falla del lado de la app no deja la obra marcada con un error
 * que nunca ocurrió.
 */
export function useEnviarTaller(obra: Obra) {
  const mirar = useCallback(
    async (desdeMs: number): Promise<Veredicto> => {
      const taller = await getEstadoTaller(obra.id)
      /* Un margen de 2 s: entre que la app marca la hora y el escenario escribe en el tablero hay
         relojes distintos, y un cambio real no puede quedar afuera por medio segundo. */
      const nuevo = taller.cambio >= desdeMs - 2_000

      if (taller.texto === ETIQUETA.tallerError && nuevo) {
        const update = await getActividadDesde(obra.id, desdeMs).catch(() => null)
        return { fin: 'error', arranco: true, update }
      }
      if (taller.texto === ETIQUETA.tallerEnviado && nuevo) {
        return { fin: 'listo', arranco: true }
      }
      return { fin: null, arranco: taller.texto === ETIQUETA.tallerEnviando && nuevo }
    },
    [obra.id],
  )

  return useCorrida({
    escenario: ESCENARIO.enviarOpTaller,
    itemId: obra.id,
    extra: {
      obra: obra.nombre,
      tipo: obra.tipo.texto,
      accion: 'enviar-op-taller',
    },
    mirar,
  })
}
