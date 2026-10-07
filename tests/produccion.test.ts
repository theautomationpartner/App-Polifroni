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
  completable,
  enElTaller,
  estadoDeOrden,
  etiquetaOp,
  indiceDeEtiqueta,
  indiceDeValor,
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
import { fechaRecordatorio } from '../src/lib/recordatorio'
import { colorCancelado, porcentajeCancelado } from '../src/lib/cancelado'
import {
  cantidadValida,
  composicion,
  consolidar,
  medidaValida,
  ordenParaCortes,
  ordenVisibleEnCortes,
  textoSolicitud,
} from '../src/lib/vidrios'
import { aAberturasOp, aVidriosOp } from '../src/lib/lecturaHetmo'
import { validarTelWsp } from '../api/_telWsp'
import { enlaceConfirmacion } from '../api/_confirmacion'
import { textoEdicion, textoReenvio, textoTaller } from '../api/_mensajeOp'
import { filasSubelementos, modeloDeSubelemento } from '../src/lib/subelementosOp'
import { aModeloListado, aberturasNuevas, editarModelo, filasAberturas, filasVidrios, hayCambiosAberturas, hayCambiosVidrios, textoNueva, mismaAbertura, modelosDe, motivoEdicion, nombreConVersion, partirTipoVidrio } from '../src/lib/edicionOp'
import { armarActividadEnvio } from '../src/lib/actividadEnvio'
import type { Obra } from '../src/types'

/* ── Un estado por OP ─────────────────────────────────────────────────────────────────────────── */
assert.equal(estadoDeOrden(ETIQUETA_OP.generada, true), 'generada')
/* Las etiquetas renombradas en el tablero (07/10/2026): "Generada" y "Pend de Confirmar". */
assert.equal(estadoDeOrden('Generada', true), 'generada', 'el nombre de hoy de "Generada Pend de Enviar"')
assert.equal(estadoDeOrden('Pend de Confirmar', true), 'pendiente', 'el nombre de hoy de "Enviada Pend de Confirmar"')
assert.equal(estadoDeOrden('Generada y Enviada Pend Confirmar', true), 'pendiente', 'un nombre anterior')
assert.equal(etiquetaOp('Pend de Confirmar'), 'Enviada Pend de Confirmar', 'en pantalla, con el nombre de antes')
assert.equal(etiquetaOp('Generada'), 'Generada Pend de Enviar')
assert.equal(etiquetaOp('Cualquier nombre', 3), 'Enviada Pend de Confirmar', 'el índice manda sobre el nombre')
assert.equal(etiquetaOp('Cualquier nombre', 6), 'Generada Pend de Enviar')
assert.equal(indiceDeEtiqueta('Pend de Confirmar'), 3)
assert.equal(indiceDeEtiqueta(ETIQUETA_OP.pendiente), 3, 'se escribe por índice, sin importar el nombre')
assert.equal(indiceDeEtiqueta('Generada'), 6)
assert.equal(indiceDeEtiqueta(ETIQUETA_OP.cancelada), 2)
assert.equal(indiceDeEtiqueta(ETIQUETA_OP.rechazada), null, '"NO Confirmado" no tiene índice')
assert.equal(indiceDeValor('{"index":3,"post_id":null}'), 3)
assert.equal(indiceDeValor(null), null)
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
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada'))?.cancelar, 'Volver', 'sólo Volver o Cargar una nueva')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'cancelada')), null, 'sólo canceladas: es una obra sin órdenes, se entra directo')
assert.deepEqual(situacionOrdenes(obraCon('PVC', 'cancelada', 'cancelada')), { tipo: 'sin' }, 'las canceladas no cuentan')
assert.deepEqual(situacionOrdenes(obraCon('PVC', 'cancelada', 'pendiente', 'borrador')), { tipo: 'asignadas', n: 2 }, 'cuenta las que no están canceladas')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada', 'confirmada'))?.aceptar, 'Cargar una nueva', 'con una confirmada se avisa, pero se puede cargar otra')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada', 'confirmada'))?.cancelar, 'Volver')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'generada', 'confirmada'))?.titulo, 'Esta obra ya tiene una orden confirmada')
assert.equal(validarEntrada('cliente', obraCon('PVC', 'taller'))?.aceptar, 'Cargar una nueva', 'ya en el taller cuenta como confirmada, y tampoco bloquea')
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

/* ── Recordatorio: el primer envío + 5 días corridos, en la fecha local ───────────────────────── */
assert.equal(fechaRecordatorio(new Date(2026, 9, 2, 10, 0)), '2026-10-07')
assert.equal(fechaRecordatorio(new Date(2026, 9, 2, 23, 30)), '2026-10-07', 'de noche sigue siendo el día local')
assert.equal(fechaRecordatorio(new Date(2026, 9, 29)), '2026-11-03', 'cruza de mes')
assert.equal(fechaRecordatorio(new Date(2026, 11, 29)), '2027-01-03', 'cruza de año')

/* ── Vidrios: composición y cortes consolidados para el proveedor ─────────────────────────────── */
{
  const v = (modelo: string, comp1: string, camara: string, comp2: string, ancho: string, alto: string, cantidad: number | null) =>
    ({ modelo, comp1, camara, comp2, ancho, alto, cantidad })
  assert.equal(composicion(v('V1', '4', '12', '4', '843', '1.013', 1)), '4 + 12 + 4', 'DVH')
  assert.equal(composicion(v('V2', '3+3', '', '', '500', '700', 1)), '3+3', 'simple')
  const cortes = consolidar([
    { op: 'IDOP-071', vidrio: v('V1', '4', '12', '4', '843', '1.013', 2) },
    { op: 'IDOP-072', vidrio: v('V7', '4', '12', '4', '843', '1013', 1) },
    { op: 'IDOP-071', vidrio: v('V2', '4', '12', '4', '459', '923', 1) },
    { op: 'IDOP-071', vidrio: v('M1', '3+3', '', '', '500', '700', null) },
  ])
  assert.equal(cortes.length, 3, 'los cortes iguales se juntan aunque la medida venga con o sin punto de miles')
  assert.equal(cortes[0].composicion, '3+3', 'ordenados por composición')
  assert.equal(cortes[0].sinCantidad, true, 'sin cantidad se marca para revisar')
  assert.equal(cortes[1].cantidad, 3, 'suma las piezas de las dos OP')
  assert.deepEqual(cortes[1].origen, ['IDOP-071 · V1', 'IDOP-072 · V7'])
  assert.equal(cortes[2].ancho, '459', 'dentro de una composición, de la más grande a la más chica')
  assert.match(textoSolicitud('Obra X', cortes), /Total: 4 piezas/)
}

/* ── % cancelado de la obra: el valor y el color de la torta ───────────────────────────────────── */
assert.equal(porcentajeCancelado('96%', null, null), 96)
assert.equal(porcentajeCancelado('', 2880, 10000), 28.8, 'fórmula vacía: se calcula con los importes')
assert.equal(porcentajeCancelado('', null, null), null)
assert.equal(colorCancelado(69.9), '#e2445c', 'menos del 70: rojo')
assert.equal(colorCancelado(0), '#e2445c')
assert.equal(colorCancelado(70), '#ff9f1c', '70 a 90: amarillo anaranjado')
assert.equal(colorCancelado(89), '#ff9f1c')
assert.equal(colorCancelado(90), '#00c875', '90 a 100: verde')
assert.equal(colorCancelado(100), '#00c875')

/* ── Qué órdenes entran en una solicitud de cortes ─────────────────────────────────────────────── */
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Pend de Solicitar', vidrios: 4 }), true)
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Solicitados', vidrios: 4 }), false, 'ya pedidos')
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Recibidos', vidrios: 4 }), false, 'ya recibidos')
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Colocados', vidrios: 4 }), false)
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Cancelados', vidrios: 4 }), false)
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: '', vidrios: 4 }), false, 'sin estado: no')
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Pend de Solicitar', vidrios: 0 }), false, 'sin vidrios')
assert.equal(ordenParaCortes({ enTaller: false, estadoVidrios: 'Pend de Solicitar', vidrios: 4 }), false, 'no salió al taller')

/* Se muestran también las del taller sin vidrios (sin poder elegirlas); las ya pedidas, no. */
assert.equal(ordenVisibleEnCortes({ enTaller: true, estadoVidrios: 'Pend de Solicitar', vidrios: 4 }), true)
assert.equal(ordenVisibleEnCortes({ enTaller: true, estadoVidrios: 'Pend de Solicitar', vidrios: 0 }), true, 'sin vidrios: se ve')
assert.equal(ordenVisibleEnCortes({ enTaller: true, estadoVidrios: '', vidrios: 0 }), true, 'sin vidrios ni estado: se ve')
assert.equal(ordenParaCortes({ enTaller: true, estadoVidrios: 'Pend de Solicitar', vidrios: 0 }), false, 'pero no se elige')
assert.equal(ordenVisibleEnCortes({ enTaller: true, estadoVidrios: 'Solicitados', vidrios: 4 }), false, 'ya pedidos: no se ve')
assert.equal(ordenVisibleEnCortes({ enTaller: true, estadoVidrios: 'Recibidos', vidrios: 4 }), false)
assert.equal(ordenVisibleEnCortes({ enTaller: false, estadoVidrios: '', vidrios: 0 }), false, 'fuera del taller: no se ve')

/* Lo que se escribe al editar un vidrio. */
assert.equal(medidaValida('843'), true)
assert.equal(medidaValida('1013'), true)
assert.equal(medidaValida('1.013'), true, 'con punto de miles')
assert.equal(medidaValida(' 948 '), true)
assert.equal(medidaValida(''), false)
assert.equal(medidaValida('0'), false)
assert.equal(medidaValida('12,5'), false, 'mm enteros')
assert.equal(medidaValida('1.01'), false, 'punto que no es de miles')
assert.equal(medidaValida('abc'), false)
assert.equal(cantidadValida('2'), true)
assert.equal(cantidadValida('0'), false)
assert.equal(cantidadValida('1.5'), false)
assert.equal(cantidadValida(''), false)

/* ── La respuesta de la lectura de HETMO con Claude ────────────────────────────────────────────── */
{
  const base = { composicion: '3+3/12/4', terminacion: 'INC', ancho: '696', alto: '1.696', cant: 1 }
  const [dvh] = aVidriosOp([{ ...base, modelo: 'v2', comp1: '3+3', camara: '12', comp2: '4' }])
  assert.deepEqual(dvh, { modelo: 'V2', comp1: '3+3', camara: '12', comp2: '4', ancho: '696', alto: '1.696', cant: 1 })
  const [simple] = aVidriosOp([{ ...base, modelo: 'v1', composicion: '4', comp1: null, camara: null, comp2: null }])
  assert.equal(simple.comp1, '4', 'composición que no se parte: entera en Comp 1')
  assert.equal(simple.camara, null)
  const [sinCant] = aVidriosOp([{ ...base, modelo: null, comp1: '4', camara: '9', comp2: '4', cant: null }])
  assert.equal(sinCant.cant, null, 'sin "ud:": cantidad nula, no 0')
  assert.equal(sinCant.modelo, '')
  assert.equal(sinCant.alto, '1.696', 'las medidas quedan como texto, con el punto de miles')

  assert.deepEqual(
    aAberturasOp([{ nombre: 'v1' }, { nombre: '' }, { nombre: 'M6' }, { nombre: 'V1 ' }]).map(({ nombre, texto }) => ({ nombre, texto })),
    [
      { nombre: 'V1', texto: '' },
      { nombre: 'V2', texto: '' },
      { nombre: 'M6', texto: '' },
    ],
    'cajas vacías; sin nombre: se numera por su posición; un modelo repetido queda una vez',
  )
}

/* ── Subelementos de la OP: uno por vidrio de cada abertura ("V1 - Vidrio 1") ──────────────── */
{
  const vid = (modelo: string, ancho: string) => ({ modelo, comp1: '4', camara: '12', comp2: '4', ancho, alto: '1.278', cant: 2 })
  const datos = { descripcion: 'Ventana Efficient - OSCILOBATIENTE', color: 'Blanco', ancho: '1.500', alto: '1.500', cantidad: 2 }
  const filas = filasSubelementos(
    [
      { nombre: 'v1', texto: ' Herraje negro ', datos },
      { nombre: 'V2', texto: '' },
      { nombre: 'M6', texto: 'Mosquitero gris' },
    ],
    [vid('V1', '459'), vid('V2', '403'), vid('V1', '765'), vid('V9', '100')],
  )
  assert.deepEqual(
    filas.map((f) => f.nombre),
    ['V1 - Vidrio 1', 'V1 - Vidrio 2', 'V2 - Vidrio 1', 'M6', 'V9 - Vidrio 1'],
    'un subelemento por vidrio, numerado por abertura; sin vidrio, el modelo solo; el vidrio sin abertura, al final',
  )
  assert.deepEqual(
    filas[0].valores,
    {
      observacion: 'Herraje negro',
      descripcion: 'Ventana Efficient - OSCILOBATIENTE',
      color: 'BLANCO',
      anchoAbertura: '1.500',
      altoAbertura: '1.500',
      cantidadAberturas: 2,
      comp1: '4',
      camara: '12',
      comp2: '4',
      ancho: '459',
      alto: '1.278',
      cantidad: 2,
    },
    'la observación, los datos de la abertura (color en mayúsculas) y el vidrio',
  )
  assert.equal(filas[1].valores.observacion, undefined, 'la observación no se repite en el segundo vidrio')
  assert.equal(filas[1].valores.color, 'BLANCO', 'los datos de la abertura sí van en cada vidrio')
  assert.equal(filas[1].valores.ancho, '765')
  assert.deepEqual(filas[3].valores, { observacion: 'Mosquitero gris' }, 'abertura sin vidrio: sólo su observación')
  assert.deepEqual(filasSubelementos([{ nombre: 'P1', texto: '' }], []), [{ nombre: 'P1', valores: {} }], 'abertura sin nada: el subelemento igual')
  assert.equal(modeloDeSubelemento('V1 - Vidrio 2'), 'V1')
  assert.equal(modeloDeSubelemento('V27/28 DT 6 - Vidrio 1'), 'V27/28 DT 6')
  assert.equal(modeloDeSubelemento('M6'), 'M6', 'sin sufijo (o del formato anterior): igual')
  assert.deepEqual(
    aAberturasOp([{ nombre: 'v1', descripcion: ' Ventana ', color: 'Jet Black', ancho: '1.500', alto: '800', cantidad: 2 }])[0].datos,
    { descripcion: 'Ventana', color: 'JET BLACK', ancho: '1.500', alto: '800', cantidad: 2 },
    'la lectura: el color pasa a mayúsculas',
  )
}

/* ── Editar Órdenes de Producción ──────────────────────────────────────────────────────────── */
{
  const viejo = aModeloListado({
    codigo: 'V1 DT 1', descripcion: 'Ventana', color: 'Blanco', ancho: '1.500', alto: '1.500', cantidad: 2,
    vidrios: [{ tipo: '4/12/4 INC', ancho: '459', alto: '1.278', ud: 1 }, { tipo: '4/12/4 INC', ancho: '765', alto: '1.396', ud: 1 }],
    taps: [], hojaIdx: 0, slot: 'a',
  })
  const leido = aModeloListado({
    codigo: 'V1', descripcion: 'Ventana', color: 'Negro', ancho: '1.600', alto: null, cantidad: 2,
    vidrios: [{ tipo: '4/12/4 INC', ancho: '500', alto: '1.278', ud: 1 }, { tipo: '3+3/12/4 INC', ancho: '800', alto: '1.396', ud: 1 }],
    taps: [], hojaIdx: 1, slot: 'b',
  })
  const sinVidrios = editarModelo(viejo, leido, [], 1)
  assert.deepEqual(
    sinVidrios.cambios.map((c) => [c.campo, c.anterior, c.nuevo]),
    [['el color', 'Blanco', 'Negro'], ['el ancho (mm)', '1.500', '1.600']],
    'cambian los datos de la abertura; lo que la IA no leyó (alto) no borra el anterior',
  )
  assert.equal(sinVidrios.modelo.alto, '1.500')
  assert.deepEqual(sinVidrios.modelo.vidrios, viejo.vidrios, 'sin vidrios elegidos, los vidrios no se tocan')
  assert.equal(sinVidrios.modelo.codigo, 'V1 DT 1', 'el nombre queda el de la OP')
  assert.deepEqual([sinVidrios.modelo.hojaIdx, sinVidrios.modelo.slot, sinVidrios.modelo.archivoIdx], [1, 'b', 1], 'el dibujo, del documento nuevo')

  const conVidrio = editarModelo(viejo, leido, [1], 1)
  assert.equal(conVidrio.modelo.vidrios[0].ancho, '459', 'el vidrio no elegido queda como estaba')
  assert.equal(conVidrio.modelo.vidrios[1].tipo, '3+3/12/4 INC', 'el elegido toma el del dibujo nuevo')
  assert.ok(conVidrio.cambios.some((c) => c.campo === 'el vidrio 2' && c.nuevo.includes('3+3/12/4 INC')))

  const quitado = editarModelo(viejo, { ...leido, vidrios: [leido.vidrios[0]] }, [1], 1)
  assert.equal(quitado.modelo.vidrios.length, 1, 'un vidrio elegido que el dibujo ya no trae se quita')
  assert.ok(quitado.cambios.some((c) => c.campo === 'el vidrio 2' && c.nuevo === 'Se quita'))

  assert.equal(nombreConVersion('OBRA - IDOP-030 - PVC 2281'), 'OBRA - IDOP-030 - PVC 2281 V2')
  assert.equal(nombreConVersion('OBRA - IDOP-030 - PVC 2281 V2'), 'OBRA - IDOP-030 - PVC 2281 V3', 'una ya editada sube de versión')
  assert.deepEqual(partirTipoVidrio('3+3/12/4 INC'), { comp1: '3+3', camara: '12', comp2: '4' })
  assert.deepEqual(partirTipoVidrio('4'), { comp1: '4', camara: '', comp2: '' }, 'vidrio simple: entero en Comp 1')
  assert.ok(mismaAbertura('V1', 'v1 dt 1'), 'el modelo con o sin "DT"')
  assert.ok(!mismaAbertura('V1 DT 1', 'V1 DT 2'), 'dos DT distintos no son la misma abertura')
  assert.ok(!mismaAbertura('V1', 'V10'))
  assert.equal(modelosDe({ paginas: [{ filas: [[{ codigo: 'V1' }, { codigo: 'V2' }], [{ codigo: 'V3' }]] }] }).length, 3)
  const nuevas = aberturasNuevas(
    [{ codigo: 'v10', descripcion: 'Ventana', vidrios: [{ tipo: '4/12/4' }, { tipo: '4/12/4' }] }, { codigo: 'V1' }, { codigo: 'M7' }, { codigo: 'V10' }],
    [viejo],
    2,
  )
  assert.deepEqual(nuevas.map((m) => [m.codigo, m.archivoIdx]), [['V10', 2], ['M7', 2]], 'las que la OP ya tiene o vienen repetidas no son nuevas')
  assert.equal(textoNueva(nuevas[0]), 'V10 - Ventana con 2 vidrios')
  assert.equal(textoNueva(nuevas[1]), 'M7 sin vidrios')
  assert.ok(motivoEdicion('X V2', [], [], nuevas).includes('Se agregó la abertura V10 - Ventana con 2 vidrios'))
  /* Las listas de la etapa 2: lo de la OP y, con la edición, lo viejo y lo nuevo. */
  const finalM = [conVidrio.modelo, ...nuevas]
  const ab = filasAberturas([viejo], finalM)
  assert.deepEqual(ab.map((f) => [f.modelo, f.nueva]), [['V1 DT 1', false], ['V10', true], ['M7', true]])
  assert.deepEqual(ab[0].color, { antes: 'BLANCO', ahora: 'NEGRO' }, 'el color, viejo y nuevo')
  assert.ok(hayCambiosAberturas(ab))
  assert.ok(!hayCambiosAberturas(filasAberturas([viejo], null)), 'sin edición generada, no hay nada nuevo')
  const vid = filasVidrios([viejo], [quitado.modelo])
  assert.equal(vid.length, 2)
  assert.ok(vid[1].quitado && !vid[0].quitado, 'el vidrio que el dibujo ya no trae, marcado')
  assert.deepEqual(vid[0].cantidad, { antes: '2', ahora: '2' }, 'piezas: la línea por las aberturas del modelo')
  assert.ok(hayCambiosVidrios(vid) && !hayCambiosVidrios(filasVidrios([viejo], null)))
  const motivo = motivoEdicion('X V2', sinVidrios.cambios, ['V3'])
  assert.ok(motivo.includes('«X V2»') && motivo.includes('V1 DT 1: el color de Blanco a Negro') && motivo.includes('V3'), 'el motivo dice a cuál reemplaza y qué cambió')
}

/* ── La actividad del envío en Emails & Activities (el módulo de Make) ───────────────────────── */
{
  const a = armarActividadEnvio({
    title: 'Envio de Orden de Produccion N° 2306 - OBRA para Juan',
    documentos_enlaces: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view',
    wsp: '549 2494 52-0152',
    contactos: 'Juan',
    documentos: ['OP.pdf'],
  })
  assert.equal(a.titulo, 'Envio de Orden de Produccion N° 2306 - OBRA para Juan')
  assert.equal(
    a.content,
    "📄 Archivo adjunto: OP.pdf: <a href='https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view' target='_blank'>https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view</a><br>👤 Contactos asignados y WhatsApp:<br>&nbsp;&nbsp;• Juan: +5492494520152",
  )
  const sinDatos = armarActividadEnvio({ contactos: null, wsp: '' })
  assert.equal(sinDatos.titulo, 'Envio de Resumen de cuenta corriente para Contacto no especificado', 'sin título: el automático del módulo')
  assert.ok(sinDatos.content.includes('⚠️ No se encontraron documentos adjuntos') && sinDatos.content.includes('⚠️ No se encontraron números de WhatsApp'))
}

/* ── Completar producción ──────────────────────────────────────────────────────────────────────── */
assert.equal(estadoDeOrden(ETIQUETA_OP.completada, true), 'completada', '"Produccion Completada" no se lee como Generada')
assert.deepEqual(accionesDe('completada'), [], 'una OP completada no admite enviar, reenviar ni cancelar')
assert.ok(completable('taller'), 'sólo la Enviada a taller se finaliza')
for (const e of ['generada', 'pendiente', 'confirmada', 'completada', 'cancelada'] as const) {
  assert.ok(!completable(e), `${e} no se finaliza`)
}

/* ── El celular para WhatsApp (el ValidarTelWsp del escenario) ─────────────────────────────────── */
assert.deepEqual(validarTelWsp('5492494122557'), { success: true, phone: '5492494122557' })
assert.equal(validarTelWsp('+54 9 249 412-2557').phone, '5492494122557')
assert.equal(validarTelWsp('2494122557').phone, '5492494122557', '10 dígitos: se le pone el 549')
assert.equal(validarTelWsp('0249 15 412-2557').phone, '5492494122557', 'sin el 0 y sin el 15')
assert.equal(validarTelWsp('011 15 2233-4455').phone, '5491122334455', 'característica de 2 dígitos')
assert.equal(validarTelWsp('02944 15 12-3456').phone, '5492944123456', 'característica de 4 dígitos')
assert.equal(validarTelWsp('542494122557').phone, '5492494122557', 'con el 54 y sin el 9')
assert.equal(validarTelWsp('12345').success, false)
assert.equal(validarTelWsp('').success, false)

/* ── El enlace de confirmación y el reenvío ────────────────────────────────────────────────────── */
{
  /* Sin la URL de la app no hay enlace (no se manda la OP); con una de prueba, se arma con la clave
     y firmado. El detalle de la firma se prueba en `tests/confirmar.test.ts`. */
  const clave = '0f8e2a6c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
  process.env.CONFIRMACION_SECRET = 'x'.repeat(40)
  delete process.env.CONFIRMACION_URL
  assert.throws(() => enlaceConfirmacion({ documento: 'op', clave, rol: 'Cliente' }), /CONFIRMACION_URL/)
  process.env.CONFIRMACION_URL = 'https://app.test/confirmar'
  const op = new URL(enlaceConfirmacion({ documento: 'op', clave, rol: 'Cliente' }))
  assert.equal(op.origin, 'https://app.test', 'el origen sale de la variable')
  assert.match(op.pathname, /^\/c\/[A-Za-z0-9_-]{35}$/, 'un código corto, sin el id de la OP ni el nombre')
  assert.equal(op.search, '')
  assert.ok(textoReenvio('Juan', 'https://x').includes('https://x'))
  assert.ok(!textoReenvio('Ana', null).includes('link'), 'quien no confirma no recibe el enlace')
  assert.ok(textoEdicion('Juan', 'https://x').includes('nueva Orden de Producción') && textoEdicion('Juan', 'https://x').includes('https://x'))
  assert.ok(!textoEdicion('Ana', null).includes('confirmar por acá'), 'OP editada: quien no confirma no recibe el enlace')
  assert.equal(
    textoTaller('OBRA TEST', 'PVC'),
    '👋 Hola *Alfredo*\n\nAdjunto la *orden de producción* para:\n\n- 🏗️  *Obra:* OBRA TEST\n- 🔨  *Material:* PVC\n\n¡Cualquier duda comunicate con nosotros!\nPolifroni Aberturas\nAutomatizado por *The Automation Partner*',
    'el mensaje al taller, con el jefe, la obra y el material',
  )
}
