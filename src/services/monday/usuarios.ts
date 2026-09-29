/**
 * Las personas de la cuenta de Monday, para el selector de usuario del encabezado.
 *
 * Mismo criterio que La Batea: se excluyen los visores (`is_view_only`) y los desactivados —ninguno
 * puede emitir una orden—; los invitados SÍ entran, porque quién puede operar lo decide la lista
 * blanca y no un flag de Monday. El orden es alfabético: la lista se lee como una agenda.
 */
import type { Usuario } from '@/types'
import { mondayApi } from './sdk'

/** Paleta del avatar. Los mismos tonos que La Batea. */
const COLORES = ['var(--avatar-orange)', 'var(--red)', 'var(--green)', '#575ce5', 'var(--primary-blue)', 'var(--purple)'] as const

/**
 * Color del avatar, derivado del id. Por HASH y no por posición en la lista: la lista crece y se
 * ordena por nombre, y con el índice el color de una persona cambiaría al entrar alguien antes que
 * ella. Con el id, cada uno conserva siempre el mismo color.
 */
export const colorDe = (id: string): string => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORES[h % COLORES.length]
}

/** Iniciales: la primera letra de las dos primeras palabras. "The Automation Partner" → "TA". */
export const inicialesDe = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

/** Una persona lista para dibujar. */
export const comoUsuario = (id: string, name: string): Usuario => ({
  id,
  name,
  ini: inicialesDe(name),
  color: colorDe(id),
})

export async function getUsuarios(): Promise<Usuario[]> {
  const d = await mondayApi<{
    users: { id: string; name: string; enabled?: boolean; is_view_only?: boolean }[]
  }>('query { users(limit: 200) { id name enabled is_view_only } }')
  return (d.users ?? [])
    .filter((u) => u.enabled !== false && !u.is_view_only)
    .map((u) => comoUsuario(String(u.id), u.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
