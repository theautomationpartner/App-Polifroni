/**
 * Qué puede hacer cada team de Monday adentro de la app.
 *
 *  · Admin       todas las funcionalidades.
 *  · Produccion  sólo "Consultar órdenes de producción", y ahí sólo las enviadas al taller, para
 *                finalizar su producción (ver `vistaConsulta` y `accionesConsulta`).
 *
 * Un usuario puede estar en VARIOS teams: tiene el rol de cada uno, y puede hacer la SUMA de lo que
 * da cada rol. Los teams sin permisos definidos no suman ni restan.
 *
 * Los roles los decide el SERVIDOR con los teams del usuario de la sesión (ver `api/_equipos.ts`) y
 * llegan en `/api/usuario`; esto sólo decide qué se muestra. Quien fuerce una pantalla igual choca
 * con el servidor: el proxy no deja escribir a quien no es admin, y las rutas de envío, lectura con
 * IA y numeración son sólo de admin.
 *
 * En desarrollo no hay servidor: los roles salen de los teams que devuelve `me`, con la misma regla.
 *
 * Este archivo no habla con Monday: es la regla sola, para poder probarla sin red.
 */
import { admite, completable, type EstadoOrden } from '@/lib/estadosOp'
import { normalizar } from '@/lib/texto'
import type { Operacion, Proceso, Rol } from '@/types'

/** Qué rol da cada team, por su nombre normalizado. Un team que no está acá no da ninguno. */
const ROL_DEL_EQUIPO: Record<string, Rol> = {
  admin: 'admin',
  produccion: 'produccion',
}

/**
 * Los roles que dan estos teams: uno por cada team que da uno, sin repetir. La comparación es
 * EXACTA: el team "Administracion" no es "Admin".
 */
export function rolesDeEquipos(nombres: string[]): Rol[] {
  const roles = nombres.map((n) => ROL_DEL_EQUIPO[normalizar(n.trim())]).filter((r): r is Rol => Boolean(r))
  return [...new Set(roles)]
}

/** Las operaciones de cada rol. `'todas'`: el admin no tiene lista, puede todo. */
const OPERACIONES_DEL_ROL: Record<Rol, readonly Operacion[] | 'todas'> = {
  admin: 'todas',
  produccion: ['consultar'],
}

/** ¿Alguno de sus roles habilita la operación? Es la suma de lo que da cada team. */
export function puedeOperar(roles: readonly Rol[] | null | undefined, operacion: Operacion): boolean {
  return (roles ?? []).some((rol) => {
    const ops = OPERACIONES_DEL_ROL[rol]
    return ops === 'todas' || ops.includes(operacion)
  })
}

/** ¿Los roles ven el área? Sólo si alguno tiene alguna operación en ella. */
export function puedeEntrar(
  roles: readonly Rol[] | null | undefined,
  proceso: Proceso,
  operaciones: readonly { id: Operacion; proceso: Proceso }[],
): boolean {
  return operaciones.some((o) => o.proceso === proceso && puedeOperar(roles, o.id))
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Consultar órdenes de producción: qué ve y qué puede hacer cada rol
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Qué órdenes trae la consulta: las pendientes de confirmar, las sin estado y las del taller. */
export interface VistaConsulta {
  pendientes: boolean
  sinEtiqueta: boolean
  taller: boolean
}

/**
 * Qué órdenes ve cada rol en la consulta. Admin: todas (pendientes de confirmar, sin enviar y en el
 * taller). Produccion: SÓLO las enviadas al taller. Con los dos teams, la suma: lo del admin.
 */
export function vistaConsulta(roles: readonly Rol[] | null | undefined): VistaConsulta {
  const admin = (roles ?? []).includes('admin')
  const produccion = (roles ?? []).includes('produccion')
  return { pendientes: admin, sinEtiqueta: admin, taller: admin || produccion }
}

export type AccionConsulta = 'enviar' | 'reenviar' | 'cancelar' | 'finalizar'

/**
 * Las acciones que tiene una fila de la consulta para estos roles.
 *  - Admin: enviar (una sin estado o generada), reenviar (pendiente), cancelar (lo que el estado
 *    admita) y finalizar (enviada al taller).
 *  - Produccion: sólo finalizar, y sólo una enviada al taller. NUNCA reenviar ni cancelar.
 * El servidor lo hace cumplir igual: el envío y las escrituras por el proxy son sólo de admin; la
 * finalización tiene su ruta, que sólo mueve una OP que sigue en el taller.
 */
export function accionesConsulta(
  roles: readonly Rol[] | null | undefined,
  orden: { estadoOrden: EstadoOrden; estado: string },
): AccionConsulta[] {
  const admin = (roles ?? []).includes('admin')
  const produccion = (roles ?? []).includes('produccion')
  const acciones: AccionConsulta[] = []
  if (admin) {
    if (admite(orden.estadoOrden, 'reenviar')) acciones.push('reenviar')
    else if (!orden.estado.trim() || admite(orden.estadoOrden, 'enviar')) acciones.push('enviar')
    if (admite(orden.estadoOrden, 'cancelar')) acciones.push('cancelar')
  }
  if ((admin || produccion) && completable(orden.estadoOrden)) acciones.push('finalizar')
  return acciones
}

