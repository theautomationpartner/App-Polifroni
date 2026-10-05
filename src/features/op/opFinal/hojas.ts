/**
 * Las hojas del listado HETMO como imágenes, y el recorte del dibujo de cada modelo.
 *
 * Reemplaza al módulo 39 del escenario ("PDF to PNG" de PDF.co): el PDF se dibuja acá, con
 * pdf.js, hoja por hoja. Si la Orden HETMO vino como foto, la foto ES la única hoja.
 *
 * El recorte es el de la plantilla HTML: allá la hoja entera se agrandaba y se corría detrás de
 * una ventanita (`--crop-*`); acá se recorta de antemano ese mismo pedazo. El PDF queda más
 * liviano —cada tarjeta lleva su dibujo, no la hoja completa— y el encuadre no depende del motor
 * que lo dibuje.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Slot } from './datos'

/**
 * Qué pedazo de la hoja de HETMO se ve en la tarjeta, en fracciones de la hoja (0 a 1).
 * Son los valores de la plantilla HTML:
 *   x      --crop-x   corrimiento horizontal (más grande = el recorte arranca más a la derecha)
 *   alto   --crop-h   alto del recorte (más chico = dibujo más grande)
 *   ya/yb  --crop-ya / --crop-yb   dónde arranca el modelo de arriba (a) y el de abajo (b)
 *   ancho  sale de --dib-ancho (31 mm) sobre la hoja agrandada: deja afuera la columna de texto
 *          que HETMO pone a la derecha del dibujo.
 */
export const RECORTE = { x: 0.1, ancho: 0.3, alto: 0.25, ya: 0.215, yb: 0.572 }

/** Ancho al que se dibuja cada hoja: sobra para un recorte de 31 mm y no pesa de más. */
const ANCHO_HOJA_PX = 1600
/** Ancho máximo del recorte que va al PDF. */
const ANCHO_RECORTE_PX = 520

const esPdf = (archivo: File) => archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)

/** La Orden HETMO cargada en la app, una imagen por hoja. */
export async function cargarHojas(blob: File): Promise<HTMLCanvasElement[]> {
  if (!esPdf(blob)) {
    /* Una foto: es la única hoja. */
    const imagen = await createImageBitmap(blob)
    const escala = Math.min(1, ANCHO_HOJA_PX / imagen.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(imagen.width * escala)
    canvas.height = Math.round(imagen.height * escala)
    canvas.getContext('2d')?.drawImage(imagen, 0, 0, canvas.width, canvas.height)
    imagen.close()
    return [canvas]
  }

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  const hojas: HTMLCanvasElement[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const base = pagina.getViewport({ scale: 1 })
    const viewport = pagina.getViewport({ scale: ANCHO_HOJA_PX / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no pudo dibujar la Orden HETMO.')
    /* Fondo blanco: un PDF sin fondo sale transparente, y en JPEG eso es negro. */
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pagina.render({ canvas, canvasContext: ctx, viewport }).promise
    hojas.push(canvas)
  }
  await doc.destroy()
  return hojas
}

/**
 * El dibujo de un modelo, como JPEG en data URL.
 *
 * `a` y `b` recortan la mitad de arriba o la de abajo de la hoja, con el encuadre de `RECORTE`.
 * `full` y `none` (la orden vino como foto y no se puede recortar) mandan la hoja entera.
 */
/** Un dibujo listo para la tarjeta: la imagen y cuánto mide de alto por cada unidad de ancho. */
export interface Dibujo {
  src: string
  proporcion: number
}

/** Un píxel cuenta como dibujo si es más oscuro que esto (el papel escaneado no es blanco puro). */
const UMBRAL_TINTA = 235
/** Lo que se deja de blanco debajo de lo último dibujado. */
const MARGEN_ABAJO_PX = 10

/**
 * Hasta qué fila hay dibujo: la última con algún píxel oscuro. Recorre de abajo hacia arriba y
 * corta en la primera que encuentra.
 */
function ultimaFilaConTinta(ctx: CanvasRenderingContext2D, ancho: number, alto: number): number {
  const { data } = ctx.getImageData(0, 0, ancho, alto)
  for (let y = alto - 1; y >= 0; y--) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      if (data[i] < UMBRAL_TINTA || data[i + 1] < UMBRAL_TINTA || data[i + 2] < UMBRAL_TINTA) return y
    }
  }
  return alto - 1
}

export function recortar(hoja: HTMLCanvasElement, slot: Slot): Dibujo | null {
  const W = hoja.width
  const H = hoja.height
  const [sx, sy, sw, sh] =
    slot === 'a' || slot === 'b'
      ? [
          RECORTE.x * W,
          (slot === 'a' ? RECORTE.ya : RECORTE.yb) * H,
          Math.min(RECORTE.ancho, 1 - RECORTE.x) * W,
          Math.min(RECORTE.alto, 1 - (slot === 'a' ? RECORTE.ya : RECORTE.yb)) * H,
        ]
      : [0, 0, W, H]
  const escala = Math.min(1, ANCHO_RECORTE_PX / sw)
  const salida = document.createElement('canvas')
  salida.width = Math.max(1, Math.round(sw * escala))
  salida.height = Math.max(1, Math.round(sh * escala))
  const ctx = salida.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, salida.width, salida.height)
  ctx.drawImage(hoja, sx, sy, sw, sh, 0, 0, salida.width, salida.height)

  /* El recorte es media hoja de HETMO, y un dibujo chico (un mosquitero) ocupa sólo la parte de
     arriba: lo de abajo es papel en blanco. Se corta ese blanco —sólo abajo, así el dibujo conserva
     su escala y su lugar— para que la tarjeta no lo muestre como un hueco antes de la observación. */
  const alto = Math.min(salida.height, ultimaFilaConTinta(ctx, salida.width, salida.height) + 1 + MARGEN_ABAJO_PX)
  let final = salida
  if (alto < salida.height) {
    final = document.createElement('canvas')
    final.width = salida.width
    final.height = alto
    final.getContext('2d')?.drawImage(salida, 0, 0)
  }
  return { src: final.toDataURL('image/jpeg', 0.85), proporcion: final.height / final.width }
}
