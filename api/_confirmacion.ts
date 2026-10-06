/**
 * El enlace de confirmación que sale por WhatsApp, para la Orden de Producción y para el presupuesto.
 *
 *   https://app-polifroni.vercel.app/confirmar?d=op&c=<clave>&n=<nombre>&t=<token>
 *
 *  - `d`  el documento: `op` | `presupuesto`.
 *  - `c`  la clave (UUID) que la app generó al enviar y que queda guardada en Monday, en
 *         `🤖Clave Confirmacion` de la OP o del subelemento del presupuesto: con ella `/confirmar`
 *         encuentra el ítem. Cuando sale el mensaje el ítem puede no existir todavía (nace al
 *         finalizar), por eso no viaja su id.
 *  - `n`  el nombre de quien confirma, para saludarlo.
 *  - `t`  la firma HMAC-SHA256 de los tres anteriores con `CONFIRMACION_SECRET`. Sin el secreto no se
 *         puede armar un enlace válido ni cambiar uno: otra clave, otro documento u otro nombre dan
 *         otra firma, y `/confirmar` lo rechaza.
 *
 * Ninguna URL interna (Make, Monday) aparece en el mensaje ni en el formulario.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type DocumentoConfirmacion = 'op' | 'presupuesto'

export const DOCUMENTOS: readonly DocumentoConfirmacion[] = ['op', 'presupuesto']

/**
 * Dónde va el enlace en el texto del presupuesto: el texto lo arma la app (`textoPresupuesto`) y el
 * servidor pone acá el enlace firmado. La misma marca está en `src/lib/presupuesto.ts`.
 */
export const MARCA_ENLACE = '[[ENLACE_CONFIRMACION]]'

const url = (): string => process.env.CONFIRMACION_URL?.trim() ?? ''
const secreto = (): string => process.env.CONFIRMACION_SECRET?.trim() ?? ''

/** Sin la URL o sin el secreto no sale ningún mensaje con enlace: saldría uno que no funciona. */
export const confirmacionConfigurada = (): boolean => !!url() && secreto().length >= 32

/** Lo que falta configurar, para el código de error que ve el soporte. `null`: nada. */
export function faltaConfiguracion(): string | null {
  if (!url()) return 'ERROR_CONFIRMACION_URL'
  if (secreto().length < 32) return 'ERROR_CONFIRMACION_SECRET'
  return null
}

/** Una clave como la genera la app (`nuevaClave`): un UUID, o 32 hexadecimales en navegadores viejos. */
export const esClave = (c: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) || /^[0-9a-f]{32}$/i.test(c)

export const esDocumento = (d: string): d is DocumentoConfirmacion => (DOCUMENTOS as readonly string[]).includes(d)

/** "1111 - CLIENTE TEST" → "CLIENTE TEST": el código de la cuenta no va en un saludo. */
const sinCodigo = (n: string) => n.replace(/^\d+\s*-\s*/, '').trim()

/* Los campos van separados por un carácter que no puede aparecer en ninguno: así "a"+"bc" y "ab"+"c"
   no firman igual. */
const SEP = '\u0000'

export function firmar(documento: DocumentoConfirmacion, clave: string, nombre: string): string {
  const s = secreto()
  if (s.length < 32) throw new Error('falta CONFIRMACION_SECRET (32 caracteres o más)')
  return createHmac('sha256', s).update(['confirmar', documento, clave.toLowerCase(), nombre].join(SEP)).digest('base64url')
}

/** ¿La firma corresponde a estos datos? Compara en tiempo constante. */
export function firmaValida(documento: DocumentoConfirmacion, clave: string, nombre: string, token: string): boolean {
  if (!token || !secreto()) return false
  const esperada = Buffer.from(firmar(documento, clave, nombre))
  const recibida = Buffer.from(token)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

export interface DatosEnlace {
  documento: DocumentoConfirmacion
  clave: string
  /** Quien confirma: el saludo del formulario. */
  nombre: string
}

export function enlaceConfirmacion({ documento, clave, nombre }: DatosEnlace): string {
  const base = url()
  if (!base) throw new Error('falta CONFIRMACION_URL')
  if (!esClave(clave)) throw new Error('la clave de confirmación no es válida')
  const n = sinCodigo(nombre)
  const q = new URLSearchParams({ d: documento, c: clave.toLowerCase(), n, t: firmar(documento, clave, n) })
  return `${base}?${q.toString()}`
}

/** Lo que trae el enlace, ya verificado. `null` si falta algo o la firma no coincide. */
export function leerEnlace(q: URLSearchParams): DatosEnlace | null {
  const documento = q.get('d') ?? ''
  const clave = (q.get('c') ?? '').toLowerCase()
  const nombre = q.get('n') ?? ''
  const token = q.get('t') ?? ''
  if (!esDocumento(documento) || !esClave(clave) || nombre.length > 200) return null
  return firmaValida(documento, clave, nombre, token) ? { documento, clave, nombre } : null
}
