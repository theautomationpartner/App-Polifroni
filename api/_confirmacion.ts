/**
 * El enlace de confirmación que sale por WhatsApp, para la Orden de Producción y para el presupuesto.
 *
 *   https://app-polifroni.vercel.app/c/aZ3k…   (35 caracteres de código)
 *
 * Es CORTO a propósito: en el mensaje se ve entero. El código junta tres cosas, en base64url:
 *  - 1 letra:     el documento y quién confirma (`a` OP/Cliente, `b` OP/Constructor,
 *                 `c` presupuesto/Cliente, `d` presupuesto/Constructor).
 *  - 22 letras:   la clave (UUID) que la app generó al enviar y que queda guardada en Monday, en
 *                 `🤖Clave Confirmacion` de la OP o del subelemento del presupuesto: con ella
 *                 `/confirmar` encuentra el ítem. Cuando sale el mensaje el ítem puede no existir
 *                 todavía (nace al finalizar), por eso no viaja su id.
 *  - 12 letras:   la firma HMAC-SHA256 (recortada a 9 bytes) de las dos anteriores con
 *                 `CONFIRMACION_SECRET`. Sin el secreto no se puede armar un código válido ni cambiar
 *                 uno: otra clave u otro documento dan otra firma, y `/confirmar` lo rechaza. Con 72
 *                 bits, adivinarla probando es impracticable.
 *
 * El nombre del saludo no viaja: el servidor lo lee de Monday según quién confirma.
 *
 * Los enlaces largos del primer formato (`/confirmar?d=&c=&n=&t=`) se siguen aceptando.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type DocumentoConfirmacion = 'op' | 'presupuesto'
export type RolConfirmacion = 'Cliente' | 'Constructor'

export const DOCUMENTOS: readonly DocumentoConfirmacion[] = ['op', 'presupuesto']

/**
 * Dónde va el enlace en un texto que arma la app (el del presupuesto): el servidor pone acá el enlace
 * firmado. La misma marca está en `src/lib/claveConfirmacion.ts`.
 */
export const MARCA_ENLACE = '[[ENLACE_CONFIRMACION]]'

const url = (): string => process.env.CONFIRMACION_URL?.trim() ?? ''
const secreto = (): string => process.env.CONFIRMACION_SECRET?.trim() ?? ''

/** Sin la URL o sin el secreto no sale ningún mensaje con enlace: saldría uno que no funciona. */
export const confirmacionConfigurada = (): boolean => faltaConfiguracion() === null

/** Lo que falta configurar, para el código de error que ve el soporte. `null`: nada. */
export function faltaConfiguracion(): string | null {
  if (!url()) return 'ERROR_CONFIRMACION_URL'
  try {
    new URL(url())
  } catch {
    return 'ERROR_CONFIRMACION_URL'
  }
  if (secreto().length < 32) return 'ERROR_CONFIRMACION_SECRET'
  return null
}

/** Una clave como la genera la app (`nuevaClave`): un UUID, o 32 hexadecimales en navegadores viejos. */
export const esClave = (c: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) || /^[0-9a-f]{32}$/i.test(c)

export const esDocumento = (d: string): d is DocumentoConfirmacion => (DOCUMENTOS as readonly string[]).includes(d)

/** Las 32 cifras hexadecimales de la clave, sin guiones. */
const hexDe = (clave: string) => clave.replace(/-/g, '').toLowerCase()

/** Las dos formas en que puede estar guardada una clave en Monday: con guiones (UUID) y sin ellos. */
export function formasDeClave(clave: string): string[] {
  const h = hexDe(clave)
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  return [uuid, h]
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El código corto
 * ──────────────────────────────────────────────────────────────────────────────── */

const PREFIJO: Record<DocumentoConfirmacion, Record<RolConfirmacion, string>> = {
  op: { Cliente: 'a', Constructor: 'b' },
  presupuesto: { Cliente: 'c', Constructor: 'd' },
}
const DE_PREFIJO: Record<string, { documento: DocumentoConfirmacion; rol: RolConfirmacion }> = {
  a: { documento: 'op', rol: 'Cliente' },
  b: { documento: 'op', rol: 'Constructor' },
  c: { documento: 'presupuesto', rol: 'Cliente' },
  d: { documento: 'presupuesto', rol: 'Constructor' },
}

/** Bytes de la firma que van en el código: 9 bytes son 12 letras de base64url. */
const BYTES_FIRMA = 9
const LARGO_CODIGO = 1 + 22 + 12

function hmac(...partes: string[]): Buffer {
  const s = secreto()
  if (s.length < 32) throw new Error('falta CONFIRMACION_SECRET (32 caracteres o más)')
  /* Los campos van separados por un carácter que no puede aparecer en ninguno: así "a"+"bc" y "ab"+"c"
     no firman igual. */
  return createHmac('sha256', s).update(partes.join('\u0000')).digest()
}

const iguales = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export interface DatosEnlace {
  documento: DocumentoConfirmacion
  clave: string
  /** Quién confirma: decide a quién se saluda (el nombre se lee de Monday). */
  rol: RolConfirmacion
}

/** Lo que se lee de un enlace: con el formato viejo, el nombre venía en el enlace. */
export interface EnlaceLeido extends DatosEnlace {
  nombre: string | null
}

export function codigoConfirmacion({ documento, clave, rol }: DatosEnlace): string {
  if (!esClave(clave)) throw new Error('la clave de confirmación no es válida')
  const prefijo = PREFIJO[documento][rol]
  const h = hexDe(clave)
  const firma = hmac('c', prefijo, h).subarray(0, BYTES_FIRMA)
  return prefijo + Buffer.from(h, 'hex').toString('base64url') + firma.toString('base64url')
}

export function enlaceConfirmacion(d: DatosEnlace): string {
  const base = url()
  if (!base) throw new Error('falta CONFIRMACION_URL')
  /* De la variable vale el origen: sirve igual `https://app…/confirmar` que `https://app…`. */
  return `${new URL(base).origin}/c/${codigoConfirmacion(d)}`
}

/** El código, verificado. `null` si no tiene la forma o la firma no coincide. */
export function leerCodigo(codigo: string): DatosEnlace | null {
  if (codigo.length !== LARGO_CODIGO || !/^[A-Za-z0-9_-]+$/.test(codigo)) return null
  const tipo = DE_PREFIJO[codigo[0]]
  if (!tipo || !secreto()) return null
  const claveBytes = Buffer.from(codigo.slice(1, 23), 'base64url')
  const firma = Buffer.from(codigo.slice(23), 'base64url')
  if (claveBytes.length !== 16) return null
  const h = claveBytes.toString('hex')
  if (!iguales(hmac('c', codigo[0], h).subarray(0, BYTES_FIRMA), firma)) return null
  return { ...tipo, clave: formasDeClave(h)[0] }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El formato viejo: /confirmar?d=&c=&n=&t=
 * ──────────────────────────────────────────────────────────────────────────────── */

/** La firma del formato viejo, que llevaba el nombre en el enlace. */
export function firmarLargo(documento: DocumentoConfirmacion, clave: string, nombre: string): string {
  return createHmac('sha256', secreto()).update(['confirmar', documento, clave.toLowerCase(), nombre].join('\u0000')).digest('base64url')
}

/** Un enlace del formato viejo, verificado. Confirma quien lo recibió: se lo saluda por el nombre del enlace. */
export function leerEnlaceLargo(q: URLSearchParams): EnlaceLeido | null {
  const documento = q.get('d') ?? ''
  const clave = (q.get('c') ?? '').toLowerCase()
  const nombre = q.get('n') ?? ''
  const token = q.get('t') ?? ''
  if (!esDocumento(documento) || !esClave(clave) || nombre.length > 200 || !token || secreto().length < 32) return null
  if (!iguales(Buffer.from(firmarLargo(documento, clave, nombre)), Buffer.from(token))) return null
  return { documento, clave, rol: 'Cliente', nombre }
}
