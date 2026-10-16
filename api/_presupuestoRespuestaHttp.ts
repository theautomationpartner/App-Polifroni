/**
 * La ruta de `/api/presupuesto-respuesta`, sin el guardián: la usa la función de Vercel (que autoriza
 * antes) y el servidor de Vite en desarrollo.
 *
 *   POST { subId, tipo: "confirmar", ubicacion, nombreObra?, coordinador, total }  → { ok: true }
 *   POST { subId, tipo: "rechazar", motivo? }                         → { ok: true }
 *   POST { subId, tipo: "ganar", total, ubicacion?, nombreObra?, coordinador? }    → { ok: true }
 *
 * Es "Confirmar" y "Perdido" de Consultar y Gestionar Presupuestos (regla del usuario, 13/10/2026):
 * hacen EXACTAMENTE lo que hace la respuesta del cliente por el enlace de WhatsApp
 * (`registrarRespuesta`): el subelemento Confirmado o Rechazado (con el motivo), y al confirmar, los
 * datos en el ítem y la constancia en el cliente. Desde la app, "Confirmar" pide también el total
 * pactado y gana el presupuesto en el mismo paso (regla del usuario, 15/10/2026). La constancia dice
 * que lo registró el usuario desde la app.
 *
 * "Ganar" es para un presupuesto que el cliente confirmó por WhatsApp ("Confirmado - Pend de Cerrar"):
 * con el total, queda Ganado y se crean la obra y su movimiento en la cuenta corriente.
 *
 * Antes de escribir se relee el presupuesto: sólo responde uno que todavía no tiene respuesta (409 si
 * ya se confirmó o se rechazó, por el enlace o por otro usuario). Gana uno solo por bolsa: si ya se
 * confirmó otro de la misma bolsa, éste no se confirma (409); sí se puede dar por perdido.
 */
import type { ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import { LIMITES, buscarPresupuestoPorId, consultaMonday, leerRespuesta, registrarRespuesta, type Respuesta } from './_confirmarMonday.js'
import { NoSeGana, ganarPresupuesto } from './_confirmarPresupuesto.js'
import { leerJson, responderJson, type Pedido } from './_http.js'
import { mondayServidor } from './_mondayApi.js'

interface Cuerpo {
  subId?: unknown
  tipo?: unknown
  ubicacion?: unknown
  nombreObra?: unknown
  coordinador?: unknown
  motivo?: unknown
  total?: unknown
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
  if (cuerpo.tipo !== 'confirmar' && cuerpo.tipo !== 'rechazar' && cuerpo.tipo !== 'ganar') {
    return responderJson(res, 400, { error: 'Falta la respuesta.' })
  }
  const total = Number(cuerpo.total)
  const conTotal = Number.isFinite(total) && total > 0
  if ((cuerpo.tipo === 'confirmar' || cuerpo.tipo === 'ganar') && !conTotal) {
    return responderJson(res, 422, { error: 'Ingresá el total pactado (un importe mayor a cero).' })
  }

  try {
    const doc = await buscarPresupuestoPorId(subId)
    if (!doc) return responderJson(res, 404, { error: 'El presupuesto ya no está en el tablero.' })

    if (cuerpo.tipo === 'ganar') {
      /* La dirección y el coordinador, si se corrigieron al ganar (el coordinador, de la lista). */
      const coordinador = cuerpo.coordinador ? doc.coordinadores.find((c) => c.nombre === String(cuerpo.coordinador)) : undefined
      if (cuerpo.coordinador && !coordinador) return responderJson(res, 422, { error: 'El coordinador tiene que ser uno de los de la lista.' })
      const ubicacion = cuerpo.ubicacion === undefined ? undefined : String(cuerpo.ubicacion).trim().slice(0, LIMITES.ubicacion)
      const nombreObra = cuerpo.nombreObra === undefined ? undefined : String(cuerpo.nombreObra).trim().slice(0, LIMITES.nombreObra)
      await ganarPresupuesto({ subId, total, ubicacion, nombreObra, coordinador: coordinador ?? null }, consultaMonday, undefined, undefined, (tarea) => {
        waitUntil(tarea)
      })
      return responderJson(res, 200, { ok: true })
    }

    if (doc.situacion !== 'pendiente') {
      return responderJson(res, 409, {
        error: doc.situacion === 'rechazada' ? 'El presupuesto ya fue rechazado.' : 'El presupuesto ya fue confirmado.',
        situacion: doc.situacion,
      })
    }

    if (cuerpo.tipo === 'confirmar' && doc.otroConfirmado) {
      return responderJson(res, 409, { error: 'Ya se confirmó otro presupuesto de este cliente: gana uno solo.', situacion: 'otroConfirmado' })
    }

    let respuesta: Respuesta
    if (cuerpo.tipo === 'confirmar') {
      /* La misma validación del formulario del enlace: ubicación y coordinador (de la lista). */
      const leida = leerRespuesta(
        'presupuesto',
        { estado_obra: 'Confirmar', ubicacion: cuerpo.ubicacion, nombre_obra: cuerpo.nombreObra, coordinador: cuerpo.coordinador },
        doc.coordinadores,
      )
      if (!leida.ok) return responderJson(res, 422, { error: leida.error })
      respuesta = { ...leida.respuesta, total } as Respuesta
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
    if (e instanceof NoSeGana) return responderJson(res, 409, { error: e.message })
    console.error('[presupuesto-respuesta]', e)
    return responderJson(res, 502, { error: 'No se pudo registrar la respuesta en Monday. Probá de nuevo en unos segundos.' })
  }
}
