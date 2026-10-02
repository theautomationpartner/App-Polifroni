import { cuantasEn, ordenesVivas, situacionOrdenes, tipoDe } from '@/lib/pasos'
import { aptaParaTaller, enElTaller } from '@/lib/estadosOp'
import type { Destino, Obra } from '@/types'

/**
 * Lo que hay que preguntar (o avisar) ANTES de entrar a una obra.
 *
 * Una validación es una decisión —"¿cargo una nueva?"— y tomada al elegir la obra reemplaza el
 * momento en que la persona se iba a dar cuenta sola, una etapa después.
 */
export interface ValidacionEntrada {
  titulo: string
  /** Lo que va a pasar, en una línea. Es lo que se lee primero. */
  clave: string
  nota?: string
  /** Botón que NO entra: se vuelve a la lista. */
  cancelar: string
  /** Botón que entra. Sin él, el aviso sólo informa (no hay con qué seguir). */
  aceptar?: string
  /** A quién se envía al aceptar. Puede no ser el que se había elegido. */
  destino: Destino
  tono: 'warn' | 'info'
}

export function validarEntrada(destino: Destino, obra: Obra): ValidacionEntrada | null {
  /* Sin el tipo no hay recorrido: PVC y Aluminio cargan documentos distintos. */
  if (destino === 'cliente' && !tipoDe(obra)) {
    return {
      titulo: 'La obra no tiene el tipo cargado',
      clave: 'No se sabe si es de PVC o de Aluminio.',
      nota: 'Cargá el tipo en la columna «Tipo» de la obra en Monday y volvé a elegirla: de eso depende qué orden se carga.',
      cancelar: 'Elegir otra obra',
      destino,
      tono: 'warn',
    }
  }

  /* Al cliente o constructor, según en qué está la obra con sus órdenes (ver `situacionOrdenes`):
     sin órdenes se sigue sin preguntar; con órdenes asignadas, o con una ya CONFIRMADA, se avisa y se
     pregunta si se carga una nueva. Tener una confirmada no bloquea: una obra puede necesitar más
     órdenes (un agregado, una corrección). */
  if (destino === 'cliente') {
    const s = situacionOrdenes(obra)
    if (s.tipo === 'confirmada') {
      return {
        titulo: 'Esta obra ya tiene una orden confirmada',
        clave: '¿Querés cargar otra orden de producción?',
        nota: 'El cliente o el constructor ya confirmó una orden de esta obra. La nueva se crea aparte, queda asociada a la obra junto a las que ya tiene, y se envía para que la confirmen.',
        cancelar: 'Volver',
        aceptar: 'Cargar una nueva',
        destino: 'cliente',
        tono: 'warn',
      }
    }
    if (s.tipo === 'asignadas') {
      return {
        titulo: 'Esta obra ya tiene órdenes de producción',
        clave: '¿Querés cargar una orden de producción nueva?',
        nota: `Tiene ${s.n === 1 ? '1 orden asignada' : `${s.n} órdenes asignadas`}. La nueva se crea aparte y queda asociada a la obra, junto a las que ya tiene. Para reenviar una de las que ya tiene, usá «Consultar órdenes de producción».`,
        cancelar: 'Volver',
        aceptar: 'Cargar una nueva',
        destino: 'cliente',
        tono: 'warn',
      }
    }
    return null
  }

  if (destino === 'taller' && ordenesVivas(obra).length === 0) {
    return {
      titulo: 'Esta obra no tiene órdenes de producción',
      clave: 'No hay ninguna orden para mandar al taller.',
      nota: 'Primero se carga la OP y se envía al cliente o al constructor para que la confirme.',
      cancelar: 'Elegir otra obra',
      aceptar: 'Cargar una OP',
      destino: 'cliente',
      tono: 'info',
    }
  }

  /* Al taller sólo va una confirmada que todavía no se envió (ver `aptaParaTaller`). Sin ninguna,
     la ventana no deja seguir, y dice por qué: si la que había ya está en el taller, eso. */
  if (destino === 'taller' && !obra.ordenes.some((o) => aptaParaTaller(o.estado, o.envioTaller))) {
    const enTaller = obra.ordenes.filter((o) => enElTaller(o.estado, o.envioTaller))
    if (enTaller.length) {
      const nombres = enTaller.map((o) => `«${o.nombre || o.id}»`).join(', ')
      return {
        titulo: 'Esta obra ya envió su orden al taller',
        clave:
          enTaller.length === 1
            ? `Ya existe una orden confirmada y enviada al taller: ${nombres}.`
            : `Ya existen órdenes confirmadas y enviadas al taller: ${nombres}.`,
        nota: 'Una orden que ya está en el taller no se vuelve a enviar.',
        cancelar: 'Elegir otra obra',
        destino: 'taller',
        tono: 'info',
      }
    }
    const pendientes = cuantasEn(obra, 'pendiente')
    return {
      titulo: 'Esta obra no tiene órdenes confirmadas',
      clave: 'Sin la confirmación del cliente o del constructor no se manda nada al taller.',
      nota: pendientes
        ? `Tiene ${pendientes} ${pendientes === 1 ? 'orden pendiente' : 'órdenes pendientes'} de confirmar.`
        : undefined,
      cancelar: 'Elegir otra obra',
      destino: 'taller',
      tono: 'info',
    }
  }

  return null
}
