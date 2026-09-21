import { useCallback } from 'react'
import { useCorrida, type Veredicto } from '@/features/shared/useCorrida'
import { ESCENARIO } from '@/services/make'
import { COL, ETIQUETA, getActividadDesde, getEstadoEnvio } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * Envío de la OP al cliente: dispara el escenario de WhatsApp y espera la confirmación.
 *
 * Lo propio de este paso es que el final se reconoce por un CAMBIO DE ESTADO, no por un archivo
 * nuevo. Y ahí está el detalle que importa: no alcanza con que la columna diga "Enviado", porque
 * una obra puede arrastrar ese estado de un envío de hace meses —pasó, y la app daba el envío por
 * hecho sin que se disparara nada—. Vale sólo si cambió DESPUÉS de apretar el botón, que es lo que
 * responde el `changed_at` de la columna.
 *
 * Este escenario todavía no cierra con un *Webhook response*; cuando lo tenga, el motor ya lo
 * escucha y la noticia va a llegar antes, sin tocar nada de acá.
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
      destinatario: obra.opDestinatario.texto,
      via: obra.opVia.texto,
      celCliente: obra.celCliente,
      celArquitecto: obra.celArquitecto,
      accion: 'enviar-op-cliente',
      /* Ver la nota en `useEnviarTaller`: el escenario lo reenvía al hook que cierra el estado. */
      columnId: COL.estadoEnvioOp,
    },
    mirar,
  })
}
