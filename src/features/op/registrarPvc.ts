import { registrarNumero } from '@/services/numeracion'
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
import { guardarLectura } from '@/services/ia/hetmo'
import type { BorradorOp } from '@/state/appState'
import type { Obra } from '@/types'
import { normalizarNombre } from './observaciones'
import { cantidadDe, cantidadesPorModelo } from './opFinal/datos'
import { abrirOrdenDeObra } from './ordenDeObra'
import { registrarEnvioLocal } from './registrarEnvioLocal'

/**
 * La creación de subelementos que está corriendo para cada OP (por id), con la OP final para la que
 * se lanzó. Al generar se dispara SIN esperarla; si después "Finalizar" llega mientras todavía corre,
 * espera ésa en vez de lanzar otra: `crearSubelementos` borra y vuelve a crear, y dos a la vez se
 * pisarían (subelementos duplicados o borrados a medias).
 */
const subelementosEnCurso = new Map<string, { opFinal: File; tarea: Promise<void> }>()
/** Para qué OP final quedaron creados los subelementos de cada OP (lo confirma la tarea al terminar). */
const subelementosHechos = new Map<string, File>()

/**
 * Los subelementos de la OP: uno por abertura —con su observación, si el usuario las cargó— y, si
 * tiene varios vidrios, uno por vidrio, con la cantidad TOTAL a pedir (la de su línea por las
 * aberturas del modelo). `crearSubelementos` REEMPLAZA los que
 * hubiera, así que volver a generar no duplica; `subelementosDe` evita repetirlo con la misma OP final.
 *
 * Devuelve la tarea: quien la necesita terminada la espera ("Finalizar"); al generar sólo se dispara.
 */
function lanzarSubelementos(
  id: string,
  b: BorradorOp,
  opFinal: File,
  avanzar: (cambios: Partial<BorradorOp>) => void,
): Promise<void> {
  if (b.subelementosDe === opFinal || subelementosHechos.get(id) === opFinal) return Promise.resolve()
  const enCurso = subelementosEnCurso.get(id)
  if (enCurso?.opFinal === opFinal) return enCurso.tarea
  /* Las aberturas las lee la IA siempre; sus observaciones van sólo si el usuario abrió las cajas. */
  const aberturas = b.aberturas.map((a) => ({
    nombre: normalizarNombre(a.nombre),
    texto: b.obsHabilitadas ? a.texto.trim() : '',
    datos: a.datos,
  }))
  const cantidades = cantidadesPorModelo(b.lecturaOp)
  const vidrios = b.vidrios.map((v) => {
    const uds = cantidadDe(cantidades, v.modelo)
    return v.cant != null && uds != null ? { ...v, cant: v.cant * uds } : v
  })
  /* Si había otra corriendo (una OP final anterior), ésta arranca cuando aquélla termina. */
  const anterior = enCurso?.tarea.catch(() => {}) ?? Promise.resolve()
  const tarea = anterior
    .then(() => crearSubelementos(id, aberturas, vidrios))
    .then(() => {
      subelementosHechos.set(id, opFinal)
      avanzar({ subelementosDe: opFinal })
    })
    .finally(() => {
      if (subelementosEnCurso.get(id)?.tarea === tarea) subelementosEnCurso.delete(id)
    })
  subelementosEnCurso.set(id, { opFinal, tarea })
  return tarea
}

/**
 * Guarda en la base la lectura con la que se armó la OP final: "Editar Órdenes de Producción" la usa
 * para volver a armarla sin leer de nuevo el PDF original. Se dispara sin esperar: si falla, la
 * edición lee el original con la IA.
 */
function guardarLecturaDe(id: string, b: BorradorOp): void {
  if (!b.lecturaOp) return
  void guardarLectura(id, b.lecturaOp).catch((e) => console.warn('[pvc] no se pudo guardar la lectura de la OP', e))
}

/**
 * La OP de PVC en el tablero, apenas se genera la OP final ("Generar OP final"): se crea —o, si se
 * vuelve a generar, se reusa la misma— en "Generada Pend de Enviar" (`🤖Estado OP`), con el PDF de
 * HETMO en `🤖OP OriginaL`, la OP final en `🤖Op V2 Mejorada`, los datos de la medición, si tiene
 * vidrios (`🤖Tiene Vidrios`), su nombre definitivo y sus subelementos —una abertura cada uno, con
 * su observación y sus VIDRIOS—. Los vidrios van acá y no recién al
 * finalizar: una OP que se termina desde la consulta y sale al taller sin pasar por "Finalizar"
 * tiene que llegar igual a la Solicitud de Cortes de Vidrio con sus vidrios. Así una orden generada que no se llegó a enviar queda en el tablero, y desde
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
  /* Lo primero, apenas existe: su estado y sus datos. Si algo corta el resto (un error, la pestaña
     que se recarga), la OP queda "Generada Pend de Enviar" y con su medición —se la encuentra y se
     la completa desde la consulta—, no como un ítem vacío y sin estado. */
  const nro = m.nroOrden.trim()
  await setEstadoOrden(id, ESTADO_OP.generada)
  await completarOrden(id, {
    tipo: 'PVC',
    numero: nro,
    personas: responsableId ? [responsableId] : obra.asignadoIds,
    medidoPor: m.medidoPor,
    observacion: m.observacion,
    fecha: m.fecha,
    tieneVidrios: b.vidrios.length > 0,
  })
  if (b.archivoSubido !== original) {
    await subirEtmoAOrden(id, original)
    avanzar({ archivoSubido: original })
  }
  if (b.opFinalSubida !== opFinal) {
    await subirOpFinal(id, opFinal)
    avanzar({ opFinalSubida: opFinal })
  }
  /* Los subelementos se disparan y NO se esperan: la OP ya quedó guardada con sus archivos. Si
     fallan, "Finalizar" los vuelve a intentar (`subelementosDe` sólo se marca al terminar bien). */
  void lanzarSubelementos(id, b, opFinal, avanzar).catch((e) =>
    console.warn('[pvc] no se pudieron crear los subelementos al generar; se reintentan al finalizar', e),
  )
  if (b.nOpHetmo) await guardarNroHetmo(id, b.nOpHetmo).catch(() => {})
  await renombrarOrdenEmitida(id, obra.nombre, 'PVC', nro).catch(() => {})
  guardarLecturaDe(id, b)
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
 *  2. Con la OP final generada: los subelementos —uno por abertura, con su observación, y uno más
 *     por cada vidrio extra de la misma abertura, con la cantidad TOTAL a pedir: la de su línea por
 *     las aberturas del modelo—, el N° de
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
    tieneVidrios: b.vidrios.length > 0,
  })

  if (opFinal) {
    /* Acá sí se espera: si la de la generación todavía corre, se espera ésa (no se lanza otra). */
    await lanzarSubelementos(id, b, opFinal, avanzar)
    if (b.nOpHetmo) await guardarNroHetmo(id, b.nOpHetmo).catch(() => {})
    if (b.opFinalSubida !== opFinal) {
      await subirOpFinal(id, opFinal)
      avanzar({ opFinalSubida: opFinal })
    }
    await renombrarOrdenEmitida(id, obra.nombre, 'PVC', nro).catch(() => {})
    guardarLecturaDe(id, b)
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
