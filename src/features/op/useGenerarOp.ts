import { useCallback, useRef } from 'react'
import { useCorrida, type Veredicto } from '@/features/shared/useCorrida'
import { ESCENARIO } from '@/services/make'
import { getArchivosOrden } from '@/services/monday'
import type { Obra } from '@/types'
import { parsear, serializarHtml, serializarLista } from './observaciones'

/**
 * Las observaciones, en las tres formas en que viajan al escenario.
 *
 * Se arma a partir de un TEXTO y no de la obra a propósito: quien genera la OP acaba de guardar lo
 * escrito, y el objeto `obra` del render todavía tiene el valor anterior. Pasando por acá lo que
 * se guardó, el escenario recibe lo que la persona escribió y no lo que había antes.
 *
 * Cada forma existe por algo:
 *  - `observaciones`       el texto plano de siempre. No se toca para no cambiarle la entrada a
 *                          nadie que ya la esté leyendo.
 *  - `observacionesHtml`   las mismas, una por renglón, con el `<br>` que es el ÚNICO corte que
 *                          una plantilla HTML respeta —probado contra la orden real: un salto de
 *                          línea ahí se colapsa a un espacio y quedan todas en un párrafo—.
 *  - `observacionesLista`  una entrada por abertura, si la plantilla prefiere recorrerla.
 * La app las manda listas; que se vean cortadas depende de que la plantilla imprima el valor sin
 * escapar (`{{{...}}}`), porque escapado muestra el `<br>` como texto.
 */
export function datosObservaciones(texto: string) {
  const aberturas = parsear(texto)
  return {
    observaciones: texto,
    observacionesHtml: serializarHtml(aberturas),
    observacionesLista: serializarLista(aberturas),
  }
}

/**
 * Generación de la OP final: dispara el escenario y espera su lectura.
 *
 * El final llega por la respuesta del webhook (`datos`, la lectura de Claude): la OP la arma la app.
 * Mirar el tablero queda de respaldo por si esa respuesta se pierde: si en la OP del tablero de
 * órdenes aparece una OP final, la corrida terminó. La obra ya no tiene columnas de este paso.
 */
export function useGenerarOp(obra: Obra, ordenId: string | null = null) {
  /** Los archivos que ya tenía la OP al apretar: una OP final vieja no es la de esta corrida. */
  const previos = useRef<Set<string>>(new Set())

  const opFinalDeOrden = useCallback(async () => {
    if (!ordenId) return []
    return (await getArchivosOrden(ordenId).catch(() => null))?.opFinal ?? []
  }, [ordenId])

  const antes = useCallback(() => {
    previos.current = new Set()
    void opFinalDeOrden().then((a) => {
      previos.current = new Set(a.map((x) => x.assetId))
    })
  }, [opFinalDeOrden])

  const mirar = useCallback(async (): Promise<Veredicto> => {
    const deOrden = await opFinalDeOrden()
    if (deOrden.some((a) => !previos.current.has(a.assetId))) return { fin: 'listo', arranco: true }
    return { fin: null, arranco: false }
  }, [opFinalDeOrden])

  return useCorrida({
    escenario: ESCENARIO.leerDocumento,
    itemId: obra.id,
    /* Las observaciones las pasa la pantalla a `correr()`: son las que se escribieron en ella. */
    extra: {
      obra: obra.nombre,
      ...datosObservaciones(''),
      accion: 'leer-documento-etmo',
    },
    antes,
    mirar,
  })
}
