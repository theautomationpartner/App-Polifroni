/**
 * 🪞 Orden de Compra Vidrios: un ítem por pedido de vidrios cargado en Tempoglass.
 *
 * Lo crea la solicitud de cortes cuando el robot termina de cargar y cerrar el pedido allá.
 */
import { mondayApi } from './sdk'

export const BOARD_OC_VIDRIOS = 18392212010

/** Columnas de 🪞 Orden de Compra Vidrios (ids de una consulta real al tablero). */
export const COL_OC = {
  /** IDTemploglass (text): el Id.Int.Obra de Tempoglass. */
  idTempoglass: 'text_mm7sa615',
  /** Obras (board_relation → 🪟 Obras). */
  obra: 'board_relation_mkynx7sv',
  /** Orden de Produccion (board_relation → 🏭 Orden de Produccion). */
  orden: 'board_relation_mm7qha1f',
  /** Fecha estimada de Colocacion. (date): la fecha de entrega que se cargó en el pedido. */
  fechaColocacion: 'date_mkyn83q3',
  /** Pedido (date): el día en que se hizo el pedido. */
  fechaPedido: 'date',
  /** Estado (status): Pedidos | Recibidos | Cancelados | Colocados. */
  estado: 'status',
} as const

export interface NuevaOrdenCompraVidrios {
  /** El nombre de la obra en Tempoglass ("IDOP-097 - PVC 2326"). */
  nombre: string
  idIntObra: string
  obraId: string
  ordenId: string
  /** `YYYY-MM-DD`. */
  fechaColocacion: string
  /** `YYYY-MM-DD`. */
  fechaPedido: string
}

/** Crea el ítem del pedido, en estado "Pedidos". Devuelve su id. */
export async function crearOrdenCompraVidrios(o: NuevaOrdenCompraVidrios): Promise<string> {
  const valores = {
    [COL_OC.idTempoglass]: o.idIntObra,
    [COL_OC.obra]: { item_ids: [Number(o.obraId)] },
    [COL_OC.orden]: { item_ids: [Number(o.ordenId)] },
    [COL_OC.fechaColocacion]: { date: o.fechaColocacion },
    [COL_OC.fechaPedido]: { date: o.fechaPedido },
    [COL_OC.estado]: { label: 'Pedidos' },
  }
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_OC_VIDRIOS}, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: o.nombre, valores: JSON.stringify(valores) },
  )
  return String(d.create_item.id)
}
