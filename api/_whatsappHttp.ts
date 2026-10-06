/**
 * La ruta de `/api/whatsapp`, sin el guardián: la usa la función de Vercel (que autoriza antes) y el
 * servidor de Vite en desarrollo.
 *
 *   POST multipart/form-data
 *     datos    JSON: { destinos: [{ tipo, nombre, whatsapp, confirmador, texto? }], reenvio, ordenId,
 *                      obraId, numero, tipo, documento?, clave }
 *     archivo  el PDF de la OP
 *
 *   200 { msj_cliente_arquitecto: "enviado", link_op, resultados }
 *   4xx/5xx { mensajeError }   el motivo, para mostrarlo junto al botón
 *
 * Es el escenario de Make "[TAP] Enviar Orden De Produccion -> A Cliente/Constructor" pasado a la
 * app, sin escenarios en el medio:
 *  1. Arma la lista de destinatarios (módulo 71): sin nombre se saluda por el rol, sin celular no se
 *     le manda, y el confirmador es el que dice la app.
 *  2. Valida el celular de CADA uno antes de mandar nada (`ValidarTelWsp`): con uno inválido no
 *     sale ningún mensaje.
 *  3. Sube el PDF a Google Drive y lo comparte (módulos 32 y 35).
 *  4. A cada uno: el texto (módulo 27) y después el archivo (módulo 38), por 360messenger.
 *  5. Confirma en la cola de 360messenger que cada mensaje salió: "success" es enviado; "failed",
 *     error de envío.
 *
 * El enlace para confirmar lo arma ACÁ el servidor, firmado (ver `_confirmacion.ts`), con la `clave`
 * que manda la app: el navegador nunca ve el secreto ni puede armar un enlace propio. En el
 * presupuesto el texto lo arma la app, con la marca `[[ENLACE_CONFIRMACION]]` donde va el enlace.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ErrorDrive, ErrorTokenDrive, driveConfigurado, subirYCompartir } from './_drive.js'
import { MARCA_ENLACE, enlaceConfirmacion, esClave, faltaConfiguracion } from './_confirmacion.js'
import { textoPrimerEnvio, textoReenvio } from './_mensajeOp.js'
import { mensajeTelInvalido, validarTelWsp } from './_telWsp.js'
import { ErrorWsp, enviarMensaje, esperarEntregas, tieneWhatsapp, wspConfigurado } from './_wsp360.js'

type Pedido = IncomingMessage & { body?: unknown }

interface DestinoPedido {
  tipo?: string
  nombre?: string
  whatsapp?: string
  confirmador?: boolean
  /** Presupuesto: el texto para este destinatario, armado por la app. */
  texto?: string
}

interface DatosPedido {
  destinos?: DestinoPedido[]
  reenvio?: boolean
  ordenId?: string | null
  obraId?: string
  numero?: string
  tipo?: string
  /** `presupuesto`: sale un presupuesto, con el texto que manda la app. */
  documento?: string
  /** La clave (UUID) del enlace de confirmación: la genera la app y queda guardada en Monday. */
  clave?: string
}

const ERROR_INTERNO_PRESUPUESTO =
  'Ocurrió un error interno al intentar enviar el presupuesto por WhatsApp. No se registró nada en el sistema: volvé a intentar el envío en unos minutos. Si el error persiste, no dude en contactarse con el soporte de TAP.'

const ERROR_INTERNO =
  'Ocurrió un error interno al intentar enviar el mensaje en la aplicacion. Dale click al boton de Finalizar Operacion para registrar la orden y no perder los datos ya cargados. Mas tarde intenta enviar la orden ya cargada nuevamente. Si el error persiste, no dude en contactarse con el soporte de TAP.'

/** Quién confirma, para el enlace: el saludo del formulario se arma con su nombre en Monday. */
const rolDe = (tipo: string) => (tipo === 'Constructor' ? 'Constructor' : 'Cliente')

const texto = (v: unknown) => (v == null ? '' : String(v).trim())
/** "1111 - CLIENTE TEST" → "CLIENTE TEST": el código de la cuenta no va en un saludo. */
const sinCodigo = (n: string) => n.replace(/^\d+\s*-\s*/, '')

export async function manejarWhatsapp(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { mensajeError: 'Method Not Allowed' })
  /* Hasta leer el pedido no se sabe qué documento es: los errores de antes hablan de "la orden". */
  let presupuesto = false
  /* Sin las credenciales no se intenta nada: el código le dice al soporte qué falta. */
  const sinConfigurar = !wspConfigurado() ? 'ERROR_API_KEY_360MESSENGER' : !driveConfigurado() ? 'ERROR_CREDENCIALES_GOOGLE_DRIVE' : null
  if (sinConfigurar) {
    return responder(res, 503, {
      mensajeError: `Ocurrio un error al intentar enviar la orden por WhatsApp. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ${sinConfigurar}`,
    })
  }
  try {
    const form = await leerFormulario(req)
    const datos = JSON.parse(String(form.get('datos') ?? '{}')) as DatosPedido
    presupuesto = datos.documento === 'presupuesto'
    const doc = presupuesto ? 'el presupuesto' : 'la orden'
    const archivo = form.get('archivo')
    if (!(archivo instanceof Blob) || archivo.size === 0) {
      return responder(res, 400, { mensajeError: presupuesto ? 'No llegó el PDF del presupuesto.' : 'No llegó el PDF de la orden.' })
    }
    /* Los dos documentos llevan el enlace para confirmarlos: sin su configuración no se manda nada. */
    const falta = faltaConfiguracion()
    if (falta) {
      return responder(res, 503, {
        mensajeError: `Ocurrio un error al intentar enviar ${doc} por WhatsApp. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ${falta}`,
      })
    }
    const clave = texto(datos.clave).toLowerCase()
    if (!esClave(clave)) {
      return responder(res, 400, { mensajeError: `Falta la clave del enlace para confirmar ${doc}.` })
    }

    /* 1. Los destinatarios. */
    const destinos = (datos.destinos ?? [])
      .map((d) => {
        const tipo = texto(d.tipo) || 'Cliente'
        return {
          tipo,
          nombre: sinCodigo(texto(d.nombre)) || tipo,
          whatsapp: texto(d.whatsapp),
          confirmador: d.confirmador === true,
          texto: texto(d.texto),
        }
      })
      .filter((d) => d.whatsapp)
    if (!destinos.length) return responder(res, 400, { mensajeError: `No hay a quién enviarle ${doc}: ningún destinatario tiene celular.` })
    /* El presupuesto lleva el texto que armó la app: sin él no se manda un mensaje vacío. */
    if (presupuesto && destinos.some((d) => !d.texto)) {
      return responder(res, 400, { mensajeError: 'Falta el texto del mensaje del presupuesto.' })
    }

    /* 2. Todos los celulares, antes de mandar nada. */
    const validados = destinos.map((d) => ({ ...d, tel: validarTelWsp(d.whatsapp) }))
    const invalido = validados.find((d) => !d.tel.success)
    if (invalido) {
      return responder(res, 400, {
        mensajeError: mensajeTelInvalido(invalido.tel.phone || invalido.whatsapp, validados.length > 1 ? invalido.nombre : undefined),
      })
    }

    /* 2b. Que cada número tenga cuenta de WhatsApp, también antes de mandar nada: si uno no tiene, no
       sale ningún mensaje. Si la consulta no responde (`null`) no se frena el envío: la cola de
       360messenger igual avisa si no pudo entregar. */
    const cuentas = await Promise.all(validados.map((d) => tieneWhatsapp(d.tel.phone)))
    const sinCuenta = validados.filter((_, i) => cuentas[i] === false)
    if (sinCuenta.length) {
      const lista = sinCuenta.map((d) => `${d.nombre} (${d.tel.phone})`).join(' y ')
      return responder(res, 400, {
        mensajeError: `${sinCuenta.length === 1 ? 'El número de' : 'Los números de'} ${lista} no ${sinCuenta.length === 1 ? 'tiene' : 'tienen'} una cuenta de WhatsApp. Corregí el celular con «Editar» y volvé a intentar: no se envió nada.`,
        sinWhatsapp: sinCuenta.map((d) => d.tel.phone),
      })
    }

    /* El enlace para confirmar va SÓLO a quien confirma: tiene que haber exactamente uno marcado. Sin
       él (o con dos) no se manda nada, en vez de mandarle el enlace a quien no corresponde. */
    const confirmadores = validados.filter((d) => d.confirmador)
    if (confirmadores.length !== 1) {
      return responder(res, 400, {
        mensajeError: `Falta indicar quién es el responsable de confirmar ${doc}: no se envió nada.`,
      })
    }
    /* En el presupuesto el texto lo arma la app: sólo el de quien confirma puede traer el enlace. */
    if (presupuesto && validados.some((d) => !d.confirmador && d.texto.includes(MARCA_ENLACE))) {
      return responder(res, 400, { mensajeError: ERROR_INTERNO_PRESUPUESTO })
    }

    /* 3. El PDF, en Drive y compartido. */
    const nombreArchivo =
      archivo instanceof File && archivo.name ? archivo.name : presupuesto ? 'Presupuesto.pdf' : 'Orden de Produccion.pdf'
    const enDrive = await subirYCompartir(new Uint8Array(await archivo.arrayBuffer()), nombreArchivo, archivo.type)

    /* 4. A cada uno, el texto y después el archivo. */
    const reenvio = datos.reenvio === true
    const enviados: { nombre: string; phone: string; ids: string[] }[] = []
    for (const d of validados) {
      const mensaje = textoParaDestino(presupuesto ? 'presupuesto' : 'op', d, { reenvio, clave })
      const idTexto = await enviarMensaje({ phonenumber: d.tel.phone, text: mensaje })
      const idArchivo = await enviarMensaje({ phonenumber: d.tel.phone, url: enDrive.webContentLink })
      enviados.push({ nombre: d.nombre, phone: d.tel.phone, ids: [idTexto, idArchivo] })
    }

    /* 5. La confirmación de la cola. */
    const estados = await esperarEntregas(enviados.flatMap((e) => e.ids))
    const resultados = enviados.map((e) => ({
      nombre: e.nombre,
      phonenumber: e.phone,
      mensajes: e.ids.map((id) => ({ id, ...estados[id] })),
    }))
    const fallido = resultados.find((r) => r.mensajes.some((m) => m.estado === 'fallo'))
    if (fallido) {
      const m = fallido.mensajes.find((x) => x.estado === 'fallo')
      return responder(res, 502, {
        mensajeError: `WhatsApp no pudo entregar el mensaje a ${fallido.nombre} (${fallido.phonenumber})${m?.detalle ? `: ${m.detalle}` : ''}. Verificá el número y volvé a intentar; si el error persiste, contactate con el soporte de TAP.`,
        resultados,
      })
    }
    const sinConfirmar = resultados.find((r) => r.mensajes.some((m) => m.estado === 'pendiente'))
    if (sinConfirmar) {
      return responder(res, 504, {
        mensajeError: `El mensaje a ${sinConfirmar.nombre} quedó en la cola de WhatsApp y no se confirmó su envío a tiempo. Antes de reenviar, revisá si le llegó, para no mandarlo dos veces.`,
        resultados,
      })
    }

    return responder(res, 200, { msj_cliente_arquitecto: 'enviado', link_op: enDrive.webViewLink, resultados })
  } catch (e) {
    console.error('[api/whatsapp]', e)
    /* El token de Drive venció: no salió ningún mensaje (el PDF se sube antes de mandar). */
    if (e instanceof ErrorTokenDrive) {
      return responder(res, 503, {
        mensajeError: `Ocurrio un error al intentar enviar ${presupuesto ? 'el presupuesto' : 'la orden'} por WhatsApp. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ERROR_TOKEN_GOOGLE_DRIVE`,
      })
    }
    /* Drive o 360messenger: se dice CUÁL falló con un código, así el soporte sabe dónde mirar sin
       pedir los logs. El detalle técnico va aparte (no en el texto que lee el usuario). */
    const codigo = e instanceof ErrorDrive ? 'ERROR_GOOGLE_DRIVE' : e instanceof ErrorWsp ? 'ERROR_360MESSENGER' : null
    if (codigo) {
      return responder(res, 502, {
        mensajeError: `Ocurrio un error al intentar enviar ${presupuesto ? 'el presupuesto' : 'la orden'} por WhatsApp. ${
          codigo === 'ERROR_GOOGLE_DRIVE' ? 'No se pudo subir el PDF a Google Drive, así que no salió ningún mensaje.' : 'El servicio de WhatsApp rechazó el mensaje.'
        } Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ${codigo}`,
        detalle: e instanceof Error ? e.message : '',
      })
    }
    return responder(res, 502, { mensajeError: presupuesto ? ERROR_INTERNO_PRESUPUESTO : ERROR_INTERNO })
  }
}

/**
 * El texto que recibe un destinatario. El enlace para confirmar va SÓLO a quien confirma (el
 * destinatario con la etiqueta de Confirmador), en la OP y en el presupuesto, en el primer envío y en
 * el reenvío. Al otro le llega el mismo mensaje sin el enlace.
 *  - OP: el texto lo arma el servidor (`_mensajeOp.ts`).
 *  - Presupuesto: el texto lo arma la app; en el de quien confirma, la marca se cambia por el enlace.
 */
export function textoParaDestino(
  documento: 'op' | 'presupuesto',
  d: { tipo: string; nombre: string; confirmador: boolean; texto: string },
  { reenvio, clave }: { reenvio: boolean; clave: string },
): string {
  const enlace = d.confirmador ? enlaceConfirmacion({ documento, clave, rol: rolDe(d.tipo) }) : null
  if (documento === 'presupuesto') return enlace ? d.texto.split(MARCA_ENLACE).join(enlace) : d.texto.split(MARCA_ENLACE).join('')
  return reenvio ? textoReenvio(d.nombre, enlace) : textoPrimerEnvio(d.nombre, enlace)
}

/**
 * El multipart del pedido. Se lee el stream ANTES de tocar `req.body`: en Vercel ese campo es un
 * getter que, al leerlo, consume el stream. Si el stream ya vino vacío, se usa lo que haya dejado.
 */
async function leerFormulario(req: Pedido): Promise<FormData> {
  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  let cuerpo: Buffer = Buffer.concat(partes)
  if (!cuerpo.length && Buffer.isBuffer(req.body)) cuerpo = req.body
  return new Response(new Uint8Array(cuerpo), {
    headers: { 'content-type': String(req.headers['content-type'] ?? '') },
  }).formData()
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}

/**
 * `/api/whatsapp-texto`: un mensaje de texto suelto, con el mismo módulo de 360messenger (los
 * mensajes de la Agenda: asignación, cancelación y confirmación del turno).
 *
 *   POST { phonenumber, text }  → 200 { msj_turno: "enviado" } | 4xx/5xx { mensajeError }
 *
 * Valida el celular, manda el texto y confirma en la cola que salió: "success" es enviado; "failed",
 * error de envío.
 */
export async function manejarWhatsappTexto(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { mensajeError: 'Method Not Allowed' })
  if (!wspConfigurado()) {
    return responder(res, 503, {
      mensajeError:
        'Ocurrio un error al intentar enviar el mensaje por WhatsApp. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ERROR_API_KEY_360MESSENGER',
      codigo: 'ERROR_API_KEY_360MESSENGER',
    })
  }
  try {
    const partes: Buffer[] = []
    for await (const trozo of req) partes.push(Buffer.from(trozo))
    let crudo = Buffer.concat(partes).toString('utf8')
    if (!crudo && req.body && typeof req.body === 'object') crudo = JSON.stringify(req.body)
    const datos = JSON.parse(crudo || '{}') as { phonenumber?: string; text?: string }
    const text = texto(datos.text)
    if (!text) return responder(res, 400, { mensajeError: 'No hay texto para enviar.' })
    const tel = validarTelWsp(texto(datos.phonenumber))
    if (!tel.success) return responder(res, 400, { mensajeError: mensajeTelInvalido(tel.phone || texto(datos.phonenumber)) })

    const id = await enviarMensaje({ phonenumber: tel.phone, text })
    const estado = (await esperarEntregas([id]))[id]
    if (estado.estado === 'fallo') {
      return responder(res, 502, {
        mensajeError: `WhatsApp no pudo entregar el mensaje (${tel.phone})${estado.detalle ? `: ${estado.detalle}` : ''}. Verificá el número y volvé a intentar.`,
      })
    }
    if (estado.estado === 'pendiente') {
      return responder(res, 504, {
        mensajeError: 'El mensaje quedó en la cola de WhatsApp y no se confirmó su envío a tiempo. Antes de reenviarlo, revisá si le llegó al cliente.',
      })
    }
    return responder(res, 200, { msj_turno: 'enviado', id, phonenumber: tel.phone })
  } catch (e) {
    console.error('[api/whatsapp-texto]', e)
    return responder(res, 502, { mensajeError: 'No se pudo enviar el mensaje por WhatsApp. Probá de nuevo en unos minutos; si el error persiste, contactate con el soporte de TAP.' })
  }
}
