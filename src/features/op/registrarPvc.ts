import { registrarNumero } from '@/services/make'
import {
  COL,
  ESTADO_OP,
  completarOrden,
  crearSubelementos,
  guardarNroHetmo,
  limpiarEstado,
  renombrarOrdenEmitida,
  setEstadoOrden,
  subirEtmoAOrden,
  subirOpFinal,
  terminarVisita,
} from '@/services/monday'
import type { BorradorOp } from '@/state/appState'
import type { Obra } from '@/types'
import { normalizarNombre } from './observaciones'
import { cantidadDe, cantidadesPorModelo } from './opFinal/datos'
import { abrirOrdenDeObra } from './ordenDeObra'
import { registrarEnvioLocal } from './registrarEnvioLocal'

/**
 * La OP de PVC en el tablero, apenas se genera la OP final ("Generar OP final"): se crea —o, si se
 * vuelve a generar, se reusa la misma— en "Generada Pend de Enviar" (`🤖Estado OP`), con el PDF de
 * HETMO en `🤖OP OriginaL`, la OP final en `🤖Op V2 Mejorada`, los datos de la medición y su nombre
 * definitivo. Así una orden generada que no se llegó a enviar queda en el tablero, y desde
 * "Consultar órdenes" se la termina de enviar ("Completar Carga").
 *
 * `avanzar` va guardando lo hecho: volver a generar no crea otra OP ni vuelve a subir el original.
 * Devuelve el id de la OP.
 */
export async function guardarOpGenerada({
  obra,
  borrador: b,
  opFinal,
  responsableId,
  avanzar,
}: {
  obra: Obra
  borrador: BorradorOp
  opFinal: File
  responsableId: string | null
  avanzar: (cambios: Partial<BorradorOp>) => void
}): Promise<string> {
  const original = b.hetmo
  if (!original) throw new Error('No hay una orden de HETMO cargada.')
  let m = b.medicion
  let id = b.ordenId
  if (!id) {
    const nueva = await abrirOrdenDeObra(obra, m, responsableId, b.numeroReservado)
    id = nueva.id
    m = { ...m, nroOrden: nueva.numero }
    avanzar({ ordenId: id, medicion: m })
  }
  if (b.archivoSubido !== original) {
    await subirEtmoAOrden(id, original)
    avanzar({ archivoSubido: original })
  }
  if (b.opFinalSubida !== opFinal) {
    await subirOpFinal(id, opFinal)
    avanzar({ opFinalSubida: opFinal })
  }
  const nro = m.nroOrden.trim()
  await completarOrden(id, {
    tipo: 'PVC',
    numero: nro,
    personas: responsableId ? [responsableId] : obra.asignadoIds,
    medidoPor: m.medidoPor,
    observacion: m.observacion,
    fecha: m.fecha,
  })
  await setEstadoOrden(id, ESTADO_OP.generada)
  await renombrarOrdenEmitida(id, obra.nombre, 'PVC', nro).catch(() => {})
  return id
}

/**
 * Registra en Monday la OP de PVC al tocar "Finalizar Operación". La OP normalmente ya existe: se
 * creó al generar la OP final (ver `guardarOpGenerada`), con sus dos PDF. Acá se completa.
 *
 * En orden:
 *  0. Si por algún motivo la OP no existe, se crea (con el número reservado al cargar el documento)
 *     y se le sube el PDF original de HETMO a `🤖OP OriginaL`.
 *  1. Los datos de la medición.
 *  2. Con la OP final generada: los subelementos —una observación por abertura y un renglón por
 *     vidrio, con la cantidad TOTAL a pedir: la de su línea por las aberturas del modelo—, el N° de
 *     OP de HETMO, la OP final adjunta en `🤖Op V2 Mejorada` y el nombre definitivo.
 *  3. Si se envió, el envío (ver `registrarEnvioLocal`). Si no, se limpian los estados de envío de
 *     la obra: hablan de una orden anterior, no de ésta.
 *  4. El número usado.
 *
 * `avanzar` va guardando lo que ya quedó hecho: un reintento no vuelve a crear la OP, no vuelve a
 * subir los archivos ni duplica los subelementos.
 */
export async function registrarPvc({
  obra,
  borrador: b,
  responsableId,
  avanzar,
}: {
  obra: Obra
  borrador: BorradorOp
  responsableId: string | null
  avanzar: (cambios: Partial<BorradorOp>) => void
}): Promise<void> {
  const original = b.hetmo
  if (!original) throw new Error('No hay una orden de HETMO cargada.')
  let m = b.medicion
  let id = b.ordenId
  if (!id) {
    const nueva = await abrirOrdenDeObra(obra, m, responsableId, b.numeroReservado)
    id = nueva.id
    m = { ...m, nroOrden: nueva.numero }
    avanzar({ ordenId: id, medicion: m })
  }
  if (b.archivoSubido !== original) {
    await subirEtmoAOrden(id, original)
    avanzar({ archivoSubido: original })
  }
  const nro = m.nroOrden.trim()
  const opFinal = b.generada ? b.opFinal : null

  await completarOrden(id, {
    tipo: 'PVC',
    numero: nro,
    personas: responsableId ? [responsableId] : obra.asignadoIds,
    medidoPor: m.medidoPor,
    observacion: m.observacion,
    fecha: m.fecha,
  })

  if (opFinal) {
    if (b.subelementosDe !== opFinal) {
      const observaciones = b.aberturas.map((a) => ({ nombre: normalizarNombre(a.nombre), texto: a.texto.trim() }))
      const cantidades = cantidadesPorModelo(b.lecturaOp)
      const vidrios = b.vidrios.map((v) => {
        const uds = cantidadDe(cantidades, v.modelo)
        return v.cant != null && uds != null ? { ...v, cant: v.cant * uds } : v
      })
      await crearSubelementos(id, observaciones, vidrios)
      avanzar({ subelementosDe: opFinal })
    }
    if (b.nOpHetmo) await guardarNroHetmo(id, b.nOpHetmo).catch(() => {})
    if (b.opFinalSubida !== opFinal) {
      await subirOpFinal(id, opFinal)
      avanzar({ opFinalSubida: opFinal })
    }
    await renombrarOrdenEmitida(id, obra.nombre, 'PVC', nro).catch(() => {})
  }

  if (b.envio) {
    await registrarEnvioLocal(obra, id, b.envio)
  } else {
    await Promise.all([
      limpiarEstado(obra.id, COL.estadoEnvioOp).catch(() => {}),
      limpiarEstado(obra.id, COL.mjsEnviadoCliente).catch(() => {}),
    ])
  }

  if (opFinal && nro) {
    await registrarNumero('PVC', nro).catch((e) => console.warn('[pvc] no se pudo actualizar la numeración', e))
  }
  terminarVisita(obra.id)
}
