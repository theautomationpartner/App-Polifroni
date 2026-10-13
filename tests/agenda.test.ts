/**
 * Las reglas de negocio del área Agenda (especificación funcional del 02/10/2026, RN-01 a RN-12).
 *
 * Lo que se fija acá:
 *  · cada tipo de turno ofrece lo suyo: Colocación "A Colocar", Medición "A Medir", Reparación
 *    todas las obras y Entrega los pendientes;
 *  · el saldo decide la aprobación de la obra, y la No aprobada agrega el aviso al mensaje;
 *  · el estado del turno se lee de las etiquetas del tablero, y sólo los activos admiten acciones;
 *  · confirmar pide el dato de finalización de cada tipo, y la entrega total o parcial sale de lo
 *    que quedaba pendiente.
 *
 * Se corre con esbuild + node (`npm run test:agenda`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import {
  ETIQUETA_TURNO,
  INDICE_TURNO,
  admiteTurno,
  aprobacionPorSaldo,
  estadoDeTurno,
  etiquetaResultado,
  faltantesAlta,
  faltantesFinalizacion,
  fechaCorta,
  mensajeAsignacion,
  mensajeCancelacion,
  mensajeConfirmacion,
  mensajeMedicion,
  mensajeReagendado,
  obrasParaTipo,
  saludo,
  textoResultado,
  tipoDeEtiqueta,
  type ObraDeCliente,
  aColumnaFecha,
  deColumnaFecha,
  fechaHoraCorta,
  TIPOS_DE_OBRA,
  alternarPendiente,
  cambiarConObra,
  elegirTipo,
  listaObras,
  TIPOS_ALTA,
  colorCancelacion,
  colorDeMaterial,
  elegirObra,
  faltantesRegistro,
  faltantesSeleccion,
  horarioOcupado,
  colorDeTipo,
  enFranja,
  materialDe,
  semanasDelMes,
  entregaDePendiente,
  franjaVacia,
  seleccionVacia,
  tipoDeSeleccion,
} from '../src/lib/agenda'

const obra = (id: string, etapa: string): ObraDeCliente => ({
  id,
  nombre: `Obra ${id}`,
  etapa,
  etapaColor: '',
  material: 'PVC',
  ubicacion: '',
  celCoordinar: '',
  saldo: 0,
  ordenesIds: [],
})
const obras = [obra('1', 'A Colocar'), obra('2', 'A Medir'), obra('3', 'Orden de Prod Emitida'), obra('4', 'a colocar ')]

/* ── RN-03 a RN-06: qué se lista según el tipo ────────────────────────────────────────────────── */
assert.deepEqual(obrasParaTipo('colocacion', obras).map((o) => o.id), ['1', '4'], 'RN-03: sólo "A Colocar" (sin importar mayúsculas)')
assert.deepEqual(obrasParaTipo('medicion', obras).map((o) => o.id), ['2'], 'RN-04: sólo "A Medir"')
assert.equal(obrasParaTipo('reparacion', obras).length, 4, 'RN-05: todas las obras del cliente')
assert.equal(obrasParaTipo('entrega', obras).length, 0, 'RN-06: la entrega lista pendientes, no obras')

/* ── RN-08: aprobación por saldo ──────────────────────────────────────────────────────────────── */
assert.equal(aprobacionPorSaldo(640000), 'noAprobada', 'saldo > 0 → No aprobada')
assert.equal(aprobacionPorSaldo(0), 'aprobada', 'saldo = 0 → Aprobada')
assert.equal(aprobacionPorSaldo(-500), 'aprobada', 'saldo a favor del cliente: nada por cobrar')
assert.equal(aprobacionPorSaldo(null), null, 'sin saldo legible no se decide')

const base = { cliente: 'CAIRO MARIO', fecha: '2026-10-15', elemento: 'CAIRO MARIO A1656' }
/* ── El mensaje de asignación: las plantillas de cada tipo ─────────────────────────────────────── */
const asig = {
  cliente: '1111 - CAIRO MARIO',
  etiquetaTipo: 'Colocacion',
  fecha: '2026-10-15',
  ubicacion: 'Calle 1 123, Tandil',
  material: 'PVC',
  aberturas: 7,
  obra: 'CAIRO MARIO A1656',
  saldo: 1250000,
}
const coloc = mensajeAsignacion({ ...asig, tipo: 'colocacion', aprobacion: 'aprobada' })
assert.ok(coloc.startsWith('Hola, *CAIRO MARIO* 👋'), 'saludo sin el código de la cuenta')
assert.ok(
  coloc.includes('✅ *Servicio:* Colocacion\n📅 *Fecha:* 15/10/2026\n📍 *Ubicacion:* Calle 1 123, Tandil'),
  'renglones seguidos; sin hora, el mensaje no lleva el rango horario',
)
assert.ok(coloc.includes('🪟 *Cantidad de Aberturas*: 7'))
assert.ok(!coloc.includes('saldo pendiente'), 'Aprobada va sin el aviso de saldo')
const deuda = mensajeAsignacion({ ...asig, tipo: 'colocacion', aprobacion: 'noAprobada' })
assert.ok(deuda.includes('Para la obra *CAIRO MARIO A1656* existe saldo pendiente:\n💵 *Saldo*: $1.250.000'), 'No aprobada lleva el saldo')
assert.ok(deuda.includes('se requiere el pago total del presupuesto'))
const sinDatos = mensajeAsignacion({ ...asig, tipo: 'colocacion', material: '', aberturas: null })
assert.ok(sinDatos.includes('⛏️ *Material:* NO ESPECIFICADO') && sinDatos.includes('Aberturas*: NO ESPECIFICADO'))
const repar = mensajeAsignacion({ ...asig, tipo: 'reparacion', etiquetaTipo: 'Reparacion', aprobacion: 'noAprobada' })
assert.ok(!repar.includes('saldo pendiente') && !repar.includes('Cantidad de Aberturas'), 'el saldo y las aberturas son sólo de Colocación')
assert.ok(repar.includes('Te informamos que ha sido agendado:\n✅ *Servicio:* Reparacion'))
const ent = mensajeAsignacion({ ...asig, tipo: 'entrega', etiquetaTipo: 'Reparto' })
assert.ok(ent.startsWith('Hola, *CAIRO MARIO*👋') && ent.includes('programado con éxito'))
assert.ok(ent.endsWith('Polifroni Aberturas\nAutomatizado por The Automation Partner'))
{
  const aviso = { cliente: '1111 - CAIRO MARIO', etiquetaTipo: 'Colocacion', fecha: '2026-10-15', ubicacion: 'TANDIL', material: '', aberturas: 2 }
  const cancel = mensajeCancelacion({ ...aviso, tipo: 'colocacion' })
  assert.match(cancel, /^Hola, \*CAIRO MARIO\* 👋/, 'saludo sin el código de la cuenta')
  assert.match(cancel, /el turno ha sido \*CANCELADO:\*/)
  assert.match(cancel, /\*Servicio:\* Colocacion/, 'la cancelación nombra el tipo de turno')
  assert.match(cancel, /\*Fecha:\* 15\/10\/2026/)
  assert.match(cancel, /\*Material:\* NO ESPECIFICADO/, 'lo que falta sale NO ESPECIFICADO')
  assert.match(cancel, /Cantidad de Aberturas\*: 2/, 'colocación lleva las aberturas')
  assert.ok(!mensajeCancelacion({ ...aviso, tipo: 'reparacion' }).includes('Cantidad de Aberturas'), 'reparación no')
  const conf = mensajeConfirmacion({ ...aviso, tipo: 'colocacion', servicio: 'Colocacion Total' })
  assert.match(conf, /el servicio se ha cumplido con Exito/)
  assert.match(conf, /\*Servicio:\* Colocacion Total/, 'la confirmación nombra el resultado')
  assert.match(conf, /¡Muchas gracias!\nPolifroni Aberturas/)
  assert.match(mensajeConfirmacion({ ...aviso, tipo: 'entrega', servicio: 'Entrega Total' }), /^Hola,\*CAIRO MARIO\*👋/, 'entrega, pegado como su plantilla')
}
assert.equal(saludo('1111 - PEREZ JUAN'), 'Perez Juan', 'sin el código y con mayúscula inicial')
assert.equal(saludo('MARTINEZ Y STANECK S.A'), 'Martinez Y Staneck S.a')

/* ── RN-01: lo obligatorio para crear el turno ────────────────────────────────────────────────── */
const hoy = '2026-10-02'
const completo = { clienteId: '1', tipo: 'colocacion' as const, elementoId: '9', fecha: '2026-10-15', hora: '14:30' }
assert.deepEqual(faltantesAlta(completo, hoy), [], 'completo: nada falta')
assert.equal(faltantesAlta({ ...completo, clienteId: null }, hoy).length, 1, 'sin cliente')
assert.equal(faltantesAlta({ ...completo, tipo: null, elementoId: null }, hoy).length, 1, 'sin tipo (la obra se pide después)')
assert.match(faltantesAlta({ ...completo, elementoId: null }, hoy)[0], /obra/, 'sin obra')
assert.match(faltantesAlta({ ...completo, tipo: 'entrega', elementoId: null }, hoy)[0], /pendiente/, 'sin pendiente')
assert.equal(faltantesAlta({ ...completo, fecha: '' }, hoy).length, 1, 'sin fecha')
assert.match(faltantesAlta({ ...completo, fecha: '2026-10-01' }, hoy)[0], /anterior/, 'no se agenda para atrás')
assert.deepEqual(faltantesAlta({ ...completo, fecha: hoy }, hoy), [], 'hoy sí')
assert.deepEqual(faltantesAlta({ ...completo, hora: '' }, hoy), [], 'el rango horario (la hora) es opcional')

/* ── La hora del turno en la columna de Monday: va en UTC y vuelve en la hora local ────────────── */
{
  const col = aColumnaFecha('2026-10-15', '14:30')
  assert.ok(col.time, 'con hora, la columna lleva time')
  assert.deepEqual(deColumnaFecha(col), { fecha: '2026-10-15', hora: '14:30' }, 'ida y vuelta: la misma fecha y hora local')
  assert.deepEqual(aColumnaFecha('2026-10-15'), { date: '2026-10-15' }, 'sin hora, sólo la fecha')
  assert.deepEqual(deColumnaFecha(aColumnaFecha('2026-10-15', '00:00')), { fecha: '2026-10-15', hora: '' }, 'las 00:00 de los turnos viejos son sin hora')
  assert.deepEqual(deColumnaFecha({ date: '2026-10-15' }), { fecha: '2026-10-15', hora: '' })
  assert.deepEqual(deColumnaFecha(null), { fecha: '', hora: '' })
  assert.equal(fechaHoraCorta('2026-10-15', '09:05'), '15/10/2026 09:05 hs')
  assert.equal(fechaHoraCorta('2026-10-15', ''), '15/10/2026')
  assert.match(mensajeAsignacion({ cliente: 'X', tipo: 'reparacion', etiquetaTipo: 'Reparacion', fecha: '2026-10-15', hora: '09:05', ubicacion: '', material: '' }), /\*Fecha:\* 15\/10\/2026\n🕐 \*Rango Horario Aproximado:\* 09:05 hs/, 'la fecha y la hora, en dos claves')
}
assert.deepEqual(faltantesAlta({ ...completo, elementoId: null, conObra: false }, hoy), [], 'Colocación sin obra: no se elige obra')
assert.match(faltantesAlta({ ...completo, tipo: 'entrega', elementoId: null, conObra: false }, hoy)[0], /pendiente/, 'la entrega no admite "sin obra"')
assert.match(faltantesAlta({ ...completo, tipo: 'reparacion' }, hoy)[0], /reparación/, 'Reparación pide el tipo de reparación')
assert.deepEqual(faltantesAlta({ ...completo, tipo: 'reparacion', tipoReparacion: 'Regulacion' }, hoy), [])

/* ── Estados del turno: las etiquetas del tablero y las acciones de cada uno ──────────────────── */
assert.equal(estadoDeTurno('Asignada'), 'asignado', 'el tablero dice "Asignada"')
assert.equal(estadoDeTurno('Cumplido'), 'cumplido')
assert.equal(estadoDeTurno('Cancelado'), 'cancelado')
assert.equal(estadoDeTurno(''), 'pendiente', 'sin etiqueta, pendiente')
assert.equal(estadoDeTurno('Asignado-Enviado'), 'asignado', 'la etiqueta renombrada en el tablero')
assert.equal(estadoDeTurno('Pendiente de Enviar'), 'pendiente')
assert.equal(INDICE_TURNO.asignado, 0, 'el estado se escribe por índice')
assert.equal(INDICE_TURNO.pendiente, 5)
assert.equal(ETIQUETA_TURNO.asignado, 'Asignado-Enviado')
assert.equal(admiteTurno('pendiente', 'asignar'), true, 'sólo se asigna el que está sin asignar')
assert.equal(admiteTurno('asignado', 'asignar'), false, 'el asignado ya está asignado')
for (const a of ['reprogramar', 'cancelar', 'confirmar'] as const) {
  assert.equal(admiteTurno('pendiente', a), false, `sin asignar no admite ${a}: primero se asigna`)
  assert.equal(admiteTurno('asignado', a), true, `asignado admite ${a}`)
  assert.equal(admiteTurno('cumplido', a), false, `cumplido no admite ${a}`)
  assert.equal(admiteTurno('cancelado', a), false, `cancelado no admite ${a} (RN-11: se crea otro)`)
}
assert.equal(tipoDeEtiqueta('Colocacion'), 'colocacion')
assert.equal(tipoDeEtiqueta('Reparto'), 'entrega')
assert.equal(tipoDeEtiqueta('MEDIR'), 'medicion', 'el nombre viejo')
assert.equal(tipoDeEtiqueta('Medicion'), 'medicion', 'el renombrado en el tablero')
assert.equal(tipoDeEtiqueta('SELLAR'), null, 'los tipos viejos no se interpretan')

/* ── RN-12: el dato de finalización de cada tipo ──────────────────────────────────────────────── */
assert.equal(faltantesFinalizacion('colocacion', {}).length, 1, 'Colocación pide Total/Parcial')
assert.deepEqual(faltantesFinalizacion('colocacion', { colocacion: 'parcial' }), [])
assert.deepEqual(faltantesFinalizacion('entrega', {}), [], 'Entrega no pide nada')
assert.equal(faltantesFinalizacion('medicion', {}).length, 1, 'Medición pide si se pudo medir')
assert.deepEqual(faltantesFinalizacion('medicion', { medicion: 'noMedido' }), [])
assert.equal(textoResultado('medicion', { medicion: 'medido' }), 'Medido exitosamente')
assert.equal(etiquetaResultado('medicion', { medicion: 'medido' }), null, 'la medición no tiene columna de resultado')
assert.equal(
  mensajeMedicion('1111 - PEREZ JUAN', 'medido'),
  'Hola, *PEREZ JUAN* 👋\n\nFuimos a medir y en los proximos dias se enviara la orden de produccion.\n\nGracias!\nPolifroni Aberturas\nAutomatizado por The Automation Partner',
  'medido: el texto de la plantilla',
)
assert.equal(
  mensajeMedicion('PEREZ JUAN', 'noMedido'),
  'Hola, *PEREZ JUAN* 👋\n\nTe informamos que no se pudo medir porque las mochetas NO se encontraban en las condiciones indicadas en el presupuesto. Por favor, vuelve a contactarnos para solicitar un nuevo turno.\n\nGracias!.\nPolifroni Aberturas\nAutomatizado por The Automation Partner',
  'no medido: el texto de la plantilla',
)
assert.deepEqual(faltantesFinalizacion('reparacion', {}), [], 'Reparación no pide nada')
assert.deepEqual(faltantesFinalizacion(null, {}), [], 'un tipo viejo se confirma sin dato')
assert.equal(etiquetaResultado('colocacion', { colocacion: 'total' }), 'Colocacion Total')
assert.equal(etiquetaResultado('colocacion', { colocacion: 'parcial' }), 'Colocacion Parcial')
assert.equal(etiquetaResultado('entrega', {}), null, 'sólo la colocación deja resultado')
assert.equal(textoResultado('colocacion', { colocacion: 'parcial' }), 'Colocación parcial')
assert.equal(fechaCorta('2026-10-15'), '15/10/2026')

/* ── Reprogramación: el mensaje de reasignación del turno nuevo ───────────────────────────────── */
assert.equal(
  mensajeReagendado({
    cliente: '1111 - PEREZ JUAN',
    tipo: 'colocacion',
    etiquetaTipo: 'Colocacion',
    fecha: '2026-11-20',
    hora: '09:15',
    ubicacion: 'TANDIL',
    material: '',
  }),
  [
    'Hola, *PEREZ JUAN* 👋',
    'Te informamos que ha sido reagendado el siguiente turno:\n✅ *Servicio:* Colocacion\n📅 *Fecha:* 20/11/2026\n🕐 *Rango Horario Aproximado:* 09:15 hs\n📍 *Ubicacion:* TANDIL\n⛏️ *Material:* NO ESPECIFICADO',
    'Solo en caso de *CANCELACION* responder.',
    '¡Muchas gracias!\n🏠 Polifroni Aberturas\n🤖 Automatizado por The Automation Partner',
  ].join('\n\n'),
  'reagendado: el texto de la plantilla',
)

/* ── Calendario: la selección de la etapa 2 (primero el tipo) ──────────────────────────────────── */
{
  const conPend = { hayPendientes: true }
  let s = seleccionVacia()
  assert.equal(s.conObra, true, '«Con Obra» viene tildado')
  assert.deepEqual(faltantesSeleccion(s, conPend), ['Elegí el tipo de turno.'], 'primero el tipo')
  assert.equal(listaObras(s), false, 'sin tipo no se listan las obras')
  s = elegirTipo(s, 'colocacion')
  assert.equal(listaObras(s), true)
  assert.match(faltantesSeleccion(s, conPend)[0], /Tildá la obra/, 'con obra, la obra es obligatoria')
  s = elegirObra(s, 'o1')
  s = { ...s, opIds: ['op1'] }
  assert.deepEqual(faltantesSeleccion(s, conPend), [], 'los pendientes son opcionales fuera de Reparto')
  s = alternarPendiente(s, 'p1')
  assert.equal(tipoDeSeleccion(s), 'colocacion', 'obra y pendientes: un solo turno, del tipo elegido')
  s = elegirObra(s, 'o2')
  assert.equal(s.obraId, 'o2', 'una sola obra: tildar otra reemplaza la anterior')
  assert.deepEqual(s.opIds, [], 'otra obra descarta las OP')
  assert.equal(s.tipo, 'colocacion', 'y el tipo se mantiene')
  s = elegirObra(s, 'o2')
  assert.equal(s.obraId, null, 'tildarla de nuevo la destilda')
  s = cambiarConObra(elegirObra(s, 'o1'), false)
  assert.equal(s.obraId, null, 'sin obra: se descarta la obra')
  assert.deepEqual(faltantesSeleccion(s, conPend), [], 'sin obra no hay nada obligatorio')
  /* Reparto: sólo pendientes. */
  s = elegirTipo(cambiarConObra(elegirObra(cambiarConObra(s, true), 'o1'), true), 'entrega')
  assert.equal(s.obraId, null, 'Reparto no lleva obra')
  assert.equal(listaObras(s), false, 'Reparto lista sólo pendientes')
  s = alternarPendiente(s, 'p1')
  assert.deepEqual(s.pendientesIds, [], 'destildar el pendiente que venía tildado')
  assert.deepEqual(faltantesSeleccion(s, conPend), ['Tildá al menos un pendiente de entrega.'], 'con pendientes en el cliente, uno es obligatorio')
  assert.deepEqual(faltantesSeleccion(s, { hayPendientes: false }), [], 'sin pendientes en el cliente, no')
  s = alternarPendiente(alternarPendiente(s, 'p1'), 'p2')
  assert.deepEqual(s.pendientesIds, ['p1', 'p2'], 'se tildan varios pendientes')
  assert.deepEqual(faltantesSeleccion(s, conPend), [])
  assert.deepEqual([...TIPOS_ALTA], ['colocacion', 'medicion', 'reparacion', 'terminacion', 'entrega'])
  assert.deepEqual([...TIPOS_DE_OBRA], ['colocacion', 'medicion', 'reparacion', 'terminacion'])
  assert.equal(tipoDeEtiqueta('TERMINACIONES'), 'terminacion', 'Terminación es la etiqueta TERMINACIONES')
}

/* ── Calendario: la etapa 3 y la disponibilidad del horario ───────────────────────────────────── */
{
  assert.deepEqual(faltantesRegistro({ tipo: 'colocacion', fecha: '2026-10-20', hora: '10:00' }, '2026-10-09'), [])
  assert.equal(faltantesRegistro({ tipo: 'colocacion', fecha: '', hora: '' }, '2026-10-09').length, 1, 'sólo la fecha: la hora es opcional')
  assert.match(faltantesRegistro({ tipo: 'colocacion', fecha: '2026-10-01', hora: '10:00' }, '2026-10-09')[0], /anterior/)
  assert.match(faltantesRegistro({ tipo: 'reparacion', fecha: '2026-10-20', hora: '10:00' }, '2026-10-09')[0], /reparación/)
  const turnos = [
    { id: 'a', estado: 'asignado' as const, fecha: '2026-10-20', hora: '10:00' },
    { id: 'b', estado: 'cancelado' as const, fecha: '2026-10-20', hora: '11:00' },
    { id: 'c', estado: 'cumplido' as const, fecha: '2026-10-20', hora: '12:00' },
    { id: 'd', estado: 'pendiente' as const, fecha: '2026-10-21', hora: '10:00' },
    { id: 'e', estado: 'pendiente' as const, fecha: '2026-10-22', hora: '' },
  ]
  assert.equal(horarioOcupado(turnos, '2026-10-20', '10:00'), true, 'un turno asignado ocupa su horario')
  assert.equal(horarioOcupado(turnos, '2026-10-21', '10:00'), true, 'uno pendiente también')
  assert.equal(horarioOcupado(turnos, '2026-10-20', '11:00'), false, 'cancelado: el horario se libera')
  assert.equal(horarioOcupado(turnos, '2026-10-20', '12:00'), false, 'cumplido: el horario se libera')
  assert.equal(horarioOcupado(turnos, '2026-10-20', '10:30'), false, 'otra hora del mismo día, libre')
  assert.equal(horarioOcupado(turnos, '2026-10-22', '00:00'), false, 'los turnos sin hora no ocupan horario')
  assert.equal(horarioOcupado(turnos, '2026-10-20', '10:00', 'a'), false, 'el turno que se mueve no se pisa a sí mismo')
}

/* ── Calendario: los colores ──────────────────────────────────────────────────────────────────── */
{
  assert.equal(colorDeMaterial('PVC').fondo, '#00c875', 'PVC verde')
  assert.equal(colorDeMaterial('Aluminio').fondo, '#ffcb00', 'Aluminio amarillo')
  assert.equal(colorDeMaterial('').fondo, '#c4c4c4', 'sin material, gris')
  assert.equal(colorCancelacion(69.9), 'rojo', 'menos del 70 %: rojo')
  assert.equal(colorCancelacion(70), 'amarillo', 'del 70 % al 90 %: amarillo')
  assert.equal(colorCancelacion(89.9), 'amarillo')
  assert.equal(colorCancelacion(90), 'verde', 'del 90 % al 100 %: verde')
  assert.equal(colorCancelacion(100), 'verde')
  assert.equal(colorCancelacion(null), null, 'sin dato, sin color')
}

console.log('agenda: todas las reglas pasan')

/* ── Calendario: color del tipo y franja horaria ── */
assert.equal(colorDeTipo('colocacion', 'Colocacion', null), '#00c875', 'sin leer el tablero, el color conocido')
assert.equal(colorDeTipo('medicion', 'MEDICIÓN', { medicion: '#123456' }), '#123456', 'el del tablero, por etiqueta sin tildes')
assert.equal(colorDeTipo(null, 'SELLAR', { sellar: '#037f4c' }), '#037f4c', 'un tipo viejo, con su color del tablero')
assert.equal(colorDeTipo(null, '', null), '#c4c4c4', 'sin tipo, gris')
assert.equal(enFranja('', franjaVacia()), true, 'sin franja entran todos, también los sin hora')
assert.equal(enFranja('', { desde: 8, hasta: 12 }), false, 'con franja, un turno sin hora no entra')
assert.equal(enFranja('08:00', { desde: 8, hasta: 12 }), true)
assert.equal(enFranja('11:59', { desde: 8, hasta: 12 }), true)
assert.equal(enFranja('12:00', { desde: 8, hasta: 12 }), false, 'el tope es excluido')
assert.equal(enFranja('07:30', { desde: 8, hasta: 12 }), false)
assert.equal(enFranja('19:00', { desde: 14, hasta: null }), true, 'sólo desde')
assert.equal(enFranja('09:00', { desde: null, hasta: 10 }), true, 'sólo hasta')
console.log('agenda: color y franja OK')

/* ── Calendario: el material de un turno ── */
assert.equal(materialDe('PVC'), 'pvc')
assert.equal(materialDe(' Aluminio '), 'aluminio')
assert.equal(materialDe(''), 'sin', 'sin material')
assert.equal(materialDe('Madera'), 'sin', 'otro material cae en "sin material"')
console.log('agenda: material OK')


/* ── Calendario: las semanas de un mes ── */
{
  const oct = semanasDelMes('2026-10-15')
  assert.equal(oct.length, 5, 'octubre 2026: 5 filas')
  assert.deepEqual(oct[0], { inicio: '2026-09-28', fin: '2026-10-04' }, 'la primera arranca el lunes anterior al 1')
  assert.deepEqual(oct[4], { inicio: '2026-10-26', fin: '2026-11-01' }, 'la última termina el domingo posterior al 31')
  const nov = semanasDelMes('2026-11-03')
  assert.deepEqual(nov[0], { inicio: '2026-10-26', fin: '2026-11-01' }, 'un mes que empieza en domingo')
  assert.equal(nov.length, 6)
  const feb = semanasDelMes('2027-02-10')
  assert.deepEqual(feb[0], { inicio: '2027-02-01', fin: '2027-02-07' }, 'un mes que empieza en lunes')
  assert.equal(feb.length, 4, 'febrero 2027: 4 filas justas')
}
console.log('agenda: semanas del mes OK')

/* ── El rango horario es opcional ── */
assert.deepEqual(faltantesRegistro({ tipo: 'colocacion', fecha: '2026-12-01', hora: '' }, '2026-10-13'), [], 'sin rango horario se puede confirmar')
assert.deepEqual(faltantesRegistro({ tipo: 'colocacion', fecha: '', hora: '10:00' }, '2026-10-13'), ['Elegí la fecha del turno.'], 'la fecha sí es obligatoria')
console.log('agenda: rango horario opcional OK')

/* ── El estado de entrega de un pendiente ── */
assert.equal(entregaDePendiente(2, 2), 'pendiente', 'nada entregado: rojo')
assert.equal(entregaDePendiente(5, 3), 'parcial', 'algo entregado: naranja')
assert.equal(entregaDePendiente(5, 0), 'entregado', 'todo entregado: verde')
console.log('agenda: entrega de pendientes OK')
