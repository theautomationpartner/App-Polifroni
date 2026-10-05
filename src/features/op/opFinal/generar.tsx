/**
 * Arma la Orden de Producción final en el navegador. NO la sube a Monday: queda en la app, se
 * envía desde ahí y se adjunta a la OP recién al finalizar la operación (ver `registrarPvc`).
 *
 * Reemplaza al escenario de generación entero: la lectura la hace Claude (`/api/hetmo?modo=listado`)
 * y las hojas, el armado de datos y el PDF se hacen acá.
 *
 * Todo lo que el documento necesita se valida ANTES de dibujar: si falta algo que la orden no
 * puede llevar vacía (la obra, la dirección, el número, la lectura), no se genera y se dice qué
 * falta. Lo que la IA no pudo leer de un modelo sale con una raya y se avisa.
 */
import { LIMITE_EFECTIVO } from '@/services/monday/subidaArchivos'
import { armarDatosOp, type EntradaOp, type ModeloOp } from './datos'
import { cargarHojas, recortar, type Dibujo } from './hojas'

/** El tope de subida a Monday por Vercel (4,5 MB, con el margen del multipart): se valida acá para
    no generar una orden que después no se pueda adjuntar (ver `subidaArchivos.ts`). */
const TOPE_BYTES = LIMITE_EFECTIVO
const LOGO = '/logo-polifroni.png'

export interface EntradaGenerar extends EntradaOp {
  /** La Orden HETMO cargada en la app: de ahí salen los dibujos. */
  hetmo: File | null
  /** El documento fue una foto, pasada a PDF al cargarla: su única hoja no se recorta por mitades. */
  deFoto?: boolean
}

export interface ResultadoGenerar {
  ok: boolean
  errores: string[]
  avisos: string[]
  /** El PDF armado. */
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
  if (!e.hetmo) errores.push('Falta el PDF de HETMO: de ahí salen los dibujos.')
  if (!datos || errores.length) return { ok: false, errores, avisos }

  /* ── Los dibujos ──────────────────────────────────────────────────────── */
  let hojas: HTMLCanvasElement[]
  try {
    hojas = await cargarHojas(e.hetmo as File)
  } catch (err) {
    return {
      ok: false,
      errores: [`No se pudo leer el PDF original: ${err instanceof Error ? err.message : String(err)}`],
      avisos,
    }
  }
  if (datos.hojasNecesarias > hojas.length) {
    avisos.push(
      `Faltan los dibujos de algunos modelos porque la IA los ubicó hasta la hoja ${datos.hojasNecesarias}, pero el documento de HETMO tiene ${hojas.length} ${hojas.length === 1 ? 'hoja' : 'hojas'}, por eso esos modelos van sin dibujo. Verificá que el documento cargado en el paso anterior esté completo y volvé a generar una OP Final.`,
    )
  }
  /* Una foto no se recorta por mitades: se muestra entera. */
  const esFoto = !!e.deFoto || !/\.pdf$/i.test((e.hetmo as File).name)
  const cache = new Map<string, Dibujo | null>()
  const dibujo = (m: ModeloOp): Dibujo | null => {
    if (m.hojaIdx == null || !hojas[m.hojaIdx]) return null
    const slot = esFoto ? 'full' : m.slot
    const clave = `${m.hojaIdx}:${slot}`
    if (!cache.has(clave)) cache.set(clave, recortar(hojas[m.hojaIdx], slot))
    return cache.get(clave) ?? null
  }
  const dibujos = datos.paginas.flatMap((p) => p.filas.flat()).map(dibujo)

  /* ── El logo ──────────────────────────────────────────────────────────── */
  let logo: string
  try {
    logo = await cargarLogo()
  } catch {
    return { ok: false, errores: ['No se pudo cargar el logo de la orden (/logo-polifroni.png).'], avisos }
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

  const archivo = new File([blob], nombreArchivo(datos.obra, datos.nroOrden), { type: 'application/pdf' })
  return { ok: true, errores: [], avisos, archivo }
}
