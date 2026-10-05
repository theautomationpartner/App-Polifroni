import type { Borders, Fill, Workbook as LibroExcel, Worksheet } from 'exceljs'
import { mm, type Corte } from '@/lib/vidrios'

/**
 * La orden de compra de vidrios en Excel: la planilla que se manda al proveedor.
 *
 * En la primera fila, el título "ORDEN DE COMPRA VIDRIOS". Debajo, dos bloques de rótulo y valor:
 * los datos de Polifroni (los de sus comprobantes) y los de la orden —fecha,
 * obra y el N° de las OP, PVC o Aluminio ("A…")—. Después, la tabla de cortes con las columnas de
 * la planilla de corte del proveedor: Cantidad, Ancho, Alto, Componente 1, Cámara y Componente 2,
 * y al pie el total de cantidades solicitadas. El bordó queda para el título y la cabecera de la
 * tabla; los datos van en negro sobre grises.
 *
 * exceljs pesa: se carga recién acá, cuando se genera la planilla.
 */

const EMPRESA: [string, string][] = [
  ['Dirección', 'Av Marconi 1155 • Tandil • Bs As • CP:7000'],
  ['Cel / WhatsApp', '2494-535460'],
  ['Email', 'polifroniaberturas@gmail.com'],
  ['CUIT', '30-63766275-5'],
]

/** Las columnas de la tabla de cortes, con su ancho en caracteres. */
const COLUMNAS = [
  { titulo: 'CANTIDAD', ancho: 16 },
  { titulo: 'ANCHO (mm)', ancho: 13 },
  { titulo: 'ALTO (mm)', ancho: 13 },
  { titulo: 'COMPONENTE 1', ancho: 20 },
  { titulo: 'CÁMARA', ancho: 12 },
  { titulo: 'COMPONENTE 2', ancho: 20 },
]
const ULTIMA = 'F'

/** El bordó de la marca (ver `--marca` en labatea.css) y los grises de los datos, en ARGB. */
const MARCA = 'FF89263C'
const NEGRO = 'FF000000'
const ROTULO = 'FFF2F2F2'
const CEBRA = 'FFF8F8F8'
const BORDE = 'FFCFCFCF'
const TEXTO_GRIS = 'FF5F5F5F'
const REVISAR = 'FFFFF4D6'

const relleno = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const bordes = (argb: string): Partial<Borders> => {
  const linea = { style: 'thin' as const, color: { argb } }
  return { top: linea, left: linea, bottom: linea, right: linea }
}

/** Una medida como número ("1.013" → 1013), o el texto tal cual si no lo es. */
const medida = (s: string): number | string => (mm(s) > 0 ? mm(s) : s || '—')

/**
 * Un bloque de rótulo y valor desde la fila `desde`: el rótulo en la columna A, el valor en B hasta
 * `hasta`. Devuelve la fila siguiente al bloque.
 */
function bloque(hoja: Worksheet, desde: number, datos: [string, string][], hasta: string): number {
  datos.forEach(([etiqueta, valor], i) => {
    const fila = desde + i
    const e = hoja.getCell(`A${fila}`)
    e.value = etiqueta
    e.font = { bold: true, size: 10, color: { argb: NEGRO } }
    e.fill = relleno(ROTULO)
    e.alignment = { vertical: 'middle', indent: 1 }
    e.border = bordes(BORDE)
    hoja.mergeCells(`B${fila}:${hasta}${fila}`)
    const v = hoja.getCell(`B${fila}`)
    v.value = valor
    v.font = { size: 10, color: { argb: NEGRO } }
    v.alignment = { vertical: 'middle', indent: 1, wrapText: true }
    v.border = bordes(BORDE)
    hoja.getRow(fila).height = 20
  })
  return desde + datos.length
}

export interface DatosOrdenCompra {
  obra: string
  /** El N° de las OP cuyos vidrios se piden, PVC ("1234") o Aluminio ("A123"). */
  ordenes: string[]
  cortes: Corte[]
  fecha?: Date
}

export async function ordenCompraExcel({ obra, ordenes, cortes, fecha = new Date() }: DatosOrdenCompra): Promise<Blob> {
  const mod = await import('exceljs')
  /* El build del navegador de exceljs es UMD: según cómo lo empaquete Vite, viene en `default`. */
  const Workbook = (mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook) as new () => LibroExcel

  const libro = new Workbook()
  libro.creator = 'Polifroni'
  libro.created = fecha
  const hoja = libro.addWorksheet('Orden de compra', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&L&8Polifroni Aberturas&R&8Página &P de &N' },
  })
  hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }))

  /* ── El título, en la primera fila ─────────────────────────────────────────────────────────── */
  hoja.mergeCells(`A1:${ULTIMA}1`)
  const titulo = hoja.getCell('A1')
  titulo.value = 'ORDEN DE COMPRA VIDRIOS'
  titulo.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  titulo.fill = relleno(MARCA)
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  hoja.getRow(1).height = 34
  hoja.getRow(2).height = 10

  /* ── Los datos de Polifroni ───────────────────────────────────────────────────────────────── */
  const finEmpresa = bloque(hoja, 3, EMPRESA, ULTIMA)
  hoja.getRow(finEmpresa).height = 10

  /* ── Los datos de la orden ─────────────────────────────────────────────────────────────────── */
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const finDatos = bloque(
    hoja,
    finEmpresa + 1,
    [
      ['Fecha', `Tandil, ${dia}`],
      ['Obra', obra],
      [ordenes.length === 1 ? 'Orden' : 'Órdenes', ordenes.join(', ') || '—'],
    ],
    ULTIMA,
  )
  hoja.mergeCells(`A${finDatos}:${ULTIMA}${finDatos}`)
  const nota = hoja.getCell(`A${finDatos}`)
  nota.value = 'Documento no válido fiscalmente'
  nota.font = { italic: true, size: 9, color: { argb: TEXTO_GRIS } }
  nota.alignment = { horizontal: 'right' }

  /* ── La tabla de cortes ───────────────────────────────────────────────────────────────────── */
  const filaCab = finDatos + 2
  const cab = hoja.getRow(filaCab)
  cab.values = COLUMNAS.map((c) => c.titulo)
  cab.height = 24
  cab.eachCell((celda) => {
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    celda.fill = relleno(MARCA)
    celda.alignment = { horizontal: 'center', vertical: 'middle' }
    celda.border = bordes(MARCA)
  })

  cortes.forEach((c, i) => {
    const fila = hoja.getRow(filaCab + 1 + i)
    fila.values = [c.cantidad, medida(c.ancho), medida(c.alto), c.comp1 || '—', c.camara || '—', c.comp2 || '—']
    fila.height = 20
    fila.eachCell({ includeEmpty: true }, (celda, col) => {
      celda.font = { size: 10, bold: col === 1, color: { argb: NEGRO } }
      celda.alignment = { horizontal: col <= 3 ? 'right' : 'center', vertical: 'middle', indent: col <= 3 ? 1 : 0 }
      celda.border = bordes(BORDE)
      if (c.sinCantidad) celda.fill = relleno(REVISAR)
      else if (i % 2 === 1) celda.fill = relleno(CEBRA)
      if (col <= 3) celda.numFmt = '0'
    })
    if (c.sinCantidad) fila.getCell(1).note = 'Algún vidrio de este corte no trae la cantidad en la OP: revisala antes de pedir.'
  })

  /* ── El total de cantidades solicitadas, debajo de la columna CANTIDAD ────────────────────── */
  const primera = filaCab + 1
  const filaTotal = primera + cortes.length
  const total = cortes.reduce((n, c) => n + c.cantidad, 0)
  const celdaTotal = hoja.getCell(`A${filaTotal}`)
  celdaTotal.value = cortes.length ? { formula: `SUM(A${primera}:A${filaTotal - 1})`, result: total } : 0
  celdaTotal.numFmt = '0'
  hoja.mergeCells(`B${filaTotal}:${ULTIMA}${filaTotal}`)
  hoja.getCell(`B${filaTotal}`).value = 'TOTAL DE CANTIDADES SOLICITADAS'
  hoja.getRow(filaTotal).height = 22
  const lineaTotal = { style: 'medium' as const, color: { argb: NEGRO } }
  for (const col of ['A', 'B']) {
    const celda = hoja.getCell(`${col}${filaTotal}`)
    celda.font = { bold: true, size: 11, color: { argb: NEGRO } }
    celda.fill = relleno(ROTULO)
    celda.alignment = { horizontal: col === 'A' ? 'right' : 'left', vertical: 'middle', indent: 1 }
    celda.border = { top: lineaTotal, bottom: lineaTotal, left: col === 'A' ? lineaTotal : undefined, right: col === 'B' ? lineaTotal : undefined }
  }

  /* Sin la cuadrícula de Excel; al imprimir, la cabecera de la tabla se repite en cada hoja. */
  hoja.views = [{ showGridLines: false }]
  hoja.pageSetup.printTitlesRow = `${filaCab}:${filaCab}`

  const bytes = await libro.xlsx.writeBuffer()
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
