/**
 * La ruta de `/confirmar`: el enlace que le llega por WhatsApp a quien confirma una Orden de Producción
 * o un presupuesto. La usan la función de Vercel (`api/confirmar.ts`, con el rewrite de `vercel.json`)
 * y el servidor de Vite en desarrollo.
 *
 *   GET  /confirmar?d=&c=&n=&t=   el formulario (o "ya respondido" si ya no espera respuesta)
 *   POST /confirmar?d=&c=&n=&t=   la respuesta (application/x-www-form-urlencoded):
 *                                 respuesta = confirmar | rechazar, motivo, ubicacion, coordinador
 *
 * Es PÚBLICA: quien la abre es el cliente, sin sesión de Monday. La protección es el enlace mismo:
 *  1. La firma (`t`) se verifica antes de nada (ver `_confirmacion.ts`): un enlace cambiado no pasa.
 *  2. El documento se busca en Monday por la clave del enlace, nunca por un id del navegador.
 *  3. Antes de escribir se relee el estado: sólo responde un documento que todavía espera respuesta,
 *     así un doble clic o un enlace abierto dos veces no escriben dos veces.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { esDocumento, leerEnlace } from './_confirmacion.js'
import { buscarDocumento, leerRespuesta, registrarRespuesta } from './_confirmarMonday.js'
import { paginaAviso, paginaFormulario, paginaGracias, paginaVistaPrevia, paginaYaRespondido } from './_confirmarPaginas.js'

type Pedido = IncomingMessage & { body?: unknown }

/** Los bots que abren el enlace para armar la vista previa: no llegan a Monday. */
const BOT = /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot/i

/** Un cuerpo de formulario no necesita más: motivo (1000) + ubicación + coordinador, codificados. */
const TOPE_CUERPO = 16 * 1024

const ENLACE_INVALIDO = paginaAviso.bind(
  null,
  'El enlace no es válido',
  'Puede que se haya copiado incompleto. Abrilo de nuevo desde el mensaje de WhatsApp; si sigue sin funcionar, respondé al mensaje y te ayudamos.',
)

export async function manejarConfirmar(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, POST')
    return html(res, 405, paginaAviso('Método no permitido', 'Abrí el enlace desde el mensaje de WhatsApp.'))
  }
  const url = new URL(req.url ?? '/', 'http://local')
  const q = url.searchParams

  if (req.method !== 'POST' && BOT.test(String(req.headers['user-agent'] ?? ''))) {
    const d = q.get('d') ?? ''
    return html(res, 200, paginaVistaPrevia(esDocumento(d) ? d : null, origenDe(req)))
  }

  const enlace = leerEnlace(q)
  if (!enlace) return html(res, 400, ENLACE_INVALIDO())
  /* El formulario se manda a la misma dirección, con la firma: el POST se verifica igual que el GET.
     La ruta va fija: según quién atienda (el rewrite de Vercel, el `use` de Vite) `req.url` puede
     traer `/api/confirmar` o sólo `/`. */
  const accion = `/confirmar?${q.toString()}`
  const que = enlace.documento === 'op' ? 'la orden' : 'el presupuesto'

  try {
    const doc = await buscarDocumento(enlace.documento, enlace.clave)
    if (!doc) {
      return html(
        res,
        404,
        paginaAviso(
          `No encontramos ${que}`,
          `Puede que todavía se esté registrando: probá de nuevo en unos minutos. Si sigue sin aparecer, respondé al mensaje de WhatsApp y te ayudamos.`,
          'revisar',
        ),
      )
    }

    if (req.method !== 'POST') {
      return html(res, 200, doc.situacion === 'pendiente' ? paginaFormulario({ doc, nombre: enlace.nombre, accion }) : paginaYaRespondido(doc))
    }

    let campos: Record<string, string>
    try {
      campos = await leerCampos(req)
    } catch {
      return html(res, 400, paginaAviso('No pudimos leer tu respuesta', 'Volvé a abrir el enlace desde el mensaje de WhatsApp e intentá de nuevo.'))
    }
    if (doc.situacion !== 'pendiente') return html(res, 409, paginaYaRespondido(doc))
    const leida = leerRespuesta(enlace.documento, campos)
    if (!leida.ok) {
      return html(res, 422, paginaFormulario({ doc, nombre: enlace.nombre, accion, previo: campos, error: leida.error }))
    }
    await registrarRespuesta(doc, enlace.nombre, leida.respuesta)
    return html(res, 200, paginaGracias(doc, enlace.nombre, leida.respuesta))
  } catch (e) {
    console.error('[confirmar]', e)
    return html(
      res,
      502,
      paginaAviso(
        'No pudimos registrar tu respuesta',
        'Tuvimos un problema momentáneo. Volvé a abrir el enlace en unos minutos e intentá de nuevo; si sigue fallando, respondé al mensaje de WhatsApp.',
      ),
    )
  }
}

/** `https://app-polifroni.vercel.app`, para el logo de la vista previa (necesita una URL absoluta). */
function origenDe(req: Pedido): string {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim()
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return ''
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim()
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}

/**
 * El cuerpo del formulario. Se lee el stream ANTES de tocar `req.body`: en Vercel ese campo es un
 * getter que, al leerlo, consume el stream. Si el stream ya vino vacío, se usa lo que haya dejado.
 */
async function leerCampos(req: Pedido): Promise<Record<string, string>> {
  const partes: Buffer[] = []
  let total = 0
  for await (const trozo of req) {
    total += trozo.length
    if (total > TOPE_CUERPO) throw new Error('cuerpo demasiado grande')
    partes.push(Buffer.from(trozo))
  }
  const crudo = Buffer.concat(partes).toString('utf8')
  if (crudo) return Object.fromEntries(new URLSearchParams(crudo))
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Object.fromEntries(Object.entries(req.body as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
  }
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body))
  return {}
}

function html(res: ServerResponse, status: number, cuerpo: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('x-robots-tag', 'noindex, nofollow')
  res.end(cuerpo)
}
