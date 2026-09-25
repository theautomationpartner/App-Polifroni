import { getNumeracion, siguiente, tipoDeObra } from '@/services/make'
import { iniciarOrden, ordenDeLaVisita, type OrdenAbierta } from '@/services/monday'
import type { Obra } from '@/types'

/** El número que le toca a la OP: el siguiente al último emitido del tipo de la obra. */
const proximoNumero = (obra: Obra) => async () =>
  siguiente(await getNumeracion(), tipoDeObra(obra.tipo.texto))

/** Crea la OP nueva de la obra (al elegirla para emitir). */
export const iniciarOrdenDeObra = (obra: Obra): Promise<OrdenAbierta> =>
  iniciarOrden(obra.id, obra.nombre, tipoDeObra(obra.tipo.texto), proximoNumero(obra))

/** La OP de esta visita; la crea sólo si no se inició ninguna. */
export const ordenDeObra = (obra: Obra): Promise<OrdenAbierta> =>
  ordenDeLaVisita(obra.id, obra.nombre, tipoDeObra(obra.tipo.texto), proximoNumero(obra))
