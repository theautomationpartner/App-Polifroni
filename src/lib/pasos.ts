import { ETIQUETA } from '@/services/monday/columns'
import { ESTADO_OP } from '@/services/monday/ordenes'
import { PASOS, indiceDe } from '@/state/appState'
import type { Obra, Paso } from '@/types'

/** Si a una etapa se puede entrar, y por qué no cuando no se puede. */
export interface Acceso {
  ok: boolean
  /** Qué falta. Va en el tooltip del stepper, del selector y en el pie del paso anterior. */
  motivo: string
}

const LIBRE: Acceso = { ok: true, motivo: '' }

/**
 * La condición PROPIA de una etapa, sin mirar las anteriores.
 *
 * Las condiciones no son del estado de la app: se leen del tablero. Una obra a la que todavía no
 * le generaron la OP no tiene nada que mandarle al cliente, y una que el cliente no confirmó no
 * tiene nada que mandarle al taller.
 */
function requisitoPropio(paso: Paso, obra: Obra): Acceso {
  switch (paso) {
    /* Elegir la obra y cargar el ETMO se pueden hacer siempre: son los pasos que llevan a la obra
       al estado que las etapas siguientes exigen. */
    case 'obra':
    case 'etmo':
      return LIBRE

    /* Las dos últimas etapas hablan del MISMO documento: la OP final adjunta. Sin ella no hay
       nada que mandar al cliente ni nada que despachar al taller, y el archivo tiene que estar
       —no alcanza con que la obra figure como enviada alguna vez—.

       Entrar al paso 5 sin la confirmación del cliente sí es válido: es la pantalla donde se mira
       si contestó. Lo que la confirmación gobierna es el BOTÓN de despacho al taller: aparece
       recién con una OP elegida en estado "Confirmada". */
    case 'envio':
      return obra.opFinal.length > 0
        ? LIBRE
        : {
            ok: false,
            motivo: 'Falta la OP final adjunta: es el documento que se le manda al cliente y al taller.',
          }

    /* A la confirmación se pasa recién con la OP ENVIADA al cliente: antes no hay nada que el
       cliente pueda haber confirmado. El escenario del envío deja "Enviado" en la columna al
       terminar, y la app relee la obra en cuanto llega la respuesta, así que el paso se habilita
       solo apenas sale el mensaje. */
    case 'confirmacion':
      return obra.estadoEnvioOp.texto === ETIQUETA.envioEnviado ||
        obra.mjsEnviadoCliente.texto === ETIQUETA.envioEnviado
        ? LIBRE
        : { ok: false, motivo: 'Primero enviá la OP al cliente.' }

    default:
      return LIBRE
  }
}

/**
 * Qué hace falta para entrar a una etapa, contando también las anteriores.
 *
 * El circuito es una secuencia: no se puede estar en condiciones de despachar al taller sin haber
 * pasado por el envío. Mirar sólo la condición propia dejaba estados absurdos —una obra vieja,
 * confirmada a mano en el tablero, habilitaba el paso 5 con el 4 cerrado— así que se devuelve la
 * PRIMERA condición que falta, que además es la que hay que ir a resolver.
 *
 * Por eso tampoco alcanza con bloquear el botón de "siguiente": el stepper y el selector de
 * proceso llegan a cualquier etapa, así que la regla vive acá y la usan los tres.
 */
export function accesoAlPaso(paso: Paso, obra: Obra | null): Acceso {
  if (!obra) return paso === 'obra' ? LIBRE : { ok: false, motivo: 'Elegí una obra para empezar.' }

  const hasta = indiceDe(paso)
  for (let i = 0; i <= hasta; i++) {
    const acceso = requisitoPropio(PASOS[i], obra)
    if (!acceso.ok) return acceso
  }
  return LIBRE
}

export type RespuestaCliente = 'confirmada' | 'rechazada' | 'pendiente'

/**
 * La respuesta del cliente a la ÚLTIMA OP enviada.
 *
 * Manda el estado de la OP cuando ya tiene respuesta: es la de ESTA orden. La columna de la obra
 * se mira sólo mientras la OP la está esperando, porque puede traer la respuesta a una orden
 * anterior —una obra rechazada y vuelta a emitir sigue diciendo "NO CONFIRMADO" hasta que el
 * cliente conteste la nueva—.
 *
 * `estadoOp` es `null` mientras no se leyó la OP (o si la obra no tiene ninguna).
 */
export function respuestaCliente(obra: Obra, estadoOp: string | null): RespuestaCliente {
  if (estadoOp === ESTADO_OP.confirmada) return 'confirmada'
  if (estadoOp === ESTADO_OP.noConfirmada) return 'rechazada'
  if (obra.confirmacionOp.texto === ETIQUETA.confirmado) return 'confirmada'
  if (obra.confirmacionOp.texto === ETIQUETA.noConfirmado) return 'rechazada'
  return 'pendiente'
}

/**
 * Índice de la etapa MÁS AVANZADA a la que la obra puede entrar hoy.
 *
 * Es el número que el stepper necesita para bloquear lo que está más adelante.
 */
export function topePermitido(obra: Obra | null): number {
  if (!obra) return 0
  let tope = 0
  for (const paso of PASOS) {
    if (!requisitoPropio(paso, obra).ok) break
    tope = indiceDe(paso)
  }
  return tope
}
