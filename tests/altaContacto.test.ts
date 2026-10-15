/**
 * El alta de clientes y constructores/arquitectos con ARCA (15/10/2026): el CUIT válido, lo que ARCA completa
 * en el formulario (sólo con etiquetas que el tablero tiene), la validación y las columnas que se escriben.
 *
 * Se corre con esbuild + node (`npm run test:alta`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import {
  DATO_NO_ENCONTRADO,
  alVacio,
  columnasParaCrear,
  cuitValido,
  desdeArca,
  erroresAlta,
  formatoCuit,
  tipoDeCuit,
} from '../src/lib/altaContacto'
import type { DatosDeArca } from '../src/services/arca'
import { consultarPadron } from '../api/_arca'

let n = 0
const prueba = (nombre: string, f: () => void | Promise<void>) => {
  n++
  return Promise.resolve(f()).then(
    () => console.log(`ok   ${nombre}`),
    (e) => {
      console.error(`FALLA ${nombre}\n${e instanceof Error ? e.stack : e}`)
      process.exitCode = 1
    },
  )
}

const arca = (c: Partial<DatosDeArca> = {}): DatosDeArca => ({
  cuit: '20312273684',
  razonSocial: 'BASUALDO DIEGO',
  condicionIva: 'MONOTRIBUTO',
  condicionIvaTexto: 'MONOTRIBUTISTA',
  domicilio: '',
  localidad: '',
  provincia: '',
  datoViejo: false,
  ...c,
})
const opcionesCliente = { tipo: ['Empresa', 'Persona Física'], condicion: ['Responsable Monotributista', 'Responsable Inscripto', 'Consumidor Final', 'EXENTO'] }
const opcionesConstructor = { tipo: ['Empresa', 'Persona Física'], condicion: ['Responsable Monotributista', 'Responsable Inscripto', 'Consumidor Final'] }

await prueba('la frase de lo que no se encontró es exacta', () => {
  assert.equal(DATO_NO_ENCONTRADO, 'No se encontro este dato en la consulta')
})

await prueba('CUIT: el verificador (módulo 11) decide', () => {
  assert.ok(cuitValido('20-31227368-4'))
  assert.ok(cuitValido('30717050998'))
  assert.ok(!cuitValido('20312273685'))
  assert.ok(!cuitValido('2031227368'))
  assert.ok(!cuitValido(''))
})

await prueba('CUIT: se formatea mientras se escribe', () => {
  assert.equal(formatoCuit('2031227'), '20-31227')
  assert.equal(formatoCuit('20312273684'), '20-31227368-4')
  assert.equal(formatoCuit('20-31227368-4999'), '20-31227368-4')
})

await prueba('tipo: 30/33/34 es empresa; 20/23/24/27, persona física', () => {
  assert.equal(tipoDeCuit('30717050998'), 'Empresa')
  assert.equal(tipoDeCuit('27124013890'), 'Persona Física')
  assert.equal(tipoDeCuit('99999999999'), '')
})

await prueba('ARCA completa nombre, tipo y condición con las etiquetas del tablero', () => {
  assert.deepEqual(desdeArca(arca(), opcionesCliente), {
    nombre: 'BASUALDO DIEGO',
    tipo: 'Persona Física',
    condicion: 'Responsable Monotributista',
  })
})

await prueba('una etiqueta que el tablero no tiene no se devuelve (queda vacía, en rojo)', () => {
  const exento = arca({ condicionIva: 'EXENTO' })
  assert.equal(desdeArca(exento, opcionesCliente).condicion, 'EXENTO')
  assert.equal(desdeArca(exento, opcionesConstructor).condicion, undefined)
  assert.equal(desdeArca(arca({ condicionIva: 'NO_ALCANZADO' }), opcionesCliente).condicion, undefined)
})

await prueba('ARCA sin razón social: el nombre queda vacío', () => {
  assert.equal(desdeArca(arca({ razonSocial: '' }), opcionesCliente).nombre, undefined)
})

await prueba('validación: nombre, CUIT y celular obligatorios; celular y e-mail con formato', () => {
  const e = erroresAlta('Cliente', alVacio())
  assert.ok(e.cuit && e.nombre && e.celular)
  const mal = erroresAlta('Cliente', { ...alVacio(), nombre: 'X', cuit: '20-31227368-4', celular: '123', email: 'x' })
  assert.ok(mal.celular && mal.email && !mal.cuit && !mal.nombre)
  const bien = erroresAlta('Constructor', { ...alVacio(), nombre: 'X', cuit: '20-31227368-4', celular: '249 436-9123', email: 'a@b.com' })
  assert.deepEqual(bien, {})
})

await prueba('columnas del alta: el CUIT va en la columna de cada tablero y el nombre no va entre las columnas', () => {
  const v = { ...alVacio(), nombre: 'BASUALDO DIEGO', cuit: '20-31227368-4', tipo: 'Persona Física', condicion: 'Responsable Monotributista', celular: '249 436-9123', categoria: 'Arquitecto' }
  const cliente = columnasParaCrear('Cliente', v)
  assert.equal(cliente.text_mkwzq9z4, '20312273684')
  assert.equal(cliente.numeric_mksy21gb, undefined)
  assert.equal(cliente.color_mkszgwmv, undefined)
  assert.deepEqual(cliente.color_mkszaw8z, { label: 'Persona Física' })
  assert.deepEqual(cliente.phone_mksydcv6, { phone: '5492494369123', countryShortName: 'AR' })
  assert.equal('name' in cliente, false)
  const constructor = columnasParaCrear('Constructor', v)
  assert.equal(constructor.numeric_mksy21gb, '20312273684')
  assert.equal(constructor.text_mkwzq9z4, undefined)
  assert.deepEqual(constructor.color_mkszgwmv, { label: 'Arquitecto' })
})

await prueba('padrón: CUIT de menos de 11 dígitos, sin clave, y respuestas del servicio', async () => {
  assert.equal(((await consultarPadron('123', 'k')) as { error: string }).error, 'documento_invalido')
  assert.equal(((await consultarPadron('20312273684', undefined)) as { error: string }).error, 'sin_clave')
  const ok = await consultarPadron('20-31227368-4', 'clave', (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://arca.theautomationpartner.com/api/padron/20312273684')
    assert.equal((init.headers as Record<string, string>)['x-api-key'], 'clave')
    return new Response(JSON.stringify({ cuit: '20312273684', razon_social: ' BASUALDO DIEGO ', condicion_iva: 'MONOTRIBUTO', domicilio: null }), { status: 200 })
  }) as unknown as typeof fetch)
  assert.ok(ok.ok && ok.datos.razonSocial === 'BASUALDO DIEGO' && ok.datos.domicilio === '')
  const noEsta = await consultarPadron('20312273684', 'clave', (async () => new Response(JSON.stringify({ error: 'no_encontrado', mensaje: 'No está en el padrón' }), { status: 404 })) as unknown as typeof fetch)
  assert.ok(!noEsta.ok && noEsta.error === 'no_encontrado')
  const sinClave = await consultarPadron('20312273684', 'mala', (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch)
  assert.ok(!sinClave.ok && !/clave/i.test(sinClave.mensaje))
})

console.log(`\n${n} pruebas`)
