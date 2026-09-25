/**
 * 🏭 Orden de Produccion (18432207111): un ítem por cada OP emitida.
 *
 * La obra guarda sólo la ÚLTIMA OP en sus columnas; este tablero guarda TODAS, cada una con su
 * número, quién midió, cuándo, los dos documentos (el ETMO original y la OP final) y sus
 * observaciones como subelementos. Es el historial que la obra sola no puede tener.
 *
 * El ítem se crea APENAS se entra a la obra para subir el ETMO: sólo con el nombre (y su vínculo a
 * la obra, para poder encontrarlo). Al apretar "Generar la OP final" se le cargan los datos, las
 * observaciones y el ETMO; cuando la OP sale, el PDF final y el estado "Generada". Después lo
 * mueven el envío ("Enviada Pend Confirmar") y la respuesta del cliente ("Confirmada" / "NO
 * Confirmado").
 */
import { getUrlArchivo, subirArchivo } from './obras'
import { mondayApi } from './sdk'
import type { ArchivoObra } from '@/types'

export const BOARD_ORDENES = 18432207111

export const COL_OP = {
  personas: 'multiple_person_mm7gz5g1',
  nroPvc: 'numeric_mm7ep0eq',
  nroAluminio: 'text_mm7gjg24',
  idOp: 'pulse_id_mm7e9nvx',
  obra: 'board_relation_mm7e604m',
  etmo: 'file_mm7g9dnc',
  opFinal: 'file_mm7g7emd',
  estado: 'color_mm7g3ta4',
  medidoPor: 'text_mm7gq0gg',
  observacion: 'long_text_mm7g7k7n',
  fechaMedicion: 'date_mm7gejvf',
  tipo: 'color_mm7gbz9q',
} as const

/** Columnas de los subelementos (las observaciones por abertura). */
export const COL_OBS = {
  texto: 'long_text_mm7g5wfj',
  estado: 'color_mm7g7r8s',
} as const

/** Etiquetas de `Estado OP`, tal cual están en el tablero. */
export const ESTADO_OP = {
  generada: 'Generada',
  enviada: 'Enviada Pend Confirmar',
  confirmada: 'Confirmada',
  noConfirmada: 'NO Confirmado',
} as const

export interface DatosOrden {
  tipo: 'PVC' | 'Aluminio'
  /** "3001" o "A3001". */
  numero: string
  personas: string[]
  medidoPor: string
  observacion: string
  /** `YYYY-MM-DD`. */
  fecha: string
}

async function cambiarColumnas(itemId: string, valores: Record<string, unknown>): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_ORDENES}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id: itemId, valores: JSON.stringify(valores) },
  )
}

/**
 * Crea la OP de la obra SÓLO con el nombre, y en seguida le cuelga el vínculo a la obra y su nombre
 * definitivo "<obra> - IDOP-00X". Devuelve el id del ítem.
 *
 * El `IDOP-00X` lo asigna Monday un instante DESPUÉS de crear el ítem (probado: leído en el acto
 * viene vacío), así que se reintenta unas veces antes de renunciar al nombre definitivo.
 */
export async function crearOrdenVacia(obraId: string, obraNombre: string): Promise<string> {
  const d = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($nombre: String!) {
      create_item(board_id: ${BOARD_ORDENES}, item_name: $nombre) { id }
    }`,
    { nombre: obraNombre },
  )
  const id = d.create_item.id

  let idOp = ''
  for (let intento = 0; intento < 6 && !idOp; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, 700))
    const r = await mondayApi<{ items: { column_values: { text: string | null }[] }[] }>(
      `query ($id: [ID!]) { items(ids: $id) { column_values(ids: ["${COL_OP.idOp}"]) { text } } }`,
      { id: [id] },
    ).catch(() => null)
    idOp = r?.items[0]?.column_values[0]?.text?.trim() ?? ''
  }
  await cambiarColumnas(id, {
    [COL_OP.obra]: { item_ids: [Number(obraId)] },
    ...(idOp ? { name: `${obraNombre} - ${idOp}` } : {}),
  })
  return id
}

/**
 * La OP ABIERTA de la obra: la última que se creó y todavía no se generó (sin estado).
 *
 * Es la que se reusa al volver a entrar: sin esto, cada visita al paso dejaría una OP vacía más.
 */
export async function ordenAbiertaDeObra(obraId: string): Promise<string | null> {
  const op = await ultimaOrdenDeObra(obraId)
  return op && !op.estado ? op.id : null
}

/**
 * La OP abierta de la obra, creándola si no hay. Una sola promesa por obra en toda la sesión: entrar
 * dos veces seguidas (o el doble efecto de React en desarrollo) no crea dos órdenes.
 */
const abiertas = new Map<string, Promise<string>>()

export function asegurarOrdenAbierta(obraId: string, obraNombre: string): Promise<string> {
  let p = abiertas.get(obraId)
  if (!p) {
    p = (async () => (await ordenAbiertaDeObra(obraId)) ?? crearOrdenVacia(obraId, obraNombre))()
    p.catch(() => abiertas.delete(obraId))
    abiertas.set(obraId, p)
  }
  return p
}

/** La OP ya se generó: la próxima vez que se entre a la obra, se abre una nueva. */
export function olvidarOrdenAbierta(obraId: string): void {
  abiertas.delete(obraId)
}

/** Carga los datos de la OP (al apretar "Generar la OP final"). */
export async function completarOrden(ordenId: string, o: DatosOrden): Promise<void> {
  const columnas: Record<string, unknown> = {
    [COL_OP.tipo]: { label: o.tipo },
    [COL_OP.medidoPor]: o.medidoPor,
    [COL_OP.observacion]: { text: o.observacion },
  }
  if (o.fecha) columnas[COL_OP.fechaMedicion] = { date: o.fecha }
  /* El número va en la columna de su tipo: la de PVC es numérica y la de Aluminio es texto, porque
     lleva la "A" adelante. La otra se vacía, por si el tipo cambió entre un intento y otro. */
  if (o.tipo === 'PVC') {
    columnas[COL_OP.nroPvc] = o.numero.replace(/\D/g, '')
    columnas[COL_OP.nroAluminio] = ''
  } else {
    columnas[COL_OP.nroAluminio] = o.numero
    columnas[COL_OP.nroPvc] = ''
  }
  if (o.personas.length) {
    columnas[COL_OP.personas] = {
      personsAndTeams: o.personas.map((id) => ({ id: Number(id), kind: 'person' })),
    }
  }
  await cambiarColumnas(ordenId, columnas)
}

/**
 * Una observación por abertura, como subelemento: nombre = la abertura ("V1"), texto = lo escrito.
 *
 * REEMPLAZA las que hubiera: si un intento anterior falló, la OP ya tiene subelementos, y volver a
 * crearlos los duplicaría.
 */
export async function crearObservaciones(
  ordenId: string,
  observaciones: { nombre: string; texto: string }[],
): Promise<void> {
  const previas = await mondayApi<{ items: { subitems: { id: string }[] | null }[] }>(
    `query ($id: [ID!]) { items(ids: $id) { subitems { id } } }`,
    { id: [ordenId] },
  )
  for (const sub of previas.items[0]?.subitems ?? []) {
    await mondayApi(`mutation ($id: ID!) { delete_item(item_id: $id) { id } }`, { id: sub.id })
  }
  for (const o of observaciones) {
    await mondayApi(
      `mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
        create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
      }`,
      {
        padre: ordenId,
        nombre: o.nombre,
        valores: JSON.stringify({
          [COL_OBS.texto]: { text: o.texto },
          [COL_OBS.estado]: { label: 'Observacion' },
        }),
      },
    )
  }
}

/**
 * Copia un archivo de la obra a la OP.
 *
 * Monday no tiene "copiar archivo entre columnas": se bajan los bytes del adjunto y se vuelven a
 * subir. Es lo mismo que hace quien lo arrastra de un ítem al otro.
 */
export async function copiarArchivo(
  archivo: ArchivoObra,
  ordenId: string,
  columna: string,
): Promise<void> {
  const url = await getUrlArchivo(archivo.assetId)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`No se pudo bajar ${archivo.nombre}: HTTP ${r.status}`)
  const blob = await r.blob()
  const tipo = blob.type || (archivo.esImagen ? 'image/png' : 'application/pdf')
  /* Una OP lleva UN documento de cada tipo: si ya había uno (un intento anterior), se reemplaza. */
  await cambiarColumnas(ordenId, { [columna]: { clear_all: true } }).catch(() => {})
  await subirArchivo(ordenId, columna, new File([blob], archivo.nombre, { type: tipo }))
}

export async function setEstadoOrden(ordenId: string, etiqueta: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $valor: String!) {
      change_simple_column_value(board_id: ${BOARD_ORDENES}, item_id: $id, column_id: "${COL_OP.estado}", value: $valor) { id }
    }`,
    { id: ordenId, valor: etiqueta },
  )
}

/**
 * La OP más nueva de una obra, con su estado. `null` si la obra todavía no tiene ninguna.
 *
 * Los ids de Monday crecen con el tiempo: el más alto es el último creado.
 */
export async function ultimaOrdenDeObra(
  obraId: string,
): Promise<{ id: string; estado: string } | null> {
  const d = await mondayApi<{
    boards: { items_page: { items: { id: string; column_values: { text: string | null }[] }[] } }[]
  }>(
    `query ($q: ItemsQuery) {
      boards(ids: [${BOARD_ORDENES}]) {
        items_page(limit: 100, query_params: $q) {
          items { id column_values(ids: ["${COL_OP.estado}"]) { text } }
        }
      }
    }`,
    { q: { rules: [{ column_id: COL_OP.obra, compare_value: [Number(obraId)], operator: 'any_of' }] } },
  )
  const items = d.boards[0]?.items_page.items ?? []
  if (!items.length) return null
  const ultimo = items.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a))
  return { id: ultimo.id, estado: ultimo.column_values[0]?.text ?? '' }
}

/**
 * Archiva una OP que no llegó a generarse (la automatización falló). Se ARCHIVA y no se borra: si
 * alguien la quiere mirar, sigue en el archivo del tablero.
 */
export async function archivarOrden(ordenId: string): Promise<void> {
  await mondayApi(`mutation ($id: ID!) { archive_item(item_id: $id) { id } }`, { id: ordenId })
}

/** Mueve el estado de la última OP de la obra, si hace falta. Nunca rompe el flujo si falla. */
export async function sincronizarEstadoOrden(obraId: string, etiqueta: string): Promise<void> {
  try {
    const op = await ultimaOrdenDeObra(obraId)
    if (op && op.estado !== etiqueta) await setEstadoOrden(op.id, etiqueta)
  } catch (e) {
    console.warn('[ordenes] no se pudo actualizar el estado de la OP', e)
  }
}
