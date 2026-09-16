/**
 * Serverless Function (Vercel) — proxy de los archivos de Monday (bucket S3).
 *
 * La `public_url` de un asset apunta a S3, que no manda cabeceras CORS y además firma la dirección
 * como DESCARGA (`content-disposition: attachment`). Sin este intermediario, el visor de la app no
 * puede mostrar el PDF: el navegador o lo bloquea o se lo lleva al disco. Acá se traen los bytes
 * del lado servidor, se devuelven por el mismo origen y se quita esa cabecera.
 *
 * Uso: `/api/monday-file?u=<url de S3 url-encodeada>`. Equivale al proxy de Vite `/monday-files`.
 *
 * Sólo se aceptan direcciones del host de archivos de Monday: así esto no puede usarse como proxy
 * abierto hacia cualquier servidor (SSRF).
 */
export const config = { runtime: 'edge' }

const FILES_HOST = 'https://files-monday-com.s3.amazonaws.com'

export default async function handler(req: Request): Promise<Response> {
  const u = new URL(req.url).searchParams.get('u')
  if (!u || !u.startsWith(FILES_HOST)) {
    return new Response('Bad Request', { status: 400 })
  }

  const upstream = await fetch(u)
  if (!upstream.ok || !upstream.body) {
    return new Response('Upstream Error', { status: upstream.status || 502 })
  }

  const headers = new Headers()
  const ct = upstream.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  /* Sin `content-disposition`: el archivo se muestra embebido. Para bajarlo está el enlace
     "Abrir en otra pestaña" del visor. */
  headers.set('cache-control', 'private, max-age=60')

  return new Response(upstream.body, { status: 200, headers })
}
