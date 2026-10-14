/**
 * Las reglas del área Obras · "Facturar una Obra" (13/10/2026).
 *
 * Lo que se fija acá:
 *  · lo pendiente de facturar, el saldo y el % cancelado salen de las mismas fórmulas del tablero;
 *  · se listan las obras con lo pendiente distinto de cero, y sólo se elige una con lo pendiente positivo;
 *  · el monto a facturar se escribe como en la app y no puede ser cero ni pasar lo pendiente;
 *  · el comprobante: IVA 21 %, vencimiento a 30 días, la letra que se anticipa y el CUIT/DNI;
 *  · el estado del comprobante se lee por índice, y la app nunca escribe "Enviar";
 *  · el mensaje es la plantilla del escenario de Make, tal cual;
 *  · las etapas de la operación.
 *
 * Se corre con esbuild + node (`npm run test:facturacion`); vive fuera de `src/`.
 */
import assert from 'node:assert/strict'
import {
  INDICE_COMPROBANTE,
  INDICE_ENVIO_FACTURA,
  conPendienteDeFacturar,
  desglose,
  documentoFiscal,
  facturable,
  faseComprobante,
  fechasComprobante,
  importeEditable,
  importeEscrito,
  letraEsperada,
  pendienteDeFacturar,
  porcentajeCanceladoObra,
  porcentajeFacturado,
  formatearImporte,
  problemaMontoNotaCredito,
  problemaMotivo,
  proyeccion,
  problemaDocumento,
  problemaMonto,
  saldoObra,
  textoFactura,
} from '../src/lib/facturacion'
import { etiquetasPasos } from '../src/lib/pasos'

let fallas = 0
function prueba(nombre: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${nombre}`)
  } catch (e) {
    fallas++
    console.error(`  ✗ ${nombre}\n    ${(e as Error).message}`)
  }
}

console.log('Facturar una Obra')

prueba('pendiente de facturar = diferencia + total − facturado (fórmula del tablero)', () => {
  assert.equal(pendienteDeFacturar({ total: 1_000_000, diferencia: 50_000, cancelado: 0, facturado: 300_000 }), 750_000)
  /* La obra de CAROLINA LABALA: facturada entera, no se lista. */
  const labala = { total: 229119, diferencia: 0, cancelado: 229119, facturado: 229119 }
  assert.equal(pendienteDeFacturar(labala), 0)
  assert.equal(conPendienteDeFacturar(labala), false)
})

prueba('una obra facturada de más se lista pero no se puede elegir', () => {
  const deMas = { total: 100, diferencia: 0, cancelado: 0, facturado: 150 }
  assert.equal(conPendienteDeFacturar(deMas), true)
  assert.equal(facturable(deMas), false)
  assert.equal(facturable({ total: 100, diferencia: 0, cancelado: 0, facturado: 0 }), true)
})

prueba('los centavos sueltos de Monday no cuentan como pendiente', () => {
  assert.equal(conPendienteDeFacturar({ total: 100.004, diferencia: 0, cancelado: 0, facturado: 100 }), false)
})

prueba('saldo y % cancelado: la fórmula del tablero, o rearmado con las partes', () => {
  const o = { total: 1_000_000, diferencia: 0, cancelado: 960_000, facturado: 0 }
  assert.equal(saldoObra(o), 40_000)
  assert.equal(porcentajeCanceladoObra('96%', o), 96)
  assert.equal(porcentajeCanceladoObra('', o), 96)
  assert.equal(porcentajeCanceladoObra('', { total: 0, diferencia: 0, cancelado: 0, facturado: 0 }), null)
})

prueba('% facturado = facturado / (total + diferencia)', () => {
  assert.equal(porcentajeFacturado({ total: 1_000_000, diferencia: 0, cancelado: 0, facturado: 750_000 }), 75)
  assert.equal(porcentajeFacturado({ total: 900_000, diferencia: 100_000, cancelado: 0, facturado: 1_000_000 }), 100)
  assert.equal(porcentajeFacturado({ total: 0, diferencia: 0, cancelado: 0, facturado: 0 }), null)
})

prueba('el importe se formatea mientras se escribe (el del anticipo de La Batea)', () => {
  assert.deepEqual(formatearImporte('30409'), { texto: '30.409', valor: 30409 })
  assert.deepEqual(formatearImporte('6020500,5'), { texto: '6.020.500,5', valor: 6020500.5 })
  assert.deepEqual(formatearImporte('1.234,567'), { texto: '1.234,56', valor: 1234.56 })
  assert.equal(formatearImporte('abc').texto, '')
})

prueba('saldo: cancela de lo pendiente y suma a lo facturado', () => {
  assert.deepEqual(proyeccion({ facturado: 1_000_000, pendiente: 500_000 }, 200_000, 'saldo'), {
    monto: 200_000,
    nuevoFacturado: 1_200_000,
    quedaPendiente: 300_000,
  })
})

prueba('nota de crédito: la operación inversa (resta de lo facturado, vuelve a lo pendiente)', () => {
  assert.deepEqual(proyeccion({ facturado: 1_000_000, pendiente: 500_000 }, 200_000, 'notaCredito'), {
    monto: 200_000,
    nuevoFacturado: 800_000,
    quedaPendiente: 700_000,
  })
})

prueba('nota de crédito: mayor a cero y sin pasar lo que la factura asociada admite anular', () => {
  assert.equal(problemaMontoNotaCredito('100.000', 100_000), null)
  assert.match(problemaMontoNotaCredito('0', 100_000) ?? '', /mayor a cero/)
  assert.match(problemaMontoNotaCredito('100.000,01', 100_000) ?? '', /no puede superar/)
  assert.match(problemaMontoNotaCredito('', 100_000) ?? '', /Ingresá/)
})

prueba('nota de crédito: el motivo es obligatorio (y con tope)', () => {
  assert.match(problemaMotivo('') ?? '', /Escribí el motivo/)
  assert.match(problemaMotivo('   ') ?? '', /Escribí el motivo/)
  assert.equal(problemaMotivo('Descuento acordado'), null)
  assert.match(problemaMotivo('x'.repeat(501)) ?? '', /500 caracteres/)
})

prueba('el importe se escribe como en la app', () => {
  assert.equal(importeEscrito('1.297.684'), 1297684)
  assert.equal(importeEscrito('1297684,5'), 1297684.5)
  assert.equal(importeEscrito('$ 1.297.684,50'), 1297684.5)
  assert.equal(importeEscrito('1731694.48'), 1731694.48)
  assert.equal(importeEscrito('abc'), null)
  assert.equal(importeEscrito(''), null)
  assert.equal(importeEditable(1297684.5), '1.297.684,50')
})

prueba('el monto: mayor a cero, dos decimales y sin pasar lo pendiente', () => {
  assert.equal(problemaMonto('1.000,00', 1000), null)
  assert.equal(problemaMonto('500', 1000), null)
  assert.match(problemaMonto('', 1000) ?? '', /Ingresá/)
  assert.match(problemaMonto('0', 1000) ?? '', /mayor a cero/)
  assert.match(problemaMonto('1000,001', 2000) ?? '', /dos decimales/)
  assert.match(problemaMonto('1.000,01', 1000) ?? '', /no puede superar/)
})

prueba('IVA 21 %: el final se parte en neto e IVA', () => {
  const d = desglose(229119)
  assert.equal(d.total, 229119)
  assert.equal(d.neto, 189354.55)
  assert.equal(d.iva, 39764.45)
})

prueba('fechas del comprobante: hoy, y el vencimiento a 30 días (cruza el mes)', () => {
  const f = fechasComprobante(new Date(2026, 9, 13))
  assert.deepEqual(f, { emision: '2026-10-13', desde: '2026-10-13', hasta: '2026-10-13', vencimiento: '2026-11-12' })
  assert.equal(fechasComprobante(new Date(2026, 11, 15)).vencimiento, '2027-01-14')
})

prueba('la letra que se anticipa: A al Responsable Inscripto, B al resto', () => {
  assert.equal(letraEsperada('Responsable Inscripto'), 'A')
  assert.equal(letraEsperada('Consumidor Final'), 'B')
  assert.equal(letraEsperada('Responsable Monotributista'), 'B')
  assert.equal(letraEsperada('Sin Informacion'), null)
  assert.equal(letraEsperada(''), null)
})

prueba('CUIT/DNI: vacío se permite; si se escribe, 7, 8 u 11 dígitos', () => {
  assert.equal(documentoFiscal('20-29718019-4'), '20297180194')
  assert.equal(problemaDocumento(''), null)
  assert.equal(problemaDocumento('20-29718019-4'), null)
  assert.equal(problemaDocumento('29.718.019'), null)
  assert.match(problemaDocumento('123') ?? '', /11 dígitos/)
})

prueba('el estado del comprobante, por índice', () => {
  assert.equal(INDICE_COMPROBANTE.crear, 3)
  assert.equal(faseComprobante(3), 'emitiendo')
  assert.equal(faseComprobante(0), 'emitiendo')
  assert.equal(faseComprobante(1), 'emitido')
  assert.equal(faseComprobante(2), 'error')
  assert.equal(faseComprobante(null), 'sinEmitir')
  assert.equal(faseComprobante(5), 'sinEmitir')
})

prueba('la app sólo escribe "Enviado" (1) en el envío, nunca "Enviar" (3, el escenario de Make)', () => {
  assert.equal(INDICE_ENVIO_FACTURA.enviado, 1)
  assert.equal(Object.values(INDICE_ENVIO_FACTURA).includes(3 as never), false)
})

prueba('el mensaje: la plantilla de Make, con el nombre de la cuenta sin su código', () => {
  const t = textoFactura({ nombre: '1111 - FEDERICO OCHOA', tipo: 'Factura', fecha: new Date(2026, 9, 7), monto: 557400 })
  assert.equal(
    t,
    [
      '👋 Hola FEDERICO OCHOA',
      '',
      'Adjuntamos el PDF del comprobante facturado. Si tenés alguna consulta sobre éste o tu cuenta, por favor respondé a este mensaje o contactanos.',
      '',
      '📄 *Tipo de Comprobante:* Factura',
      '📅 *Fecha:* 07/10/2026',
      '💰 *Monto Facturado:* $557.400,00',
      '',
      'Polifroni Aberturas.',
      '🤖 Automatizado por The Automation Partner',
    ].join('\n'),
  )
})

prueba('las etapas de la operación', () => {
  assert.deepEqual(etiquetasPasos(null, null, 'facturar'), ['Seleccionar Obra', 'Tipo de Facturación', 'Emitir y Enviar Factura'])
})

if (fallas) {
  console.error(`\n${fallas} prueba(s) fallaron`)
  process.exit(1)
}
console.log('\nTodo OK')
