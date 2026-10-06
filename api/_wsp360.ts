/**
 * WhatsApp por 360messenger (https://api.360messenger.com/v2): mandar un mensaje y confirmar en su
 * cola que salió.
 *
 *   POST /v2/sendMessage       phonenumber + text  → un mensaje de texto
 *                              phonenumber + url   → un archivo, que 360messenger baja de esa dirección
 *   GET  /v2/message/status?id → el estado del mensaje en la cola (`result.status`)
 *
 * Autenticación: `Authorization: Bearer <WHATSAPP_360_API_KEY>`, sólo del servidor.
 */

const BASE = 'https://api.360messenger.com/v2'

export class ErrorWsp extends Error {}

const clave = () => {
  const k = process.env.WHATSAPP_360_API_KEY?.trim()
  if (!k) throw new ErrorWsp('falta WHATSAPP_360_API_KEY')
  return k
}

export const wspConfigurado = (): boolean => !!process.env.WHATSAPP_360_API_KEY?.trim()

type Respuesta = {
  success?: boolean
  statusCode?: number
  message?: string
  error?: string
  data?: { id?: string; status?: string; statusInfo?: string; delivery?: string }
  result?: { id?: string; status?: string; statusInfo?: string; delivery?: string }
  id?: string
}

/** Manda un mensaje (texto o archivo por URL) y devuelve su id en la cola. */
export async function enviarMensaje(p: { phonenumber: string; text?: string; url?: string }): Promise<string> {
  const form = new FormData()
  form.append('phonenumber', p.phonenumber)
  if (p.text) form.append('text', p.text)
  if (p.url) form.append('url', p.url)
  const r = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${clave()}` },
    body: form,
  })
  const j = (await r.json().catch(() => ({}))) as Respuesta
  const id = j.data?.id ?? j.result?.id ?? j.id
  if (!r.ok || j.success === false || !id) {
    throw new ErrorWsp(`360messenger rechazó el mensaje (${j.message ?? j.error ?? r.status})`)
  }
  return String(id)
}

/**
 * ¿El número tiene una cuenta de WhatsApp? (`POST /v2/client/isRegisteredUser`). El número va en
 * dígitos solos: con el sufijo `@c.us` la API contesta siempre que no.
 *
 * `null` si no se pudo saber (la API no respondió): quien llama decide; no se frena un envío porque
 * falló la consulta.
 */
export async function tieneWhatsapp(phonenumber: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${BASE}/client/isRegisteredUser`, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ number: phonenumber.replace(/\D/g, '') }),
    })
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { result?: unknown }; result?: { result?: unknown } }
    const v = j.data?.result ?? j.result?.result
    return r.ok && j.success !== false && typeof v === 'boolean' ? v : null
  } catch {
    return null
  }
}

export type Entrega = { estado: 'ok' | 'fallo' | 'pendiente'; detalle: string }

/**
 * El estado del mensaje en la cola. "success" (y sus equivalentes: enviado, entregado, leído) es que
 * salió; "failed" (o no encontrado, error) es que no; lo demás —en cola, pendiente— todavía no se sabe.
 */
export async function estadoMensaje(id: string): Promise<Entrega> {
  const r = await fetch(`${BASE}/message/status?id=${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${clave()}` },
  })
  const j = (await r.json().catch(() => ({}))) as Respuesta
  /* Un 404 apenas encolado es "todavía no está": se vuelve a mirar. */
  if (!r.ok) return { estado: 'pendiente', detalle: `HTTP ${r.status}` }
  /* La API trae el dato en `result` (estado de mensaje) o en `data` (otras respuestas v2). */
  const info = j.result ?? j.data
  const estado = String(info?.status ?? '').trim().toLowerCase()
  const detalle = [info?.status, info?.statusInfo].filter(Boolean).join(' · ')
  if (/^(success|sent|delivered|read|ok|done|executed)$/.test(estado)) return { estado: 'ok', detalle }
  if (/fail|error|not found|reject|invalid|cancel/.test(estado)) return { estado: 'fallo', detalle }
  return { estado: 'pendiente', detalle }
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/**
 * Espera a que TODOS los mensajes tengan un estado final, mirando la cola cada 3 segundos. Devuelve
 * el estado de cada uno; los que no terminaron a tiempo quedan "pendiente".
 */
export async function esperarEntregas(ids: string[], topeMs = 75_000): Promise<Record<string, Entrega>> {
  const estados: Record<string, Entrega> = Object.fromEntries(ids.map((id) => [id, { estado: 'pendiente', detalle: '' }]))
  const fin = Date.now() + topeMs
  while (Date.now() < fin) {
    const abiertos = ids.filter((id) => estados[id].estado === 'pendiente')
    if (!abiertos.length) break
    await Promise.all(
      abiertos.map(async (id) => {
        estados[id] = await estadoMensaje(id).catch(() => estados[id])
      }),
    )
    if (ids.some((id) => estados[id].estado === 'fallo')) break
    if (ids.every((id) => estados[id].estado !== 'pendiente')) break
    await pausa(3_000)
  }
  return estados
}
