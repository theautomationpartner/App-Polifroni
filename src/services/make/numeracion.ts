/**
 * Numeración de las Órdenes de Producción, vía `/api/numeracion` (tabla `numeracion_op` de la base
 * Neon de la app; ya no es el data store de Make).
 *
 * PVC y Aluminio llevan contadores separados. El de Aluminio siempre va con una "A" adelante:
 * "A3000" → la próxima es "A3001".
 *
 * El número se RESERVA al crear la OP (`reservarNumero`): lo que se ve antes en el campo es sólo el
 * próximo libre en ese momento, y puede adelantarse si otra persona crea una OP primero.
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'
import { tipoDeObra, type TipoOrden } from '@/lib/tipoObra'

export { tipoDeObra, type TipoOrden }


export interface Numeracion {
  nroOrdenPVC: string
  nroOrdenAluminio: string
}

/** El tipo de la obra tal como viene del tablero. Cualquier cosa que no sea PVC se numera como Aluminio. */

/** El número que sigue al último usado, con la "A" si es Aluminio. */
export function siguiente(n: Numeracion, tipo: TipoOrden): string {
  const ultimo = tipo === 'PVC' ? n.nroOrdenPVC : n.nroOrdenAluminio
  const numero = (Number(String(ultimo).replace(/\D/g, '')) || 0) + 1
  return tipo === 'Aluminio' ? `A${numero}` : String(numero)
}

export async function getNumeracion(): Promise<Numeracion> {
  const r = await fetch('/api/numeracion', { cache: 'no-store', headers: await cabecerasPropias() })
  await verificarRespuesta(r, 'Numeración')
  return (await r.json()) as Numeracion
}

/** Reserva el siguiente número del tipo, en el servidor y de forma atómica: nunca se repite. */
export async function reservarNumero(tipo: TipoOrden): Promise<string> {
  const r = await fetch('/api/numeracion', {
    method: 'POST',
    headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tipo, reservar: true }),
  })
  await verificarRespuesta(r, 'Numeración')
  const d = (await r.json()) as { numero?: string }
  if (!d.numero) throw new Error('La numeración no devolvió un número reservado.')
  return d.numero
}

/** Deja el número como el último usado. El servidor no retrocede el contador si ya hay uno mayor. */
export async function registrarNumero(tipo: TipoOrden, numero: string): Promise<void> {
  const r = await fetch('/api/numeracion', {
    method: 'POST',
    headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tipo, numero }),
  })
  await verificarRespuesta(r, 'Numeración')
}
