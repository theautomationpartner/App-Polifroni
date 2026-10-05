/**
 * Una foto (o captura) de la orden de HETMO, convertida en PDF.
 *
 * La OP guarda siempre un PDF —es lo que se envía y lo que lee la IA—, pero a veces lo que hay a
 * mano es una foto del listado. Se arma un PDF de UNA hoja del tamaño de la imagen, con
 * @react-pdf/renderer (el mismo que dibuja la OP final), sin pasar por ningún servicio de afuera.
 *
 * Antes la imagen pasa por el canvas: así entra cualquier formato que el navegador sepa leer (react-pdf
 * sólo acepta JPG y PNG), se respeta la orientación de la foto y se achica a un tamaño razonable.
 */
import { comprimirImagen } from '@/services/monday'

/** Lado largo de la hoja, en puntos: el de una A4. La imagen conserva su proporción. */
const LADO_HOJA = 842

const nombrePdf = (nombre: string): string => `${(nombre || 'orden').replace(/\.[^.]+$/, '')}.pdf`

const comoDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'))
    lector.readAsDataURL(blob)
  })

const medidas = (src: string): Promise<{ ancho: number; alto: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight })
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = src
  })

export async function imagenAPdf(imagen: File): Promise<File> {
  const jpg = await comprimirImagen(imagen)
  const src = await comoDataUrl(jpg)
  const { ancho, alto } = await medidas(src)
  const escala = LADO_HOJA / Math.max(ancho, alto)
  const hoja: [number, number] = [Math.round(ancho * escala), Math.round(alto * escala)]

  /* react-pdf pesa: se carga recién acá, cuando hay una imagen para convertir. */
  const { Document, Image: Imagen, Page, pdf } = await import('@react-pdf/renderer')
  const blob = await pdf(
    <Document>
      <Page size={hoja} style={{ padding: 0 }}>
        <Imagen src={src} style={{ width: hoja[0], height: hoja[1] }} />
      </Page>
    </Document>,
  ).toBlob()
  return new File([blob], nombrePdf(imagen.name), { type: 'application/pdf', lastModified: Date.now() })
}
