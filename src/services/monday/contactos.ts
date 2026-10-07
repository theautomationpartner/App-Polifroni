import type { Rol } from '@/lib/destinatario'
import type { Obra } from '@/types'
import { mondayApi } from './sdk'

/**
 * Dónde vive el celular de cada destinatario. La obra lo muestra en espejos (`🤖Cel-WHATSAPP
 * Cliente` y `🤖Cel-WHATSAPP Contructor/Arquitecto`): para cambiarlo hay que escribir en el ítem de
 * la persona, en su tablero.
 *
 *  - Constructor: la obra lo vincula directo (`✋Constructor/Arquitecto`) al tablero de
 *    constructores, y el celular es su `✋Cel-WHATSAPP`.
 *  - Cliente: la obra vincula la CUENTA CORRIENTE (`✋Cta Cte Cliente`), y la cuenta vincula al
 *    cliente (`board_relation_mkt5evd4`) del tablero de clientes, donde está su `✋Cel-WHATSAPP`.
 *    Una cuenta dada de baja vive en ARCHIVADOS, con las mismas columnas.
 */
const TABLERO_CLIENTES = 9617181550
const TABLERO_CONSTRUCTORES = 9618146225
const COL_CEL = 'phone_mksydcv6'
const COL_CTA_CLIENTE = 'board_relation_mkt5evd4'

/** El ítem de la persona (en Clientes o en Constructor/Arquitecto) y su tablero. */
export async function itemDe(obra: Obra, rol: Rol): Promise<{ board: number; id: string }> {
  if (rol === 'Constructor') {
    const id = obra.arquitectoIds[0]
    if (!id) throw new Error('La obra no tiene un constructor vinculado.')
    return { board: TABLERO_CONSTRUCTORES, id: String(id) }
  }
  const cuenta = obra.ctaCteClienteIds[0]
  if (!cuenta) throw new Error('La obra no tiene una cuenta corriente de cliente vinculada.')
  const d = await mondayApi<{ items: { column_values: { linked_item_ids?: string[] }[] }[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { column_values(ids: ["${COL_CTA_CLIENTE}"]) { ... on BoardRelationValue { linked_item_ids } } }
    }`,
    { ids: [String(cuenta)] },
  )
  const id = d.items?.[0]?.column_values?.[0]?.linked_item_ids?.[0]
  if (!id) throw new Error('La cuenta corriente no tiene un cliente vinculado.')
  return { board: TABLERO_CLIENTES, id: String(id) }
}

/**
 * Cambia el `✋Cel-WHATSAPP` del cliente o del constructor de la obra. `celular` va en dígitos, con
 * el 54 (ver `normalizarCelular`): así lo espera la columna de teléfono de Monday.
 */
export async function actualizarCelular(obra: Obra, rol: Rol, celular: string): Promise<void> {
  const { board, id } = await itemDe(obra, rol)
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    {
      board: String(board),
      id,
      valores: JSON.stringify({ [COL_CEL]: { phone: celular, countryShortName: 'AR' } }),
    },
  )
}

/**
 * Cambia el `✋Cel-WHATSAPP` de un cliente de 👤 Clientes por su id: la Agenda ya tiene el cliente
 * (el asignado en la cuenta corriente) y no pasa por la obra. Mismo formato que `actualizarCelular`.
 */
export async function actualizarCelularCliente(clienteId: string, celular: string): Promise<void> {
  await mondayApi(
    `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores) { id }
    }`,
    {
      board: String(TABLERO_CLIENTES),
      id: clienteId,
      valores: JSON.stringify({ [COL_CEL]: { phone: celular, countryShortName: 'AR' } }),
    },
  )
}

/** La actividad personalizada "envío de OP" de Emails & Activities. */
export const ACTIVIDAD_ENVIO_OP = '755fffba-f273-4d3c-bf10-17d59a419cbb'

/**
 * Registra una actividad en Emails & Activities del ítem (`create_timeline_item`). El título y el
 * contenido van por variables: viajan tal cual los arma `armarActividadEnvio`, sin riesgo de romper
 * la mutation. La hora es la de ahora, en UTC ("2026-10-07T13:57:00Z").
 */
export async function registrarActividad(
  itemId: string,
  { titulo, content }: { titulo: string; content: string },
  actividad: string = ACTIVIDAD_ENVIO_OP,
): Promise<void> {
  await mondayApi(
    `mutation ($item: ID!, $actividad: String!, $titulo: String!, $content: String, $cuando: ISO8601DateTime!) {
      create_timeline_item(item_id: $item, custom_activity_id: $actividad, title: $titulo, content: $content, timestamp: $cuando) { id }
    }`,
    {
      item: itemId,
      actividad,
      titulo,
      content,
      cuando: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  )
}
