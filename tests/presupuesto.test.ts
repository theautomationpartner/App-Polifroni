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
import { CAMPOS_FICHA, erroresFicha, valoresMonday } from '../src/lib/fichaContacto'
import {
  datosContacto,
  nuevaClave,
  etiquetaEnviarA,
  fechaLocal,
  ganable,
  gestionable,
  importeDe,
  nombreBolsa,
  pasaFiltroBolsa,
  tipoObraDe,
  colorTipoCarpinteria,
  formatoImporte,
  rolesDeEnviarA,
  rolesIniciales,
  etiquetaPresupuesto,
  marcaPresupuesto,
  textoPresupuestos,
  accionesPresupuesto,
  situacionDe,
  yaEnviado,
  esSinArquitecto,
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
assert.deepEqual(etiquetasPasos(null, null, 'presupuestos'), ['Seleccionar Cliente', 'Cargar Presupuestos', 'Enviar Presupuestos'], 'sólo crea (15/10/2026)')
assert.equal(etiquetasPasos(null, null, 'enviar').length, 3, 'Producción sigue con tres etapas')

/* Consultar y Gestionar: los presupuestos de las bolsas que no están Ganadas ni Perdidas (13/10/2026) */
for (const e of ['Presupuesto Enviado', 'En Negociacion', 'Presupuesto vencido', 'Solicitud de Presupuesto', 'Proyecto Ganado con otro pres', '']) {
  assert.ok(gestionable(e), e)
}
for (const e of ['Ganado', 'Perdido']) assert.ok(!gestionable(e), e)
assert.ok(!ganable('Presupuesto vencido'), 'un vencido no se confirma')
for (const e of ['Presupuesto Enviado', 'En Negociacion', 'Solicitud de Presupuesto']) assert.ok(ganable(e), e)

/* La respuesta del presupuesto y el envío */
assert.equal(situacionDe(''), 'pendiente')
assert.equal(situacionDe('Confirmado'), 'confirmado')
assert.equal(situacionDe('Rechazado'), 'rechazado')
assert.equal(situacionDe('Error de Confirmacion'), 'error')
assert.ok(yaEnviado('Enviado') && !yaEnviado('') && !yaEnviado('Enviar'))
{
  const pdf = { assetId: '1' }
  const sinEnviar = { estadoEnvio: '', confirmacion: '', pdf }
  const enviado = { estadoEnvio: 'Enviado', confirmacion: '', pdf }
  assert.deepEqual(accionesPresupuesto('Solicitud de Presupuesto', sinEnviar), { envio: 'enviar', confirmar: true, perder: true, ganar: false })
  assert.deepEqual(accionesPresupuesto('Presupuesto Enviado', enviado), { envio: 'reenviar', confirmar: true, perder: true, ganar: false }, 'ya salió: Reenviar')
  assert.equal(accionesPresupuesto('Presupuesto vencido', enviado).confirmar, false, 'vencido: no se confirma')
  assert.equal(accionesPresupuesto('Presupuesto vencido', enviado).perder, true, 'vencido: sí se pierde')
  assert.deepEqual(accionesPresupuesto('Presupuesto Enviado', { ...enviado, pdf: null }), { envio: null, confirmar: false, perder: true, ganar: false }, 'sin PDF')
  for (const c of ['Confirmado', 'Rechazado', 'Error de Confirmacion']) {
    assert.deepEqual(accionesPresupuesto('Presupuesto Enviado', { ...enviado, confirmacion: c }), { envio: null, confirmar: false, perder: false, ganar: false }, c)
  }
  assert.deepEqual(accionesPresupuesto('Ganado', enviado), { envio: null, confirmar: false, perder: false, ganar: false }, 'bolsa recién ganada')
  /* Confirmado por WhatsApp: la bolsa "Confirmado - Pend de Cerrar" se gana con el total (15/10/2026). */
  const pendCerrar = 'Confirmado - Pend de Cerrar'
  assert.deepEqual(accionesPresupuesto(pendCerrar, { ...enviado, confirmacion: 'Confirmado' }), { envio: null, confirmar: false, perder: false, ganar: true })
  assert.equal(accionesPresupuesto('Presupuesto Enviado', { ...enviado, confirmacion: 'Confirmado' }).ganar, false, 'sin la etiqueta, no')
  assert.equal(accionesPresupuesto('Ganado', { ...enviado, confirmacion: 'Confirmado' }).ganar, false, 'ya ganado')
  assert.deepEqual(accionesPresupuesto(pendCerrar, enviado), { envio: 'reenviar', confirmar: false, perder: true, ganar: false }, 'otro de la misma bolsa: ya hay uno confirmado')
  /* Gana uno solo: con la bolsa Ganada (por otro), los demás ya no se confirman. */
  assert.deepEqual(accionesPresupuesto('Ganado', sinEnviar), { envio: null, confirmar: false, perder: false, ganar: false })
}

/* La consulta lista TODAS las bolsas; las pestañas filtran por su estado (15/10/2026). */
{
  const estados = ['Presupuesto Enviado', 'Confirmado - Pend de Cerrar', 'Ganado', 'Perdido', 'Presupuesto vencido', '']
  const en = (f: Parameters<typeof pasaFiltroBolsa>[0]) => estados.filter((e) => pasaFiltroBolsa(f, e))
  assert.deepEqual(en('todos'), estados)
  assert.deepEqual(en('enGestion'), ['Presupuesto Enviado', 'Confirmado - Pend de Cerrar', 'Presupuesto vencido', ''])
  assert.deepEqual(en('paraCerrar'), ['Confirmado - Pend de Cerrar'])
  assert.deepEqual(en('ganados'), ['Ganado'])
  assert.deepEqual(en('perdidos'), ['Perdido'])
  assert.ok(!gestionable('Ganado') && !gestionable('Perdido') && gestionable('Presupuesto Enviado'), '«+Nuevo» no en una Ganada o Perdida')
}

/* El reenvío: el mensaje lo dice */
{
  const t = textoPresupuestos('PEREZ JUAN', 1, new Date(2026, 9, 5), [], true)
  assert.ok(t.includes('🔁 Te *REENVIAMOS* el presupuesto solicitado'), t)
  assert.ok(t.includes('📄 *Concepto:* Reenvío de presupuesto'), t)
  assert.ok(!textoPresupuestos('PEREZ JUAN', 1, new Date(2026, 9, 5)).includes('REENVIAMOS'), 'un envío normal no')
}

/* Tipo, color e importes */
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


/* "SIN ARQUITECTO" no es una persona: no se le envía el presupuesto (13/10/2026) */
assert.ok(esSinArquitecto({ id: '10910009068', nombre: 'Lo que sea' }), 'por su id')
assert.ok(esSinArquitecto({ id: '1', nombre: 'SIN ARQUITECTO' }), 'por su nombre')
assert.ok(esSinArquitecto({ id: '1', nombre: '0000 - Sin Constructor' }), 'con código de cuenta')
assert.ok(!esSinArquitecto({ id: '55', nombre: 'ARQ. GOMEZ' }))
assert.ok(!esSinArquitecto({ id: '55', nombre: 'Sinatra Juan' }), 'un apellido que empieza con "Sin" no')
assert.ok(!esSinArquitecto(null))

/* Editar el contacto desde su card (14/10/2026) */
{
  const campos = CAMPOS_FICHA.Cliente
  const antes = { name: 'PEREZ JUAN', phone_mksydcv6: '5492494014611', email_mksynch6: '', text_mkwzq9z4: '20123456789', color_mkszaw8z: 'Persona Física', color_mkszas2x: '' }
  assert.deepEqual(erroresFicha(campos, antes), {}, 'lo que ya está, vale')
  assert.ok(erroresFicha(campos, { ...antes, name: '  ' }).name, 'el nombre es obligatorio')
  assert.ok(erroresFicha(campos, { ...antes, phone_mksydcv6: '12345' }).phone_mksydcv6, 'celular incompleto')
  assert.ok(!erroresFicha(campos, { ...antes, phone_mksydcv6: '249 436-9123' }).phone_mksydcv6, 'con característica y número')
  assert.ok(erroresFicha(campos, { ...antes, email_mksynch6: 'juan@' }).email_mksynch6)
  assert.ok(erroresFicha(campos, { ...antes, text_mkwzq9z4: 'abc' }).text_mkwzq9z4)
  assert.ok(erroresFicha(CAMPOS_FICHA.Constructor, { name: 'X', numeric_mksy21gb: '20-1234' }).numeric_mksy21gb === undefined, 'el CUIT puede venir con guiones')

  assert.deepEqual(valoresMonday(campos, antes, antes), {}, 'sin cambios, nada se escribe')
  assert.deepEqual(valoresMonday(campos, antes, { ...antes, phone_mksydcv6: '+54 9 249 401-4611' }), {}, 'el mismo celular, escrito distinto')
  assert.deepEqual(
    valoresMonday(campos, antes, { ...antes, name: 'PEREZ JUAN CARLOS', phone_mksydcv6: '249 555-0000', email_mksynch6: 'juan@x.com', color_mkszas2x: 'Consumidor Final' }),
    {
      name: 'PEREZ JUAN CARLOS',
      phone_mksydcv6: { phone: '5492495550000', countryShortName: 'AR' },
      email_mksynch6: { email: 'juan@x.com', text: 'juan@x.com' },
      color_mkszas2x: { label: 'Consumidor Final' },
    },
    'sólo lo que cambió, en el formato de cada columna',
  )
  assert.deepEqual(valoresMonday(campos, antes, { ...antes, color_mkszaw8z: '' }), { color_mkszaw8z: '' }, 'vaciar un dato lo borra')
  assert.deepEqual(valoresMonday(CAMPOS_FICHA.Constructor, { numeric_mksy21gb: '' }, { numeric_mksy21gb: '20-12345678-9' }), { numeric_mksy21gb: '20123456789' })
}

console.log('presupuesto: todas las reglas pasan')
