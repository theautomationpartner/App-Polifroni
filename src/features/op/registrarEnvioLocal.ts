import { registrarActividadEnvio } from '@/features/envio/actividadEnvio'
import {
  COL,
  ESTADO_OP,
  ETIQUETA,
  guardarConfirmador,
  guardarLinkOrden,
  leerOrden,
  setEstado,
  setEstadoOrden,
} from '@/services/monday'
import type { EnvioLocal } from '@/state/appState'
import type { Obra } from '@/types'

/** La vía con la que salió el mensaje; es la etiqueta de `✋Enviar Orden de Produccion x:`. */
const VIA = 'Whatsapp'

/**
 * Deja en Monday el envío que se hizo con el PDF de la app (Aluminio y PVC), al finalizar la
 * operación: la OP "Enviada Pend Confirmar"; en la obra a quiénes y por dónde, y "Pend de
 * Confirmar"; quién confirma (`🤖Responsable de Confirmar`), el link del PDF en la OP y la
 * actividad "OP Enviada". El estado de envío de la OP no
 * se escribe: sólo se marca cuando el envío falla ("Error De Envio").
 */
export async function registrarEnvioLocal(
  obra: Obra,
  ordenId: string,
  envio: EnvioLocal,
  datos: {
    numero: string
    tipo: string
    nOpHetmo: string
    medidoPor: string
    fechaMedicion: string
    observacion: string
  },
): Promise<void> {
  await setEstadoOrden(ordenId, ESTADO_OP.enviada)
  if (envio.confirmador) await guardarConfirmador(ordenId, envio.confirmador)
  const etiqueta = envio.roles.length === 2 ? 'Ambos' : (envio.roles[0] ?? '')
  if (etiqueta && obra.opDestinatario.texto !== etiqueta) await setEstado(obra.id, COL.opDestinatario, etiqueta)
  if (obra.opVia.texto !== VIA) await setEstado(obra.id, COL.opVia, VIA)
  if (obra.confirmacionOp.texto !== ETIQUETA.pendConfirmar) {
    await setEstado(obra.id, COL.confirmacionOp, ETIQUETA.pendConfirmar)
  }
  if (envio.link) await guardarLinkOrden(ordenId, envio.link).catch(() => {})
  const op = await leerOrden(ordenId).catch(() => null)
  await registrarActividadEnvio(
    obra,
    { idOp: op?.idOp ?? '', ...datos },
    envio.roles,
    false,
    envio.link,
    new Date(envio.cuando),
  ).catch((e) => console.warn('[envio] no se pudo crear la actividad OP Enviada', e))
}
