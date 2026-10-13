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
import { marcaPresupuesto as marcaPresupuestoServidor, textoPresupuestoDestino } from '../api/_whatsappHttp'
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
  colorTipoCarpinteria,
  formatoImporte,
  rolesDeEnviarA,
  rolesIniciales,
  etiquetaPresupuesto,
  marcaPresupuesto,
  textoPresupuestos,
  actividadConfirmacionApp,
  bolsaParaCargar,
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

/* Mensaje: uno o varios presupuestos, texto genérico */
assert.equal(
  textoPresupuestos('1111 - PEREZ JUAN', 1, new Date(2026, 9, 5, 15, 0)),
  [
    '👋Hola *PEREZ JUAN*,',
    'Le adjuntamos el presupuesto solicitado. Si tenés alguna consulta sobre este o tu cuenta, por favor respondé a este mensaje o contactanos.',
    '📄 *Concepto:* Presupuesto\n📅 *Fecha:* 05/10/2026',
    'Polifroni Aberturas\nAutomatizado por *The Automation Partner*',
  ].join('\n\n'),
  'un presupuesto: la plantilla del usuario, sin el código de la cuenta y con la fecha del envío',
)
const varios = textoPresupuestos('PEREZ JUAN', 3, new Date(2026, 9, 5))
assert.ok(varios.includes('Le adjuntamos los presupuestos solicitados.'), 'varios: en plural')
assert.ok(varios.includes('📄 *Concepto:* Presupuestos (3)'))
assert.ok(!/ENLACE_CONFIRMACION|https?:\/\//.test(varios), 'sin confirmación, sin enlaces')
assert.ok(textoPresupuestos('', 1).startsWith('👋Hola *Cliente*'))
assert.equal(
  etiquetaPresupuesto({ nombreArchivo: 'Presupuesto_Cocina.pdf', tipo: 'Aluminio', color: 'Negro' }),
  'Presupuesto_Cocina (Aluminio · Negro)',
)

/* Confirmación opcional: el responsable recibe un enlace por presupuesto a confirmar (uno o todos) */
const k1 = nuevaClave()
const k2 = nuevaClave()
const uno = textoPresupuestos('PEREZ JUAN', 2, new Date(2026, 9, 5), [{ etiqueta: 'Cocina (PVC · BLANCO)', clave: k1 }])
assert.ok(uno.includes(`el presupuesto *Cocina (PVC · BLANCO)* te parece correcto, podés confirmarlo haciendo click en el siguiente enlace: ${marcaPresupuesto(k1)}`))
assert.ok(uno.indexOf(marcaPresupuesto(k1)) < uno.indexOf('Polifroni Aberturas'), 'el enlace va antes de la firma')
const todos = textoPresupuestos('PEREZ JUAN', 2, new Date(2026, 9, 5), [
  { etiqueta: 'Cocina', clave: k1 },
  { etiqueta: 'Baño', clave: k2 },
])
assert.ok(todos.includes(`• *Cocina*: ${marcaPresupuesto(k1)}`) && todos.includes(`• *Baño*: ${marcaPresupuesto(k2)}`), 'todos: un enlace por presupuesto')
assert.ok(!/hook\.us1\.make\.com/.test(todos), 'ninguna URL de Make en el mensaje')
assert.equal(marcaPresupuesto(k1), marcaPresupuestoServidor(k1), 'la app y el servidor usan la misma marca')

/* El servidor pone los enlaces firmados: sólo a quien confirma, y sólo de claves pedidas */
process.env.CONFIRMACION_URL = 'https://app.ejemplo.com'
process.env.CONFIRMACION_SECRET = 'x'.repeat(40)
const firmado = textoPresupuestoDestino({ tipo: 'Cliente', confirmador: true, texto: todos }, [k1, k2])
assert.ok(firmado && !firmado.includes('ENLACE_CONFIRMACION') && (firmado.match(/https:\/\/app\.ejemplo\.com\/c\//g) ?? []).length === 2)
assert.equal(textoPresupuestoDestino({ tipo: 'Cliente', confirmador: false, texto: todos }, [k1, k2]), null, 'el que no confirma no lleva enlaces')
assert.equal(textoPresupuestoDestino({ tipo: 'Cliente', confirmador: true, texto: todos }, [k1]), null, 'una marca de una clave no pedida')
assert.equal(textoPresupuestoDestino({ tipo: 'Cliente', confirmador: true, texto: uno }, [k1, k2]), null, 'una clave pedida sin su enlace')
assert.equal(textoPresupuestoDestino({ tipo: 'Cliente', confirmador: false, texto: varios }, []), varios, 'sin confirmación, el texto tal cual')
const c1 = nuevaClave()
const c2 = nuevaClave()
assert.ok(c1.length >= 32 && c1 !== c2, 'claves únicas')

/* Fecha de envío, en la hora local */
assert.equal(fechaLocal(new Date(2026, 9, 5, 23, 30)), '2026-10-05')

/* Etapas */
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'crear'), ['Seleccionar Cliente', 'Cargar Presupuestos', 'Enviar Presupuestos'])
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos', 'cargar'), ['Seleccionar Presupuesto', 'Cargar Presupuestos', 'Enviar Presupuestos'])
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
assert.equal(colorTipoCarpinteria('PVC'), '#00c875', 'PVC: verde')
for (const t of ['Aluminio', 'Alumino', 'Aluminio A30New']) assert.equal(colorTipoCarpinteria(t), '#ffcb00', `${t}: amarillo`)
assert.equal(importeDe('1.731.694,48'), 1731694.48)
assert.equal(importeDe('1731694.48'), 1731694.48)
assert.equal(importeDe('$ 604500'), 604500)
assert.equal(importeDe('604.500'), 604500, 'puntos de miles sin coma')
assert.equal(importeDe('1.731.694'), 1731694)
assert.equal(importeDe('abc'), null)
assert.equal(formatoImporte(1297684), '$ 1.297.684', 'total del presupuesto, sin decimales si es entero')
assert.equal(formatoImporte(1731694.48), '$ 1.731.694,48')
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

/* La actividad de un presupuesto ganado desde la app: la misma estructura que la de WhatsApp. */
{
  const t = actividadConfirmacionApp({ contacto: 'PEREZ <JUAN>', ubicacion: 'Pujol 1147', autor: 'Ana', cuando: new Date('2026-10-13T15:43:00Z') })
  assert.ok(t.startsWith('<p><b>✅ Confirmó el presupuesto:</b> PEREZ &lt;JUAN&gt;</p>'), t)
  assert.ok(t.includes('<p><b>Fecha:</b> 13/10/2026') && t.includes('12:43'), 'la hora de Argentina')
  assert.ok(t.includes('<p><b>Ubicación de la obra:</b> Pujol 1147</p>'))
  assert.ok(t.endsWith('<p><i>Registrado desde la app por Ana (Consultar y Gestionar Presupuestos).</i></p>'))
  assert.ok(!actividadConfirmacionApp({ contacto: 'X', ubicacion: '', autor: '' }).includes('Ubicación'), 'sin ubicación, sin renglón')
}

/* Cargar otro: las bolsas del cliente sin ganar ni perder; los nuevos van a la más reciente. */
{
  const env = (id: string, fechaEnvio: string) =>
    ({ id, nombre: id, tipo: 'PVC', color: 'Blanco', fechaEnvio, estadoEnvio: 'Enviado', pdf: null, total: 1 }) as const
  const bolsa = (id: string, estado: string, presupuestos: ReturnType<typeof env>[]) => ({
    id, nombre: 'PEREZ', idPresupuesto: '', creacion: '', cliente: null, arquitecto: null, enviarA: 'Cliente', presupuestos: [...presupuestos], estado,
  })
  const r = bolsaParaCargar([
    bolsa('100', 'Presupuesto Enviado', [env('11', '2026-10-02')]),
    bolsa('300', 'Ganado', [env('31', '2026-10-01')]),
    bolsa('200', 'En Negociacion', [env('21', '2026-10-01'), env('22', '2026-10-05')]),
    bolsa('400', 'Perdido', [env('41', '2026-10-03')]),
  ])
  assert.equal(r?.bolsa.id, '200', 'la más reciente de las abiertas (no la ganada ni la perdida)')
  assert.deepEqual(r?.enviados.map((e) => e.id), ['21', '11', '22'], 'los enviados de las abiertas, por fecha')
  assert.equal(bolsaParaCargar([bolsa('1', 'Ganado', []), bolsa('2', 'Perdido', [])]), null, 'sin abiertas: no se avanza')
  assert.equal(bolsaParaCargar([]), null)
}

console.log('presupuesto: todas las reglas pasan')
