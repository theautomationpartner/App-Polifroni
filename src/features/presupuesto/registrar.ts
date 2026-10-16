import { etiquetaEnviarA, fechaLocal, nombreBolsa } from '@/lib/presupuesto'
import {
  actualizarBolsa,
  crearBolsa,
  crearPresupuestoEnviado,
  marcarBolsaEnviada,
  nombrarPresupuestoEnviado,
  subirPdfPresupuesto,
} from '@/services/monday'
import type { PresupuestoGestion } from '@/services/monday'
import type { BorradorPresupuesto, PresupuestoCargado } from './borrador'

/**
 * Registra en Monday los presupuestos que se enviaron: se llama al tocar "Finalizar Operación" (que se
 * toca solo apenas el envío sale bien). Hasta acá no se escribió nada: los PDF vivían en la app.
 *
 * En orden:
 *  1. La bolsa (el ítem), con el cliente y/o el constructor, a quién se envió, quién la creó
 *     (🤖Creado por) y en "Presupuesto Enviado".
 *  2. Por CADA presupuesto de la lista, su subelemento: tipo de carpintería, color, "Enviado", la fecha del envío y —sólo si el responsable tenía que confirmarlo— la clave del
 *     enlace que salió en el mensaje (`🤖Clave Confirmacion`). Después su PDF (`✋Presupuesto pdf`) y
 *     su nombre (`🤖ID PDF`).
 *
 * `avanzar` va guardando en el borrador lo que ya quedó hecho: si algo falla a mitad de camino, el
 * reintento reusa la misma bolsa y los mismos subelementos, y no vuelve a subir los PDF.
 */
export async function registrarPresupuesto({
  borrador,
  nombre,
  creadoPor,
  avanzar,
}: {
  borrador: BorradorPresupuesto
  /** El nombre del ítem, si el usuario lo cambió; si no, el del cliente (o el del constructor). */
  nombre?: string
  /** El usuario logueado: queda en 🤖Creado por de la bolsa nueva. */
  creadoPor: string | null
  avanzar: (cambios: Partial<BorradorPresupuesto>) => void
}): Promise<void> {
  const { envio, cliente, arquitecto } = borrador
  if (!borrador.presupuestos.length) throw new Error('No hay presupuestos cargados.')
  if (!envio) throw new Error('Los presupuestos todavía no se enviaron.')
  const enviarA = etiquetaEnviarA(envio.roles)

  let bolsaId = borrador.bolsaId
  if (!bolsaId) {
    bolsaId = await crearBolsa({ nombre: nombre?.trim() || nombreBolsa(cliente, arquitecto), cliente, arquitecto, enviarA, creadoPor })
    avanzar({ bolsaId })
  }

  /* La lista se va actualizando fila por fila: cada avance queda en el borrador. */
  let lista = [...borrador.presupuestos]
  const guardar = (id: string, cambios: Partial<PresupuestoCargado>) => {
    lista = lista.map((p) => (p.id === id ? { ...p, ...cambios } : p))
    avanzar({ presupuestos: lista })
  }

  for (const p of borrador.presupuestos) {
    let subitemId = p.subitemId
    if (!subitemId) {
      subitemId = await crearPresupuestoEnviado({
        bolsaId,
        tipo: p.tipo,
        color: p.color,
        fechaEnvio: fechaLocal(new Date(envio.cuando)),
        /* La clave, sólo en los que se pidió confirmar: con ella `/confirmar` encuentra éste. */
        clave: envio.confirmador && envio.aConfirmar.includes(p.id) ? p.clave : null,
      })
      guardar(p.id, { subitemId })
    }
    if (!p.pdfSubido) {
      await subirPdfPresupuesto(subitemId, p.archivo)
      guardar(p.id, { pdfSubido: true })
    }
    await nombrarPresupuestoEnviado(subitemId).catch((e) => console.warn('[presupuesto] no se pudo nombrar el subelemento', e))
  }

  /* 3. La bolsa queda "Presupuesto Enviado" y con quién la creó. Se escribe de nuevo al final: una
     automatización del tablero la pasa a "Solicitud de Presupuesto" al crearle el primer subelemento. */
  await marcarBolsaEnviada(bolsaId, creadoPor)
}

/** Lo que ya quedó en Monday de un presupuesto nuevo: un reintento no lo repite. */
export interface AvanceNuevo {
  subitemId: string | null
  pdfSubido: boolean
}

/**
 * «+Nuevo» de la consulta (regla del usuario, 15/10/2026): el presupuesto que acaba de salir por
 * WhatsApp, como subelemento de una bolsa que ya existía —tipo, color, "Enviado", la fecha y la clave
 * del enlace si alguien lo confirma—, con su PDF y su nombre (🤖ID PDF). Después, la bolsa: a quién se
 * le mandó esta vez y su estado de antes (no se cambia, ver `actualizarBolsa`).
 *
 * `avance` se completa a medida que se escribe: si algo falla, el reintento sigue desde ahí.
 */
export async function registrarNuevoEnBolsa(a: {
  bolsa: PresupuestoGestion
  tipo: string
  color: string
  archivo: File
  clave: string | null
  enviarA: string
  /** Cuándo salió (ISO). */
  cuando: string
  avance: AvanceNuevo
}): Promise<string> {
  const { avance } = a
  if (!avance.subitemId) {
    avance.subitemId = await crearPresupuestoEnviado({
      bolsaId: a.bolsa.id,
      tipo: a.tipo,
      color: a.color,
      fechaEnvio: fechaLocal(new Date(a.cuando)),
      clave: a.clave,
    })
  }
  if (!avance.pdfSubido) {
    await subirPdfPresupuesto(avance.subitemId, a.archivo)
    avance.pdfSubido = true
  }
  await nombrarPresupuestoEnviado(avance.subitemId).catch((e) => console.warn('[presupuesto] no se pudo nombrar el subelemento', e))
  /* Al final, con el subelemento ya creado: la automatización del tablero ya cambió el estado. */
  await actualizarBolsa(a.bolsa.id, { enviarA: a.enviarA !== a.bolsa.enviarA ? a.enviarA : '', estado: a.bolsa.estado })
  return avance.subitemId
}
