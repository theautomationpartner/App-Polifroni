/**
 * El enlace de confirmación (`/confirmar`) de la Orden de Producción y del presupuesto:
 *  · el enlace va firmado: otra clave, otro documento u otro nombre no pasan;
 *  · qué estado admite una respuesta y qué exige cada respuesta;
 *  · el documento se busca en Monday por la clave, y la respuesta escribe donde corresponde;
 *  · la ruta entera (GET y POST) contra un Monday simulado: formulario, "ya respondido", errores.
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { enlaceConfirmacion, esClave, faltaConfiguracion, firmaValida, firmar, leerEnlace } from '../api/_confirmacion'
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
import { esc } from '../api/_confirmarPaginas'

const CLAVE = '0f8e2a6c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
process.env.CONFIRMACION_URL = 'https://app.test/confirmar'
process.env.CONFIRMACION_SECRET = 's'.repeat(48)
process.env.MONDAY_TOKEN = 'token-de-prueba'

/* ── La firma ──────────────────────────────────────────────────────────────────────────────────── */
assert.equal(faltaConfiguracion(), null)
assert.ok(esClave(CLAVE) && esClave('a'.repeat(32)) && !esClave('123') && !esClave(`${CLAVE}x`))

const enlace = new URL(enlaceConfirmacion({ documento: 'op', clave: CLAVE, nombre: '1111 - Juan Pérez' }))
assert.equal(enlace.searchParams.get('n'), 'Juan Pérez', 'el saludo, sin el código de la cuenta')
assert.deepEqual(leerEnlace(enlace.searchParams), { documento: 'op', clave: CLAVE, nombre: 'Juan Pérez' })
assert.ok(!enlace.href.includes('make.com') && !enlace.href.includes('monday'), 'ninguna URL interna')

const cambiado = (k: string, v: string) => {
  const q = new URLSearchParams(enlace.searchParams)
  q.set(k, v)
  return leerEnlace(q)
}
assert.equal(cambiado('c', 'aaaaaaaa-1b3d-4e5f-8a9b-0c1d2e3f4a5b'), null, 'otra clave: no pasa')
assert.equal(cambiado('d', 'presupuesto'), null, 'otro documento: no pasa')
assert.equal(cambiado('n', 'Otro'), null, 'otro nombre: no pasa')
assert.equal(cambiado('t', firmar('op', CLAVE, 'Juan Pérez').slice(0, -1) + 'A'), null, 'firma cambiada: no pasa')
assert.equal(cambiado('d', 'obra'), null, 'documento desconocido')
assert.ok(firmaValida('op', CLAVE.toUpperCase(), 'Juan Pérez', enlace.searchParams.get('t')!), 'la clave no distingue mayúsculas')
{
  const s = process.env.CONFIRMACION_SECRET
  process.env.CONFIRMACION_SECRET = 'otro'.repeat(10)
  assert.equal(leerEnlace(enlace.searchParams), null, 'con otro secreto, el enlace no vale')
  process.env.CONFIRMACION_SECRET = 'corto'
  assert.equal(faltaConfiguracion(), 'ERROR_CONFIRMACION_SECRET', 'un secreto corto no sirve')
  process.env.CONFIRMACION_SECRET = s
}

/* ── Las reglas ────────────────────────────────────────────────────────────────────────────────── */
assert.equal(situacionOp('Enviada Pend Confirmar'), 'pendiente')
assert.equal(situacionOp('Generada y Enviada Pend Confirmar'), 'pendiente', 'el nombre nuevo de la etiqueta')
assert.equal(situacionOp('Confirmada'), 'confirmada')
assert.equal(situacionOp('NO Confirmado'), 'rechazada')
for (const e of ['Cancelada', 'Enviada a Taller', 'Produccion Completada', 'Generada', '']) assert.equal(situacionOp(e), 'cerrada', e)
assert.equal(situacionPresupuesto(''), 'pendiente')
assert.equal(situacionPresupuesto('Confirmado'), 'confirmada')
assert.equal(situacionPresupuesto('Rechazado'), 'rechazada')

assert.deepEqual(leerRespuesta('op', { respuesta: 'confirmar', ubicacion: ' Av. 1 ', coordinador: 'Ana' }), {
  ok: true,
  respuesta: { tipo: 'confirmar', ubicacion: 'Av. 1', coordinador: 'Ana' },
})
assert.equal(leerRespuesta('op', { respuesta: 'confirmar', ubicacion: 'Av. 1' }).ok, false, 'la OP exige el coordinador')
assert.equal(leerRespuesta('presupuesto', { respuesta: 'confirmar' }).ok, true, 'el presupuesto no pide datos de obra')
assert.equal(leerRespuesta('op', { respuesta: 'rechazar', motivo: '  ' }).ok, false, 'rechazar exige el motivo')
assert.equal(leerRespuesta('op', { respuesta: 'rechazar', motivo: 'x'.repeat(1001) }).ok, false, 'motivo con tope')
assert.equal(leerRespuesta('op', { respuesta: 'otra' }).ok, false)
assert.deepEqual(leerRespuesta('presupuesto', { respuesta: 'rechazar', motivo: 'línea 1\nlínea 2' }), {
  ok: true,
  respuesta: { tipo: 'rechazar', motivo: 'línea 1\nlínea 2' },
})

/* ── Monday simulado ───────────────────────────────────────────────────────────────────────────── */
interface Llamada {
  query: string
  variables: Record<string, unknown>
}
function simulado(items: Record<string, unknown>[], conPadre = false) {
  const llamadas: Llamada[] = []
  const consulta: Consulta = async <T,>(query: string, variables: Record<string, unknown>) => {
    llamadas.push({ query, variables })
    if (query.trim().startsWith('mutation')) return { ok: true } as T
    return { boards: [{ items_page: { items: items.map((i) => (conPadre ? i : { ...i, parent_item: undefined })) } }] } as T
  }
  return { consulta, llamadas }
}
const op = (estado: string, clave = CLAVE) => ({
  id: '501',
  name: 'Obra X - IDOP-1',
  state: 'active',
  column_values: [
    { id: COL_OP.clave, text: clave },
    { id: COL_OP.estado, text: estado },
    { id: COL_OP.tipo, text: 'PVC' },
    { id: COL_OP.nroPvc, text: '2291' },
    { id: COL_OP.nroAluminio, text: '' },
    { id: COL_OP.obra, text: 'Obra X', display_value: 'Obra X', linked_item_ids: ['900'] },
  ],
})

{
  const m = simulado([op('Enviada Pend Confirmar')])
  const doc = await buscarDocumento('op', CLAVE, m.consulta)
  assert.ok(doc)
  assert.equal(doc.id, '501')
  assert.equal(doc.padreId, '900')
  assert.equal(doc.titulo, 'Orden de Producción N° 2291 · PVC')
  assert.equal(doc.situacion, 'pendiente')
  assert.deepEqual(m.llamadas[0].variables.c, [CLAVE], 'se busca por la clave')
  assert.ok(m.llamadas[0].query.includes('18432207111') && m.llamadas[0].query.includes(COL_OP.clave))

  await registrarRespuesta(doc, 'Juan', { tipo: 'confirmar', ubicacion: 'Av. 1', coordinador: 'Ana' }, m.consulta)
  const escrituras = m.llamadas.slice(1)
  const valores = (l: Llamada) => JSON.parse(String(l.variables.valores ?? '{}'))
  assert.equal(escrituras[0].variables.id, '501')
  assert.deepEqual(valores(escrituras[0]), { [COL_OP.estado]: { label: 'Confirmada' } }, 'la OP pasa a Confirmada')
  assert.equal(escrituras[1].variables.id, '900')
  assert.deepEqual(valores(escrituras[1]), { color_mm73rxg7: { label: 'CONFIRMADO OP' } }, 'la obra, CONFIRMADO OP')
  assert.ok(String(escrituras[2].variables.cuerpo).includes('Coordinador de la obra:</b> Ana'), 'el update con los datos')
}
{
  /* Una clave que Monday matchea "de más" no se toma: tiene que ser exactamente la del enlace. */
  const m = simulado([op('Enviada Pend Confirmar', 'otra-clave')])
  assert.equal(await buscarDocumento('op', CLAVE, m.consulta), null)
}
{
  const sub = {
    id: '701',
    name: 'IDPDF-1221',
    state: 'active',
    parent_item: { id: '700', name: 'PEREZ JUAN' },
    column_values: [
      { id: COL_SUB_PRES.clave, text: CLAVE },
      { id: COL_SUB_PRES.confirmacion, text: '' },
      { id: COL_SUB_PRES.tipo, text: 'PVC' },
      { id: COL_SUB_PRES.color, text: 'Blanco' },
      { id: COL_SUB_PRES.motivo, text: '' },
    ],
  }
  const m = simulado([sub], true)
  const doc = await buscarDocumento('presupuesto', CLAVE, m.consulta)
  assert.ok(doc)
  assert.equal(doc.titulo, 'Presupuesto IDPDF-1221')
  assert.equal(doc.padreId, '700')
  assert.ok(m.llamadas[0].query.includes('9984270591') && m.llamadas[0].query.includes('parent_item'))
  await registrarRespuesta(doc, 'Juan', { tipo: 'rechazar', motivo: 'El color\nno es' }, m.consulta)
  assert.deepEqual(JSON.parse(String(m.llamadas[1].variables.valores)), {
    [COL_SUB_PRES.confirmacion]: { label: 'Rechazado' },
    [COL_SUB_PRES.motivo]: 'El color no es',
  })
}

/* El texto del cliente no entra crudo al HTML (ni del update ni de la página). */
{
  const doc: Documento = { documento: 'op', id: '1', padreId: '', titulo: 'OP', detalle: '', etiqueta: '', situacion: 'pendiente' }
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

let estadoOp = 'Enviada Pend Confirmar'
const mutaciones: string[] = []
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  const { query, variables } = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> }
  if (query.trim().startsWith('mutation')) {
    mutaciones.push(String(variables.valores ?? variables.cuerpo))
    if (String(variables.valores ?? '').includes('Confirmada')) estadoOp = 'Confirmada'
    return new Response(JSON.stringify({ data: { ok: true } }))
  }
  const items = (variables.c as string[])[0] === CLAVE ? [op(estadoOp)] : []
  return new Response(JSON.stringify({ data: { boards: [{ items_page: { items } }] } }))
}) as typeof fetch

const ruta = `/confirmar${enlace.search}`
{
  const r = await pedir('GET', ruta)
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /text\/html/)
  assert.ok(r.cuerpo.includes('Estimado/a Juan Pérez') && r.cuerpo.includes('Orden de Producción N° 2291'))
  assert.ok(r.cuerpo.includes(`action="${esc(ruta)}"`), 'el formulario vuelve a la misma dirección firmada')
  assert.ok(!/make\.com|monday\.com/.test(r.cuerpo), 'el HTML no tiene URLs internas')
}
assert.equal((await pedir('GET', `/confirmar?d=op&c=${CLAVE}&n=Juan&t=inventado`)).status, 400, 'firma inventada')
assert.equal((await pedir('GET', '/confirmar')).status, 400, 'sin datos')
{
  const r = await pedir('GET', ruta, '', 'WhatsApp/2.23.20.0 A')
  assert.ok(r.cuerpo.includes('og:title') && r.cuerpo.includes('https://app.test/logo-polifroni.png'), 'la vista previa, sin Monday')
}
{
  const r = await pedir('POST', ruta, 'respuesta=confirmar&ubicacion=Av.+1')
  assert.equal(r.status, 422, 'falta el coordinador: vuelve el formulario con el error')
  assert.ok(r.cuerpo.includes('Completá la ubicación') && r.cuerpo.includes('value="Av. 1"'))
  assert.equal(mutaciones.length, 0, 'no se escribió nada')
}
{
  const r = await pedir('POST', ruta, 'respuesta=confirmar&ubicacion=Av.+1&coordinador=Ana')
  assert.equal(r.status, 200)
  assert.ok(r.cuerpo.includes('¡Confirmamos tu pedido, Juan Pérez!'))
  assert.equal(mutaciones.length, 3, 'la OP, la obra y el update')
}
{
  /* El mismo enlace otra vez: ya está respondida y no se escribe de nuevo. */
  const antes = mutaciones.length
  const r = await pedir('POST', ruta, 'respuesta=rechazar&motivo=cambio')
  assert.equal(r.status, 409)
  assert.ok(r.cuerpo.includes('ya está confirmada'))
  assert.equal(mutaciones.length, antes)
  assert.ok((await pedir('GET', ruta)).cuerpo.includes('ya está confirmada'))
}
{
  const otra = new URL(enlaceConfirmacion({ documento: 'op', clave: 'aaaaaaaa-1b3d-4e5f-8a9b-0c1d2e3f4a5b', nombre: 'Juan' }))
  assert.equal((await pedir('GET', `/confirmar${otra.search}`)).status, 404, 'clave firmada que no está en Monday')
}

console.log('confirmar: ok')
