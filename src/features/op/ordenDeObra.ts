import { getNumeracion, registrarNumero, reservarNumero, siguiente, tipoDeObra } from '@/services/make'
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
 * La OP de esta visita a la obra, creándola si todavía no existe. Se llama al cargar el PDF
 * original: es el primer dato que la OP tiene que guardar.
 *
 * Al crearla se RESERVA su número: el que se mostraba era sólo el próximo libre, y si otra persona
 * creó una OP mientras tanto, éste es otro. Devuelve el número con que quedó: quien llama lo pone en
 * el campo. Si el número se escribió a mano (el lápiz), se usa ése y se deja como usado.
 */
export async function abrirOrdenDeObra(
  obra: Obra,
  medicion: Pick<Medicion, 'nroOrden' | 'nroEditado'>,
  responsableId: string | null,
): Promise<OrdenAbierta> {
  /* Ya hay una OP de esta visita: es ésa, con su número; no se reserva otro. */
  const previa = ordenEnCurso(obra.id)
  if (previa) return previa
  const tipo = tipoDeObra(obra.tipo.texto)
  const manual = medicion.nroEditado && medicion.nroOrden.trim()
  let numero: string
  if (manual) {
    numero = manual
    await registrarNumero(tipo, numero).catch((e) => console.warn('[numeración] no se pudo registrar el número', e))
  } else {
    numero = await reservarNumero(tipo)
  }
  return abrirOrden(obra.id, obra.nombre, tipo, numero, responsableId)
}
