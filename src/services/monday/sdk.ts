/**
 * Acceso a la API de Monday (GraphQL) por HTTP.
 *
 * En local se pega contra `/monday-api`, el proxy de Vite hacia api.monday.com: evita el CORS del
 * navegador y deja el token en `.env.local` (VITE_MONDAY_TOKEN). Los archivos NO van por el mismo
 * endpoint —Monday los recibe en `/v2/file`, por multipart— así que tienen el suyo.
 *
 * Todavía no hay autenticación de usuario (es la etapa que viene): cuando la haya, este módulo es
 * el que cambia —endpoint `/api/monday` con el token del lado servidor—, y ninguna vista se entera.
 */

const TOKEN = (import.meta.env.VITE_MONDAY_TOKEN as string | undefined)?.trim() || undefined

const ENDPOINT = '/monday-api'
const ENDPOINT_ARCHIVO = '/monday-api-file'
const API_VERSION = '2024-10'

/** Host del bucket donde Monday guarda los archivos de las columnas file. */
const FILES_HOST = 'https://files-monday-com.s3.amazonaws.com'

/** Sin token no hay nada que hacer: la app lo dice en pantalla en vez de fallar consulta por consulta. */
export const mondayHabilitado = (): boolean => Boolean(TOKEN)

/**
 * La `public_url` de un asset apunta a S3, que no manda cabeceras CORS: leerla desde el navegador
 * falla. Se reescribe al proxy del mismo origen, que sí puede traer los bytes para el visor.
 */
export function urlArchivo(url: string): string {
  if (!url.startsWith(FILES_HOST)) return url
  return `/monday-files${url.slice(FILES_HOST.length)}`
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

function cabeceras(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    Authorization: TOKEN ?? '',
    'API-Version': API_VERSION,
  }
}

/** Ejecuta una query/mutation contra la API y devuelve `data`; lanza si Monday rechaza. */
export async function mondayApi<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, variables: variables ?? {} }),
  })
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`)
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
  const form = new FormData()
  form.append('query', query)
  form.append('variables[file]', archivo, archivo.name)

  const res = await fetch(ENDPOINT_ARCHIVO, {
    method: 'POST',
    headers: cabeceras(),
    body: form,
  })
  if (!res.ok) throw new Error(`Monday API (archivos) HTTP ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: ApiError[] }
  if (json.errors?.length) throw new MondayApiError(json.errors)
  if (!json.data) throw new Error('Monday no devolvió datos al subir el archivo.')
  return json.data
}
