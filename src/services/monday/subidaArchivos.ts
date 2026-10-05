/**
 * Prepara un archivo antes de mandarlo al servidor: achica las fotos y, si aun así no entra, corta
 * con un mensaje que se entienda. Es la solución de Stagnar Oportunidades (commit 7ce8db8), traída
 * tal cual.
 *
 * El problema: en producción lo que sube la app pasa por una función serverless de Vercel
 * (`/api/monday-upload`) y Vercel rechaza cualquier pedido cuyo cuerpo pase los 4,5 MB. El rechazo
 * pasa EN EL BORDE, antes de que corra una línea del handler, así que la respuesta no es un JSON de
 * Monday y el error salía como un 413 sin explicación. Un PDF escaneado o una foto de celular pasan
 * ese tope sin esfuerzo.
 *
 * No se nota en desarrollo: ahí la subida va por el proxy de Vite (`/monday-api-file`), que no tiene
 * límite de tamaño.
 */

/** El tope real de Vercel. */
export const LIMITE_SUBIDA_BYTES = 4.5 * 1024 * 1024

/* El archivo no viaja solo: va adentro de un multipart junto con la query de GraphQL, los
   boundaries y los headers de cada parte. Se reserva un margen para que un archivo de 4,49 MB no
   termine igual en 413 por culpa del envoltorio. */
const MARGEN_MULTIPART = 128 * 1024
export const LIMITE_EFECTIVO = LIMITE_SUBIDA_BYTES - MARGEN_MULTIPART

/* Lado largo al que se achican las fotos. La API de Anthropic ya redimensiona cualquier imagen a
   ~1568 px antes de leerla; 2000 px deja margen (el archivo también queda en Monday y conviene poder
   ampliarlo un poco) sin acercarse al límite. */
const MAX_LADO = 2000

/* Por debajo de esto no se toca nada: no tiene sentido re-encodear —y perder calidad— un archivo que
   ya entra cómodo. */
const UMBRAL_COMPRIMIR = 1.5 * 1024 * 1024

/* 0,85: el JPEG deja de verse distinto a simple vista pero ya pesa una fracción. Más abajo aparecen
   artefactos en los bordes de las letras y de las líneas del dibujo, que es lo que hay que leer. */
const CALIDAD_JPEG = 0.85

/** El archivo no entra en el tope de subida: el mensaje dice cuánto pesa y qué hacer. */
export class ArchivoMuyPesado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ArchivoMuyPesado'
  }
}

export const esImagen = (file: File): boolean => typeof file?.type === 'string' && file.type.startsWith('image/')

const enMegas = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')

/**
 * Decodifica respetando la orientación EXIF. Sin esto, una foto sacada en vertical se dibuja
 * acostada en el canvas (el celular no rota los píxeles: deja una marca que dice cómo mostrarlos).
 */
async function decodificar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* Safari viejo no soporta la opción: se reintenta sin ella antes de caer al <img>. */
      try {
        return await createImageBitmap(file)
      } catch {
        /* sigue abajo */
      }
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

/**
 * Mismo nombre pero terminado en .jpg. Importa: los escenarios de Make rutean por la EXTENSIÓN y le
 * declaran a Claude un tipo de archivo derivado de ahí; un "foto.png" con bytes JPEG adentro hace que
 * Anthropic rechace la llamada.
 */
const nombreJpg = (nombre: string): string => `${(nombre || 'archivo').replace(/\.[^.]+$/, '')}.jpg`

export async function comprimirImagen(file: File): Promise<File> {
  const bitmap = await decodificar(file)
  const { width, height } = bitmap
  if (!width || !height) throw new Error('Imagen sin dimensiones')

  const escala = Math.min(1, MAX_LADO / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * escala)
  canvas.height = Math.round(height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el canvas')
  /* El JPEG no tiene transparencia: sin esto, lo transparente de un PNG queda negro. Fondo blanco,
     que es lo que se espera de un documento. */
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if ('close' in bitmap) bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG))
  if (!blob) throw new Error('No se pudo convertir la imagen')
  return new File([blob], nombreJpg(file.name), { type: 'image/jpeg', lastModified: Date.now() })
}

/**
 * El punto único por el que pasan todas las subidas (`mondaySubirArchivo`), y que las pantallas de
 * carga llaman ANTES de crear la OP, para no dejar una OP vacía por un archivo que no entra.
 *
 * - Imagen grande: se achica y se devuelve como .jpg.
 * - Imagen chica, PDF o cualquier otra cosa: se devuelve tal cual.
 * - Si después de todo eso sigue sin entrar: `ArchivoMuyPesado`, con cuánto pesa y qué hacer, en vez
 *   de dejar que Vercel conteste un 413 pelado.
 *
 * Si la compresión falla (un HEIC que el navegador no sabe decodificar, un canvas que no se pudo
 * crear) se sigue con el original: no poder achicarlo no es razón para frenar una subida que quizás
 * entraba igual.
 */
export async function prepararArchivoParaSubir(file: File): Promise<File> {
  let listo = file
  if (esImagen(file) && file.size > UMBRAL_COMPRIMIR) {
    try {
      const comprimido = await comprimirImagen(file)
      /* Sólo si de verdad sirvió: una imagen ya optimizada puede salir MÁS pesada al re-encodearla. */
      if (comprimido.size < file.size) listo = comprimido
    } catch (err) {
      console.warn('No se pudo comprimir la imagen, se sube como está', err)
    }
  }

  if (listo.size > LIMITE_EFECTIVO) {
    throw new ArchivoMuyPesado(
      `El archivo pesa ${enMegas(listo.size)} MB y el máximo que se puede subir es ${enMegas(LIMITE_SUBIDA_BYTES)} MB. ` +
        (esImagen(listo)
          ? 'Probá sacar la foto con menos resolución.'
          : 'Si es un PDF escaneado, exportalo con menos calidad o en blanco y negro, y volvé a cargarlo.'),
    )
  }
  return listo
}
