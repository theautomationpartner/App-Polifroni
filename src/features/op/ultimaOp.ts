import type { ArchivoObra, Obra } from '@/types'

/**
 * La ÚLTIMA Orden de Producción final de la obra.
 *
 * Una obra puede tener más de una: cuando se hace por etapas, cada etapa tiene su orden, y todas
 * conviven en la columna `🤖OP Final`. Lo que hay que mostrar —en el envío y en la confirmación—
 * es siempre la más nueva: es la que se le manda al cliente y al taller.
 *
 * Antes se tomaba `opFinal.find(...)`, o sea el PRIMER archivo de la columna, que es el más VIEJO.
 * Mientras el escenario limpiaba la columna antes de generar no se notaba —había una sola—, pero
 * en cuanto empiezan a convivir dos, esa línea muestra la vieja: el documento equivocado, y del
 * lado del cliente eso significa fabricar sobre una orden que ya no rige.
 *
 * Se ordena por `assetId`, no por la posición en la lista. Monday los asigna de forma creciente, y
 * comparándolos como NÚMERO el más alto es el último que se subió. El orden del array depende de
 * cómo Monday serialice la columna, que no es algo que convenga dar por sentado.
 *
 * Se descartan las imágenes: lo que se manda y se previsualiza es el PDF.
 */
export function ultimaOpFinal(obra: Obra): ArchivoObra | null {
  const pdfs = obra.opFinal.filter((a) => !a.esImagen)
  if (pdfs.length === 0) return null
  return pdfs.reduce((masNueva, a) =>
    Number(a.assetId) > Number(masNueva.assetId) ? a : masNueva,
  )
}
