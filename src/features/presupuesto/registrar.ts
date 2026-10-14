import { etiquetaEnviarA, fechaLocal, nombreBolsa } from '@/lib/presupuesto'
import {
  actualizarEnviarA,
  crearBolsa,
  crearPresupuestoEnviado,
  marcarBolsaEnviada,
  nombrarPresupuestoEnviado,
  subirPdfPresupuesto,
} from '@/services/monday'
import type { BorradorPresupuesto, PresupuestoCargado } from './borrador'

/**
 * Registra en Monday los presupuestos que se enviaron: se llama al tocar "Finalizar Operación" (que se
 * toca solo apenas el envío sale bien). Hasta acá no se escribió nada: los PDF vivían en la app.
 *
 * En orden:
 *  1. Crear: la bolsa (el ítem), con el cliente y/o el constructor, a quién se envió, quién la creó
 *     (🤖Creado por) y en "Presupuesto Enviado". Cargar otro: la bolsa ya existe; se actualiza a quién se envió esta vez (el estado no se toca).
 *  2. Por CADA presupuesto de la lista, su subelemento: tipo de carpintería, color, Total Pactado,
 *     "Enviado", la fecha del envío y —sólo si el responsable tenía que confirmarlo— la clave del
 *     enlace que salió en el mensaje (`🤖Clave Confirmacion`). Después su PDF (`✋Presupuesto pdf`) y
 *     su nombre (`🤖ID PDF`).
 *
 * `avanzar` va guardando en el borrador lo que ya quedó hecho: si algo falla a mitad de camino, el
 * reintento reusa la misma bolsa y los mismos subelementos, y no vuelve a subir los PDF.
 */
export async function registrarPresupuesto({
  borrador,
  creadoPor,
  avanzar,
}: {
  borrador: BorradorPresupuesto
  /** El usuario logueado: queda en 🤖Creado por de la bolsa nueva. */
  creadoPor: string | null
  avanzar: (cambios: Partial<BorradorPresupuesto>) => void
}): Promise<void> {
  const { envio, cliente, arquitecto } = borrador
  if (!borrador.presupuestos.length) throw new Error('No hay presupuestos cargados.')
  if (!envio) throw new Error('Los presupuestos todavía no se enviaron.')
  const enviarA = etiquetaEnviarA(envio.roles)

  let bolsaId = borrador.bolsaId ?? borrador.bolsa?.id ?? null
  if (!bolsaId) {
    bolsaId = await crearBolsa({ nombre: nombreBolsa(cliente, arquitecto), cliente, arquitecto, enviarA, creadoPor })
    avanzar({ bolsaId })
  } else if (borrador.bolsa && !borrador.bolsaId) {
    /* Otro presupuesto en una bolsa existente: a quién se le mandó esta vez. */
    if (enviarA && enviarA !== borrador.bolsa.enviarA) await actualizarEnviarA(bolsaId, enviarA)
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
        total: p.total,
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

  /* 3. Una bolsa nueva queda "Presupuesto Enviado" y con quién la creó. Se escribe de nuevo al final:
     una automatización del tablero la pasa a "Solicitud de Presupuesto" al crearle el primer
     subelemento. Cargar otro presupuesto no toca el estado (regla del usuario, 13/10/2026). */
  if (borrador.modo === 'crear') await marcarBolsaEnviada(bolsaId, creadoPor)
}
