/**
 * El robot de Tempoglass, sin red: lo que se fija acá es la LECTURA de lo que devuelve Tempoglass.
 *
 *  · el nombre de la obra allá sale de la OP: "IDOP-053 - PVC 2282" (Aluminio con su "A");
 *  · del login se toma el `_token` del formulario; de la página, el token CSRF;
 *  · el buscador se reconoce con o sin modificadores de `wire:model`;
 *  · el componente de la tabla es el que tiene `table` en sus datos, aunque la página traiga otros;
 *  · las filas se leen por el encabezado de cada columna, y la obra buscada es la de nombre IGUAL
 *    (el buscador de Tempoglass trae también las que lo contienen).
 *
 * Los HTML son reducciones de los de Tempoglass (Laravel + Livewire 2). Se corre con esbuild + node
 * (`npm run test:tempoglass`).
 */
import assert from 'node:assert/strict'
import { nombreObraTempoglass } from '../src/lib/tempoglass'
import {
  componenteDeTabla,
  csrfDePagina,
  filasDeObras,
  obraExacta,
  tieneBuscador,
  tokenDeFormulario,
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

console.log('tempoglass: ok')
