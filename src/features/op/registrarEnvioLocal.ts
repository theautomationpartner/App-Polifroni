import {
  COL,
  ESTADO_OP,
  ETIQUETA,
  guardarConfirmador,
  guardarDestinatarios,
  guardarLinkOrden,
  guardarRecordatorio,
  setEstado,
  itemDe,
  setEstadoOrden,
} from '@/services/monday'
import { fechaRecordatorio } from '@/lib/recordatorio'
import type { EnvioLocal } from '@/state/appState'
import type { Obra } from '@/types'

/** La vía con la que salió el mensaje; es la etiqueta de `✋Enviar Orden de Produccion x:`. */
const VIA = 'Whatsapp'

/**
 * Deja en Monday el envío que se hizo con el PDF de la app (Aluminio y PVC), al finalizar la
 * operación: la OP "Enviada Pend Confirmar"; en la obra a quiénes y por dónde, y "Pend de
 * Confirmar"; quién confirma (`🤖Responsable de Confirmar`), a quiénes se envió (`🤖Destinatarios`,
 * vinculados a Clientes y Constructor/Arquitecto), la fecha del recordatorio (envío + 5
 * días, `🤖Fecha Recordatorio +5d`) y el link del PDF en la OP. El estado
 * de envío de la OP no se escribe: sólo se marca cuando el envío falla ("Error De Envio").
 */
export async function registrarEnvioLocal(
  obra: Obra,
  ordenId: string,
  envio: EnvioLocal,
): Promise<void> {
  await setEstadoOrden(ordenId, ESTADO_OP.enviada)
  /* Es el PRIMER envío de la orden: el recordatorio va 5 días después de que salió el mensaje. */
  await guardarRecordatorio(ordenId, fechaRecordatorio(new Date(envio.cuando)))
  if (envio.confirmador) await guardarConfirmador(ordenId, envio.confirmador)
  /* A quiénes se envió: el ítem de cada destinatario (el cliente en Clientes, el constructor en
     Constructor/Arquitecto), vinculado en `🤖Destinatarios`. */
  const personas = await Promise.all(
    envio.roles.map((r) =>
      itemDe(obra, r)
        .then((p) => p.id)
        .catch((e) => {
          console.warn(`[envio] no se encontró el ítem del ${r.toLowerCase()} para «Destinatarios»`, e)
          return null
        }),
    ),
  )
  const ids = personas.filter((id): id is string => !!id)
  if (ids.length) await guardarDestinatarios(ordenId, ids)
  const etiqueta = envio.roles.length === 2 ? 'Ambos' : (envio.roles[0] ?? '')
  if (etiqueta && obra.opDestinatario.texto !== etiqueta) await setEstado(obra.id, COL.opDestinatario, etiqueta)
  if (obra.opVia.texto !== VIA) await setEstado(obra.id, COL.opVia, VIA)
  if (obra.confirmacionOp.texto !== ETIQUETA.pendConfirmar) {
    await setEstado(obra.id, COL.confirmacionOp, ETIQUETA.pendConfirmar)
  }
  if (envio.link) await guardarLinkOrden(ordenId, envio.link).catch(() => {})
}
