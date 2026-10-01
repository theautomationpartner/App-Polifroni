import { useCallback } from 'react'
import { useCorrida, type Veredicto } from '@/features/shared/useCorrida'
import { TOPE_ENVIO } from './topeEnvio'
import { ESCENARIO, respondioEnviado } from '@/services/make'
import { COL_OP, ETIQUETA, getActividadDesde, getEstadoEnvio } from '@/services/monday'
import type { Obra } from '@/types'

const RESPUESTA_OK = respondioEnviado('msj_cliente_arquitecto')

/**
 * Envío de la OP al cliente: dispara el escenario de WhatsApp y espera la confirmación.
 *
 * El final se reconoce por un CAMBIO DE ESTADO, no por lo que la columna diga: una obra puede
 * arrastrar un "Enviado" de hace meses —pasó, y la app daba el envío por hecho sin que se
 * disparara nada—. Vale sólo si cambió DESPUÉS de apretar el botón (`changed_at`).
 *
 * Además el escenario cierra con un *Webhook response*: cuando llega, avisa antes que el tablero.
 *
 * Qué OP, a quién y con qué número NO sale de la obra de este render: lo pasa la pantalla a
 * `correr()` en el momento de mandar, ya verificado.
 */
export function useEnviarOp(obra: Obra) {
  const mirar = useCallback(
    async (desdeMs: number): Promise<Veredicto> => {
      const { envioOp, mensajeCliente } = await getEstadoEnvio(obra.id)
      /* Un margen de 2 s: entre que la app marca la hora y el escenario escribe en el tablero hay
         relojes distintos, y un cambio real no puede quedar afuera por medio segundo. */
      const nuevo = (cambio: number) => cambio >= desdeMs - 2_000

      if (envioOp.texto === ETIQUETA.envioError && nuevo(envioOp.cambio)) {
        const update = await getActividadDesde(obra.id, desdeMs).catch(() => null)
        return { fin: 'error', arranco: true, update }
      }
      if (
        (envioOp.texto === ETIQUETA.envioEnviado && nuevo(envioOp.cambio)) ||
        (mensajeCliente.texto === ETIQUETA.envioEnviado && nuevo(mensajeCliente.cambio))
      ) {
        return { fin: 'listo', arranco: true }
      }
      return {
        fin: null,
        arranco: envioOp.texto === ETIQUETA.envioEnviando && nuevo(envioOp.cambio),
      }
    },
    [obra.id],
  )

  return useCorrida({
    escenario: ESCENARIO.enviarOpCliente,
    itemId: obra.id,
    extra: {
      obra: obra.nombre,
      accion: 'enviar-op-cliente',
      /* Ver la nota en `useEnviarTaller`: el escenario lo reenvía al hook que cierra el estado. Es
         la columna de la OP «🤖Estado De Envio OP a Cliente». */
      columnId: COL_OP.estadoEnvio,
    },
    mirar,
    /* El escenario cierra con un Webhook response `{ "msj_cliente_arquitecto": "enviado" }`. */
    exito: RESPUESTA_OK,
    /* Envío: si al minuto y medio no hubo respuesta exitosa, es un error de envío (ver `TOPE_ENVIO`). */
    tope: TOPE_ENVIO,
  })
}
