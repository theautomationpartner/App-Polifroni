import { etiquetaEnviarA, fechaLocal, nombreBolsa } from '@/lib/presupuesto'
import {
  actualizarEnviarA,
  crearBolsa,
  crearPresupuestoEnviado,
  nombrarPresupuestoEnviado,
  subirPdfPresupuesto,
} from '@/services/monday'
import type { BorradorPresupuesto, PresupuestoCargado } from './borrador'

/**
 * Registra en Monday los presupuestos que se enviaron: se llama al tocar "Finalizar Operación" (que se
 * toca solo apenas el envío sale bien). Hasta acá no se escribió nada: los PDF vivían en la app.
 *
 * En orden:
 *  1. Crear: la bolsa (el ítem), con el cliente y/o el constructor, a quién se envió y en "Solicitud
 *     de Presupuesto". Cargar otro: la bolsa ya existe; se actualiza a quién se envió esta vez.
 *  2. Por CADA presupuesto de la lista, su subelemento: tipo de carpintería, color, "Enviado", la
 *     fecha del envío y —sólo si el responsable tenía que confirmarlo— la clave del enlace que salió en
 *     el mensaje (`🤖Clave Confirmacion`). Después su PDF (`✋Presupuesto pdf`) y su nombre (`🤖ID PDF`).
 *
 * `avanzar` va guardando en el borrador lo que ya quedó hecho: si algo falla a mitad de camino, el
 * reintento reusa la misma bolsa y los mismos subelementos, y no vuelve a subir los PDF.
 */
export async function registrarPresupuesto({
  borrador,
  avanzar,
}: {
  borrador: BorradorPresupuesto
  avanzar: (cambios: Partial<BorradorPresupuesto>) => void
}): Promise<void> {
  const { envio, cliente, arquitecto } = borrador
  if (!borrador.presupuestos.length) throw new Error('No hay presupuestos cargados.')
  if (!envio) throw new Error('Los presupuestos todavía no se enviaron.')
  const enviarA = etiquetaEnviarA(envio.roles)

  let bolsaId = borrador.bolsaId ?? borrador.bolsa?.id ?? null
  if (!bolsaId) {
    bolsaId = await crearBolsa({ nombre: nombreBolsa(cliente, arquitecto), cliente, arquitecto, enviarA })
    avanzar({ bolsaId })
  } else if (borrador.bolsa && !borrador.bolsaId) {
    /* Otro presupuesto en una bolsa abierta: a quién se le mandó esta vez. */
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
}
