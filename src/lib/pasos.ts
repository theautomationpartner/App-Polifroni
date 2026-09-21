import { ETIQUETA } from '@/services/monday/columns'
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
    /* Elegir la obra, cargar el ETMO y pedir la generación se pueden hacer siempre: son
       justamente los pasos que llevan a la obra al estado que las etapas siguientes exigen. */
    case 'obra':
    case 'etmo':
    case 'op-final':
      return LIBRE

    /* Las dos últimas etapas hablan del MISMO documento: si no existe, no hay nada que enviar ni
       nada que confirmar.

       Entrar al paso 5 sin la confirmación del cliente es válido y necesario: es justamente la
       pantalla donde se mira si contestó. Lo que la confirmación gobierna es el BOTÓN de despacho
       al taller (ver `puedeDespacharAlTaller`), no el acceso. Cerrar la pantalla dejaría al usuario
       sin ningún lugar donde ver el estado de lo que está esperando. */
    case 'envio':
    case 'confirmacion':
      return obra.opFinal.length > 0
        ? LIBRE
        : {
            ok: false,
            motivo: 'Primero hay que generar la OP final: es el documento que se le manda al cliente.',
          }

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

/**
 * Si se puede despachar al taller.
 *
 * Al taller sólo llega lo que el cliente vio y APROBÓ. Es la condición del botón, no la de la
 * pantalla: mientras la obra está en "Pend de Confirmar" se entra igual al paso 5 —ahí se ve si
 * el cliente contestó— pero el despacho queda bloqueado.
 */
export function puedeDespacharAlTaller(obra: Obra): Acceso {
  if (obra.confirmacionOp.texto === ETIQUETA.confirmado) return LIBRE
  if (obra.confirmacionOp.texto === ETIQUETA.noConfirmado) {
    return { ok: false, motivo: 'El cliente rechazó la orden: no se manda al taller.' }
  }
  return {
    ok: false,
    motivo: 'El cliente todavía no confirmó la orden. Hasta que lo haga, no hay nada que mandar al taller.',
  }
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
