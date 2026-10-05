import { celularValido, digitos, normalizarCelular } from '@/lib/destinatario'
import { htmlATexto } from '@/lib/texto'
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

export type Mensaje = 'asignacion' | 'cancelacion' | 'confirmacion'

/**
 * Lo que falta configurar en el servidor para mandar los mensajes. Los tres salen por el mismo
 * módulo de WhatsApp (360messenger) que el envío de las OP: ya no hay un escenario de Make por mensaje.
 */
export const VARIABLE_DE: Record<Mensaje, string> = {
  asignacion: 'WHATSAPP_360_API_KEY',
  cancelacion: 'WHATSAPP_360_API_KEY',
  confirmacion: 'WHATSAPP_360_API_KEY',
}

/**
 * Cómo terminó el envío:
 *  - `enviado`        la cola de 360messenger confirmó que el mensaje salió.
 *  - `error`          no salió (celular inválido, la cola lo dio por fallido, no se confirmó a tiempo).
 *  - `sinConfigurar`  falta la API key de 360messenger en el servidor.
 */
export type ResultadoEnvio = 'enviado' | 'error' | 'sinConfigurar'

/** El celular al que se manda, en dígitos y con el 549 de los móviles; vacío si no sirve. */
export function celularDeEnvio(...candidatos: string[]): string {
  for (const c of candidatos) {
    const d = normalizarCelular(digitos(c ?? ''))
    if (d && celularValido(d)) return d
  }
  return ''
}

/**
 * Manda un texto por WhatsApp (`/api/whatsapp-texto`) y espera la confirmación de la cola. Devuelve
 * cómo terminó y, si no salió, el motivo para mostrarlo.
 */
export async function enviarTextoWsp(celular: string, texto: string): Promise<{ resultado: ResultadoEnvio; problema: string }> {
  try {
    const r = await fetch('/api/whatsapp-texto', {
      method: 'POST',
      headers: await cabecerasPropias({ 'content-type': 'application/json' }),
      body: JSON.stringify({ phonenumber: celular, text: texto }),
      signal: AbortSignal.timeout(120_000),
    })
    if (r.status === 401 || r.status === 403) await verificarRespuesta(r, 'Envío por WhatsApp')
    const cuerpo = (await r.json().catch(() => ({}))) as { msj_turno?: string; mensajeError?: string; codigo?: string }
    if (r.ok && cuerpo.msj_turno === 'enviado') return { resultado: 'enviado', problema: '' }
    if (cuerpo.codigo === 'ERROR_API_KEY_360MESSENGER') return { resultado: 'sinConfigurar', problema: htmlATexto(cuerpo.mensajeError ?? '') }
    return { resultado: 'error', problema: htmlATexto(cuerpo.mensajeError ?? '') || 'No se pudo enviar el mensaje por WhatsApp.' }
  } catch {
    return { resultado: 'error', problema: 'No se pudo enviar el mensaje por WhatsApp: no hubo respuesta del servidor.' }
  }
}

/**
 * Manda un mensaje del turno al cliente. El texto lo arma la app (ver `lib/agenda`) y sale tal
 * cual: el mensaje de la vista previa es exactamente el que le llega al cliente.
 */
export async function notificarTurno(
  _mensaje: Mensaje,
  _turnoId: string,
  /* El resto de los datos (cliente, tipo, fecha) son de quien llama: el mensaje ya viene armado. */
  datos: { texto: string; celular: string } & Record<string, unknown>,
): Promise<ResultadoEnvio> {
  return (await enviarTextoWsp(datos.celular, datos.texto)).resultado
}
