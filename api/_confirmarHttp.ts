/**
 * La ruta del enlace de confirmación que le llega por WhatsApp a quien confirma una Orden de
 * Producción o un presupuesto. La usan la función de Vercel (`api/confirmar.ts`, con los rewrites de
 * `vercel.json`) y el servidor de Vite en desarrollo.
 *
 *   GET  /c/<código>   el formulario de confirmación del documento; si ya se respondió, su
 *                      agradecimiento
 *   POST /c/<código>   la respuesta (application/x-www-form-urlencoded, los campos de los formularios):
 *                      estado_obra = "Confirmar" | "No confirmar", motivo y, en el presupuesto,
 *                      ubicacion y coordinador
 *
 * El formato largo del primer enlace (`/confirmar?d=&c=&n=&t=`) se sigue atendiendo igual.
 *
 * Es PÚBLICA: quien la abre es el cliente, sin sesión de Monday. La protección es el enlace mismo:
 *  1. La firma se verifica antes de nada (ver `_confirmacion.ts`): un enlace cambiado no pasa.
 *  2. El documento se busca en Monday por la clave del enlace, nunca por un id del navegador.
 *  3. Antes de escribir se relee el estado: sólo responde un documento que todavía espera respuesta,
 *     así un doble clic o un enlace abierto dos veces no escriben dos veces.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import { leerCodigo, leerEnlaceLargo, type DocumentoConfirmacion, type EnlaceLeido } from './_confirmacion.js'
import { buscarDocumento, leerRespuesta, registrarRespuesta, type Documento } from './_confirmarMonday.js'
import { conVistaPrevia, paginaAviso, paginaFormulario, paginaRespuesta, paginaVistaPrevia } from './_confirmarPaginas.js'

type Pedido = IncomingMessage & { body?: unknown }

/** Los bots que abren el enlace para armar la vista previa: no llegan a Monday. */
const BOT =
  /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|bot\b|crawler|spider|preview|embed|iframely/i

/**
 * Quién abre el enlace sólo para armar la vista previa. No son únicamente los bots que se presentan
 * como tales: el envío por 360messenger es una sesión de WhatsApp Web, y la vista previa la arma el
 * que manda, bajando la página con un cliente HTTP cualquiera (sin "Mozilla/") y esperando apenas unos
 * segundos. Si recibe el formulario —que primero consulta Monday— no llega a tiempo y el mensaje
 * queda con el dominio pelado. Todos los navegadores de verdad (también el de WhatsApp) mandan
 * "Mozilla/": lo que no lo manda recibe al instante la vista previa, sin tocar Monday.
 */
const esVistaPrevia = (ua: string) => BOT.test(ua) || !/\bMozilla\//.test(ua)

/** Un cuerpo de formulario no necesita más: el motivo (1000 caracteres), codificado. */
const TOPE_CUERPO = 16 * 1024

const enlaceInvalido = () =>
  paginaAviso(
    'El enlace no es válido',
    'Puede que se haya copiado incompleto. Abrilo de nuevo desde el mensaje de WhatsApp; si sigue sin funcionar, respondé al mensaje y te ayudamos.',
  )

/**
 * El enlace del pedido y a dónde vuelve el formulario. El código corto llega distinto según quién
 * atienda: en la ruta (`/c/<código>`, o sólo `/<código>` desde el `use` de Vite) o, por el rewrite de
 * Vercel, como `?codigo=`.
 */
function enlaceDe(url: URL): { enlace: EnlaceLeido; accion: string } | null {
  const codigo = url.searchParams.get('codigo') ?? url.pathname.match(/([A-Za-z0-9_-]{35})\/?$/)?.[1] ?? ''
  if (codigo) {
    const d = leerCodigo(codigo)
    return d ? { enlace: { ...d, nombre: null }, accion: `/c/${codigo}` } : null
  }
  const largo = leerEnlaceLargo(url.searchParams)
  return largo ? { enlace: largo, accion: `/confirmar?${url.searchParams.toString()}` } : null
}

/** El formulario de confirmación del documento (el de la OP o el del presupuesto). */
const formulario = (doc: Documento, accion: string) =>
  paginaFormulario({ documento: doc.documento, nombre: doc.nombre, accion, coordinadores: doc.coordinadores })

/**
 * Lo que se muestra de un documento que ya no espera respuesta: si ya se respondió, el agradecimiento
 * de ESE documento con lo que se respondió; si no, un aviso.
 */
function paginaSinRespuesta(doc: Documento): string {
  const op = doc.documento === 'op'
  /* Gana un solo presupuesto por bolsa: si ya se confirmó otro, éste ya no se responde. */
  if (doc.situacion === 'pendiente' && doc.otroConfirmado) {
    return paginaAviso(
      'Ya confirmaste otro presupuesto',
      'Quedó confirmado otro de los presupuestos que te enviamos, así que éste ya no hace falta confirmarlo. Si querés cambiarlo, respondé al mensaje de WhatsApp y te ayudamos.',
      '📝',
    )
  }
  switch (doc.situacion) {
    case 'confirmada':
      return paginaRespuesta(doc.documento, doc.nombre, 'confirmada', '')
    case 'rechazada':
      return paginaRespuesta(doc.documento, doc.nombre, 'rechazada', doc.motivo)
    case 'cancelada':
      return paginaAviso(
        'Esta orden fue cancelada',
        'Ya no hace falta confirmarla. Si había que corregir algo, te vamos a enviar la orden nueva por WhatsApp para que la confirmes.',
        '📝',
      )
    default:
      return paginaAviso(
        `${op ? 'Esta orden' : 'Este presupuesto'} todavía no está para confirmar`,
        'Te avisamos por WhatsApp cuando esté lista para que la revises.',
        '📝',
      )
  }
}

export async function manejarConfirmar(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, POST')
    return html(res, 405, paginaAviso('Abrí el enlace desde el mensaje de WhatsApp', 'Esta dirección sólo se abre desde el enlace que te enviamos.'))
  }
  const url = new URL(req.url ?? '/', 'http://local')
  const leido = enlaceDe(url)

  if (req.method !== 'POST' && esVistaPrevia(String(req.headers['user-agent'] ?? ''))) {
    return html(res, 200, paginaVistaPrevia(leido?.enlace.documento ?? null))
  }
  if (!leido) return html(res, 400, enlaceInvalido())
  const { enlace, accion } = leido
  /* Todas las páginas del enlace llevan la tarjeta de la vista previa de ESTE documento. */
  const tarjeta = enlace.documento
  const que = enlace.documento === 'op' ? 'la orden' : 'el presupuesto'

  try {
    const doc = await buscarDocumento(enlace.documento, enlace.clave, enlace.rol, undefined, enlace.nombre)
    /* Todavía no está en Monday: la OP o el presupuesto se registran al finalizar, DESPUÉS de mandar el
       mensaje. Va con 200 (y con la tarjeta): quien arma la vista previa en ese momento descarta una
       respuesta de error y el mensaje quedaba con el dominio pelado. */
    if (!doc) {
      return html(
        res,
        200,
        tarjeta,
        paginaAviso(
          `No encontramos ${que}`,
          'Puede que todavía se esté registrando: probá de nuevo en unos minutos. Si sigue sin aparecer, respondé al mensaje de WhatsApp y te ayudamos.',
        ),
      )
    }

    /* El estado se lee de Monday en CADA pedido, antes de mostrar el formulario y antes de escribir:
       si alguien ya la confirmó desde la app (o la respondió el otro destinatario), al cliente se le
       muestra el agradecimiento de ya confirmada, nunca el formulario. */
    if (req.method !== 'POST') {
      return html(res, 200, tarjeta, doc.situacion === 'pendiente' && !doc.otroConfirmado ? formulario(doc, accion) : paginaSinRespuesta(doc))
    }

    let campos: Record<string, string>
    try {
      campos = await leerCampos(req)
    } catch {
      return html(res, 400, tarjeta, paginaAviso('No pudimos leer tu respuesta', 'Volvé a abrir el enlace desde el mensaje de WhatsApp e intentá de nuevo.'))
    }
    if (doc.situacion !== 'pendiente' || doc.otroConfirmado) return html(res, 409, tarjeta, paginaSinRespuesta(doc))
    const leida = leerRespuesta(enlace.documento, campos, doc.coordinadores)
    /* Los formularios ya exigen cada campo antes de enviar: si igual falta algo, se vuelve a mostrar. */
    if (!leida.ok) return html(res, 422, tarjeta, formulario(doc, accion))

    /* Quien confirma sólo espera su respuesta y los datos del presupuesto; la obra y la cuenta corriente
       siguen después de responderle. En Vercel, `waitUntil` mantiene viva la función hasta que
       terminan; en desarrollo (Vite) siguen corriendo solas. */
    await registrarRespuesta(doc, doc.nombre, leida.respuesta, undefined, undefined, (tarea) => {
      waitUntil(tarea)
    })
    const r = leida.respuesta
    return html(
      res,
      200,
      tarjeta,
      paginaRespuesta(doc.documento, doc.nombre, r.tipo === 'confirmar' ? 'confirmada' : 'rechazada', r.tipo === 'rechazar' ? r.motivo : ''),
    )
  } catch (e) {
    console.error('[confirmar]', e)
    return html(
      res,
      502,
      tarjeta,
      paginaAviso(
        'No pudimos registrar tu respuesta',
        'Tuvimos un problema momentáneo. Volvé a abrir el enlace en unos minutos e intentá de nuevo; si sigue fallando, respondé al mensaje de WhatsApp.',
      ),
    )
  }
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

/**
 * Responde una página. Con `documento`, le asegura las etiquetas de la tarjeta de WhatsApp (título,
 * texto y logo), sea cual sea la página: el formulario, el agradecimiento o un aviso.
 */
function html(res: ServerResponse, status: number, ...args: [string] | [DocumentoConfirmacion, string]): void {
  const cuerpo = args.length === 2 ? conVistaPrevia(args[1], args[0]) : args[0]
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('x-robots-tag', 'noindex, nofollow')
  res.end(cuerpo)
}
