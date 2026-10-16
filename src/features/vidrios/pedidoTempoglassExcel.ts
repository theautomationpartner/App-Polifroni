import type { Corte } from '@/lib/vidrios'
import { filasPedidoTempoglass, COLUMNAS_PEDIDO_TEMPOGLASS } from '@/lib/tempoglass'

/**
 * La planilla que se IMPORTA en Tempoglass ("Importar" en el pedido): el mismo formato que su
 * "Descargar planilla modelo" (PedidoDVH.xlsx) —una hoja "Pedido", los encabezados en la fila 1 y
 * un renglón por corte desde la fila 2—. Sin títulos ni datos de la empresa arriba: el importador
 * de Tempoglass lee desde la primera fila, y la orden de compra "linda" (`ordenCompraExcel`) no le
 * sirve.
 */
export async function pedidoTempoglassExcel(cortes: Corte[]): Promise<Blob> {
  const mod = await import('exceljs')
  /* El build del navegador de exceljs es UMD: según cómo lo empaquete Vite, viene en `default`. */
  const Workbook = (mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook) as new () => import('exceljs').Workbook

  const libro = new Workbook()
  libro.creator = 'Polifroni'
  const hoja = libro.addWorksheet('Pedido')
  hoja.addRow([...COLUMNAS_PEDIDO_TEMPOGLASS])
  for (const fila of filasPedidoTempoglass(cortes)) hoja.addRow(fila)
  hoja.columns.forEach((c) => (c.width = 14))

  const buffer = await libro.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
