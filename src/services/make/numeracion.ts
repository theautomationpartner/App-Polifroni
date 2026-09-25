/**
 * Numeración de las Órdenes de Producción (data store de Make, vía `/api/numeracion`).
 *
 * PVC y Aluminio llevan contadores separados. El de Aluminio siempre va con una "A" adelante:
 * "A3000" → la próxima es "A3001".
 */
export type TipoOrden = 'PVC' | 'Aluminio'

export interface Numeracion {
  nroOrdenPVC: string
  nroOrdenAluminio: string
}

/** El tipo de la obra tal como viene del tablero. Cualquier cosa que no sea PVC se numera como Aluminio. */
export const tipoDeObra = (tipo: string): TipoOrden => (/pvc/i.test(tipo) ? 'PVC' : 'Aluminio')

/** El número que sigue al último usado, con la "A" si es Aluminio. */
export function siguiente(n: Numeracion, tipo: TipoOrden): string {
  const ultimo = tipo === 'PVC' ? n.nroOrdenPVC : n.nroOrdenAluminio
  const numero = (Number(String(ultimo).replace(/\D/g, '')) || 0) + 1
  return tipo === 'Aluminio' ? `A${numero}` : String(numero)
}

export async function getNumeracion(): Promise<Numeracion> {
  const r = await fetch('/api/numeracion', { cache: 'no-store' })
  if (!r.ok) throw new Error(`Numeración: HTTP ${r.status}`)
  return (await r.json()) as Numeracion
}

/** Deja el número como el último usado. El servidor no retrocede el contador si ya hay uno mayor. */
export async function registrarNumero(tipo: TipoOrden, numero: string): Promise<void> {
  const r = await fetch('/api/numeracion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, numero }),
  })
  if (!r.ok) throw new Error(`Numeración: HTTP ${r.status}`)
}
