import type { Obra } from '@/types'

/** "1111 - PEREZ JUAN" → "PEREZ JUAN". */
const sinCodigo = (n: string) => n.replace(/^\s*\d+\s*-\s*/, '').trim()

/**
 * Quién coordina la obra (`✋Coordinar Entrega`): el cliente o el constructor, con su nombre.
 * "Arquitecto" y "Constructor" son la misma persona en la obra —el vínculo Constructor/Arquitecto—.
 * `null` si la columna no dice ninguno de los dos.
 */
export function coordinador(obra: Obra): { nombre: string; rol: 'Cliente' | 'Constructor' } | null {
  const c = obra.coordinarEntrega.texto.trim()
  if (/^cliente$/i.test(c)) return { nombre: sinCodigo(obra.ctaCteCliente), rol: 'Cliente' }
  if (/^(constructor|arquitecto)$/i.test(c)) return { nombre: sinCodigo(obra.arquitecto), rol: 'Constructor' }
  return null
}
