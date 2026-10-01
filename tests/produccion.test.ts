/**
 * Las reglas de negocio de la operación de Producción (documento funcional, 2.4 y 3).
 *
 * Lo que se fija acá:
 *  · cada OP tiene UN estado, leído de `🤖Estado OP`; sin etiqueta decide si tiene la OP final;
 *  · qué acción admite cada estado: enviar sólo Generadas, reenviar sólo Pendientes, al taller
 *    sólo Confirmadas, y las finales (taller, cancelada) ya no admiten nada;
 *  · cada acción de la obra se habilita por el estado de SUS OP, no por columnas de la obra;
 *  · el destinatario es uno solo —cliente o constructor—, con un celular válido, y se avisa cuando
 *    el número podría no ser de esa persona.
 *
 * Se corre con esbuild + node (`npm run test:produccion`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import {
  ETIQUETA_OP,
  accionesDe,
  admite,
  aptaParaTaller,
  enElTaller,
  estadoDeOrden,
  type EstadoOrden,
} from '../src/lib/estadosOp'
import {
  advertenciasDestino,
  celularValido,
  destinoDe,
  faltantesDestino,
  formatoCelular,
  formatoMonday,
  type DatosContacto,
} from '../src/lib/destinatario'
import { etiquetasPasos, ordenesVivas, situacionOrdenes, textoSituacion, tipoDe } from '../src/lib/pasos'
import { validarEntrada } from '../src/features/obras/validaciones'
import type { Obra } from '../src/types'

/* ── Un estado por OP ─────────────────────────────────────────────────────────────────────────── */
assert.equal(estadoDeOrden(ETIQUETA_OP.generada, true), 'generada')
assert.equal(estadoDeOrden(ETIQUETA_OP.pendiente, true), 'pendiente')
assert.equal(estadoDeOrden(ETIQUETA_OP.confirmada, true), 'confirmada')
assert.equal(estadoDeOrden(ETIQUETA_OP.rechazada, true), 'rechazada')
assert.equal(estadoDeOrden(ETIQUETA_OP.taller, true), 'taller')
assert.equal(estadoDeOrden(ETIQUETA_OP.cancelada, true), 'cancelada')
assert.equal(estadoDeOrden('', true), 'generada', 'sin etiqueta y con OP final: una emitida de antes')
assert.equal(estadoDeOrden('', false), 'borrador', 'sin etiqueta ni OP final: se cargó el original y nada más')
assert.equal(estadoDeOrden(ETIQUETA_OP.generada, false), 'borrador', '"Generada" sin documento no se puede enviar')
assert.equal(estadoDeOrden('Algo raro', false), 'borrador', 'una etiqueta desconocida no habilita nada')
assert.equal(estadoDeOrden(ETIQUETA_OP.cancelada, false), 'cancelada', 'cancelar un borrador lo deja cancelado')

/* ── Qué admite cada estado ───────────────────────────────────────────────────────────────────── */
assert.deepEqual([...accionesDe('generada')], ['enviar', 'cancelar'])
assert.deepEqual([...accionesDe('pendiente')], ['reenviar', 'cancelar'])
assert.deepEqual([...accionesDe('confirmada')], ['taller', 'cancelar'])
assert.ok(!admite('generada', 'reenviar'), 'enviar y reenviar son acciones separadas')
assert.ok(!admite('pendiente', 'enviar'), 'una OP ya enviada no se vuelve a "enviar": se reenvía')
assert.ok(!admite('pendiente', 'taller'), 'sin confirmación no se fabrica')
assert.ok(!admite('rechazada', 'reenviar'), 'rechazada: se cancela y se genera otra')
assert.ok(!admite('rechazada', 'taller'))
for (const final of ['taller', 'cancelada'] as EstadoOrden[]) {
  assert.equal(accionesDe(final).length, 0, `${final} es final: sólo se consulta`)
}
assert.ok(admite('borrador', 'cancelar'), 'los borradores se pueden limpiar cancelándolos')

/* ── Las etapas se llaman según a quién se envía y el tipo de obra ──────────────────────────────── */
assert.deepEqual(etiquetasPasos('cliente', 'PVC'), ['Seleccionar Obra', 'Cargar OP Hetmo', 'Emitir y Enviar OP'])
assert.deepEqual(etiquetasPasos('cliente', 'Aluminio'), ['Seleccionar Obra', 'Cargar OP', 'Enviar OP'])
assert.deepEqual(etiquetasPasos('taller', 'PVC'), ['Seleccionar Obra', 'Seleccionar OP A Enviar', 'Enviar OP'])
assert.deepEqual(etiquetasPasos('taller', 'Aluminio'), ['Seleccionar Obra', 'Seleccionar OP A Enviar', 'Enviar OP'])
/* "Enviar una ya cargada" pisa el tipo: tabla y envío, también en PVC (sin emitir). */
assert.deepEqual(etiquetasPasos('cliente', 'PVC', true), ['Seleccionar Obra', 'Seleccionar OP A Enviar', 'Enviar OP'])
assert.deepEqual(etiquetasPasos('cliente', 'Aluminio', true), ['Seleccionar Obra', 'Seleccionar OP A Enviar', 'Enviar OP'])

/* ── Lo que se pregunta al elegir la obra ────────────────────────────────────────────────────── */
const obraCon = (tipo: string, ...estados: EstadoOrden[]): Obra =>
  ({
    tipo: { texto: tipo, color: '' },
    ordenes: estados.map((estado, i) => ({ id: String(i + 1), estado })),
    ordenesIds: estados.map((_, i) => String(i + 1)),
    confirmacionOp: { texto: '', color: '' },
  }) as unknown as Obra

assert.equal(tipoDe(obraCon('')), null, 'sin tipo no se adivina PVC ni Aluminio')
assert.equal(tipoDe(obraCon('PVC')), 'PVC')
assert.equal(tipoDe(obraCon('Aluminio')), 'Aluminio')
assert.equal(ordenesVivas(obraCon('PVC', 'cancelada', 'borrador')).length, 0, 'canceladas y borradores no cuentan')
assert.equal(validarEntrada('cliente', obraCon('PVC')), null, 'obra sin órdenes: se entra directo')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada'))?.aceptar, 'Cargar una nueva', 'con órdenes se pregunta')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada'))?.alternativa, 'Enviar una ya cargada')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada'))?.cancelar, 'Cancelar')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'cancelada'))?.aceptar, 'Cargar una nueva', 'cuenta todo lo vinculado')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada', 'confirmada'))?.aceptar, undefined, 'con una confirmada no deja seguir')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'taller'))?.aceptar, undefined, 'ya en el taller cuenta como confirmada')
assert.deepEqual(situacionOrdenes(obraCon('PVC')), { tipo: 'sin' })
assert.deepEqual(situacionOrdenes(obraCon('PVC', 'generada', 'pendiente')), { tipo: 'asignadas', n: 2 })
assert.deepEqual(situacionOrdenes(obraCon('PVC', 'pendiente', 'confirmada')), { tipo: 'confirmada' })
assert.equal(textoSituacion({ tipo: 'asignadas', n: 1 }), '1 Orden de Producción asignada')
assert.equal(textoSituacion({ tipo: 'asignadas', n: 3 }), '3 Órdenes de Producción asignadas')
assert.equal(validarEntrada('cliente', obraCon(''))?.aceptar, undefined, 'sin tipo no hay con qué seguir')
assert.equal(validarEntrada('taller', obraCon('PVC'))?.destino, 'cliente', 'sin órdenes, al taller no hay nada: se ofrece cargar')
assert.equal(validarEntrada('taller', obraCon('PVC', 'confirmada')), null)
assert.equal(validarEntrada('taller', obraCon('PVC', 'pendiente'))?.destino, 'taller', 'sin confirmadas se avisa, pero se puede mirar')

/* ── Destinatario: uno solo, con un celular que llegue ───────────────────────────────────────── */
const contacto = (c: Partial<DatosContacto>): DatosContacto => ({
  ctaCteCliente: '1111 - PEREZ JUAN',
  celCliente: '5491122334455',
  emailCliente: 'juan@mail.com',
  arquitecto: 'ARQ. GOMEZ',
  celArquitecto: '5491199998888',
  ...c,
})

const cliente = destinoDe(contacto({}), 'Cliente')
assert.equal(cliente.nombre, 'PEREZ JUAN', 'el código de la cuenta no va en el saludo')
assert.equal(cliente.whatsapp, '5491122334455')
assert.equal(destinoDe(contacto({}), 'Constructor').whatsapp, '5491199998888', 'cada rol, su número')
assert.equal(destinoDe(contacto({}), 'Constructor').email, '', 'el constructor no tiene mail espejado')

assert.deepEqual(faltantesDestino(contacto({}), 'Cliente'), [])
assert.equal(faltantesDestino(contacto({}), '').length, 1, 'sin rol elegido, se pide elegirlo')
assert.match(faltantesDestino(contacto({ celCliente: '' }), 'Cliente')[0], /celular/)
assert.match(faltantesDestino(contacto({ celCliente: '123' }), 'Cliente')[0], /formato válido/)
assert.match(
  faltantesDestino(contacto({ arquitecto: 'SIN ARQUITECTO' }), 'Constructor')[0],
  /no tiene un constructor/,
  '"SIN ARQUITECTO" es el comodín del tablero, no una persona',
)

assert.ok(celularValido('5491122334455'))
assert.ok(celularValido('541122334455'))
assert.ok(celularValido('1122334455'))
assert.ok(!celularValido('22334455'))
assert.ok(!celularValido('54911223344556'))
assert.equal(formatoCelular('5491122334455'), '+54 9 11 2233-4455')
assert.equal(formatoMonday('542494522200'), '+54 249 452 2200', 'el formato de Monday')
assert.equal(formatoMonday('5492494587833'), '+54 9 249 458 7833', 'con el 9 de los móviles')
assert.equal(formatoMonday(''), '')

assert.match(
  advertenciasDestino(contacto({ celArquitecto: '1122334455' }), 'Cliente')[0],
  /MISMO celular/,
  'el mismo número (con o sin 549) en los dos roles se avisa',
)
const varios = contacto({ celCliente: '5491122334455, 5491100001111' })
assert.equal(destinoDe(varios, 'Cliente').whatsapp, '5491122334455', 'con varios, el primero')
assert.match(advertenciasDestino(varios, 'Cliente')[0], /más de un celular/)
assert.deepEqual(advertenciasDestino(contacto({}), 'Cliente'), [])

console.log('produccion (estados, acciones y destinatario): OK')

/* ── Al taller: confirmada y todavía no enviada ───────────────────────────────────────────────── */
assert.equal(aptaParaTaller('confirmada', ''), true, 'confirmada sin envío al taller')
assert.equal(aptaParaTaller('confirmada', 'NO enviada'), true)
assert.equal(aptaParaTaller('confirmada', 'Error de Envio'), true, 'un envío fallido se reintenta')
assert.equal(aptaParaTaller('confirmada', 'Enviando...'), false)
assert.equal(aptaParaTaller('confirmada', 'Enviado'), false, 'ya enviada: no se repite')
assert.equal(aptaParaTaller('taller', ''), false)
assert.equal(aptaParaTaller('pendiente', ''), false)
assert.equal(enElTaller('taller', ''), true)
assert.equal(enElTaller('confirmada', 'Enviado'), true)
assert.equal(enElTaller('confirmada', 'Error de Envio'), false)
{
  const base = obraCon('Aluminio', 'taller')
  const v = validarEntrada('taller', base)
  assert.equal(v?.titulo, 'Esta obra ya envió su orden al taller', 'la que ya está en el taller se informa')
  assert.equal(v?.aceptar, undefined, 'y no deja seguir')
  const apta = { ...base, ordenes: [{ id: '1', estado: 'confirmada' as EstadoOrden, envioTaller: 'Error de Envio' }] }
  assert.equal(validarEntrada('taller', apta), null, 'confirmada con envío fallido: entra')
  const pend = obraCon('Aluminio', 'pendiente', 'pendiente')
  assert.match(validarEntrada('taller', pend)?.nota ?? '', /2 órdenes pendientes de confirmar/)
}
