/**
 * La base de una edición: la lectura del listado con la que se armó la OP final de la orden, y los
 * documentos de donde salen sus dibujos (los PDF de `🤖OP OriginaL`, en orden).
 *
 * La lectura sale de la base si la OP la tiene guardada (las generadas o editadas desde que existe
 * esta función). Si no, se lee el PDF original con la IA, igual que al generar: uno o dos minutos.
 * Por eso se arranca apenas se elige la orden y se guarda la promesa por orden: cuando el usuario
 * llega a cargar el dibujo nuevo, normalmente ya está.
 */
import { leerListado, leerLecturaGuardada } from '@/services/ia/hetmo'
import { getUrlArchivo } from '@/services/monday'
import type { OrdenEditable } from '@/services/monday/edicionOp'

export interface BaseEdicion {
  lectura: unknown
  documentos: File[]
  /** La lectura venía guardada (no hizo falta la IA). */
  guardada: boolean
}

const enCurso = new Map<string, Promise<BaseEdicion>>()
const listas = new Set<string>()

async function bajar(assetId: string, nombre: string): Promise<File> {
  const url = await getUrlArchivo(assetId)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`No se pudo bajar ${nombre}: HTTP ${r.status}`)
  return new File([await r.blob()], nombre, { type: 'application/pdf' })
}

/** La base de la orden: la misma promesa para toda la sesión (salvo que falle: ahí se reintenta). */
export function lecturaBase(orden: OrdenEditable): Promise<BaseEdicion> {
  const previa = enCurso.get(orden.id)
  if (previa) return previa
  const p = (async () => {
    if (!orden.etmo.length) throw new Error('La orden no tiene su PDF original de HETMO (🤖OP OriginaL): sin él no se pueden armar los dibujos.')
    const [documentos, guardada] = await Promise.all([
      Promise.all(orden.etmo.map((a) => bajar(a.assetId, a.nombre))),
      leerLecturaGuardada(orden.id).catch((e) => {
        console.warn('[editar] no se pudo leer la lectura guardada; se lee el original', e)
        return null
      }),
    ])
    const lectura = guardada ?? (await leerListado(documentos[0]))
    listas.add(orden.id)
    return { lectura, documentos, guardada: guardada != null }
  })()
  p.catch(() => enCurso.delete(orden.id))
  enCurso.set(orden.id, p)
  return p
}

/** La base ya está lista (no hay que esperar a la IA). */
export const baseLista = (ordenId: string): boolean => listas.has(ordenId)
