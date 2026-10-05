/**
 * Capa 2 (cont.) — el ROL del usuario, según su team de Monday.
 *
 * La lista blanca dice si el usuario puede entrar a la app; esto dice QUÉ puede hacer adentro. Se
 * decide por los teams de Monday del usuario de la SESIÓN, leídos por el servidor con su propio
 * token: si viniera del cliente, cualquiera se respondería "Admin" a sí mismo.
 *
 *  · `admin`       team "Admin": todas las funcionalidades.
 *  · `produccion`  team "Produccion": sólo "Completar producción de órdenes".
 *
 * Un usuario puede estar en VARIOS teams: tiene un rol por cada team que da uno, y lo que puede
 * hacer es la SUMA de lo que da cada uno. Los teams que todavía no tienen permisos definidos no
 * suman ni restan. Sin ningún team, 403 `sin_equipo`; con teams pero ninguno que dé un rol, 403
 * `sin_rol`.
 *
 * Igual que la lista blanca, falla CERRADA: si Monday no contesta, nadie entra. El "sí" se cachea
 * cinco minutos (lo que tarda en hacerse efectivo sacar a alguien de un team) y el "no" treinta
 * segundos (lo que espera alguien recién agregado).
 */
import { ErrorAuth, type Rol, type Sesion } from './_errores.js'
import { mondayServidor } from './_mondayApi.js'

export type { Rol } from './_errores.js'

const TTL_PERMITIDO_MS = 5 * 60_000
const TTL_DENEGADO_MS = 30_000

/** Caché por proceso: ahorro de cuota, no fuente de verdad. */
const cache = new Map<string, { roles: Rol[]; sinEquipo: boolean; hasta: number }>()

/** El nombre del team sin tildes ni mayúsculas: "Producción" y "PRODUCCION" son el mismo team. */
const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Qué rol da cada team, por su nombre normalizado. Un team que no está acá no da ninguno. */
const ROL_DEL_EQUIPO: Record<string, Rol> = {
  admin: 'admin',
  produccion: 'produccion',
}

/**
 * Los roles que dan estos teams: uno por cada team que da uno, sin repetir. Comparación EXACTA del
 * nombre: el team "Administracion" no es "Admin".
 */
export function rolesDeEquipos(nombres: string[]): Rol[] {
  const roles = nombres.map((n) => ROL_DEL_EQUIPO[normalizar(n)]).filter((r): r is Rol => Boolean(r))
  return [...new Set(roles)]
}

const QUERY = `
  query ($ids: [ID!]) {
    users(ids: $ids) {
      id
      teams { id name }
    }
  }
`

/** Los nombres de los teams del usuario. Lanza si Monday no contesta: quien llama falla cerrado. */
async function equiposDe(userId: string): Promise<string[]> {
  const data = await mondayServidor<{ users?: { id: string; teams?: { name: string }[] | null }[] }>(QUERY, {
    ids: [userId],
  })
  const usuario = data.users?.find((u) => String(u.id) === userId)
  return (usuario?.teams ?? []).map((t) => (t.name ?? '').trim()).filter(Boolean)
}

/**
 * Los roles del usuario de la sesión (al menos uno). Lanza `ErrorAuth` 403 si no tiene team, si
 * ninguno de sus teams da un rol, o si no se pudieron leer.
 */
export async function exigirEquipo(sesion: Sesion): Promise<Rol[]> {
  const clave = `${sesion.accountId}:${sesion.userId}`

  let guardado = cache.get(clave)
  if (!guardado || Date.now() >= guardado.hasta) {
    let equipos: string[]
    try {
      equipos = await equiposDe(sesion.userId)
    } catch (e) {
      // El fallo no se cachea: en cuanto Monday responde, la app vuelve sola.
      throw new ErrorAuth(403, `no se pudieron leer los teams: ${(e as Error).message}`)
    }
    const roles = rolesDeEquipos(equipos)
    guardado = {
      roles,
      sinEquipo: equipos.length === 0,
      hasta: Date.now() + (roles.length ? TTL_PERMITIDO_MS : TTL_DENEGADO_MS),
    }
    cache.set(clave, guardado)
  }

  if (guardado.sinEquipo) throw new ErrorAuth(403, `sin team asignado ${clave}`, 'sin_equipo')
  if (!guardado.roles.length) throw new ErrorAuth(403, `sus teams no tienen permisos en la app ${clave}`, 'sin_rol')
  return guardado.roles
}

/** ¿Alguno de sus teams lo hace admin? */
export const esAdmin = (sesion: Sesion): boolean => Boolean(sesion.roles?.includes('admin'))

/** Corta con 403 si ninguno de los teams de la sesión es Admin. Para los endpoints que sólo usa el admin. */
export function exigirAdmin(sesion: Sesion): Sesion {
  if (!esAdmin(sesion)) {
    throw new ErrorAuth(
      403,
      `operación sólo para admin (roles ${sesion.roles?.join(', ') || 'ninguno'})`,
      'operacion_no_permitida',
    )
  }
  return sesion
}

/** Vacía la caché. Existe para los tests. */
export function limpiarCacheEquipos(): void {
  cache.clear()
}
