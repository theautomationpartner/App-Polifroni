/**
 * Las reglas del área Presupuesto ("Crear y Cargar Presupuestos", 05/10/2026).
 *
 * Lo que se fija acá:
 *  · a quién se mandó se anota en `✋Enviar a:` con las etiquetas del tablero (Ambos | Cliente |
 *    Arquitecto), y se lee de vuelta al cargar otro presupuesto;
 *  · el envío arranca con los destinatarios de la bolsa o, en una nueva, con los contactos elegidos;
 *  · los contactos usan las MISMAS reglas de destinatario que la OP;
 *  · la bolsa nueva se llama como el cliente o, sin cliente, como el constructor;
 *  · el mensaje no lleva enlace de confirmación ni el código de la cuenta en el saludo;
 *  · las etapas: dos, y su nombre depende de si se crea o se carga otro.
 *
 * Se corre con esbuild + node (`npm run test:presupuesto`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import { destinoDe, faltantesDestino } from '../src/lib/destinatario'
import { etiquetasPasos } from '../src/lib/pasos'
import {
  datosContacto,
  etiquetaEnviarA,
  fechaLocal,
  nombreBolsa,
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
const msj = textoPresupuesto('1111 - PEREZ JUAN')
assert.ok(msj.startsWith('Hola *PEREZ JUAN* 👋'), 'sin el código de la cuenta en el saludo')
assert.ok(!/https?:\/\//.test(msj), 'el presupuesto no lleva enlace')
assert.ok(textoPresupuesto('').startsWith('Hola *Cliente*'))

/* Fecha de envío, en la hora local */
assert.equal(fechaLocal(new Date(2026, 9, 5, 23, 30)), '2026-10-05')

/* Etapas */
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'crear'), ['Seleccionar Cliente', 'Cargar y Enviar Presupuesto'])
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'cargar'), ['Seleccionar Presupuesto', 'Cargar y Enviar Presupuesto'])
assert.equal(etiquetasPasos(null, null, 'enviar').length, 3, 'Producción sigue con tres etapas')

console.log('presupuesto: todas las reglas pasan')
