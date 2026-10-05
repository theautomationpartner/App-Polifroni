import { etiquetaEnviarA, fechaLocal, nombreBolsa } from '@/lib/presupuesto'
import {
  actualizarEnviarA,
  crearBolsa,
  crearPresupuestoEnviado,
  nombrarPresupuestoEnviado,
  subirPdfPresupuesto,
} from '@/services/monday'
import type { BorradorPresupuesto } from './borrador'

/**
 * Registra en Monday el presupuesto que se envió: se llama al tocar "Finalizar Operación" (que se
 * toca solo apenas el envío sale bien). Hasta acá no se escribió nada: el PDF vivía en la app.
 *
 * En orden:
 *  1. Crear: la bolsa (el ítem), con el cliente y/o el constructor, a quién se envió y en "Solicitud
 *     de Presupuesto". Cargar otro: la bolsa ya existe; se actualiza a quién se envió esta vez.
 *  2. El subelemento del presupuesto: tipo de carpintería, color, "Enviado" y la fecha del envío.
 *  3. Su PDF, en `✋Presupuesto pdf`.
 *  4. Su nombre: el `🤖ID PDF` que le da el tablero.
 *
 * `avanzar` va guardando en el borrador lo que ya quedó hecho: si algo falla a mitad de camino, el
 * reintento reusa la misma bolsa y el mismo subelemento, y no vuelve a subir el PDF.
 */
export async function registrarPresupuesto({
  borrador,
  avanzar,
}: {
  borrador: BorradorPresupuesto
  avanzar: (cambios: Partial<BorradorPresupuesto>) => void
}): Promise<void> {
  const { archivo, envio, cliente, arquitecto } = borrador
  if (!archivo) throw new Error('No hay un PDF cargado.')
  if (!envio) throw new Error('El presupuesto todavía no se envió.')
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

  let subitemId = borrador.subitemId
  if (!subitemId) {
    subitemId = await crearPresupuestoEnviado({
      bolsaId,
      tipo: borrador.tipo,
      color: borrador.color,
      fechaEnvio: fechaLocal(new Date(envio.cuando)),
    })
    avanzar({ subitemId })
  }

  if (archivo !== borrador.archivoSubido) {
    await subirPdfPresupuesto(subitemId, archivo)
    avanzar({ archivoSubido: archivo })
  }

  await nombrarPresupuestoEnviado(subitemId).catch((e) => console.warn('[presupuesto] no se pudo nombrar el subelemento', e))
}
