/**
 * La ruta de `/api/presupuesto-respuesta`, sin el guardián: la usa la función de Vercel (que autoriza
 * antes) y el servidor de Vite en desarrollo.
 *
 *   POST { subId, tipo: "confirmar", ubicacion, coordinador }  → { ok: true }
 *   POST { subId, tipo: "rechazar", motivo? }                  → { ok: true }
 *
 * Es "Confirmar" y "Perdido" de Consultar y Gestionar Presupuestos (regla del usuario, 13/10/2026):
 * hacen EXACTAMENTE lo que hace la respuesta del cliente por el enlace de WhatsApp
 * (`registrarRespuesta`): el subelemento Confirmado o Rechazado (con el motivo), y al confirmar, los
 * datos en el ítem, la constancia en el cliente, la obra y la cuenta corriente. La constancia dice que
 * lo registró el usuario desde la app.
 *
 * Antes de escribir se relee el presupuesto: sólo responde uno que todavía no tiene respuesta (409 si
 * ya se confirmó o se rechazó, por el enlace o por otro usuario).
 */
import type { ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import { LIMITES, buscarPresupuestoPorId, leerRespuesta, registrarRespuesta, type Respuesta } from './_confirmarMonday.js'
import { leerJson, responderJson, type Pedido } from './_http.js'
import { mondayServidor } from './_mondayApi.js'

interface Cuerpo {
  subId?: unknown
  tipo?: unknown
  ubicacion?: unknown
  coordinador?: unknown
  motivo?: unknown
  /** Sólo en desarrollo (sin sesión): el nombre de quien lo registra. */
  autor?: unknown
}

/** El nombre del usuario de Monday: va en la constancia. Si no se puede leer, sin nombre. */
async function nombreDeUsuario(userId: string): Promise<string> {
  try {
    const d = await mondayServidor<{ users: { name: string }[] }>(`query ($ids: [ID!]) { users(ids: $ids) { name } }`, { ids: [userId] })
    return d.users[0]?.name ?? ''
  } catch {
    return ''
  }
}

export async function manejarRespuestaPresupuesto(req: Pedido, res: ServerResponse, userId: string | null): Promise<void> {
  if (req.method !== 'POST') return responderJson(res, 405, { error: 'Method Not Allowed' })

  let cuerpo: Cuerpo
  try {
    cuerpo = await leerJson<Cuerpo>(req)
  } catch {
    return responderJson(res, 400, { error: 'Pedido inválido.' })
  }
  const subId = String(cuerpo.subId ?? '').trim()
  if (!/^\d{1,20}$/.test(subId)) return responderJson(res, 400, { error: 'Presupuesto inválido.' })
  if (cuerpo.tipo !== 'confirmar' && cuerpo.tipo !== 'rechazar') return responderJson(res, 400, { error: 'Falta la respuesta.' })

  try {
    const doc = await buscarPresupuestoPorId(subId)
    if (!doc) return responderJson(res, 404, { error: 'El presupuesto ya no está en el tablero.' })
    if (doc.situacion !== 'pendiente') {
      return responderJson(res, 409, {
        error: doc.situacion === 'rechazada' ? 'El presupuesto ya fue rechazado.' : 'El presupuesto ya fue confirmado.',
        situacion: doc.situacion,
      })
    }

    let respuesta: Respuesta
    if (cuerpo.tipo === 'confirmar') {
      /* La misma validación del formulario del enlace: ubicación y coordinador (de la lista). */
      const leida = leerRespuesta(
        'presupuesto',
        { estado_obra: 'Confirmar', ubicacion: cuerpo.ubicacion, coordinador: cuerpo.coordinador },
        doc.coordinadores,
      )
      if (!leida.ok) return responderJson(res, 422, { error: leida.error })
      respuesta = leida.respuesta
    } else {
      /* Desde la app el motivo es opcional (regla del usuario, 13/10/2026); el enlace lo exige. */
      const motivo = String(cuerpo.motivo ?? '')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, LIMITES.motivo)
      respuesta = { tipo: 'rechazar', motivo }
    }

    const autor = userId ? await nombreDeUsuario(userId) : String(cuerpo.autor ?? '').slice(0, 120)
    /* Igual que el enlace: lo que no hace falta esperar (constancia, obra, cuenta corriente) sigue
       después de responder. En Vercel, `waitUntil` mantiene viva la función. */
    await registrarRespuesta(doc, doc.nombre, respuesta, undefined, undefined, (tarea) => {
      waitUntil(tarea)
    }, autor)
    return responderJson(res, 200, { ok: true })
  } catch (e) {
    console.error('[presupuesto-respuesta]', e)
    return responderJson(res, 502, { error: 'No se pudo registrar la respuesta en Monday. Probá de nuevo en unos segundos.' })
  }
}
