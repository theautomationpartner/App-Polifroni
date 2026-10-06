/**
 * Las reglas del área Presupuesto ("Crear y Cargar Presupuestos", 05/10/2026).
 *
 * Lo que se fija acá:
 *  · a quién se mandó se anota en `✋Enviar a:` con las etiquetas del tablero (Ambos | Cliente |
 *    Arquitecto), y se lee de vuelta al cargar otro presupuesto;
 *  · el envío arranca con los destinatarios de la bolsa o, en una nueva, con los contactos elegidos;
 *  · los contactos usan las MISMAS reglas de destinatario que la OP;
 *  · la bolsa nueva se llama como el cliente o, sin cliente, como el constructor;
 *  · el mensaje lleva el enlace de confirmación (la marca que reemplaza el servidor) sólo para quien
 *    confirma, y no lleva el código de la cuenta en el saludo;
 *  · las etapas: dos, y su nombre depende de si se crea o se carga otro;
 *  · la consulta lista sólo los que se gestionan (ni ganados ni perdidos), y para ganar uno hace falta
 *    el presupuesto elegido con PDF, el total pactado y la cuenta corriente del cliente.
 *
 * Se corre con esbuild + node (`npm run test:presupuesto`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import { MARCA_ENLACE as MARCA_ENLACE_SERVIDOR } from '../api/_confirmacion'
import { MARCA_ENLACE } from '../src/lib/claveConfirmacion'
import { destinoDe, faltantesDestino } from '../src/lib/destinatario'
import { etiquetasPasos } from '../src/lib/pasos'
import {
  INDICES_GESTION,
  datosContacto,
  nuevaClave,
  etiquetaEnviarA,
  faltantesGanar,
  fechaLocal,
  ganable,
  gestionable,
  importeDe,
  nombreBolsa,
  nombreMovimiento,
  pasaFiltro,
  tipoObraDe,
  rolesDeEnviarA,
  rolesIniciales,
  textoPresupuesto,
} from '../src/lib/presupuesto'

/* ✋Enviar a: */
assert.equal(etiquetaEnviarA(['Cliente', 'Constructor']), 'Ambos')
assert.equal(etiquetaEnviarA(['Cliente']), 'Cliente')
assert.equal(etiquetaEnviarA(['Constructor']), 'Arquitecto', 'el tablero llama Arquitecto al constructor')
assert.equal(etiquetaEnviarA([]), '')
assert.deepEqual(rolesDeEnviarA('Ambos'), ['Cliente', 'Constructor'])
assert.deepEqual(rolesDeEnviarA('Arquitecto'), ['Constructor'])
assert.deepEqual(rolesDeEnviarA(''), [])

/* Destinatarios iniciales */
assert.deepEqual(rolesIniciales('', true, true), ['Cliente', 'Constructor'], 'nueva: todos los elegidos')
assert.deepEqual(rolesIniciales('', false, true), ['Constructor'])
assert.deepEqual(rolesIniciales('Cliente', true, true), ['Cliente'], 'cargar otro: los de la bolsa')
assert.deepEqual(rolesIniciales('Ambos', true, false), ['Cliente'], 'sólo los que existen')
assert.deepEqual(rolesIniciales('Arquitecto', true, false), ['Cliente'], 'el de la bolsa ya no está: los elegidos')

/* Las reglas de destinatario de la OP, con los contactos del presupuesto */
const datos = datosContacto({ nombre: 'PEREZ JUAN', celular: '5492494369123' }, null)
assert.equal(destinoDe(datos, 'Cliente').whatsapp, '5492494369123')
assert.deepEqual(faltantesDestino(datos, 'Cliente'), [])
assert.equal(destinoDe(datos, 'Constructor').nombre, '', 'sin constructor no hay a quién')
assert.ok(
  faltantesDestino(datosContacto({ nombre: 'X', celular: '' }, null), 'Cliente').some((f) => f.includes('celular')),
  'sin celular no se manda',
)

/* Nombre de la bolsa */
assert.equal(nombreBolsa({ nombre: 'PEREZ JUAN', celular: '' }, { nombre: 'ARQ. GOMEZ', celular: '' }), 'PEREZ JUAN')
assert.equal(nombreBolsa(null, { nombre: 'ARQ. GOMEZ', celular: '' }), 'ARQ. GOMEZ')

/* Mensaje */
assert.equal(
  textoPresupuesto('1111 - PEREZ JUAN', new Date(2026, 9, 5, 15, 0)),
  [
    '👋Hola *PEREZ JUAN*,',
    'Adjuntamos el presupuesto. Si tenés alguna consulta sobre este o tu cuenta, por favor respondé a este mensaje o contactanos.',
    '📄 *Concepto:* Presupuesto\n📅 *Fecha:* 05/10/2026',
    'Polifroni Aberturas\nAutomatizado por *The Automation Partner*',
  ].join('\n\n'),
  'la plantilla del usuario, sin el código de la cuenta y con la fecha del envío',
)
assert.ok(!/https?:\/\//.test(textoPresupuesto('X')), 'el presupuesto no lleva enlace')
assert.ok(textoPresupuesto('').startsWith('👋Hola *Cliente*'))

/* Enlace de confirmación: sólo para quien confirma. La app pone la marca; el servidor, el enlace firmado */
const conEnlace = textoPresupuesto('PEREZ JUAN', new Date(2026, 9, 5), true)
assert.ok(conEnlace.includes(`podés confirmarlo haciendo click en el siguiente enlace: ${MARCA_ENLACE}`))
assert.ok(conEnlace.indexOf(MARCA_ENLACE) < conEnlace.indexOf('Polifroni Aberturas'), 'el enlace va antes de la firma')
assert.ok(!textoPresupuesto('PEREZ JUAN', new Date(2026, 9, 5)).includes(MARCA_ENLACE), 'sin confirmador, sin enlace')
assert.ok(!/hook\.us1\.make\.com/.test(conEnlace), 'ninguna URL de Make en el mensaje')
assert.equal(MARCA_ENLACE, MARCA_ENLACE_SERVIDOR, 'la app y el servidor usan la misma marca')
const c1 = nuevaClave()
const c2 = nuevaClave()
assert.ok(c1.length >= 32 && c1 !== c2, 'claves únicas')

/* Fecha de envío, en la hora local */
assert.equal(fechaLocal(new Date(2026, 9, 5, 23, 30)), '2026-10-05')

/* Etapas */
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'crear'), ['Seleccionar Cliente', 'Cargar y Enviar Presupuesto'])
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'cargar'), ['Seleccionar Presupuesto', 'Cargar y Enviar Presupuesto'])
assert.equal(etiquetasPasos(null, null, 'enviar').length, 3, 'Producción sigue con tres etapas')

/* Consultar y Gestionar: qué se lista */
assert.deepEqual([...INDICES_GESTION].sort(), [1, 3, 4, 5], 'enviado, negociación, vencido y solicitud')
for (const e of ['Presupuesto Enviado', 'En Negociacion', 'Presupuesto vencido', 'Solicitud de Presupuesto']) assert.ok(gestionable(e), e)
for (const e of ['Ganado', 'Perdido', 'Proyecto Ganado con otro pres', '']) assert.ok(!gestionable(e), e)
assert.ok(pasaFiltro('pendientes', 'Presupuesto Enviado'))
assert.ok(pasaFiltro('pendientes', 'Solicitud de Presupuesto'))
assert.ok(!pasaFiltro('pendientes', 'En Negociacion'))
assert.ok(pasaFiltro('vencidos', 'Presupuesto vencido'))
assert.ok(!pasaFiltro('todos', 'Ganado'))
assert.ok(!ganable('Presupuesto vencido'), 'un vencido no se gana')
for (const e of ['Presupuesto Enviado', 'En Negociacion', 'Solicitud de Presupuesto']) assert.ok(ganable(e), e)
assert.ok(!ganable('Perdido'))

/* Ganar */
assert.equal(tipoObraDe('PVC'), 'PVC')
assert.equal(tipoObraDe('Alumino'), 'Aluminio')
assert.equal(tipoObraDe('Aluminio A30New'), 'Aluminio')
assert.equal(tipoObraDe(''), '')
assert.equal(importeDe('1.731.694,48'), 1731694.48)
assert.equal(importeDe('1731694.48'), 1731694.48)
assert.equal(importeDe('$ 604500'), 604500)
assert.equal(importeDe('604.500'), 604500, 'puntos de miles sin coma')
assert.equal(importeDe('1.731.694'), 1731694)
assert.equal(importeDe('abc'), null)
assert.equal(importeDe(''), null)
const listo = { presupuestoElegido: true, conPdf: true, total: '604.500', conCliente: true, cuentas: 1, cuentaElegida: true }
assert.deepEqual(faltantesGanar(listo), [])
assert.equal(faltantesGanar({ ...listo, total: '0' }).length, 1, 'el total tiene que ser mayor a cero')
assert.equal(faltantesGanar({ ...listo, conPdf: false }).length, 1)
assert.ok(faltantesGanar({ ...listo, conCliente: false })[0].includes('cliente'), 'sin cliente no hay cuenta corriente')
assert.ok(faltantesGanar({ ...listo, cuentas: 0 })[0].includes('cuenta corriente activa'))
assert.equal(faltantesGanar({ ...listo, cuentas: 2, cuentaElegida: false }).length, 1, 'con varias cuentas, se elige')
assert.equal(nombreMovimiento('IDOBRA-787', 'DIAZ CARLOS NICOLAS'), 'IDOBRA-787 - DIAZ CARLOS NICOLAS', 'como lo deja Make')
assert.equal(nombreMovimiento('', 'DIAZ'), 'DIAZ')

console.log('presupuesto: todas las reglas pasan')
