import type { Obra, Paso } from '@/types'

/**
 * Lo que hay que preguntar ANTES de entrar a una obra.
 *
 * Todas las validaciones del circuito viven acá y se resuelven en la PRIMERA pantalla, en el
 * momento de elegir la obra. El motivo es que una validación es una decisión —"¿genero una nueva?",
 * "¿voy a emitirla primero?"— y una decisión tomada al entrar no agrega un paso: reemplaza el
 * momento en que la persona se iba a dar cuenta sola, tres pantallas después.
 *
 * Lo que NO se hace acá es frenar: las dos opciones siempre llevan a algún lado. Un cartel que
 * sólo dice "no se puede" deja a alguien mirando una lista sin saber qué hacer con ella.
 */
export interface ValidacionEntrada {
  titulo: string
  /** Lo que va a pasar, en una línea. Es lo que se lee primero. */
  clave: string
  /** El detalle, para quien lo necesite. */
  nota?: string
  /** Botón que NO entra: se vuelve a la lista. */
  cancelar: string
  /** Botón que entra. */
  aceptar: string
  /** A qué etapa se entra al aceptar. Puede no ser la que se había elegido. */
  destino: Paso
  /**
   * Antes de entrar, borrar la Orden ETMO y las observaciones.
   *
   * Es el caso de rehacer una orden ya emitida: lo que quedó cargado pertenece a la orden
   * anterior, y dejarlo puesto hace que la etapa parezca a medio hacer y empuja a generar otra vez
   * sobre el material viejo.
   */
  limpiarCiclo?: boolean
  tono: 'warn' | 'info'
}

export function validarEntrada(destino: Paso, obra: Obra): ValidacionEntrada | null {
  const tieneOp = obra.opFinal.length > 0
  const hayCicloPrevio = obra.ordenEtmo.length > 0 || obra.observaciones.trim().length > 0

  /* Emitir sobre una obra que YA tiene su orden: no es "generar", es rehacer. */
  if (destino === 'etmo' && tieneOp) {
    return {
      titulo: 'Ya cuenta con una OP Final cargada',
      clave: '¿Desea generar una nueva?',
      nota: hayCicloPrevio
        ? 'Se borran la Orden ETMO y las observaciones de la anterior para empezar de cero. La orden que está cargada se reemplaza recién cuando generes la nueva.'
        : 'La orden que está cargada se reemplaza recién cuando generes la nueva.',
      cancelar: 'No generar',
      aceptar: 'Generar una nueva',
      destino: 'etmo',
      limpiarCiclo: hayCicloPrevio,
      tono: 'warn',
    }
  }

  /* Mandar —al cliente o al taller— algo que todavía no existe. En vez de negarlo, se ofrece el
     camino: emitirla, que es lo que hay que hacer de todos modos. */
  if ((destino === 'envio' || destino === 'confirmacion') && !tieneOp) {
    return {
      titulo: 'Esta obra todavía no tiene la OP Final',
      clave:
        destino === 'envio'
          ? 'No hay documento para mandarle al cliente.'
          : 'No hay documento que confirmar ni que mandar al taller.',
      nota: 'Se emite en la etapa de Orden ETMO, a partir del documento que genera ETMO.',
      cancelar: 'Elegir otra obra',
      aceptar: 'Ir a emitir la OP',
      destino: 'etmo',
      tono: 'info',
    }
  }

  return null
}
