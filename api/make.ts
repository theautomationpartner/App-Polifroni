/**
 * Serverless Function (Vercel) — disparo de los escenarios de Make.
 *
 * El navegador pide `/api/make?escenario=leer-documento` y esta función reenvía el cuerpo al
 * webhook que corresponda. Las URLs viven en variables de entorno del SERVIDOR, así que ni el hook
 * ni su secreto quedan escritos en el JavaScript que se descarga cualquiera que abra la página; y
 * de paso se evita el CORS, porque el hook de Make no manda cabeceras para pedidos de otro origen.
 *
 * Equivale a las rutas `/make/*` del proxy de Vite en desarrollo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Los únicos escenarios que se pueden disparar, y de qué variable sale la URL de cada uno. */
const ESCENARIOS: Record<string, string> = {
  'leer-documento': 'MAKE_WEBHOOK_LEER_DOC',
  'enviar-op-cliente': 'MAKE_WEBHOOK_ENVIAR_OP',
  'enviar-op-taller': 'MAKE_WEBHOOK_TALLER',
}

type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  const escenario = new URL(req.url ?? '', 'http://local').searchParams.get('escenario') ?? ''
  const variable = ESCENARIOS[escenario]

  /* GET sólo contesta si el escenario TIENE una URL cargada, sin decir cuál. Existe porque la
     pregunta "¿por qué no se disparó nada?" no se puede contestar disparando: eso mandaría un
     mensaje de verdad. Nunca devuelve la URL ni ningún secreto. */
  if (req.method === 'GET') {
    if (!variable) return responder(res, 400, { error: 'Escenario desconocido.', escenario })
    return responder(res, 200, {
      escenario,
      variable,
      configurado: Boolean(process.env[variable]?.trim()),
    })
  }

  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
  /* Una lista cerrada: el cliente elige ENTRE escenarios conocidos, no manda una URL. Si pudiera
     mandarla, esta ruta serviría para pegarle a cualquier servidor desde nuestro dominio. */
  if (!variable) return responder(res, 400, { error: 'Escenario desconocido.' })

  const url = process.env[variable]?.trim()
  /* 404 a propósito: es la misma respuesta que da el proxy de Vite cuando la URL no está cargada,
     así la app muestra el mismo aviso de "falta configurar el escenario" en los dos entornos. */
  if (!url) {
    return responder(res, 404, { error: `Falta configurar ${variable} en el servidor.` })
  }

  try {
    const body = await leerCuerpo(req)
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      /* Del otro lado hay un módulo de IA leyendo un PDF. El tope lo pone igual la plataforma
         (`maxDuration`), pero sin esto el fetch se cortaría antes por su cuenta. */
      signal: AbortSignal.timeout(170_000),
    })

    const texto = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'text/plain')
    res.end(texto)
  } catch (e) {
    console.error('[api/make]', escenario, e)
    responder(res, 502, { error: 'El escenario de Make no respondió.' })
  }
}

async function leerCuerpo(req: Pedido): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)

  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  return Buffer.concat(partes).toString('utf8')
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
