import { motivoEdicion } from '@/lib/edicionOp'
import { guardarLectura } from '@/services/ia/hetmo'
import { reemplazarOrdenEditada, subelementosDeEdicion } from '@/services/monday'
import type { BorradorEdicion } from './borrador'

/**
 * El registro de la edición en Monday, apenas se genera la OP final nueva:
 *
 *  1. La OP nueva ("… V2"): los datos y el estado de la editada —con la medición y las
 *     observaciones como quedaron en el formulario—, la clave del enlace, el recordatorio y el link,
 *     el PDF original más el dibujo nuevo y la OP final nueva. Sus subelementos se disparan sin
 *     esperarlos.
 *  2. La anterior, cancelada con el motivo de la edición (ver `reemplazarOrdenEditada`).
 *  3. La lectura de la OP nueva en la base, para poder volver a editarla sin la IA.
 *
 * Si después se envía, el envío registra lo suyo sobre la nueva (ver `finalizarEdicion`).
 * `onCreada` guarda la OP nueva apenas existe: un reintento la completa en vez de crear otra.
 */
export async function registrarEdicion(
  e: BorradorEdicion,
  onCreada: (id: string) => void,
  avance?: (texto: string) => void,
): Promise<string> {
  const { orden, generada: g, obra, medicion } = e
  if (!orden || !g || !obra) throw new Error('Falta la orden editada o su OP final nueva.')
  const observaciones = new Map((e.observaciones ?? []).map((a) => [a.nombre.trim().toUpperCase(), a.texto.trim()]))
  const id = await reemplazarOrdenEditada({
    vieja: orden,
    nombreNuevo: g.nombreNuevo,
    conservarEnvio: true,
    originales: [...g.documentos, g.dibujo],
    opFinal: g.archivo,
    subelementos: subelementosDeEdicion(e.subelementos ?? [], g.modelos, g.editados, observaciones),
    motivo: motivoEdicion(g.nombreNuevo, g.cambios, [], g.nuevas),
    medicion: medicion ? { medidoPor: medicion.medidoPor, fecha: medicion.fecha, observacion: medicion.observacion } : undefined,
    existente: e.nuevaId,
    onCreada,
    avance,
  })
  void guardarLectura(id, g.lectura).catch((err) => console.warn('[editar] no se pudo guardar la lectura de la OP nueva', err))
  return id
}
