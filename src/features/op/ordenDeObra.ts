import { getNumeracion, siguiente, tipoDeObra } from '@/services/make'
import { abrirOrden, type OrdenAbierta } from '@/services/monday'
import type { Obra } from '@/types'

/**
 * El número que le toca a la próxima OP de la obra: el siguiente al último emitido de su tipo.
 * Leerlo NO reserva nada ni crea la OP: sólo sirve para mostrarlo en el campo.
 */
export const proximoNumero = async (obra: Obra): Promise<string> =>
  siguiente(await getNumeracion(), tipoDeObra(obra.tipo.texto))

/**
 * La OP de esta visita a la obra, creándola si todavía no existe. Se llama al cargar el PDF
 * original: es el primer dato que la OP tiene que guardar.
 */
export const abrirOrdenDeObra = (
  obra: Obra,
  numero: string,
  responsableId: string | null,
): Promise<OrdenAbierta> =>
  abrirOrden(obra.id, obra.nombre, tipoDeObra(obra.tipo.texto), numero, responsableId)
