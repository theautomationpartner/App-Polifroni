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
import {
  COLUMNAS_PEDIDO_TEMPOGLASS,
  faltantesPedido,
  filasPedidoTempoglass,
  hoyIso,
  nombreObraTempoglass,
  referenciaDeCorte,
} from '../src/lib/tempoglass'
import type { Corte } from '../src/lib/vidrios'
import {
  accionYParametros,
  buscarObraTempoglass,
  cargarPedidoTempoglass,
  ofreceCerrar,
  ritmo,
  pedidoAbierto,
  wireInitDe,
  type AvanceTempoglass,
  idIntDeObra,
  pedidoDeDireccion,
  renglonesDePedido,
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
assert.equal(nombreObraTempoglass({ idOp: 'IDOP-110', tipo: 'PVC', numero: 'TEST' }), 'IDOP-110 - PVC TEST', 'el N° «TEST» de las obras de test va tal cual')

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
/* Las pausas de "esperar a que cargue" (`abrirHasta`, la lista de pedidos), instantáneas en los tests. */
ritmo.esperar = async () => {}
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
/** Lo que recibió el Tempoglass simulado en cada envío de formulario, por ruta ("POST /obra"). */
const enviados: Record<string, string[]> = {}
function simular(guion: Record<string, (() => Response)[]>) {
  const llamadas: string[] = []
  const usadas: Record<string, number> = {}
  for (const k of Object.keys(enviados)) delete enviados[k]
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const ruta = `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`
    llamadas.push(ruta)
    if (typeof init?.body === 'string') (enviados[ruta] ??= []).push(init.body)
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

// ── La planilla que se importa (formato de la "planilla modelo" PedidoDVH) ───────────────────────
assert.deepEqual([...COLUMNAS_PEDIDO_TEMPOGLASS], ['CANTIDAD', 'Ancho', 'Alto', 'Componente 1', 'Camara', 'Componente 2', 'Referencia', 'Comentario'])
const corte = (o: Partial<Corte>): Corte => ({
  composicion: '3+3/9/4', dvh: true, comp1: '3+3', camara: '9', comp2: '4', ancho: '839', alto: '1.742',
  cantidad: 2, origen: ['IDOP-097 · V4'], sinCantidad: false, ...o,
})
assert.deepEqual(filasPedidoTempoglass([corte({})]), [[2, 839, 1742, '3+3', 9, 4, 'V4', '']], 'medidas en mm, números como número, el modelo como referencia')
assert.deepEqual(filasPedidoTempoglass([corte({ comp1: '3 BRONCE', comp2: '10 TEMPLADO' })])[0]!.slice(3, 6), ['3 BRONCE', 9, '10 TEMPLADO'])
assert.equal(referenciaDeCorte(['IDOP-097 · V4', 'IDOP-097 · V1', 'IDOP-097 · V4']), 'V4, V1', 'sin repetir')
assert.equal(referenciaDeCorte(['IDOP-097 · V4', 'IDOP-098 · V1']), 'IDOP-097 V4, IDOP-098 V1', 'de varias OP, con la OP')

// ── Comentario y fecha: los dos obligatorios ─────────────────────────────────────────────────────
assert.deepEqual(faltantesPedido({ comentario: 'Entrega urgente', fecha: '2026-10-22' }, '2026-10-16'), [])
assert.deepEqual(faltantesPedido({ comentario: '  ', fecha: '' }, '2026-10-16'), ['el comentario', 'la fecha de entrega'])
assert.deepEqual(faltantesPedido({ comentario: 'x', fecha: '2026-10-15' }, '2026-10-16'), ['una fecha de entrega que no sea pasada'])
assert.equal(hoyIso(new Date('2026-10-17T02:00:00Z')), '2026-10-16', 'hoy en Argentina, no en UTC')

// ── Lo que se lee de cada pantalla, con el HTML real de Tempoglass ───────────────────────────────
const tablaReal = `<table class="min-w-full"><thead class="bg-gray-50"><tr>
  <th scope="col"><button wire:click="sortBy('nombre')"><span>Nombre</span></button></th>
  <th scope="col"><button wire:click="sortBy('descripcion')"><span>Descripción</span></button></th>
  <th scope="col"><button wire:click="sortBy('id')"><span>Id.</span></button></th></tr></thead>
  <tbody><tr class="cursor-pointer" wire:key="row-0">
    <td onclick="window.open('https://tempoglass.ar/obra/4715', '_self')">
        IDOP-053 - PVC 2282 TEST
    </td>
    <td onclick="window.open('https://tempoglass.ar/obra/4715', '_self')">UBICACION DELA OBRA</td>
    <td onclick="window.open('https://tempoglass.ar/obra/4715', '_self')">4715</td></tr></tbody></table>`
assert.deepEqual(filasDeObras(tablaReal), [
  { id: '4715', nombre: 'IDOP-053 - PVC 2282 TEST', descripcion: 'UBICACION DELA OBRA', url: 'https://tempoglass.ar/obra/4715' },
])
assert.equal(idIntDeObra('<input id="id" type="text" readonly="" class="x" placeholder="4715">'), '4715')
assert.equal(idIntDeObra('<input id="id" type="text" placeholder="">'), null)
assert.equal(pedidoDeDireccion('https://tempoglass.ar/dvhpedidorenglon/4938'), '4938')
assert.equal(pedidoDeDireccion('https://tempoglass.ar/obra/4715'), null)

const detalle = (filas: [string, number][]) => `<table><thead><tr><th>ID</th><th>CANTIDAD</th><th>ANCHO/ALTO (MM)</th>
  <th>COMP.</th><th>REFERENCIA</th><th>COMENTARIO</th><th>ESTADO</th></tr></thead><tbody>
  ${filas.map(([id, n]) => `<tr><td>${id}</td><td>${n}</td><td>1000 x 1000</td><td>3 / 6 / 3 ESPEJO</td><td>V1</td><td>Ejemplo</td><td>PENDIENTE</td></tr>`).join('')}
  </tbody></table>`
assert.deepEqual(renglonesDePedido(detalle([['18228', 1], ['18229', 10]])), [{ id: '18228', cantidad: 1 }, { id: '18229', cantidad: 10 }])
assert.deepEqual(renglonesDePedido('<p class="text-red-600">Aún no hay productos ingresados.</p>'), [])

// ── El pedido entero contra un Tempoglass simulado ───────────────────────────────────────────────
process.env.TEMPOGLASS_PASSWORD = 'secreta'
/** Una pantalla con un componente Livewire que dibuja `cuerpo`. */
const conComponente = (nombre: string, data: unknown, cuerpo: string) =>
  `<meta name="csrf-token" content="CSRF-${nombre}"><div wire:id="${nombre}" wire:initial-data="${datos(data, nombre)}">${cuerpo}</div>`
const pantallaObra = html(conComponente('obra-show', { obra: { id: 4715 } }, '<input id="id" readonly placeholder="4715"><button wire:click="addPedido">Agregar Pedido</button>'))
const pantallaPedidoNuevo = html(conComponente('dvh-pedido', { pedido: { detalle: '', fecha_entrega: '' } }, '<textarea wire:model="pedido.detalle"></textarea><button wire:click="saveCabecera">Confirmar</button>'))
/* Como la pantalla REAL de un pedido (vista el 16/10): las ventanas de confirmación están siempre en
   la página, ocultas con x-show; lo que ofrece de verdad es la barra visible. Abierto: Agregar
   Producto, Importar y —con renglones— Cerrar Pedido. Cerrado/enviado: Imprimir y Volver. */
const VENTANAS = `<div x-show="show"><h3>Cerrar Pedido</h3><button wire:click="$toggle('confirmCloseOrder')">Cancelar</button><button wire:click="closeOrder">Confirmar</button></div>
  <div x-show="show"><h3>Enviar Pedido</h3><button wire:click="$toggle('confirmSendOrder')">Cancelar</button><button wire:click="sendOrder">Confirmar</button></div>`
const BOTON_CERRAR = `<button wire:click="$toggle('confirmCloseOrder')">Cerrar Pedido</button>`
const barraAbierto = (conCerrar: boolean) =>
  `<button wire:click="openCreateForm">Agregar Producto</button>${conCerrar ? BOTON_CERRAR : ''}<button wire:click="$set('showUploadForm', true)">Importar</button>`
const BARRA_CERRADO = `<button wire:click="printOrder">Imprimir</button><button wire:click="goBack">Volver</button>`
const renglonPedido = (filas: [string, number][], abierto = true, conCerrar = filas.length > 0) =>
  html(
    conComponente(
      'dvh-pedido-renglon',
      { confirmCloseOrder: false, confirmSendOrder: false, cant_renglones: filas.length },
      `<div>Pedido 4938</div>${abierto ? barraAbierto(conCerrar) : BARRA_CERRADO}${VENTANAS}${detalle(filas)}`,
    ),
  )
const dosRenglones: [string, number][] = [['18228', 1], ['18229', 10]]
const redirige = (a: string) => json({ effects: { html: null, redirect: `https://tempoglass.ar${a}` }, serverMemo: { checksum: 'c2' } })

/** La lista "Pedidos (Todos)" de Tempoglass, como la real: Id | Obra | Descripción | Detalle | Emisión | Estado. */
const listaPedidos = (pedidos: [string, string, string][]) =>
  html(`<meta name="csrf-token" content="L"><table><thead><tr><th>Id</th><th>Obra</th><th>Descripción</th><th>Detalle</th><th>Emisión</th><th>Estado</th></tr></thead><tbody>
  ${pedidos.map(([id, obra, detalle]) => `<tr onclick="window.open('https://tempoglass.ar/dvhpedidorenglon/${id}', '_self')"><td>${id}</td><td>${obra}</td><td>UBICACION</td><td>${detalle}</td><td>2026-10-16</td><td>Pendiente</td></tr>`).join('')}
  </tbody></table>`)
const OTROS_PEDIDOS: [string, string, string][] = [['4904', 'MATHEU CECILIA', '29/10/26'], ['4892', 'IDOP-053 - PVC 2282 TEST', 'viejo']]

const pedidoBien = {
  ...bien,
  'GET /cliente.pedido.index/9999': [listaPedidos(OTROS_PEDIDOS)],
  'POST /livewire/message/obra-table': [json({ effects: { html: tablaReal } })],
  'GET /obra/4715': [pantallaObra],
  'POST /livewire/message/obra-show': [redirige('/dvhpedido/4715')],
  'GET /dvhpedido/4715': [pantallaPedidoNuevo],
  'POST /livewire/message/dvh-pedido': [redirige('/dvhpedidorenglon/4938')],
  'GET /dvhpedidorenglon/4938': [renglonPedido([]), renglonPedido(dosRenglones), renglonPedido(dosRenglones), renglonPedido(dosRenglones, false)],
  'POST /importpedido': [redirigir('/dvhpedidorenglon/4938')],
  /* Cerrar: un solo mensaje, confirmCloseOrder=true + closeOrder (como el navegador al confirmar). */
  'POST /livewire/message/dvh-pedido-renglon': [json({ effects: { html: '' }, serverMemo: { data: { confirmCloseOrder: false } } })],
}
const datosPedido = (o: Partial<Parameters<typeof cargarPedidoTempoglass>[0]> = {}) => ({
  nombre: 'IDOP-053 - PVC 2282 TEST',
  ubicacion: 'Av. Marconi 1155, Tandil',
  comentario: 'Pedido de prueba',
  fecha: '2026-10-22',
  archivo: { nombre: 'PedidoDVH.xlsx', datos: new Uint8Array([1, 2, 3]) },
  esperado: { renglones: 2, piezas: 11 },
  ...o,
})
{
  // Todo bien: obra, pedido, planilla y cierre, con cada aviso en orden.
  const llamadas = simular(pedidoBien)
  const avisos: { etapa: string }[] = []
  const r = await cargarPedidoTempoglass(datosPedido(), (a) => avisos.push(a), rapido)
  assert.deepEqual(r, { obra: filasDeObras(tablaReal)[0], idIntObra: '4715', pedido: '4938', renglones: 2 })
  assert.deepEqual(etapas(avisos), ['sesion', 'logueado', 'buscando', 'obraSeleccionada', 'creandoPedido', 'pedidoCreado', 'importando', 'importado', 'cerrando'])
  assert.equal(llamadas.filter((l) => l === 'POST /importpedido').length, 1)
}
{
  // La subida del archivo no contesta, pero llegó: el reintento ve los renglones y NO sube otra vez.
  const llamadas = simular({
    ...pedidoBien,
    'POST /importpedido': [caida],
    'GET /dvhpedidorenglon/4938': [renglonPedido([]), renglonPedido(dosRenglones), renglonPedido(dosRenglones), renglonPedido(dosRenglones, false)],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'POST /importpedido').length, 1, 'una sola subida')
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/dvh-pedido').length, 1, 'un solo pedido')
}
{
  // "Confirmar" no contesta, pero el pedido se creó: aparece en la lista y se sigue con ÉSE.
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/dvh-pedido': [caida],
    'GET /cliente.pedido.index/9999': [listaPedidos(OTROS_PEDIDOS), listaPedidos([['4938', 'IDOP-053 - PVC 2282 TEST', 'Pedido de prueba'], ...OTROS_PEDIDOS])],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/dvh-pedido').length, 1, 'un solo Confirmar')
}
{
  // LA FALLA DE LA APP: "Confirmar" contesta sin el número. Se espera y se lo busca en la lista.
  simular({
    ...pedidoBien,
    'POST /livewire/message/dvh-pedido': [json({ effects: { html: '<div>ok</div>' }, serverMemo: {} })],
    'GET /cliente.pedido.index/9999': [
      listaPedidos(OTROS_PEDIDOS),
      listaPedidos(OTROS_PEDIDOS), // todavía no aparece: se espera
      listaPedidos([['4938', 'IDOP-053 - PVC 2282 TEST', 'Pedido de prueba'], ...OTROS_PEDIDOS]),
    ],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938', 'lo encontró en la lista al reintentar')
}
{
  // "Confirmar" sin número y el pedido nunca aparece: se frena diciendo qué contestó Tempoglass.
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/dvh-pedido': [json({ effects: { html: '<div class="alert">La fecha de entrega no es válida</div>', dispatches: [{ event: 'alerta' }] }, serverMemo: {} })],
  })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) =>
      e instanceof ErrorTempoglass && e.paso === 'pedido' && !e.reintentable &&
      /no creó el pedido/.test(e.message) && /La fecha de entrega no es válida/.test(e.message) && /alerta/.test(e.message),
  )
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/dvh-pedido').length, 1, 'no insiste con Confirmar')
}
{
  // Pantallas lentas: la obra sin el Id.Int.Obra y el formulario sin "Confirmar" la primera vez.
  const llamadas = simular({
    ...pedidoBien,
    'GET /obra/4715': [html(conComponente('obra-show', {}, '<div class="cargando"></div>')), pantallaObra],
    'GET /dvhpedido/4715': [html(conComponente('dvh-pedido', {}, '<div class="cargando"></div>')), pantallaPedidoNuevo],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'GET /dvhpedido/4715').length, 2, 'esperó y reabrió el formulario')
}
{
  // La importación tarda: los renglones aparecen recién en la tercera lectura del detalle.
  simular({
    ...pedidoBien,
    'GET /dvhpedidorenglon/4938': [renglonPedido([]), renglonPedido([]), renglonPedido([['18228', 1]]), renglonPedido(dosRenglones), renglonPedido(dosRenglones), renglonPedido(dosRenglones, false)],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.renglones, 2)
}
{
  // Tempoglass rechaza la cabecera (validación): se dice por qué.
  simular({
    ...pedidoBien,
    'POST /livewire/message/dvh-pedido': [json({ effects: { html: '' }, serverMemo: { errors: { 'pedido.fecha_entrega': ['La fecha es obligatoria.'] } } })],
  })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'pedido' && /La fecha es obligatoria/.test(e.message),
  )
}
{
  // La importación entra incompleta: se frena y se dice cuánto quedó.
  simular({ ...pedidoBien, 'GET /dvhpedidorenglon/4938': [renglonPedido([]), renglonPedido([['18228', 1]])] })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'importar' && /1 renglones y 1 piezas; se esperaban 2 y 11/.test(e.message),
  )
}
{
  // Tempoglass no carga nada y muestra un aviso: el aviso se ve en el error.
  simular({
    ...pedidoBien,
    'GET /dvhpedidorenglon/4938': [renglonPedido([]), html(`<meta name="csrf-token" content="X"><div class="alert">El archivo no tiene el formato correcto</div>`)],
  })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'importar' && /formato correcto/.test(e.message),
  )
}
{
  // Se pierde la sesión DESPUÉS de crear el pedido: el reintento entra de nuevo y sigue con ESE pedido.
  const llamadas = simular({
    ...pedidoBien,
    'GET /dvhpedidorenglon/4938': [redirigir('/login'), renglonPedido([]), renglonPedido(dosRenglones), renglonPedido(dosRenglones), renglonPedido(dosRenglones, false)],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'POST /login').length, 2, 'volvió a entrar')
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/dvh-pedido').length, 1, 'sin crear otro pedido')
}
{
  // Retomar un pedido ya creado (desde la app): ni busca la obra ni crea otro.
  const llamadas = simular(pedidoBien)
  const retomar = { pedido: '4938', obra: filasDeObras(tablaReal)[0]!, idIntObra: '4715' }
  const r = await cargarPedidoTempoglass(datosPedido({ retomar }), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'GET /obra').length, 0, 'no buscó la obra')
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/dvh-pedido').length, 0, 'no creó pedido')
}
{
  // Un pedido ya cerrado (sin "Cerrar Pedido"): cerrar es no hacer nada.
  simular({ ...pedidoBien, 'GET /dvhpedidorenglon/4938': [renglonPedido(dosRenglones, false)] })
  const r = await cargarPedidoTempoglass(datosPedido({ retomar: { pedido: '4938', obra: filasDeObras(tablaReal)[0]!, idIntObra: '4715' } }), () => {}, rapido)
  assert.equal(r.renglones, 2)
}
{
  // La obra no existe, se crea, pero después no aparece en el buscador: se frena, sin pedido.
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/obra-table': [json({ effects: { html: tabla } })],
    'GET /obra/create': [html('<meta name="csrf-token" content="X"><form><input type="hidden" name="_token" value="T"></form>')],
    'POST /obra': [redirigir('/obra')],
  })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido({ nombre: 'IDOP-999 - PVC 1' }), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'obra' && /no aparece en el buscador/.test(e.message),
  )
  assert.equal(llamadas.filter((l) => l.includes('dvhpedido')).length, 0)
}

// ── La obra no existe en Tempoglass: se crea con el nombre de la OP y se sigue con ella ──────────
const sinResultados = json({ effects: { html: tabla.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>') } })
const formObraNueva = html(`<meta name="csrf-token" content="CSRF-OBRA"><form id="create-obra-form" method="post" action="https://tempoglass.ar/obra">
  <input type="hidden" name="_token" value="TOKEN-OBRA"><input id="nombre" name="nombre"><input id="descripcion" name="descripcion"></form>`)
{
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/obra-table': [sinResultados, json({ effects: { html: tablaReal } })],
    'GET /obra/create': [formObraNueva],
    'POST /obra': [redirigir('/obra')],
  })
  const avisos: AvanceTempoglass[] = []
  const r = await cargarPedidoTempoglass(datosPedido(), (a) => avisos.push(a), rapido)
  assert.equal(r.pedido, '4938', 'se creó la obra y se siguió con el pedido')
  assert.ok(avisos.some((a) => a.etapa === 'creandoObra'))
  const cuerpo = new URLSearchParams(enviados['POST /obra']![0])
  assert.deepEqual(
    { token: cuerpo.get('_token'), nombre: cuerpo.get('nombre'), descripcion: cuerpo.get('descripcion') },
    { token: 'TOKEN-OBRA', nombre: 'IDOP-053 - PVC 2282 TEST', descripcion: 'AV. MARCONI 1155, TANDIL' },
    'nombre de la OP y la ubicación de Monday',
  )
  assert.equal(llamadas.filter((l) => l === 'POST /obra').length, 1)
}
{
  // Sin ubicación en Monday: como Tempoglass la exige, va el nombre.
  simular({
    ...pedidoBien,
    'POST /livewire/message/obra-table': [sinResultados, json({ effects: { html: tablaReal } })],
    'GET /obra/create': [formObraNueva],
    'POST /obra': [redirigir('/obra')],
  })
  await cargarPedidoTempoglass(datosPedido({ ubicacion: '  ' }), () => {}, rapido)
  assert.equal(new URLSearchParams(enviados['POST /obra']![0]).get('descripcion'), 'IDOP-053 - PVC 2282 TEST')
}
{
  // Tempoglass rechaza la obra nueva (vuelve al formulario): se dice por qué y no se crea pedido.
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/obra-table': [sinResultados],
    'GET /obra/create': [formObraNueva, html(`<meta name="csrf-token" content="X"><ul class="text-red-600"><li>El nombre ya existe.</li></ul>`)],
    'POST /obra': [redirigir('/obra/create')],
  })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'obra' && /El nombre ya existe/.test(e.message),
  )
  assert.equal(llamadas.filter((l) => l.includes('dvhpedido')).length, 0)
}
{
  // Crear la obra no contesta, pero llegó: el reintento BUSCA antes y la encuentra; no crea otra.
  const llamadas = simular({
    ...pedidoBien,
    'POST /livewire/message/obra-table': [sinResultados, json({ effects: { html: tablaReal } })],
    'GET /obra/create': [formObraNueva],
    'POST /obra': [caida],
  })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.pedido, '4938')
  assert.equal(llamadas.filter((l) => l === 'POST /obra').length, 1, 'una sola obra creada')
}

// ── La falla real del 16/10: la pantalla de la obra carga sus datos DESPUÉS (wire:init) ───────────
assert.equal(wireInitDe('<div wire:id="a" wire:init="cargarObra"><p>…</p></div>'), 'cargarObra')
assert.equal(wireInitDe('<div wire:id="a"><p wire:init="x">…</p></div>'), null, 'sólo el del elemento raíz')
assert.deepEqual(accionYParametros("cargar('obra', 3)"), { metodo: 'cargar', params: ['obra', '3'] })
assert.deepEqual(accionYParametros('addPedido'), { metodo: 'addPedido', params: [] })
assert.ok(ofreceCerrar(barraAbierto(true) + VENTANAS), 'el Cerrar Pedido de la barra')
assert.ok(!ofreceCerrar(barraAbierto(false) + VENTANAS), 'el de la ventana oculta no cuenta (pedido sin renglones)')
assert.ok(!ofreceCerrar(`<div wire:initial-data="{&quot;confirmCloseOrder&quot;:false}"></div>`), 'el estado del componente no es un botón')
assert.ok(pedidoAbierto(barraAbierto(false) + VENTANAS) && !pedidoAbierto(BARRA_CERRADO + VENTANAS), 'abierto = Agregar Producto / Importar visibles')
{
  // Abierto, con renglones, pero sin "Cerrar Pedido" visible: no se da por cerrado, se avisa.
  simular({ ...pedidoBien, 'GET /dvhpedidorenglon/4938': [renglonPedido(dosRenglones, true, false)] })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido({ retomar: { pedido: '4938', obra: filasDeObras(tablaReal)[0]!, idIntObra: '4715' } }), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'cerrar' && /no ofrece "Cerrar Pedido"/.test(e.message),
  )
}
{
  // Tempoglass acepta el cierre pero el pedido sigue abierto: es un error, no un éxito.
  simular({ ...pedidoBien, 'GET /dvhpedidorenglon/4938': [renglonPedido(dosRenglones)] })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido({ retomar: { pedido: '4938', obra: filasDeObras(tablaReal)[0]!, idIntObra: '4715' } }), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && /sigue abierto/.test(e.message),
  )
}
// El campo "Nombre" de la obra REAL también tiene id="id": se toma el de la etiqueta Id.Int.Obra.
assert.equal(
  idIntDeObra(`<label for="id">Nombre</label><div><input id="id" readonly placeholder="IDOP-053 - PVC 2282 TEST"/></div>
    <div><label for="id">Id.Int.Obra</label><input id="id" type="text" readonly placeholder="4715"/></div>`),
  '4715',
)
{
  // La obra llega vacía y se completa con su wire:init: el robot hace esa llamada y lee el campo.
  const obraVacia = html(
    `<meta name="csrf-token" content="C"><div wire:id="obra-show" wire:init="cargarObra" wire:initial-data="${datos({ cargada: false }, 'obra-show')}"><div class="spinner"></div></div>`,
  )
  const llamadas = simular({
    ...pedidoBien,
    'GET /obra/4715': [obraVacia],
    'POST /livewire/message/obra-show': [
      json({ effects: { html: '<div wire:id="obra-show"><input id="id" readonly placeholder="4715"><button wire:click="addPedido">Agregar Pedido</button></div>' } }),
      redirige('/dvhpedido/4715'),
    ],
  })
  const avisos: AvanceTempoglass[] = []
  const r = await cargarPedidoTempoglass(datosPedido(), (a) => avisos.push(a), rapido)
  assert.equal(r.idIntObra, '4715')
  assert.equal(llamadas.filter((l) => l === 'POST /livewire/message/obra-show').length, 2, 'wire:init y después Agregar Pedido')
}
{
  // El campo no aparece nunca (lo arma el navegador): vale el número de la dirección /obra/4715.
  simular({ ...pedidoBien, 'GET /obra/4715': [html(conComponente('obra-show', {}, '<button wire:click="addPedido">Agregar Pedido</button>'))] })
  const r = await cargarPedidoTempoglass(datosPedido(), () => {}, rapido)
  assert.equal(r.idIntObra, '4715')
}
{
  // El campo dice una obra y la dirección otra: se frena ANTES de crear el pedido.
  const llamadas = simular({ ...pedidoBien, 'GET /obra/4715': [html(conComponente('obra-show', {}, '<input id="id" placeholder="9999">'))] })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && e.paso === 'obra' && /9999/.test(e.message),
  )
  assert.equal(llamadas.filter((l) => l.includes('dvhpedido')).length, 0)
}
{
  // El formulario no tiene "Confirmar": el error dice qué trae la pantalla, para ajustar sin adivinar.
  simular({ ...pedidoBien, 'GET /dvhpedido/4715': [html(conComponente('dvh-pedido', {}, '<input id="pedido_detalle"><button wire:click="guardar">Guardar</button>'))] })
  await assert.rejects(
    cargarPedidoTempoglass(datosPedido(), () => {}, rapido),
    (e: unknown) => e instanceof ErrorTempoglass && /componentes: dvh-pedido · acciones: guardar · campos: pedido_detalle/.test(e.message),
  )
}

console.log('tempoglass: ok')
