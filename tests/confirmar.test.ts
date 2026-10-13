/**
 * El enlace de confirmación (`/c/<código>`) de la Orden de Producción y del presupuesto:
 *  · el enlace es corto y va firmado: otra clave, otro documento u otro rol no pasan;
 *  · el formato largo del primer enlace (`/confirmar?d=&c=&n=&t=`) se sigue aceptando;
 *  · qué estado admite una respuesta, y qué se muestra si ya no la admite;
 *  · el documento se busca en Monday por la clave, con el nombre de quien confirma;
 *  · la ruta entera (GET y POST) contra un Monday simulado, con los campos del formulario de siempre.
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  codigoConfirmacion,
  enlaceConfirmacion,
  esClave,
  faltaConfiguracion,
  firmarLargo,
  formasDeClave,
  leerCodigo,
  leerEnlaceLargo,
  origenDelPedido,
} from '../api/_confirmacion'
import {
  COL_OP,
  COL_SUB_PRES,
  buscarDocumento,
  leerRespuesta,
  registrarRespuesta,
  situacionOp,
  situacionPresupuesto,
  textoUpdate,
  type Consulta,
  type Documento,
} from '../api/_confirmarMonday'
import { manejarConfirmar } from '../api/_confirmarHttp'
import { MARCA_ENLACE } from '../api/_confirmacion'
import { textoParaDestino } from '../api/_whatsappHttp'
import { esc } from '../api/_confirmarPaginas'

const CLAVE = '0f8e2a6c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
const OTRA = 'aaaaaaaa-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
process.env.CONFIRMACION_URL = 'https://app.test/confirmar'
process.env.CONFIRMACION_SECRET = 's'.repeat(48)
process.env.MONDAY_TOKEN = 'token-de-prueba'

/* ── El enlace corto ───────────────────────────────────────────────────────────────────────────── */
assert.equal(faltaConfiguracion(), null)
assert.ok(esClave(CLAVE) && esClave('a'.repeat(32)) && !esClave('123') && !esClave(`${CLAVE}x`))
assert.deepEqual(formasDeClave(CLAVE.replace(/-/g, '')), [CLAVE, CLAVE.replace(/-/g, '')], 'con y sin guiones')

const enlace = enlaceConfirmacion({ documento: 'op', clave: CLAVE, rol: 'Cliente' })
const codigo = enlace.split('/c/')[1]
assert.ok(enlace.startsWith('https://app.test/c/'), 'de la variable vale el origen')
assert.equal(codigo.length, 35)
assert.ok(enlace.length <= 60, `corto: ${enlace.length} caracteres`)
assert.ok(!/make\.com|monday/.test(enlace), 'ninguna URL interna')
assert.deepEqual(leerCodigo(codigo), { documento: 'op', rol: 'Cliente', clave: CLAVE })
assert.deepEqual(leerCodigo(codigoConfirmacion({ documento: 'presupuesto', clave: CLAVE, rol: 'Constructor' })), {
  documento: 'presupuesto',
  rol: 'Constructor',
  clave: CLAVE,
})
assert.equal(leerCodigo(codigoConfirmacion({ documento: 'op', clave: CLAVE.replace(/-/g, ''), rol: 'Cliente' }))?.clave, CLAVE)

/* Cambiar cualquier parte del código lo invalida. */
const otroCodigo = codigoConfirmacion({ documento: 'op', clave: OTRA, rol: 'Cliente' })
assert.equal(leerCodigo('b' + codigo.slice(1)), null, 'otro documento/rol: no pasa')
assert.equal(leerCodigo(codigo.slice(0, 23) + otroCodigo.slice(23)), null, 'firma de otra clave: no pasa')
assert.equal(leerCodigo(otroCodigo.slice(0, 23) + codigo.slice(23)), null, 'otra clave con esta firma: no pasa')
assert.equal(leerCodigo(codigo.slice(0, -1)), null, 'incompleto')
assert.equal(leerCodigo('z' + codigo.slice(1)), null, 'prefijo desconocido')
{
  const s = process.env.CONFIRMACION_SECRET
  process.env.CONFIRMACION_SECRET = 'otro'.repeat(10)
  assert.equal(leerCodigo(codigo), null, 'con otro secreto, el enlace no vale')
  process.env.CONFIRMACION_SECRET = 'corto'
  assert.equal(faltaConfiguracion(), 'ERROR_CONFIRMACION_SECRET', 'un secreto corto no sirve')
  process.env.CONFIRMACION_SECRET = s
}

/* El formato largo de antes. */
const largo = new URLSearchParams({ d: 'op', c: CLAVE, n: 'Juan Pérez', t: firmarLargo('op', CLAVE, 'Juan Pérez') })
assert.deepEqual(leerEnlaceLargo(largo), { documento: 'op', clave: CLAVE, rol: 'Cliente', nombre: 'Juan Pérez' })
assert.equal(leerEnlaceLargo(new URLSearchParams({ ...Object.fromEntries(largo), n: 'Otro' })), null, 'otro nombre: no pasa')

/* ── Las reglas ────────────────────────────────────────────────────────────────────────────────── */
assert.equal(situacionOp('Enviada Pend Confirmar'), 'pendiente')
assert.equal(situacionOp('Generada y Enviada Pend Confirmar'), 'pendiente', 'un nombre anterior de la etiqueta')
assert.equal(situacionOp('Pend de Confirmar'), 'pendiente', 'el nombre de hoy en el tablero')
assert.equal(situacionOp('Cualquier nombre', 3), 'pendiente', 'con el índice manda el índice, no el nombre')
assert.equal(situacionOp('Pend de Confirmar', 6), 'sinEnviar', 'índice 6 = Generada: todavía no se envió')
assert.equal(situacionOp('', 1), 'confirmada')
for (const e of ['Confirmada', 'Enviada a Taller', 'Produccion Completada']) {
  assert.equal(situacionOp(e), 'confirmada', `${e}: ya se confirmó`)
}
assert.equal(situacionOp('NO Confirmado'), 'rechazada')
assert.equal(situacionOp('Cancelada'), 'cancelada')
for (const e of ['Generada', '']) assert.equal(situacionOp(e), 'sinEnviar', e)
assert.equal(situacionPresupuesto(''), 'pendiente')
assert.equal(situacionPresupuesto('Confirmado'), 'confirmada')
assert.equal(situacionPresupuesto('Rechazado'), 'rechazada')

/* Los campos de los formularios. */
assert.deepEqual(leerRespuesta('op', { estado_obra: 'Confirmar' }), { ok: true, respuesta: { tipo: 'confirmar' } })
assert.equal(leerRespuesta('op', { estado_obra: 'No confirmar', motivo: '  ' }).ok, false, '"No confirmar" exige el motivo')
assert.equal(leerRespuesta('op', { estado_obra: 'No confirmar', motivo: 'x'.repeat(1001) }).ok, false, 'motivo con tope')
assert.equal(leerRespuesta('op', { estado_obra: 'otra' }).ok, false)
assert.equal(leerRespuesta('presupuesto', { estado_obra: 'Confirmar', ubicacion: 'Av. 1' }).ok, false, 'el presupuesto pide el coordinador')
assert.deepEqual(leerRespuesta('presupuesto', { estado_obra: 'Confirmar', ubicacion: ' Av. 1 ', coordinador: 'Ana' }), {
  ok: true,
  respuesta: { tipo: 'confirmar', ubicacion: 'Av. 1', coordinador: 'Ana' },
})
{
  /* Con opciones de coordinador, sólo vale una de ellas: no se acepta un nombre escrito a mano. */
  const opciones = [
    { nombre: 'PEREZ JUAN', rol: 'Cliente' as const },
    { nombre: 'ARQ. GOMEZ', rol: 'Arquitecto' as const },
  ]
  const campos = (coordinador: string) => ({ estado_obra: 'Confirmar', ubicacion: 'Av. 1', coordinador })
  assert.equal(leerRespuesta('presupuesto', campos('ARQ. GOMEZ'), opciones).ok, true)
  assert.equal(leerRespuesta('presupuesto', campos('Otro'), opciones).ok, false, 'fuera de la lista')
}
assert.deepEqual(leerRespuesta('presupuesto', { estado_obra: 'No confirmar', motivo: 'línea 1\nlínea 2' }), {
  ok: true,
  respuesta: { tipo: 'rechazar', motivo: 'línea 1\nlínea 2' },
})

/* ── Monday simulado ───────────────────────────────────────────────────────────────────────────── */
interface Llamada {
  query: string
  variables: Record<string, unknown>
}
const OBRA_CONTACTOS = {
  column_values: [
    { id: 'board_relation_mkthtd70', text: '1111 - PEREZ JUAN', display_value: '1111 - PEREZ JUAN', linked_item_ids: ['1'] },
    { id: 'board_relation_mksz3v0h', text: 'ARQ. GOMEZ', display_value: 'ARQ. GOMEZ', linked_item_ids: ['2'] },
  ],
}
function simulado(items: Record<string, unknown>[]) {
  const llamadas: Llamada[] = []
  const consulta: Consulta = async <T,>(query: string, variables: Record<string, unknown>) => {
    llamadas.push({ query, variables })
    if (query.trim().startsWith('mutation')) return { ok: true } as T
    if (query.includes('items(ids:')) {
      const cols = variables.cols as string[]
      return { items: [{ column_values: OBRA_CONTACTOS.column_values.filter((c) => cols.includes(c.id)) }] } as T
    }
    return { boards: [{ items_page: { items } }] } as T
  }
  return { consulta, llamadas }
}
const op = (estado: string, clave = CLAVE, motivo = '') => ({
  id: '501',
  name: 'Obra X - IDOP-1',
  state: 'active',
  column_values: [
    { id: COL_OP.clave, text: clave },
    { id: COL_OP.motivoNoConfirmo, text: motivo },
    { id: COL_OP.estado, text: estado },
    { id: COL_OP.tipo, text: 'PVC' },
    { id: COL_OP.nroPvc, text: '2291' },
    { id: COL_OP.nroAluminio, text: '' },
    { id: COL_OP.obra, text: 'Obra X', display_value: 'Obra X', linked_item_ids: ['900'] },
  ],
})

{
  const m = simulado([op('Generada y Enviada Pend Confirmar')])
  const doc = await buscarDocumento('op', CLAVE, 'Cliente', m.consulta)
  assert.ok(doc)
  assert.equal(doc.id, '501')
  assert.equal(doc.padreId, '900')
  assert.equal(doc.titulo, 'Orden de Producción N° 2291 · PVC')
  assert.equal(doc.situacion, 'pendiente')
  assert.equal(doc.nombre, 'PEREZ JUAN', 'el cliente de la obra, sin el código de la cuenta')
  assert.deepEqual(m.llamadas[0].variables.c, formasDeClave(CLAVE), 'se busca por la clave, con y sin guiones')
  assert.ok(m.llamadas[0].query.includes('18432207111') && m.llamadas[0].query.includes(COL_OP.clave))

  await registrarRespuesta(doc, doc.nombre, { tipo: 'confirmar' }, m.consulta)
  const escrituras = m.llamadas.filter((l) => l.query.trim().startsWith('mutation'))
  const valores = (l: Llamada) => JSON.parse(String(l.variables.valores ?? '{}'))
  assert.equal(escrituras[0].variables.id, '501')
  assert.deepEqual(valores(escrituras[0]), { [COL_OP.estado]: { index: 1 } }, 'la OP pasa a Confirmada (por índice: el nombre puede cambiar)')
  assert.equal(escrituras[1].variables.id, '900')
  assert.deepEqual(valores(escrituras[1]), { color_mm73rxg7: { label: 'CONFIRMADO OP' } }, 'la obra, CONFIRMADO OP')
  assert.ok(String(escrituras[2].variables.cuerpo).includes('PEREZ JUAN'), 'el update dice quién confirmó')
}
{
  const m = simulado([op('Generada y Enviada Pend Confirmar')])
  assert.equal((await buscarDocumento('op', CLAVE, 'Constructor', m.consulta))?.nombre, 'ARQ. GOMEZ', 'confirma el constructor')
}
{
  /* Una clave que Monday matchea "de más" no se toma: tiene que ser exactamente la del enlace. */
  const m = simulado([op('Enviada Pend Confirmar', OTRA)])
  assert.equal(await buscarDocumento('op', CLAVE, 'Cliente', m.consulta), null)
}
{
  const sub = {
    id: '701',
    name: 'IDPDF-1221',
    state: 'active',
    parent_item: {
      id: '700',
      name: 'PEREZ JUAN',
      column_values: [
        { id: 'board_relation_mkvgt8r', text: 'PEREZ JUAN', display_value: 'PEREZ JUAN', linked_item_ids: ['1'] },
        { id: 'board_relation_mkvgk8yb', text: '', display_value: '', linked_item_ids: [] },
      ],
    },
    column_values: [
      { id: COL_SUB_PRES.clave, text: CLAVE },
      { id: COL_SUB_PRES.confirmacion, text: '' },
      { id: COL_SUB_PRES.tipo, text: 'PVC' },
      { id: COL_SUB_PRES.color, text: 'Blanco' },
      { id: COL_SUB_PRES.motivo, text: '' },
    ],
  }
  const m = simulado([sub])
  const doc = await buscarDocumento('presupuesto', CLAVE, 'Cliente', m.consulta)
  assert.ok(doc)
  assert.equal(doc.titulo, 'Presupuesto IDPDF-1221')
  assert.equal(doc.padreId, '700')
  assert.equal(doc.nombre, 'PEREZ JUAN', 'el cliente de la bolsa')
  assert.deepEqual(doc.coordinadores, [{ nombre: 'PEREZ JUAN', rol: 'Cliente' }], 'sin arquitecto, sólo el cliente')
  assert.ok(m.llamadas[0].query.includes('9984270591') && m.llamadas[0].query.includes('parent_item'))
  await registrarRespuesta(doc, doc.nombre, { tipo: 'rechazar', motivo: 'El color\nno es' }, m.consulta)
  assert.deepEqual(JSON.parse(String(m.llamadas[1].variables.valores)), {
    [COL_SUB_PRES.confirmacion]: { label: 'Rechazado' },
    [COL_SUB_PRES.motivo]: 'El color no es',
  })
}

/* Los coordinadores de la obra: el cliente y el arquitecto de la bolsa, nunca el comodín "SIN ARQUITECTO". */
{
  const conArquitecto = (arquitecto: { display_value: string; linked_item_ids: string[] }) => ({
    id: '701',
    name: 'IDPDF-1221',
    state: 'active',
    parent_item: {
      id: '700',
      name: 'PEREZ JUAN',
      column_values: [
        { id: 'board_relation_mkvgt8r', text: '1111 - PEREZ JUAN', display_value: '1111 - PEREZ JUAN', linked_item_ids: ['1'] },
        { id: 'board_relation_mkvgk8yb', text: arquitecto.display_value, ...arquitecto },
      ],
    },
    column_values: [
      { id: COL_SUB_PRES.clave, text: CLAVE },
      { id: COL_SUB_PRES.confirmacion, text: '' },
    ],
  })
  const coordinadores = async (arquitecto: { display_value: string; linked_item_ids: string[] }) =>
    (await buscarDocumento('presupuesto', CLAVE, 'Cliente', simulado([conArquitecto(arquitecto)]).consulta))?.coordinadores

  assert.deepEqual(await coordinadores({ display_value: 'ARQ. GOMEZ', linked_item_ids: ['55'] }), [
    { nombre: 'PEREZ JUAN', rol: 'Cliente' },
    { nombre: 'ARQ. GOMEZ', rol: 'Arquitecto' },
  ])
  assert.deepEqual(
    await coordinadores({ display_value: 'SIN ARQUITECTO', linked_item_ids: ['10910009068'] }),
    [{ nombre: 'PEREZ JUAN', rol: 'Cliente' }],
    'el comodín no se lista',
  )
  assert.deepEqual(
    await coordinadores({ display_value: 'Sin Arquitecto', linked_item_ids: ['999'] }),
    [{ nombre: 'PEREZ JUAN', rol: 'Cliente' }],
    'tampoco por el nombre, aunque sea otro ítem',
  )
}

/* El texto del cliente no entra crudo al HTML (ni del update ni de la página). */
{
  const doc: Documento = {
    documento: 'op',
    id: '1',
    padreId: '',
    titulo: 'OP',
    detalle: '',
    etiqueta: '',
    situacion: 'pendiente',
    nombre: '',
    motivo: '',
    coordinadores: [],
  }
  const u = textoUpdate(doc, '<b>Juan</b>', { tipo: 'rechazar', motivo: '<script>alert(1)</script>' })
  assert.ok(!u.includes('<script>') && u.includes('&lt;script&gt;') && !u.includes('<b>Juan</b>'))
  assert.equal(esc(`"><img src=x onerror=alert(1)>`), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')
}

/* ── La ruta entera, con Monday simulado por `fetch` ───────────────────────────────────────────── */
interface Resp {
  status: number
  headers: Record<string, string>
  cuerpo: string
}
async function pedir(metodo: string, ruta: string, cuerpo = '', ua = 'Mozilla/5.0'): Promise<Resp> {
  const req = Object.assign(Readable.from(cuerpo ? [Buffer.from(cuerpo)] : []), {
    method: metodo,
    url: ruta,
    headers: { 'user-agent': ua, host: 'app.test', 'content-type': 'application/x-www-form-urlencoded' },
  }) as unknown as IncomingMessage
  const r: Resp = { status: 0, headers: {}, cuerpo: '' }
  const res = {
    set statusCode(s: number) {
      r.status = s
    },
    setHeader(k: string, v: string) {
      r.headers[k.toLowerCase()] = v
    },
    end(b: string) {
      r.cuerpo = b
    },
  } as unknown as ServerResponse
  await manejarConfirmar(req, res)
  return r
}

let estadoOp = 'Generada y Enviada Pend Confirmar'
let motivoOp = ''
const mutaciones: string[] = []
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  const { query, variables } = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> }
  if (query.trim().startsWith('mutation')) {
    mutaciones.push(String(variables.valores ?? variables.cuerpo))
    /* La OP se confirma y se cancela por índice ({"index":1} / {"index":2}), no por nombre. */
    const v = JSON.parse(String(variables.valores ?? '{}')) as Record<string, { index?: number } | string>
    const estado = v[COL_OP.estado]
    if (typeof estado === 'object' && estado.index === 1) estadoOp = 'Confirmada'
    if (typeof estado === 'object' && estado.index === 2) estadoOp = 'Cancelada'
    if (typeof v[COL_OP.motivoNoConfirmo] === 'string') motivoOp = v[COL_OP.motivoNoConfirmo] as string
    return new Response(JSON.stringify({ data: { ok: true } }))
  }
  if (query.includes('items(ids:')) return new Response(JSON.stringify({ data: { items: [OBRA_CONTACTOS] } }))
  const items = (variables.c as string[])[0] === CLAVE ? [op(estadoOp, CLAVE, motivoOp)] : []
  return new Response(JSON.stringify({ data: { boards: [{ items_page: { items } }] } }))
}) as typeof fetch

const ruta = `/c/${codigo}`
{
  const r = await pedir('GET', ruta)
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /text\/html/)
  assert.ok(r.cuerpo.includes('Estimado/a<span id="saludoNombre"> PEREZ JUAN</span>,'), 'el saludo con el nombre de Monday')
  assert.ok(r.cuerpo.includes('<title>Confirmación de la Orden de Producción · Polifroni</title>'), 'el HTML de la OP')
  assert.ok(!r.cuerpo.includes('Presupuesto'), 'nada del HTML del presupuesto')
  assert.ok(r.cuerpo.includes(`<form action="${ruta}" method="POST">`), 'el formulario vuelve al mismo enlace')
  assert.ok(!/hook\.|make\.com|monday\.com|\{\{/.test(r.cuerpo), 'sin URLs internas ni variables de Make')
}
/* El rewrite de Vercel lo pasa como `?codigo=`; el `use` de Vite, sin el `/c`. */
assert.equal((await pedir('GET', `/api/confirmar?codigo=${codigo}`)).status, 200)
assert.equal((await pedir('GET', `/${codigo}`)).status, 200)
assert.equal((await pedir('GET', `/c/${'b' + codigo.slice(1)}`)).status, 400, 'código cambiado')
assert.equal((await pedir('GET', '/c/')).status, 400, 'sin código')
{
  const r = await pedir('GET', ruta, '', 'WhatsApp/2.23.20.0 A')
  assert.ok(r.cuerpo.includes('og:title') && r.cuerpo.includes('logo-polifroni.png'), 'la vista previa, sin Monday')
  assert.ok(r.cuerpo.includes('content="Revisar orden de producción enviada y solicitud de confirmación"'))
}
{
  /* El envío por 360messenger arma la vista previa con un cliente HTTP que no dice ser un bot: tiene
     que recibir al instante la vista previa, sin consultar Monday. */
  const fetchReal = globalThis.fetch
  let consultas = 0
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    consultas++
    return fetchReal(...a)
  }) as typeof fetch
  for (const ua of ['axios/1.7.2', 'node-fetch', 'okhttp/4.9.2', '']) {
    const r = await pedir('GET', ruta, '', ua)
    assert.ok(r.cuerpo.includes('<meta property="og:title" content="Confirmación de la Orden de Producción" />'), `vista previa: "${ua}"`)
    assert.ok(!r.cuerpo.includes('<form'), `sin el formulario: "${ua}"`)
  }
  assert.equal(consultas, 0, 'ninguna consulta a Monday')
  globalThis.fetch = fetchReal
}
{
  /* La página de verdad también trae la vista previa, por las dudas. */
  const r = await pedir('GET', ruta)
  assert.ok(r.cuerpo.includes('<form') && r.cuerpo.includes('og:image'), 'el formulario, con las etiquetas de la vista previa')
}
{
  const r = await pedir('POST', ruta, 'estado_obra=No+confirmar&motivo=')
  assert.equal(r.status, 422, 'sin motivo: vuelve el formulario')
  assert.ok(r.cuerpo.includes('Confirmación de la Orden de Producción'))
  assert.equal(mutaciones.length, 0, 'no se escribió nada')
}
{
  const r = await pedir('POST', ruta, 'estado_obra=Confirmar')
  assert.equal(r.status, 200)
  assert.ok(r.cuerpo.includes('<span id="respuesta" hidden>Confirmar</span>'), 'el agradecimiento elige el bloque de confirmado')
  assert.ok(r.cuerpo.includes('¡Confirmamos tu pedido<span id="nombreOk">, PEREZ JUAN</span>!'), 'el agradecimiento de la OP')
  assert.ok(!r.cuerpo.includes('Confirmación recibida'), 'no el del presupuesto')
  assert.equal(mutaciones.length, 3, 'la OP, la obra y el update')
}
{
  /* El mismo enlace otra vez: muestra que ya está confirmada y no escribe de nuevo. */
  const antes = mutaciones.length
  const r = await pedir('POST', ruta, 'estado_obra=No+confirmar&motivo=cambio')
  assert.equal(r.status, 409)
  assert.ok(r.cuerpo.includes('<span id="respuesta" hidden>Confirmar</span>'), 'muestra lo que ya se respondió')
  assert.equal(mutaciones.length, antes)
}
{
  /* La que ya se mandó al taller (el caso de la OP 2300): se ve como confirmada, no como un error. */
  estadoOp = 'Enviada a Taller'
  const r = await pedir('GET', ruta)
  assert.ok(r.cuerpo.includes('<span id="respuesta" hidden>Confirmar</span>') && !r.cuerpo.includes('no espera respuesta'))
  estadoOp = 'Cancelada'
  assert.ok((await pedir('GET', ruta)).cuerpo.includes('Esta orden fue cancelada'))
}
{
  /* El formato largo de antes sigue funcionando, con el nombre que traía. */
  estadoOp = 'Generada y Enviada Pend Confirmar'
  const r = await pedir('GET', `/confirmar?${largo.toString()}`)
  assert.equal(r.status, 200)
  assert.ok(r.cuerpo.includes('Estimado/a<span id="saludoNombre"> Juan Pérez</span>,'))
}
{
  /* Todavía no está en Monday (se registra al finalizar, después del mensaje): quien arma la vista
     previa como un navegador igual recibe 200 y la tarjeta, no un error. */
  const r = await pedir('GET', `/c/${otroCodigo}`)
  assert.equal(r.status, 200, 'código firmado de una clave que todavía no está en Monday')
  assert.ok(r.cuerpo.includes('No encontramos la orden'))
  assert.ok(r.cuerpo.includes('<meta property="og:title" content="Confirmación de la Orden de Producción" />'), 'con la tarjeta')
}
{
  /* Cualquier página del enlace, abierta como navegador, lleva la tarjeta UNA vez. */
  for (const e of ['Pend de Confirmar', 'Confirmada', 'Cancelada']) {
    estadoOp = e
    const r = await pedir('GET', ruta)
    assert.equal(r.cuerpo.split('og:title').length - 1, 1, `una sola tarjeta con la OP "${e}"`)
  }
  estadoOp = 'Generada y Enviada Pend Confirmar'
}

/* ── Ya la confirmaron desde la app antes de que el cliente abriera el enlace ─────────────────── */
{
  estadoOp = 'Confirmada'
  const antes = mutaciones.length
  const r = await pedir('GET', ruta)
  assert.ok(r.cuerpo.includes('<span id="respuesta" hidden>Confirmar</span>'), 've la orden ya confirmada')
  assert.ok(!r.cuerpo.includes('name="estado_obra"'), 'no se le muestra el formulario')
  /* Y si tenía el formulario abierto de antes y lo manda igual: no se escribe nada. */
  const p = await pedir('POST', ruta, 'estado_obra=No+confirmar&motivo=cambio')
  assert.equal(p.status, 409)
  assert.ok(p.cuerpo.includes('<span id="respuesta" hidden>Confirmar</span>'))
  assert.equal(mutaciones.length, antes, 'no pisa la confirmación de la app')
}

/* ── "No confirmar": la OP queda Cancelada con el motivo del cliente ──────────────────────────── */
{
  estadoOp = 'Pend de Confirmar'
  motivoOp = ''
  const antes = mutaciones.length
  const r = await pedir('POST', ruta, 'estado_obra=No+confirmar&motivo=La+ventana+del%0Aliving+mide+distinto')
  assert.equal(r.status, 200)
  assert.ok(r.cuerpo.includes('<span id="respuesta" hidden>No confirmar</span>'), 'el agradecimiento de "revisar"')
  assert.ok(r.cuerpo.includes('La ventana del\nliving mide distinto'), 'con lo que contó')
  const deLaOp = JSON.parse(mutaciones[antes])
  assert.deepEqual(
    deLaOp,
    { [COL_OP.estado]: { index: 2 }, [COL_OP.motivoNoConfirmo]: 'La ventana del living mide distinto' },
    'Cancelada (índice 2) y el motivo en 🤖Motivo por el que NO Confirmo',
  )
  assert.ok(mutaciones[antes + 1].includes('NO CONFIRMADO'), 'la obra, NO CONFIRMADO')
  /* Vuelve a abrir el enlace: ve su respuesta con el motivo, no "orden cancelada". */
  const g = await pedir('GET', ruta)
  assert.ok(g.cuerpo.includes('<span id="respuesta" hidden>No confirmar</span>') && g.cuerpo.includes('La ventana del living mide distinto'))
  assert.ok(!g.cuerpo.includes('Esta orden fue cancelada'))
  motivoOp = ''
}

/* ── El presupuesto: sus dos HTML, con el paso 2 (ubicación y coordinador) ─────────────────────── */
{
  let estadoPres = ''
  const escritas: string[] = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const { query, variables } = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> }
    if (query.trim().startsWith('mutation')) {
      escritas.push(String(variables.valores ?? variables.cuerpo))
      if (String(variables.valores ?? '').includes('Confirmado')) estadoPres = 'Confirmado'
      return new Response(JSON.stringify({ data: { ok: true } }))
    }
    const sub = {
      id: '701',
      name: 'IDPDF-1221',
      state: 'active',
      parent_item: {
        id: '700',
        name: 'PEREZ JUAN',
        column_values: [{ id: 'board_relation_mkvgt8r', text: 'PEREZ JUAN', display_value: 'PEREZ JUAN', linked_item_ids: ['1'] }],
      },
      column_values: [
        { id: COL_SUB_PRES.clave, text: CLAVE },
        { id: COL_SUB_PRES.confirmacion, text: estadoPres },
      ],
    }
    return new Response(JSON.stringify({ data: { boards: [{ items_page: { items: [sub] } }] } }))
  }) as typeof fetch

  const rutaPres = `/c/${codigoConfirmacion({ documento: 'presupuesto', clave: CLAVE, rol: 'Cliente' })}`
  const form = await pedir('GET', rutaPres)
  assert.equal(form.status, 200)
  assert.ok(form.cuerpo.includes('<title>Confirmación de Presupuesto · Polifroni</title>'), 'el HTML del presupuesto')
  assert.ok(!form.cuerpo.includes('Orden de Producción</strong>'), 'nada del HTML de la OP')
  assert.ok(
    form.cuerpo.includes(`const webhookOriginal = '${rutaPres}'`) && form.cuerpo.includes(`const webhookNuevo = '${rutaPres}'`),
    'los dos pasos vuelven al enlace',
  )
  assert.ok(!/hook\.|make\.com|\{\{/.test(form.cuerpo), 'sin URLs de Make ni variables')
  assert.ok(form.cuerpo.includes('Dirección de la obra (ingresa nombre de calle y número)'), 'el rótulo de la dirección')
  assert.ok(form.cuerpo.includes('<meta property="og:title" content="Confirmación de Presupuesto" />'), 'su vista previa')
  const previa = await pedir('GET', rutaPres, '', 'WhatsApp/2.23.20.0 A')
  assert.ok(previa.cuerpo.includes('<meta property="og:title" content="Confirmación de Presupuesto" />'), 'título del presupuesto')
  assert.ok(previa.cuerpo.includes('content="Revisar presupuesto enviado y solicitud de confirmación"'))
  assert.ok(form.cuerpo.includes('<select id="coordinador" name="coordinador"'), 'el coordinador se elige de una lista')
  assert.ok(form.cuerpo.includes('<option value="PEREZ JUAN">PEREZ JUAN · Cliente</option>'), 'con el cliente de la bolsa')

  assert.equal((await pedir('POST', rutaPres, 'estado_obra=Confirmar')).status, 422, 'falta el paso 2')
  assert.equal(
    (await pedir('POST', rutaPres, 'estado_obra=Confirmar&ubicacion=Av.+1&coordinador=Arq.+P%C3%A9rez')).status,
    422,
    'un coordinador que no está en la lista',
  )
  assert.equal(escritas.length, 0)
  const ok = await pedir('POST', rutaPres, 'estado_obra=Confirmar&ubicacion=Av.+San+Mart%C3%ADn+1500&coordinador=PEREZ+JUAN')
  assert.equal(ok.status, 200)
  assert.ok(ok.cuerpo.includes('¡Confirmación recibida<span id="nombreOk">, PEREZ JUAN</span>!'), 'el agradecimiento del presupuesto')
  assert.ok(!ok.cuerpo.includes('<h1>¡Confirmamos tu pedido'), 'no el de la OP')
  assert.ok(escritas.some((e) => e.includes('Ubicación de la obra:</b> Av. San Martín 1500')), 'el update con los datos de la obra')
}

/* ── El enlace va SÓLO a quien confirma ────────────────────────────────────────────────────────── */
{
  /* El caso reportado: cliente y constructor, y sólo el cliente marcado como Confirmador. */
  const cliente = { tipo: 'Cliente', nombre: 'PEREZ JUAN', confirmador: true, texto: '' }
  const constructor = { tipo: 'Constructor', nombre: 'ARQ. GOMEZ', confirmador: false, texto: '' }
  const tieneEnlace = (t: string) => t.includes('/c/')
  for (const reenvio of [false, true]) {
    const aCliente = textoParaDestino('op', cliente, { reenvio, clave: CLAVE })
    const aConstructor = textoParaDestino('op', constructor, { reenvio, clave: CLAVE })
    const cuando = reenvio ? 'reenvío' : 'primer envío'
    assert.ok(tieneEnlace(aCliente), `OP, ${cuando}: el confirmador recibe el enlace`)
    assert.ok(!tieneEnlace(aConstructor), `OP, ${cuando}: quien no confirma NO recibe el enlace`)
    assert.ok(!aConstructor.includes('La tenés que confirmar por acá'), `OP, ${cuando}: ni la frase del enlace`)
    assert.ok(aConstructor.includes('Hola *ARQ. GOMEZ*'), `OP, ${cuando}: el resto del mensaje sí le llega`)
  }
  const textoPres = (conMarca: boolean) => `Hola${conMarca ? ' ' + MARCA_ENLACE : ''}`
  assert.ok(tieneEnlace(textoParaDestino('presupuesto', { ...cliente, texto: textoPres(true) }, { reenvio: false, clave: CLAVE })))
  assert.ok(!tieneEnlace(textoParaDestino('presupuesto', { ...constructor, texto: textoPres(false) }, { reenvio: false, clave: CLAVE })))
  /* Aunque al texto del que no confirma le llegara la marca, no se le pone el enlace. */
  const forzado = textoParaDestino('presupuesto', { ...constructor, texto: textoPres(true) }, { reenvio: false, clave: CLAVE })
  assert.ok(!tieneEnlace(forzado) && !forzado.includes(MARCA_ENLACE))
}

/* ── El enlace apunta al MISMO deploy que manda el mensaje ────────────────────────────────────── */
{
  const dev = origenDelPedido({ 'x-forwarded-host': 'app-polifroni-git-dev-tap.vercel.app', host: 'otro.vercel.app' })
  assert.equal(dev, 'https://app-polifroni-git-dev-tap.vercel.app', 'el deploy de dev arma enlaces a dev')
  assert.equal(origenDelPedido({ host: 'app-polifroni.vercel.app' }), 'https://app-polifroni.vercel.app', 'producción, a producción')
  assert.equal(origenDelPedido({ host: 'localhost:5192' }), null, 'en local, la variable')
  assert.equal(origenDelPedido({ host: '127.0.0.1' }), null)
  assert.equal(origenDelPedido({ host: 'evil.com/x?y' }), null, 'una cabecera que no es un dominio no se usa')
  const enDev = enlaceConfirmacion({ documento: 'presupuesto', clave: CLAVE, rol: 'Cliente' }, dev)
  assert.ok(enDev.startsWith('https://app-polifroni-git-dev-tap.vercel.app/c/'))
  assert.ok(enlaceConfirmacion({ documento: 'op', clave: CLAVE, rol: 'Cliente' }).startsWith('https://app.test/c/'), 'sin origen, la variable')
  assert.equal(faltaConfiguracion(dev), null)
  const op = textoParaDestino('op', { tipo: 'Cliente', nombre: 'X', confirmador: true, texto: '' }, { reenvio: false, clave: CLAVE, origen: dev })
  assert.ok(op.includes('https://app-polifroni-git-dev-tap.vercel.app/c/'), 'el texto de la OP usa el origen del envío')
}

console.log('confirmar: ok')
