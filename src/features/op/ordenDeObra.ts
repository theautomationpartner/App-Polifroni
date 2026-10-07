import { getNumeracion, registrarNumero, reservarNumero, siguiente, tipoDeObra } from '@/services/numeracion'
import { abrirOrden, ordenEnCurso, type OrdenAbierta } from '@/services/monday'
import type { Obra } from '@/types'
import type { Medicion } from './DatosMedicion'

/**
 * El número que le toca a la próxima OP de la obra: el siguiente al último emitido de su tipo.
 * Leerlo NO reserva nada ni crea la OP: sólo sirve para mostrarlo en el campo.
 */
export const proximoNumero = async (obra: Obra): Promise<string> =>
  siguiente(await getNumeracion(), tipoDeObra(obra.tipo.texto))

/**
 * Reserva el N° de la OP al cargar su documento. La OP todavía NO se crea en Monday (eso pasa al
 * finalizar), pero el número sí se fija acá: va impreso en la OP final y en el mensaje que se envía,
 * y los dos salen antes de finalizar. Reservarlo en la base hace que dos personas cargando a la vez
 * no reciban el mismo.
 *
 * Si ya estaba reservado, o se escribió a mano con el lápiz, no se toca. Devuelve el número con que
 * queda la medición.
 */
export async function reservarNumeroDeCarga(
  obra: Obra,
  medicion: Pick<Medicion, 'nroOrden' | 'nroEditado'>,
  reservado: boolean,
): Promise<string | null> {
  if (reservado || (medicion.nroEditado && medicion.nroOrden.trim())) return null
  return reservarNumero(tipoDeObra(obra.tipo.texto))
}

/**
 * Crea la OP de la obra en el tablero de órdenes. Se llama al FINALIZAR la operación: antes no hay
 * nada en Monday.
 *
 * El número es el del borrador: si se reservó al cargar el documento, ése; si se escribió a mano,
 * se deja como usado; si por algún motivo no se reservó, se reserva ahora.
 */
export async function abrirOrdenDeObra(
  obra: Obra,
  medicion: Pick<Medicion, 'nroOrden' | 'nroEditado'>,
  responsableId: string | null,
  reservado = false,
): Promise<OrdenAbierta> {
  /* Ya hay una OP de esta visita (un reintento del registro): es ésa, con su número. */
  const previa = ordenEnCurso(obra.id)
  if (previa) return previa
  const tipo = tipoDeObra(obra.tipo.texto)
  const actual = medicion.nroOrden.trim()
  let numero: string
  if (medicion.nroEditado && actual) {
    numero = actual
    await registrarNumero(tipo, numero).catch((e) => console.warn('[numeración] no se pudo registrar el número', e))
  } else if (reservado && actual) {
    numero = actual
  } else {
    numero = await reservarNumero(tipo)
  }
  return abrirOrden(obra.id, obra.nombre, tipo, numero, responsableId)
}
