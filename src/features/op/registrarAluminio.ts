import { registrarNumero } from '@/services/make'
import { completarOrden, renombrarOrdenEmitida, subirEtmoAOrden, terminarVisita } from '@/services/monday'
import type { BorradorOp } from '@/state/appState'
import type { Obra } from '@/types'
import { abrirOrdenDeObra } from './ordenDeObra'
import { registrarEnvioLocal } from './registrarEnvioLocal'

/**
 * Registra en Monday la orden de Aluminio y, si se mandó, su envío: se llama al tocar "Finalizar
 * Operación". La OP y su PDF en `🤖OP OriginaL` ya existen desde la carga (`CargarOpView`): acá se
 * reusan, y sólo se crean o suben si por algún motivo faltan.
 *
 * En orden:
 *  1. Crea la OP en el tablero de órdenes (vínculo a la obra, tipo, número, responsable) y la suma
 *     a la columna de órdenes de la obra.
 *  2. Sube el PDF a `🤖OP OriginaL` —sólo ahí: en Aluminio el original es la orden—.
 *  3. Carga los datos de la medición.
 *  4. Si se envió: deja la OP "Enviada Pend Confirmar" (el estado de envío no se toca), escribe en la
 *     obra a quiénes y por dónde, la pone "Pend de Confirmar", guarda el link del PDF y crea la
 *     actividad "OP Enviada".
 *  5. Registra el número usado y le da a la OP su nombre definitivo.
 *
 * `avanzar` va guardando en el borrador lo que ya quedó hecho: si algo falla a mitad de camino, el
 * reintento reusa la misma OP y no vuelve a subir el archivo.
 */
export async function registrarAluminio({
  obra,
  borrador,
  responsableId,
  avanzar,
}: {
  obra: Obra
  borrador: BorradorOp
  responsableId: string | null
  avanzar: (cambios: Partial<BorradorOp>) => void
}): Promise<void> {
  const m = borrador.medicion
  const nro = m.nroOrden.trim()
  const archivo = borrador.archivo
  if (!archivo) throw new Error('No hay un PDF cargado.')

  const id = borrador.ordenId ?? (await abrirOrdenDeObra(obra, nro, responsableId)).id
  avanzar({ ordenId: id })

  if (archivo !== borrador.archivoSubido) {
    await subirEtmoAOrden(id, archivo)
    avanzar({ archivoSubido: archivo })
  }

  await completarOrden(id, {
    tipo: 'Aluminio',
    numero: nro,
    personas: responsableId ? [responsableId] : obra.asignadoIds,
    medidoPor: m.medidoPor,
    observacion: m.observacion,
    fecha: m.fecha,
  })

  await renombrarOrdenEmitida(id, obra.nombre, 'Aluminio', nro).catch(() => {})

  if (borrador.envio) {
    await registrarEnvioLocal(obra, id, borrador.envio, {
      numero: nro,
      tipo: 'Aluminio',
      nOpHetmo: '',
      medidoPor: m.medidoPor,
      fechaMedicion: m.fecha,
      observacion: m.observacion,
    })
  }

  await registrarNumero('Aluminio', nro).catch((e) => console.warn('[aluminio] no se pudo actualizar la numeración', e))
  terminarVisita(obra.id)
}
