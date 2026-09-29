/**
 * Acceso a la API de Monday (GraphQL) por HTTP.
 *
 * Hay DOS caminos, y la diferencia es dónde vive el token:
 *
 * - En desarrollo se pega contra `/monday-api`, el proxy de Vite hacia api.monday.com. El token
 *   sale de `.env.local` (`VITE_MONDAY_TOKEN`) y viaja en la Authorization. Es cómodo y no sale de
 *   tu máquina.
 * - En producción se pega contra `/api/monday`, una Serverless Function (ver `api/monday.ts`) que
 *   pone el token del lado servidor (`MONDAY_TOKEN`, SIN prefijo `VITE_`). Así el token nunca entra
 *   en el bundle que se descarga el navegador: con `VITE_MONDAY_TOKEN` en producción, cualquiera
 *   que abra la página podría leerlo del JavaScript y usarlo contra los tableros.
 *
 * Los archivos no van por el endpoint GraphQL —Monday los recibe en `/v2/file`, por multipart—, así
 * que tienen su propio par de rutas.
 *
 * ── Autorización (las tres capas) ──
 * En producción la Authorization NO lleva un token de Monday sino el *session token* del usuario
 * (`Bearer <jwt>`, ver `src/lib/mondayAuth.ts`). Es lo que le permite al backend saber QUIÉN pide:
 * verifica la firma, consulta la lista blanca y exige el segundo factor antes de gastar el token del
 * servidor. El dispositivo del segundo factor viaja aparte, en `X-Device-Token`. En desarrollo la app
 * pega directo contra Monday por el proxy de Vite con el token de `.env.local`, y ninguna de las tres
 * capas existe.
 */
import { leerDeviceToken, olvidarDeviceToken } from '@/lib/deviceToken'
import { notificarErrorSeguridad, type ClaseErrorSeguridad } from '@/lib/errorSeguridad'
import { getSessionToken, invalidarSessionToken, sessionTokenEnCache } from '@/lib/mondayAuth'

const DEV = import.meta.env.DEV

/**
 * Token local, SÓLO para desarrollo.
 *
 * La lectura va adentro del `DEV ?` a propósito. Vite reemplaza `import.meta.env.VITE_*` por su
 * valor literal al compilar: si la lectura estuviera suelta, el token quedaría escrito dentro del
 * JavaScript publicado —visible para cualquiera que abra la página— con sólo tener esa variable
 * definida en el entorno del build. Colgada de `DEV`, en producción la rama entera es código
 * muerto y el compilador la borra: aunque alguien cargue `VITE_MONDAY_TOKEN` en Vercel por error,
 * no llega al navegador.
 */
const TOKEN = DEV ? (import.meta.env.VITE_MONDAY_TOKEN as string | undefined)?.trim() || undefined : undefined

const ENDPOINT = DEV ? '/monday-api' : '/api/monday'
const ENDPOINT_ARCHIVO = DEV ? '/monday-api-file' : '/api/monday-upload'
const API_VERSION = '2024-10'

/** Host del bucket donde Monday guarda los archivos de las columnas file. */
const FILES_HOST = 'https://files-monday-com.s3.amazonaws.com'

/**
 * En desarrollo hay acceso a Monday sólo si hay token local; en producción lo resuelve el servidor,
 * así que se asume habilitado (y si falta `MONDAY_TOKEN` en el entorno, la función lo dice).
 */
export const mondayHabilitado = (): boolean => (DEV ? Boolean(TOKEN) : true)

/**
 * La `public_url` de un asset apunta a S3, que no manda cabeceras CORS: leerla desde el navegador
 * falla. Se reescribe al proxy del mismo origen, que sí puede traer los bytes para el visor.
 */
export function urlArchivo(url: string): string {
  if (!url.startsWith(FILES_HOST)) return url
  if (DEV) return `/monday-files${url.slice(FILES_HOST.length)}`
  return `/api/monday-file?u=${encodeURIComponent(url)}`
}

interface ApiError {
  message: string
  extensions?: { code?: string }
}

/** Monday respondió con `errors`. Conserva los errores tal como vinieron, no sólo el texto. */
export class MondayApiError extends Error {
  readonly errores: ApiError[]
  constructor(errores: ApiError[]) {
    super(errores.map((e) => e.message).join(' · '))
    this.name = 'MondayApiError'
    this.errores = errores
  }
}

/**
 * El backend rechazó al usuario: o no pudo probar quién es (401) o no está habilitado (403). No es
 * un fallo de la API y se muestra distinto: reintentar no cambia nada, hay que pedir el alta.
 */
const MENSAJE_RECHAZO: Record<number, string> = {
  401: 'Tu sesión de Monday no pudo verificarse. Recargá la app.',
  403: 'No tenés acceso habilitado a esta app. Pedile el alta al administrador.',
  429: 'Demasiados intentos. Esperá 15 minutos y volvé a probar.',
}

export class AccesoDenegado extends Error {
  constructor(public readonly status: number) {
    super(MENSAJE_RECHAZO[status] ?? 'No se pudo verificar tu acceso a esta app.')
    this.name = 'AccesoDenegado'
  }
}

/** Falta el segundo factor: tiene arreglo, y lo tiene el propio usuario (volver a verificar). */
export class SegundoFactorRequerido extends Error {
  constructor() {
    super('Necesitás verificar tu segundo factor para seguir.')
    this.name = 'SegundoFactorRequerido'
  }
}

/**
 * La Authorization de cada pedido: en desarrollo el token local (el destino es api.monday.com por
 * el proxy de Vite); en producción, el session token del usuario.
 *
 * Devuelve un `string` cuando ya se sabe —así el `fetch` sale en el mismo turno— y una promesa sólo
 * la primera vez, cuando todavía hay que pedirle el token al contenedor de Monday.
 */
function autorizacion(): string | Promise<string> {
  if (DEV) return TOKEN ?? ''
  const enCache = sessionTokenEnCache()
  if (enCache !== undefined) return enCache ? `Bearer ${enCache}` : ''
  return getSessionToken().then((token) => (token ? `Bearer ${token}` : ''))
}

/** Las cabeceras de cada pedido a Monday: la Authorization, la versión y el dispositivo. */
function cabeceras(auth: string, extra: Record<string, string> = {}): Record<string, string> {
  const device = leerDeviceToken()
  return {
    ...extra,
    ...(auth ? { Authorization: auth } : {}),
    ...(DEV ? { 'API-Version': API_VERSION } : {}),
    ...(device && !DEV ? { 'X-Device-Token': device } : {}),
  }
}

/**
 * Cabeceras autenticadas para NUESTROS endpoints (`/api/*`): la sesión, el segundo factor, los
 * escenarios de Make, la numeración y el índice de obras. Existe para que ningún pedido se olvide de
 * la credencial: sin ella, el backend lo rechaza como a un desconocido.
 */
export async function cabecerasPropias(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  if (DEV) return extra
  const auth = autorizacion()
  const device = leerDeviceToken()
  return {
    ...extra,
    Authorization: typeof auth === 'string' ? auth : await auth,
    ...(device ? { 'X-Device-Token': device } : {}),
  }
}

/** Un intento, con el `fetch` disparado apenas se sabe la Authorization. */
function conAutorizacion(url: string, init: (auth: string) => RequestInit): Promise<Response> {
  const auth = autorizacion()
  return typeof auth === 'string' ? fetch(url, init(auth)) : auth.then((a) => fetch(url, init(a)))
}

/**
 * Reintenta UNA vez ante un 401 con el token renovado: el caso real es un token que venció antes de
 * lo calculado (relojes corridos). Un 403 no se reintenta: la firma estaba bien y no va a cambiar.
 */
async function pedir(url: string, init: (auth: string) => RequestInit): Promise<Response> {
  const res = await conAutorizacion(url, init)
  if (res.status !== 401 || DEV) return res
  invalidarSessionToken()
  return conAutorizacion(url, init)
}

/**
 * Traduce el rechazo del backend. Si trae la pista `mfa`, lo que falta es el segundo factor y no el
 * permiso: se tira el dispositivo guardado —seguir mandando uno muerto no lleva a nada— y se lanza el
 * error que la pantalla sabe interpretar. Un 5xx de NUESTRO backend también se avisa: una pantalla
 * que se ve entera pero donde nada funciona es peor que un cartel.
 */
export async function verificarRespuesta(res: Response, contexto: string): Promise<void> {
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    const cuerpo = (await res.clone().json().catch(() => ({}))) as { codigo?: string }
    const clase = claseDeRechazo(res.status, cuerpo.codigo)

    if (clase === 'segundoFactor') olvidarDeviceToken()
    notificarErrorSeguridad(clase, res.status)

    if (clase === 'segundoFactor') throw new SegundoFactorRequerido()
    throw new AccesoDenegado(res.status)
  }
  if (!DEV && res.status >= 500 && res.status !== 502 && res.status !== 504) {
    notificarErrorSeguridad('servidor', res.status)
  }
  if (!res.ok) throw new Error(`${contexto} HTTP ${res.status}`)
}

/**
 * Qué pantalla corresponde según lo que el servidor dice que falló: al servidor le falta
 * configuración, la credencial no vale, o el usuario no está dado de alta. Sin el `codigo` los tres
 * se verían como el mismo 401 mudo.
 */
function claseDeRechazo(status: number, codigo: string | undefined): ClaseErrorSeguridad {
  if (codigo === 'mfa') return 'segundoFactor'
  if (codigo === 'no_habilitado') return 'sinPermiso'
  if (codigo === 'config') return 'configuracion'
  if (status === 429) return 'demasiadosIntentos'
  return status === 401 ? 'sesion' : 'sinPermiso'
}

/** Ejecuta una query/mutation contra la API y devuelve `data`; lanza si Monday rechaza. */
export async function mondayApi<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cuerpo = JSON.stringify({ query, variables: variables ?? {} })
  const res = await pedir(ENDPOINT, (auth) => ({
    method: 'POST',
    headers: cabeceras(auth, { 'Content-Type': 'application/json' }),
    body: cuerpo,
  }))
  await verificarRespuesta(res, 'Monday API')
  const json = (await res.json()) as { data?: T; errors?: ApiError[] }
  if (json.errors?.length) throw new MondayApiError(json.errors)
  if (!json.data) throw new Error('Monday no devolvió datos.')
  return json.data
}

/**
 * Sube un archivo a una columna `file`. Es el ÚNICO camino: por `column_values` sólo viaja JSON,
 * el binario va en multipart. El `Content-Type` no se setea a mano —lo arma el navegador con su
 * `boundary`—.
 */
export async function mondaySubirArchivo<T>(query: string, archivo: File): Promise<T> {
  /* El `FormData` se arma de nuevo en cada intento: un cuerpo ya consumido no se puede reenviar, y
     el reintento por token vencido necesita uno entero. */
  const res = await pedir(ENDPOINT_ARCHIVO, (auth) => {
    const form = new FormData()
    form.append('query', query)
    form.append('variables[file]', archivo, archivo.name)
    return { method: 'POST', headers: cabeceras(auth), body: form }
  })
  await verificarRespuesta(res, 'Monday API (archivos)')
  const json = (await res.json()) as { data?: T; errors?: ApiError[] }
  if (json.errors?.length) throw new MondayApiError(json.errors)
  if (!json.data) throw new Error('Monday no devolvió datos al subir el archivo.')
  return json.data
}
