/**
 * El robot de Tempoglass, sin red: lo que se fija acá es la LECTURA de lo que devuelve Tempoglass.
 *
 *  · el nombre de la obra allá sale de la OP: "IDOP-053 - PVC 2282" (Aluminio con su "A");
 *  · del login se toma el `_token` del formulario; de la página, el token CSRF;
 *  · el buscador se reconoce con o sin modificadores de `wire:model`;
 *  · el componente de la tabla es el que tiene `table` en sus datos, aunque la página traiga otros;
 *  · las filas se leen por el encabezado de cada columna, y la obra buscada es la de nombre IGUAL
 *    (el buscador de Tempoglass trae también las que lo contienen);
 *  · lo que se arregla entrando de nuevo (sesión perdida, 419, 5xx, red) se reintenta ENTERO, con un
 *    login nuevo; lo que no (contraseña mala, bloqueo por intentos, pantalla cambiada) corta en el
 *    acto; y después de 3 intentos o del plazo, se rinde diciéndolo.
 *
 * Los HTML son reducciones de los de Tempoglass (Laravel + Livewire 2). Se corre con esbuild + node
 * (`npm run test:tempoglass`).
 */
import assert from 'node:assert/strict'
import { nombreObraTempoglass } from '../src/lib/tempoglass'
import {
  buscarObraTempoglass,
  componenteDeTabla,
  conReintentos,
  csrfDePagina,
  ErrorTempoglass,
  errorDeLogin,
  esBloqueoPorIntentos,
  filasDeObras,
  obraExacta,
  statusReintentable,
  tieneBuscador,
  tokenDeFormulario,
  type OpcionesReintento,
} from '../api/_tempoglass'

// ── El nombre de la obra en Tempoglass ───────────────────────────────────────────────────────────
assert.equal(nombreObraTempoglass({ idOp: 'IDOP-053', tipo: 'PVC', numero: '2282' }), 'IDOP-053 - PVC 2282')
assert.equal(nombreObraTempoglass({ idOp: 'IDOP-066', tipo: 'Aluminio', numero: 'A3010' }), 'IDOP-066 - Aluminio A3010')
assert.equal(nombreObraTempoglass({ idOp: ' IDOP-101 ', tipo: 'PVC', numero: '2.331' }), 'IDOP-101 - PVC 2331', 'sin puntos ni espacios')

// ── Login y CSRF ─────────────────────────────────────────────────────────────────────────────────
const login = `<html><head><meta name="csrf-token" content="CSRF123"></head><body>
  <form method="POST" action="https://tempoglass.ar/login">
    <input type="hidden" name="_token" value="TOKEN456" autocomplete="off">
    <input id="email" type="email" name="email"><input id="password" type="password" name="password">
  </form></body></html>`
assert.equal(tokenDeFormulario(login), 'TOKEN456')
assert.equal(csrfDePagina(login), 'CSRF123')
assert.equal(tokenDeFormulario('<html></html>'), null, 'sin formulario no hay token')

// ── El buscador ──────────────────────────────────────────────────────────────────────────────────
assert.ok(tieneBuscador('<input wire:model="table.search" placeholder="Buscar" type="text">'))
assert.ok(tieneBuscador('<input wire:model.debounce.500ms="table.search" type="text">'), 'con modificadores')
assert.ok(!tieneBuscador('<input name="q" placeholder="Buscar">'), 'otro buscador no cuenta')

// ── El componente de la tabla ────────────────────────────────────────────────────────────────────
const datos = (data: unknown, name: string) =>
  JSON.stringify({ fingerprint: { id: name, name, locale: 'es', path: 'obra', method: 'GET', v: 'acj' }, effects: {}, serverMemo: { children: [], errors: [], htmlHash: 'h', data, dataMeta: [], checksum: 'c' } })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
const pagina = `<meta name="csrf-token" content="CSRF">
  <div wire:id="nav" wire:initial-data="${datos({ abierto: false }, 'navegacion')}"></div>
  <div wire:id="tab" wire:initial-data="${datos({ table: { search: '' }, perPage: 10 }, 'obra-table')}">
    <input wire:model="table.search">
  </div>`
assert.equal(componenteDeTabla(pagina)?.fingerprint.name, 'obra-table', 'el que tiene `table`, no el primero')
assert.equal(componenteDeTabla('<div wire:initial-data="no es json"></div>'), null)

// ── Las filas y la obra exacta ───────────────────────────────────────────────────────────────────
const tabla = `<table>
  <thead><tr><th>NOMBRE</th><th>DESCRIPCIÓN</th><th>ID.</th></tr></thead>
  <tbody>
    <tr><td> TEST </td><td>TEST</td><td>4713</td></tr>
    <tr><td>IDOP-053 - PVC 2282   TEST</td><td>UBICACION DELA OBRA</td><td>4715</td></tr>
    <tr><td>TEST. 222</td><td>TEST22222</td><td>4726</td></tr>
  </tbody></table>`
const filas = filasDeObras(tabla)
assert.equal(filas.length, 3)
assert.deepEqual(filas[1], { id: '4715', nombre: 'IDOP-053 - PVC 2282 TEST', descripcion: 'UBICACION DELA OBRA' })
assert.equal(obraExacta(filas, 'idop-053 - pvc 2282 test')?.id, '4715', 'sin distinguir mayúsculas ni espacios')
assert.equal(obraExacta(filas, 'IDOP-053 - PVC 2282'), null, '"contiene" no es la obra: tiene que ser igual')

// Las columnas se leen por el encabezado: con otro orden, mismo resultado.
const reordenada = filasDeObras(`<table><thead><tr><th>ID.</th><th>NOMBRE</th></tr></thead>
  <tbody><tr><td>4715</td><td>IDOP-053 - PVC 2282 TEST</td></tr></tbody></table>`)
assert.deepEqual(reordenada, [{ id: '4715', nombre: 'IDOP-053 - PVC 2282 TEST', descripcion: '' }])

// La fila de "sin resultados" no es una obra.
assert.deepEqual(filasDeObras(`<table><thead><tr><th>NOMBRE</th><th>ID.</th></tr></thead>
  <tbody><tr><td colspan="2">No se encontraron registros</td></tr></tbody></table>`), [])

// ── Qué se reintenta ─────────────────────────────────────────────────────────────────────────────
for (const s of [302, 401, 408, 419, 500, 502, 503]) assert.ok(statusReintentable(s), `${s} se reintenta`)
for (const s of [400, 403, 404, 429]) assert.ok(!statusReintentable(s), `${s} no se reintenta`)

const loginConError = (msg: string) => `<form method="POST"><input name="_token" value="T">
  <div><ul class="text-sm text-red-600 space-y-1 mt-2"><li>${msg}</li></ul></div></form>`
assert.equal(errorDeLogin(loginConError('Estas credenciales no coinciden con nuestros registros.')), 'Estas credenciales no coinciden con nuestros registros.')
assert.equal(errorDeLogin(login), null, 'sin error, nada')
assert.ok(esBloqueoPorIntentos('Demasiados intentos de acceso. Por favor intente nuevamente en 58 segundos.'))
assert.ok(esBloqueoPorIntentos('Too many login attempts. Please try again in 58 seconds.'))
assert.ok(!esBloqueoPorIntentos('Estas credenciales no coinciden con nuestros registros.'))

// ── conReintentos ────────────────────────────────────────────────────────────────────────────────
const rapido: OpcionesReintento = { intentos: 3, esperaMs: () => 0, plazoMs: 60_000, esperar: async () => {} }
const fallaQue = (reintentable: boolean) => new ErrorTempoglass('obras', 'sesión perdida', reintentable)

{
  // Falla dos veces con algo reintentable y a la tercera anda.
  let corridas = 0
  const avisos: number[] = []
  const r = await conReintentos(
    async () => {
      if (++corridas < 3) throw fallaQue(true)
      return 'ok'
    },
    (intento) => avisos.push(intento),
    rapido,
  )
  assert.equal(r, 'ok')
  assert.equal(corridas, 3)
  assert.deepEqual(avisos, [2, 3], 'avisa cada reintento')
}
{
  // Lo no reintentable corta en el acto.
  let corridas = 0
  await assert.rejects(
    conReintentos(async () => { corridas++; throw fallaQue(false) }, () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.message === 'sesión perdida',
  )
  assert.equal(corridas, 1)
}
{
  // Agotados los intentos, el error lo dice y ya no es reintentable.
  let corridas = 0
  await assert.rejects(
    conReintentos(async () => { corridas++; throw fallaQue(true) }, () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && !e.reintentable && /se intentó 3 veces/.test(e.message),
  )
  assert.equal(corridas, 3)
}
{
  // Sin tiempo para esperar otro intento dentro del plazo, no se intenta.
  let reloj = 0
  let corridas = 0
  const justo: OpcionesReintento = { intentos: 5, esperaMs: () => 5000, plazoMs: 8000, esperar: async (ms) => { reloj += ms }, ahora: () => reloj }
  await assert.rejects(conReintentos(async () => { corridas++; throw fallaQue(true) }, () => {}, justo))
  assert.equal(corridas, 2, '0 s → 5 s → (10 s pasaría el plazo de 8 s)')
}
{
  // Un error que no es de Tempoglass es un bug: no se reintenta.
  let corridas = 0
  await assert.rejects(conReintentos(async () => { corridas++; throw new TypeError('bug') }, () => {}, rapido), TypeError)
  assert.equal(corridas, 1)
}

// ── El recorrido entero contra un Tempoglass simulado ────────────────────────────────────────────
/**
 * Un Tempoglass de mentira: cada ruta contesta lo que diga `guion`, una respuesta por llamada (la
 * última se repite). Registra las llamadas para verificar que cada reintento ENTRA DE NUEVO.
 */
function simular(guion: Record<string, (() => Response)[]>) {
  const llamadas: string[] = []
  const usadas: Record<string, number> = {}
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const ruta = `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`
    llamadas.push(ruta)
    const lista = guion[ruta]
    if (!lista) throw new Error(`ruta no simulada: ${ruta}`)
    const i = Math.min(usadas[ruta] ?? 0, lista.length - 1)
    usadas[ruta] = (usadas[ruta] ?? 0) + 1
    return lista[i]!()
  }) as typeof fetch
  return llamadas
}
const html = (cuerpo: string, status = 200) => () =>
  new Response(cuerpo, { status, headers: { 'content-type': 'text/html', 'set-cookie': 'tempoglass_session=abc; path=/' } })
const redirigir = (a: string) => () => new Response(null, { status: 302, headers: { location: `https://tempoglass.ar${a}` } })
const status = (n: number) => () => new Response('', { status: n })
const caida = () => { throw new TypeError('fetch failed') }
const json = (data: unknown) => () => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })

const formLogin = html(login)
const paginaObras = html(pagina)
const respuestaBusqueda = json({ effects: { html: tabla } })
const bien = { 'GET /login': [formLogin], 'POST /login': [redirigir('/home')], 'GET /obra': [paginaObras], 'POST /livewire/message/obra-table': [respuestaBusqueda] }
const etapas = (avisos: { etapa: string }[]) => avisos.map((a) => a.etapa)

process.env.TEMPOGLASS_EMAIL = 'robot@polifroni.test'
process.env.TEMPOGLASS_PASSWORD = 'secreta'
{
  // Todo bien: entra, abre Obras, busca y encuentra la obra exacta.
  simular(bien)
  const avisos: { etapa: string }[] = []
  const r = await buscarObraTempoglass('IDOP-053 - PVC 2282 TEST', (a) => avisos.push(a), rapido)
  assert.equal(r.encontrada?.id, '4715')
  assert.deepEqual(etapas(avisos), ['sesion', 'logueado', 'buscando'])
}
{
  // La sesión se pierde al abrir Obras (302 a /login): se reintenta con un login NUEVO y anda.
  const llamadas = simular({ ...bien, 'GET /obra': [redirigir('/login'), paginaObras] })
  const avisos: { etapa: string }[] = []
  const r = await buscarObraTempoglass('IDOP-053 - PVC 2282 TEST', (a) => avisos.push(a), rapido)
  assert.equal(r.encontrada?.id, '4715')
  assert.deepEqual(etapas(avisos), ['sesion', 'logueado', 'reintentando', 'sesion', 'logueado', 'buscando'])
  assert.equal(llamadas.filter((l) => l === 'POST /login').length, 2, 'volvió a iniciar sesión')
}
{
  // Livewire contesta 419 (page expired): se reintenta entero.
  simular({ ...bien, 'POST /livewire/message/obra-table': [status(419), respuestaBusqueda] })
  const r = await buscarObraTempoglass('IDOP-053 - PVC 2282 TEST', () => {}, rapido)
  assert.equal(r.encontrada?.id, '4715')
}
{
  // La red se cae y Tempoglass da un 503: se reintenta hasta que anda.
  simular({ ...bien, 'GET /login': [caida, status(503), formLogin] })
  const r = await buscarObraTempoglass('IDOP-053 - PVC 2282 TEST', () => {}, rapido)
  assert.equal(r.encontrada?.id, '4715')
}
{
  // Contraseña mala: NO se reintenta (insistir termina en bloqueo) y el motivo de Tempoglass se ve.
  const llamadas = simular({
    ...bien,
    'GET /login': [formLogin, html(loginConError('Estas credenciales no coinciden con nuestros registros.'))],
    'POST /login': [redirigir('/login')],
  })
  await assert.rejects(
    buscarObraTempoglass('X', () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'login' && !e.reintentable && /no coinciden/.test(e.message),
  )
  assert.equal(llamadas.filter((l) => l === 'POST /login').length, 1, 'un solo intento de login')
}
{
  // Bloqueo por demasiados intentos: tampoco se reintenta, y se dice que es un bloqueo.
  simular({
    ...bien,
    'GET /login': [formLogin, html(loginConError('Demasiados intentos de acceso. Por favor intente nuevamente en 58 segundos.'))],
    'POST /login': [redirigir('/login')],
  })
  await assert.rejects(
    buscarObraTempoglass('X', () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && !e.reintentable && /bloqueó el ingreso/.test(e.message),
  )
}
{
  // La pantalla de Obras cambió de forma (sin buscador): no se reintenta, pide revisar el robot.
  simular({ ...bien, 'GET /obra': [html('<html><body>Obras</body></html>')] })
  await assert.rejects(
    buscarObraTempoglass('X', () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'obras' && !e.reintentable,
  )
}
{
  // Tempoglass caído todo el tiempo: se rinde a los 3 intentos y lo dice.
  const llamadas = simular({ ...bien, 'GET /login': [status(503)] })
  await assert.rejects(
    buscarObraTempoglass('X', () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && /se intentó 3 veces/.test(e.message),
  )
  assert.equal(llamadas.length, 3)
}
{
  // Sin credenciales: ni se intenta.
  delete process.env.TEMPOGLASS_PASSWORD
  const llamadas = simular(bien)
  await assert.rejects(
    buscarObraTempoglass('X', () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'credenciales',
  )
  assert.equal(llamadas.length, 0)
}

console.log('tempoglass: ok')
