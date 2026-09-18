import { ETIQUETA } from '@/services/monday'
import { PASOS, indiceDe } from '@/state/appState'
import type { Obra, Paso } from '@/types'

/** Si a una etapa se puede entrar, y por qué no cuando no se puede. */
export interface Acceso {
  ok: boolean
  /** Qué falta. Va en el tooltip del stepper y en el pie del paso anterior. */
  motivo: string
}

const LIBRE: Acceso = { ok: true, motivo: '' }

/**
 * Qué hace falta para entrar a cada etapa.
 *
 * Las condiciones NO son del estado de la app: se leen del tablero. Una obra a la que todavía no le
 * generaron la OP no tiene nada que mandarle al cliente, y una que el cliente no confirmó no tiene
 * nada que mandarle al taller. Que la pantalla exista no significa que la obra esté lista para ella.
 *
 * Por eso tampoco alcanza con bloquear el botón de "siguiente": el stepper llega a cualquier etapa,
 * así que la regla vive acá y la usan los dos.
 */
export function accesoAlPaso(paso: Paso, obra: Obra | null): Acceso {
  if (!obra) return paso === 'obra' ? LIBRE : { ok: false, motivo: 'Elegí una obra para empezar.' }

  switch (paso) {
    /* Elegir la obra, cargar el ETMO y pedir la generación se pueden hacer siempre: son
       justamente los pasos que llevan a la obra al estado que las etapas siguientes exigen. */
    case 'obra':
    case 'etmo':
    case 'op-final':
      return LIBRE

    /* Al cliente se le manda un documento: si no existe, no hay nada que enviar. */
    case 'envio':
      return obra.opFinal.length > 0
        ? LIBRE
        : {
            ok: false,
            motivo: 'Primero hay que generar la OP final: es el documento que se le manda al cliente.',
          }

    /* Al taller sólo llega lo que el cliente vio y aprobó. Las dos condiciones son del tablero:
       el mensaje salió (🤖 Estado de Envío OP) y el cliente confirmó (Confirmacion de la Op). */
    case 'confirmacion': {
      const enviado = obra.estadoEnvioOp.texto === ETIQUETA.envioEnviado
      const confirmado = obra.confirmacionOp.texto === ETIQUETA.confirmado
      if (enviado && confirmado) return LIBRE
      if (!enviado) {
        return {
          ok: false,
          motivo: 'La OP todavía no salió al cliente. Enviala y esperá a que el tablero lo confirme.',
        }
      }
      return {
        ok: false,
        motivo: 'El cliente todavía no confirmó la orden. Hasta que lo haga, no hay nada que mandar al taller.',
      }
    }

    default:
      return LIBRE
  }
}

/**
 * Índice de la etapa MÁS AVANZADA a la que la obra puede entrar hoy.
 *
 * Las condiciones se encadenan —para confirmar hace falta haber enviado, y para enviar, haber
 * generado— así que el tope es la primera etapa que no pasa su requisito, menos uno. Es el número
 * que el stepper necesita para bloquear lo que está más adelante.
 */
export function topePermitido(obra: Obra | null): number {
  let tope = 0
  for (const paso of PASOS) {
    if (!accesoAlPaso(paso, obra).ok) break
    tope = indiceDe(paso)
  }
  return tope
}
