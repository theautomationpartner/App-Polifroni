import { registrarNumero } from '@/services/make'
import {
  COL,
  completarOrden,
  crearSubelementos,
  guardarNroHetmo,
  limpiarEstado,
  renombrarOrdenEmitida,
  subirOpFinal,
  terminarVisita,
} from '@/services/monday'
import type { BorradorOp } from '@/state/appState'
import type { Obra } from '@/types'
import { normalizarNombre } from './observaciones'
import { cantidadDe, cantidadesPorModelo } from './opFinal/datos'
import { registrarEnvioLocal } from './registrarEnvioLocal'

/**
 * Registra en Monday la OP de PVC al tocar "Finalizar Operación". "Generar OP final" sólo arma el
 * PDF en la app: todo lo que queda escrito en el tablero se escribe acá.
 *
 * La OP ya existe (nació al cargar la orden de HETMO, con el documento adjunto). En orden:
 *  1. Los datos de la medición.
 *  2. Con la OP final generada: los subelementos —una observación por abertura y un renglón por
 *     vidrio, con la cantidad TOTAL a pedir: la de su línea por las aberturas del modelo—, el N° de
 *     OP de HETMO, la OP final adjunta en `🤖Op V2 Mejorada` y el nombre definitivo.
 *  3. Si se envió, el envío (ver `registrarEnvioLocal`). Si no, se limpian los estados de envío de
 *     la obra: hablan de una orden anterior, no de ésta.
 *  4. El número usado.
 *
 * `avanzar` va guardando lo que ya quedó hecho: un reintento no vuelve a subir la OP final ni
 * duplica los subelementos.
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
  const id = b.ordenId
  if (!id) throw new Error('La OP todavía no existe en el tablero.')
  const m = b.medicion
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
