/**
 * Capa 2 (cont.) — el ROL del usuario, según su team de Monday.
 *
 * La lista blanca dice si el usuario puede entrar a la app; esto dice QUÉ puede hacer adentro. Se
 * decide por los teams de Monday del usuario de la SESIÓN, leídos por el servidor con su propio
 * token: si viniera del cliente, cualquiera se respondería "Admin" a sí mismo.
 *
 *  · `admin`       team "Admin": todas las funcionalidades.
 *  · `produccion`  team "Produccion": sólo el área Producción, y en ella sólo "Consultar órdenes
 *                  de producción" (ver `src/lib/permisos.ts`).
 *  · `administracion` team "Administracion": el área Agenda, todas sus operaciones.
 *  · `ventas`      team "Ventas": el área Presupuesto, todas sus operaciones.
 *
 * Hardcodeado por ahora (regla del cliente, 2026-10-07). Qué rutas del servidor usa cada rol está
 * en `RUTAS_DEL_ROL`: la interfaz esconde lo que no le toca, pero el que manda es el servidor.
 *
 * El team es el de la CUENTA de Monday. La columna "Team" de la lista blanca es sólo informativa
 * —para ver de un vistazo a qué equipo pertenece cada usuario— y NO se lee para autorizar nada.
 *
 * Un usuario puede estar en VARIOS teams: tiene un rol por cada team que da uno, y lo que puede
 * hacer es la SUMA de lo que da cada uno.
 *
 * Para ENTRAR alcanza con tener un team, el que sea: sin ningún team no hay con qué autorizar nada
 * y es 403 `sin_equipo`. Un team que todavía no tiene permisos definidos (Ventas, Colocacion...)
 * entra igual —se registra, pasa el código de verificación y ve la app—, pero sin roles: no ve
 * ningún área ni operación hasta que exista una para su equipo.
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
const cache = new Map<string, { roles: Rol[]; equipos: string[]; hasta: number }>()

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
  administracion: 'administracion',
  ventas: 'ventas',
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
 * Los teams del usuario de la sesión y los roles que le dan (pueden ser ninguno: entra, pero no ve
 * nada). Lanza `ErrorAuth` 403 si no tiene ningún team o si no se pudieron leer.
 */
export async function exigirEquipo(sesion: Sesion): Promise<{ roles: Rol[]; equipos: string[] }> {
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
      equipos,
      hasta: Date.now() + (equipos.length ? TTL_PERMITIDO_MS : TTL_DENEGADO_MS),
    }
    cache.set(clave, guardado)
  }

  if (!guardado.equipos.length) throw new ErrorAuth(403, `sin team asignado ${clave}`, 'sin_equipo')
  return { roles: guardado.roles, equipos: guardado.equipos }
}

/** ¿Alguno de sus teams lo hace admin? */
export const esAdmin = (sesion: Sesion): boolean => Boolean(sesion.roles?.includes('admin'))

/**
 * Las rutas del servidor que usa cada área, y por eso cada rol. El admin, todas.
 *  · Agenda (administracion): escribir en Monday, buscar obras y mandar el aviso por WhatsApp.
 *  · Presupuesto (ventas): escribir en Monday, buscar obras, subir el PDF y enviarlo por WhatsApp.
 *  · Producción · Consultar (produccion): sólo finalizar la producción de una OP.
 * La lectura con IA y la numeración son de la carga de OP, que es sólo del admin.
 */
export type Ruta = 'escribir' | 'obras' | 'whatsapp' | 'subir' | 'finalizar' | 'ia' | 'numeracion'

const RUTAS_DEL_ROL: Record<Exclude<Rol, 'admin'>, readonly Ruta[]> = {
  produccion: ['finalizar'],
  administracion: ['escribir', 'obras', 'whatsapp'],
  ventas: ['escribir', 'obras', 'whatsapp', 'subir'],
}

/** ¿Alguno de los roles de la sesión usa esta ruta? La suma de lo de cada team. */
export const puedeUsar = (sesion: Sesion, ruta: Ruta): boolean =>
  (sesion.roles ?? []).some((rol) => rol === 'admin' || RUTAS_DEL_ROL[rol].includes(ruta))

/** Corta con 403 si ninguno de los roles de la sesión usa esta ruta. */
export function exigirRuta(sesion: Sesion, ruta: Ruta): Sesion {
  if (!puedeUsar(sesion, ruta)) {
    throw new ErrorAuth(
      403,
      `ruta ${ruta} no habilitada (roles ${sesion.roles?.join(', ') || 'ninguno'})`,
      'operacion_no_permitida',
    )
  }
  return sesion
}

/** Corta con 403 si ninguno de los teams de la sesión es Admin. */
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
