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
 * Todavía no hay autenticación de usuario: cuando la haya, cambia este módulo y sus funciones, y
 * ninguna vista se entera.
 */

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
 * Las cabeceras de cada pedido.
 *
 * La Authorization se manda SÓLO en desarrollo, que es cuando el destino real es api.monday.com.
 * En producción la pone el servidor: mandarla desde acá sería volver a meter el token en el
 * navegador, que es justamente lo que estas dos rutas existen para evitar.
 */
function cabeceras(extra: Record<string, string> = {}): Record<string, string> {
  if (!DEV) return extra
  return { ...extra, Authorization: TOKEN ?? '', 'API-Version': API_VERSION }
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
