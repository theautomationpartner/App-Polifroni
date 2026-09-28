/**
 * Arma la Orden de Producción final en el navegador y la adjunta a la OP.
 *
 * Reemplaza a los módulos 39 (hojas a PNG), 59 (armado de datos), 54 (HTML a PDF) y 55 (subir a
 * Monday) del escenario de generación. Del escenario sólo se usa la lectura de Claude, que llega
 * como `datos` en su respuesta.
 *
 * Todo lo que el documento necesita se valida ANTES de dibujar: si falta algo que la orden no
 * puede llevar vacía (la obra, la dirección, el número, la lectura), no se genera y se dice qué
 * falta. Lo que la IA no pudo leer de un modelo sale con una raya y se avisa.
 */
import { subirOpFinal } from '@/services/monday'
import type { ArchivoObra } from '@/types'
import { armarDatosOp, type EntradaOp, type ModeloOp } from './datos'
import { cargarHojas, recortar } from './hojas'

/** Límite de la función de Vercel que sube el archivo a Monday (4,5 MB), con margen. */
const TOPE_BYTES = 4.3 * 1024 * 1024
const LOGO = '/logo-op.jpg'

export interface EntradaGenerar extends EntradaOp {
  ordenId: string
  /** La Orden HETMO de la OP: de ahí salen los dibujos. */
  etmo: ArchivoObra | null
}

export interface ResultadoGenerar {
  ok: boolean
  errores: string[]
  avisos: string[]
  /** El PDF subido, por si hace falta mostrarlo o volver a subirlo. */
  archivo?: File
}

/** El logo como data URL: así el PDF no depende de que react-pdf pueda bajarlo por su cuenta. */
async function cargarLogo(): Promise<string> {
  const r = await fetch(LOGO)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const blob = await r.blob()
  return await new Promise<string>((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => ok(String(lector.result))
    lector.onerror = () => mal(lector.error)
    lector.readAsDataURL(blob)
  })
}

const nombreArchivo = (obra: string, nro: string) =>
  `Orden de Produccion Final - ${obra} - ${nro}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ')

export async function generarOpFinal(e: EntradaGenerar): Promise<ResultadoGenerar> {
  const { datos, errores, avisos } = armarDatosOp(e)
  if (!e.etmo) errores.push('La OP no tiene la Orden HETMO adjunta: de ahí salen los dibujos.')
  if (!datos || errores.length) return { ok: false, errores, avisos }

  /* ── Los dibujos ──────────────────────────────────────────────────────── */
  let hojas: HTMLCanvasElement[]
  try {
    hojas = await cargarHojas(e.etmo as ArchivoObra)
  } catch (err) {
    return {
      ok: false,
      errores: [`No se pudo leer la Orden HETMO: ${err instanceof Error ? err.message : String(err)}`],
      avisos,
    }
  }
  if (datos.hojasNecesarias > hojas.length) {
    avisos.push(
      `La lectura ubica dibujos hasta la hoja ${datos.hojasNecesarias}, pero la Orden HETMO tiene ${hojas.length}: esos modelos van sin dibujo.`,
    )
  }
  /* Una foto no se recorta por mitades: se muestra entera. */
  const esFoto = !/\.pdf$/i.test((e.etmo as ArchivoObra).nombre)
  const cache = new Map<string, string>()
  const dibujo = (m: ModeloOp): string | null => {
    if (m.hojaIdx == null || !hojas[m.hojaIdx]) return null
    const slot = esFoto ? 'full' : m.slot
    const clave = `${m.hojaIdx}:${slot}`
    if (!cache.has(clave)) cache.set(clave, recortar(hojas[m.hojaIdx], slot))
    return cache.get(clave) || null
  }
  const dibujos = datos.paginas.flatMap((p) => p.filas.flat()).map(dibujo)

  /* ── El logo ──────────────────────────────────────────────────────────── */
  let logo: string
  try {
    logo = await cargarLogo()
  } catch {
    return { ok: false, errores: ['No se pudo cargar el logo de la orden (/logo-op.jpg).'], avisos }
  }

  /* ── El PDF ───────────────────────────────────────────────────────────── */
  let blob: Blob
  try {
    /* react-pdf pesa: se carga recién acá, cuando hay una orden para dibujar. */
    const [{ pdf }, { DocumentoOp }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('./DocumentoOp'),
    ])
    blob = await pdf(<DocumentoOp datos={datos} logo={logo} dibujos={dibujos} />).toBlob()
  } catch (err) {
    return {
      ok: false,
      errores: [`No se pudo armar el PDF: ${err instanceof Error ? err.message : String(err)}`],
      avisos,
    }
  }
  if (blob.size > TOPE_BYTES) {
    return {
      ok: false,
      errores: [
        `La orden pesa ${(blob.size / 1048576).toFixed(1)} MB y el máximo que se puede subir es 4,5 MB.`,
      ],
      avisos,
    }
  }

  /* ── A la OP ──────────────────────────────────────────────────────────── */
  const archivo = new File([blob], nombreArchivo(datos.obra, datos.nroOrden), { type: 'application/pdf' })
  try {
    await subirOpFinal(e.ordenId, archivo)
  } catch (err) {
    return {
      ok: false,
      errores: [`No se pudo adjuntar la orden en Monday: ${err instanceof Error ? err.message : String(err)}`],
      avisos,
      archivo,
    }
  }
  return { ok: true, errores: [], avisos, archivo }
}
