/**
 * Alta de un cliente o de un constructor/arquitecto en su tablero (Etapa 1 del presupuesto). Los datos ya
 * vienen validados por `lib/altaContacto`; acá sólo se lee lo que el formulario ofrece y se escribe.
 */
import { columnasParaCrear, type TipoAlta, type ValoresAlta } from '@/lib/altaContacto'
import { normalizarCelular } from '@/lib/destinatario'
import { BOARD_CONTACTO, buscarContactos, type Contacto } from './presupuestos'
import { mondayApi } from './sdk'

/** Los estados que se eligen en el formulario de alta. */
const COLUMNAS_ESTADO = { tipo: 'color_mkszaw8z', condicion: 'color_mkszas2x', categoria: 'color_mkszgwmv' } as const

export interface OpcionesAlta {
  tipo: string[]
  condicion: string[]
  /** Sólo el tablero de constructores tiene categoría. */
  categoria: string[]
}

/** Las etiquetas vigentes de un status, en el orden del tablero (las desactivadas no se ofrecen). */
function etiquetas(settings: string): string[] {
  try {
    const s = JSON.parse(settings || '{}') as {
      labels?: Record<string, string>
      labels_positions_v2?: Record<string, number>
      deactivated_labels?: number[]
    }
    const fuera = new Set((s.deactivated_labels ?? []).map(String))
    return Object.entries(s.labels ?? {})
      .filter(([i, t]) => t.trim() && !fuera.has(i))
      .sort(([a], [b]) => (s.labels_positions_v2?.[a] ?? 0) - (s.labels_positions_v2?.[b] ?? 0))
      .map(([, t]) => t)
  } catch {
    return []
  }
}

/** Las opciones de Tipo, Condición fiscal (y Categoría) del tablero, para los desplegables y para ARCA. */
export async function leerOpcionesAlta(tipo: TipoAlta): Promise<OpcionesAlta> {
  const ids = Object.values(COLUMNAS_ESTADO)
  const d = await mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    `query ($ids: [String!]) { boards(ids: [${BOARD_CONTACTO[tipo]}]) { columns(ids: $ids) { id settings_str } } }`,
    { ids },
  )
  const de = (id: string) => etiquetas(d.boards[0]?.columns.find((c) => c.id === id)?.settings_str ?? '')
  return {
    tipo: de(COLUMNAS_ESTADO.tipo),
    condicion: de(COLUMNAS_ESTADO.condicion),
    categoria: tipo === 'Constructor' ? de(COLUMNAS_ESTADO.categoria) : [],
  }
}

/** Crea el ítem en el tablero del tipo elegido y devuelve el contacto como quedó, listo para la card. */
export async function crearContacto(tipo: TipoAlta, v: ValoresAlta): Promise<Contacto> {
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($board: ID!, $nombre: String!, $valores: JSON!) {
      create_item(board_id: $board, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { board: String(BOARD_CONTACTO[tipo]), nombre: v.nombre.trim(), valores: JSON.stringify(columnasParaCrear(tipo, v)) },
  )
  return {
    id: String(d.create_item.id),
    nombre: v.nombre.trim(),
    celular: normalizarCelular(v.celular),
    email: v.email.trim(),
  }
}

/** ¿Ya existe en el tablero un contacto con ese CUIT/CUIL? Evita duplicar a quien la búsqueda no encontró. */
export async function existeContactoConCuit(tipo: TipoAlta, cuit: string): Promise<{ id: string; nombre: string } | null> {
  return (await buscarContactos(tipo, cuit, 1))[0] ?? null
}
