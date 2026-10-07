/**
 * El rol por team de Monday (Capa 2, después de la lista blanca) y lo que habilita cada rol.
 *
 * Lo que se fija acá:
 *  · sin ningún team, 403 `sin_equipo`; con teams pero ninguno con permisos, 403 `sin_rol`;
 *  · un usuario puede estar en VARIOS teams: tiene un rol por cada team que da uno, y puede la
 *    SUMA de lo que da cada rol; los teams sin permisos no suman ni restan;
 *    "Administracion" NO es "Admin";
 *  · falla CERRADA: si Monday no contesta, 403, y ese fallo no se cachea;
 *  · pasa `exigirAdmin` quien tenga el rol admin entre los suyos;
 *  · en la interfaz, Produccion ve sólo "Consultar órdenes" y el área Producción; Admin, todo;
 *  · en la consulta, Produccion ve SÓLO las enviadas al taller y sólo puede FINALIZARLAS: nunca
 *    reenviar ni cancelar. Admin ve pendientes, sin enviar y del taller, con todas las acciones.
 *
 * Se corre con esbuild + node (`npm run test:equipos`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import { ErrorAuth } from '../api/_guard'
import { exigirAdmin, exigirEquipo, limpiarCacheEquipos, rolesDeEquipos } from '../api/_equipos'
import { estadoDeOrden, type EstadoOrden } from '../src/lib/estadosOp'
import {
  accionesConsulta,
  categoriaConsulta,
  filtrosConsulta,
  puedeEntrar,
  puedeOperar,
  rolesDeEquipos as rolesDeEquiposUi,
  vistaConsulta,
} from '../src/lib/permisos'

/* Las operaciones por área, como en `state/appState` (que no se importa: arrastra el SDK de Monday). */
const OPERACIONES = [
  { id: 'enviar', proceso: 'obras' },
  { id: 'consultar', proceso: 'obras' },
  { id: 'vidrios', proceso: 'obras' },
  { id: 'crearTurno', proceso: 'agenda' },
  { id: 'gestionarTurnos', proceso: 'agenda' },
] as const

process.env.MONDAY_API_TOKEN = 'token-de-prueba'

const sesion = { userId: '107870718', accountId: '35883216', isGuest: false, isAdmin: false, appId: '1' }

let viajes = 0
function responderTeams(teams: string[] | 'falla'): void {
  viajes = 0
  globalThis.fetch = (async () => {
    viajes++
    if (teams === 'falla') throw new Error('red caída')
    return {
      ok: true,
      json: async () => ({ data: { users: [{ id: sesion.userId, teams: teams.map((name, i) => ({ id: String(i), name })) }] } }),
    }
  }) as unknown as typeof fetch
}

async function rechazo(p: Promise<unknown>): Promise<ErrorAuth> {
  try {
    await p
  } catch (e) {
    assert.ok(e instanceof ErrorAuth, 'el rechazo es un ErrorAuth')
    return e
  }
  throw new Error('se esperaba un rechazo')
}

/* ── La regla de nombres, igual en el servidor y en la interfaz ────────────────────────────────── */
for (const roles of [rolesDeEquipos, rolesDeEquiposUi]) {
  assert.deepEqual(roles(['Admin']), ['admin'])
  assert.deepEqual(roles(['Produccion']), ['produccion'])
  assert.deepEqual(roles(['Producción']), ['produccion'], 'con tilde es el mismo team')
  assert.deepEqual(roles(['Produccion', 'Admin']).sort(), ['admin', 'produccion'], 'en dos teams, los dos roles')
  assert.deepEqual(roles(['Ventas', 'Produccion', 'Reparto']), ['produccion'], 'los teams sin permisos no restan')
  assert.deepEqual(roles(['Produccion', 'PRODUCCION']), ['produccion'], 'sin repetir')
  assert.deepEqual(roles(['Administracion']), [], '"Administracion" no es "Admin"')
  assert.deepEqual(roles(['Ventas', 'Reparto']), [])
  assert.deepEqual(roles([]), [])
}

/* ── El servidor ───────────────────────────────────────────────────────────────────────────────── */
limpiarCacheEquipos()
responderTeams([])
{
  const e = await rechazo(exigirEquipo(sesion))
  assert.equal(e.status, 403)
  assert.equal(e.codigo, 'sin_equipo', 'sin team: 403 sin_equipo')
}

limpiarCacheEquipos()
responderTeams(['Ventas'])
assert.equal((await rechazo(exigirEquipo(sesion))).codigo, 'sin_rol', 'team sin permisos: 403 sin_rol')

limpiarCacheEquipos()
responderTeams(['Produccion'])
assert.deepEqual(await exigirEquipo(sesion), ['produccion'])
assert.deepEqual(await exigirEquipo(sesion), ['produccion'])
assert.equal(viajes, 1, 'la segunda vez sale de la caché')

limpiarCacheEquipos()
responderTeams(['Colocacion', 'Produccion', 'Admin'])
assert.deepEqual((await exigirEquipo(sesion)).sort(), ['admin', 'produccion'], 'varios teams: un rol por cada uno')

limpiarCacheEquipos()
responderTeams('falla')
assert.equal((await rechazo(exigirEquipo(sesion))).status, 403, 'Monday caído: nadie entra')
responderTeams(['Admin'])
assert.deepEqual(await exigirEquipo(sesion), ['admin'], 'el fallo no quedó cacheado')

assert.doesNotThrow(() => exigirAdmin({ ...sesion, roles: ['admin'] }))
assert.doesNotThrow(() => exigirAdmin({ ...sesion, roles: ['produccion', 'admin'] }), 'admin entre otros roles')
assert.throws(() => exigirAdmin({ ...sesion, roles: ['produccion'] }), (e: ErrorAuth) => e.codigo === 'operacion_no_permitida')
assert.throws(() => exigirAdmin(sesion), ErrorAuth, 'sin rol resuelto, tampoco')

/* ── La interfaz ───────────────────────────────────────────────────────────────────────────────── */
assert.ok(puedeOperar(['produccion'], 'consultar'), 'produccion entra a Consultar órdenes')
for (const op of ['enviar', 'vidrios', 'crearTurno', 'gestionarTurnos'] as const) {
  assert.ok(!puedeOperar(['produccion'], op), `produccion no ve ${op}`)
}
for (const op of ['enviar', 'consultar', 'vidrios', 'crearTurno', 'gestionarTurnos'] as const) {
  assert.ok(puedeOperar(['admin'], op), `admin ve ${op}`)
  assert.ok(puedeOperar(['produccion', 'admin'], op), `en los dos teams, la suma: ve ${op}`)
}
assert.ok(!puedeOperar([], 'consultar'), 'sin roles, nada')
assert.ok(!puedeOperar(null, 'consultar'))

/* ── La consulta: qué órdenes ve y qué puede hacer cada rol ─────────────────────────────────────── */
assert.deepEqual(vistaConsulta(['produccion']), { pendientes: false, sinEtiqueta: false, taller: true }, 'produccion: SÓLO el taller')
assert.deepEqual(vistaConsulta(['admin']), { pendientes: true, sinEtiqueta: true, taller: true }, 'admin: todo')
assert.deepEqual(vistaConsulta(['produccion', 'admin']), { pendientes: true, sinEtiqueta: true, taller: true }, 'los dos: la suma')
assert.deepEqual(vistaConsulta([]), { pendientes: false, sinEtiqueta: false, taller: false }, 'sin roles: nada')
assert.deepEqual(vistaConsulta(null), { pendientes: false, sinEtiqueta: false, taller: false })

/* Cada estado posible de una OP, con y sin la OP final, para cada rol. */
const ETIQUETAS = ['', 'Generada', 'Enviada Pend Confirmar', 'Generada Pend de Enviar', 'Generada y Enviada Pend Confirmar', 'Confirmada', 'Rechazada', 'Enviada a Taller', 'Produccion Completada', 'Cancelada']
const ordenDe = (estado: string, conOpFinal: boolean) => ({ estado, estadoOrden: estadoDeOrden(estado, conOpFinal) as EstadoOrden })
for (const etiqueta of ETIQUETAS) {
  for (const conOpFinal of [true, false]) {
    const o = ordenDe(etiqueta, conOpFinal)
    const prod = accionesConsulta(['produccion'], o)
    /* Lo crítico: producción NUNCA reenvía, envía ni cancela, en ningún estado. */
    assert.ok(!prod.includes('reenviar') && !prod.includes('enviar') && !prod.includes('cancelar'), `produccion sin envío ni cancelación («${etiqueta}»)`)
    assert.deepEqual(prod, o.estadoOrden === 'taller' ? ['finalizar'] : [], `produccion sólo finaliza las del taller («${etiqueta}»)`)
    assert.deepEqual(accionesConsulta([], o), [], `sin roles, ninguna acción («${etiqueta}»)`)
    assert.deepEqual(accionesConsulta(['produccion', 'admin'], o), accionesConsulta(['admin'], o), `los dos teams = admin («${etiqueta}»)`)
  }
}
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Enviada Pend Confirmar', true)), ['reenviar', 'confirmar', 'cancelar'], 'admin: pendiente → reenviar, confirmar a mano y cancelar')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Generada y Enviada Pend Confirmar', true)), ['reenviar', 'confirmar', 'cancelar'], 'con otro nombre de la etiqueta, igual')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Pend de Confirmar', true)), ['reenviar', 'confirmar', 'cancelar'], 'con el nombre de hoy en el tablero, igual')
assert.ok(!accionesConsulta(['produccion'], ordenDe('Pend de Confirmar', true)).includes('confirmar'), 'Produccion nunca confirma')
assert.ok(!accionesConsulta(['admin'], ordenDe('Generada Pend de Enviar', true)).includes('confirmar'), 'sin enviar no se confirma')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Generada Pend de Enviar', true)), ['enviar', 'cancelar'], 'generada sin enviar → enviar y cancelar')
/* Lo que se veía en la pantalla: un usuario en los teams Produccion Y Admin tiene TODAS las acciones. */
assert.deepEqual(accionesConsulta(['produccion', 'admin'], ordenDe('Generada y Enviada Pend Confirmar', true)), ['reenviar', 'confirmar', 'cancelar'])
assert.deepEqual(accionesConsulta(['produccion', 'admin'], ordenDe('Enviada a Taller', true)), ['finalizar'])
assert.deepEqual(accionesConsulta(['admin'], ordenDe('', true)), ['enviar', 'cancelar'], 'admin: sin estado → enviar y cancelar')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Enviada a Taller', true)), ['finalizar'], 'admin: del taller → finalizar')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Produccion Completada', true)), [], 'completada: nada (no se finaliza dos veces)')
assert.deepEqual(accionesConsulta(['admin'], ordenDe('Cancelada', true)), [], 'cancelada: nada')
assert.ok(puedeEntrar(['produccion'], 'obras', OPERACIONES), 'produccion entra al área Producción')
assert.ok(!puedeEntrar(['produccion'], 'agenda', OPERACIONES), 'produccion no ve la Agenda')
assert.ok(puedeEntrar(['produccion', 'admin'], 'agenda', OPERACIONES), 'con Admin además, sí')
assert.ok(puedeEntrar(['admin'], 'agenda', OPERACIONES))

/* ── Los filtros de la consulta ──────────────────────────────────────────────────────────────── */
assert.deepEqual(filtrosConsulta(['produccion']), { opciones: ['taller'], inicial: 'taller', fijo: true }, 'produccion: sólo "Enviadas al taller", fijo')
assert.deepEqual(filtrosConsulta(['admin']).opciones, ['todas', 'pendientes', 'taller', 'pendEnviar'], 'admin: todos los filtros')
assert.equal(filtrosConsulta(['admin']).fijo, false, 'admin los puede cambiar')
assert.deepEqual(filtrosConsulta(['produccion', 'admin']), filtrosConsulta(['admin']), 'admin y produccion a la vez: lo del admin')
assert.deepEqual(filtrosConsulta([]).opciones, ['taller'], 'sin roles: nada fuera del taller')
assert.equal(categoriaConsulta(ordenDe('Generada y Enviada Pend Confirmar', true)), 'pendientes')
assert.equal(categoriaConsulta(ordenDe('Enviada Pend Confirmar', true)), 'pendientes', 'el nombre viejo, igual')
assert.equal(categoriaConsulta(ordenDe('Enviada a Taller', true)), 'taller')
assert.equal(categoriaConsulta(ordenDe('Generada Pend de Enviar', true)), 'pendEnviar')
assert.equal(categoriaConsulta(ordenDe('', true)), 'pendEnviar', 'sin estado: todavía no se envió')
assert.equal(categoriaConsulta(ordenDe('Cancelada', true)), null)
assert.equal(categoriaConsulta(ordenDe('Produccion Completada', true)), null)

console.log('equipos (rol por team): OK')
