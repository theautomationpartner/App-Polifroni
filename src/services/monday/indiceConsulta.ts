import { memoGlobal } from './cache'
import { BOARD_OBRAS, BOARD_ORDENES, COL } from './columns'
import type { ObraIndice } from './indiceObras'
import { buscarObras } from './obras'
import { COL_OP } from './ordenes'
import { mondayApi } from './sdk'

/**
 * El índice del buscador de la CONSULTA: cada obra con su nombre y, además, su cliente y el IDOP y
 * el N° de cada una de sus órdenes. Así "IDOP-059", "3002" o el nombre del cliente encuentran la
 * obra igual que su nombre.
 *
 * Monday no busca por texto en una columna de relación (el cliente) ni en el tablero de órdenes
 * desde el de obras, así que el índice se arma en memoria, una vez por sesión: las obras con la
 * cuenta corriente del cliente, y las órdenes con su obra.
 */

interface Pagina<T> {
  cursor: string | null
  items: T[]
}

type Valor = { id: string; text?: string | null; display_value?: string | null; linked_item_ids?: string[] }
type ItemObra = { id: string; name: string; column_values: Valor[] }
type ItemOrden = { id: string; name: string; state?: string; column_values: Valor[] }

/** Recorre un tablero entero, de a 500, siguiendo el cursor. */
async function todo<T>(board: number, campos: string): Promise<T[]> {
  const items: T[] = []
  const d = await mondayApi<{ boards: { items_page: Pagina<T> }[] }>(
    `query { boards(ids: [${board}]) { items_page(limit: 500) { cursor items { ${campos} } } } }`,
  )
  let pagina: Pagina<T> | undefined = d.boards[0]?.items_page
  for (let vuelta = 0; pagina && vuelta < 20; vuelta++) {
    items.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina<T> } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${campos} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return items
}

/* De las relaciones se piden sólo los ids vinculados: pedir `display_value` hace que Monday
   resuelva cada vínculo y la consulta del tablero de obras pasa de ~2 s a más de 12. El nombre del
   cliente se trae aparte, de a 100 cuentas por pedido (ver `nombresDe`). */
const VALORES = `column_values(ids: COLS) { id text ... on BoardRelationValue { linked_item_ids } }`

/** "1111 - PEREZ JUAN" → "PEREZ JUAN": el código de la cuenta no es parte del nombre. */
const sinCodigo = (n: string) => n.replace(/^\s*\d+\s*-\s*/, '').trim()

/** Los nombres de varios ítems, de a 100 por pedido (el tope de `items(ids:)`), en paralelo. */
async function nombresDe(ids: string[]): Promise<Map<string, string>> {
  const tandas: string[][] = []
  for (let i = 0; i < ids.length; i += 100) tandas.push(ids.slice(i, i + 100))
  const respuestas = await Promise.all(
    tandas.map((t) =>
      mondayApi<{ items: { id: string; name: string }[] }>(
        `query ($ids: [ID!]) { items(ids: $ids, limit: 100) { id name } }`,
        { ids: t },
      ).catch(() => ({ items: [] as { id: string; name: string }[] })),
    ),
  )
  return new Map(respuestas.flatMap((r) => r.items.map((i) => [String(i.id), i.name] as const)))
}

export const getIndiceConsulta = memoGlobal(async (): Promise<ObraIndice[]> => {
  const [obras, ordenes] = await Promise.all([
    todo<ItemObra>(BOARD_OBRAS, `id name ${VALORES.replace('COLS', JSON.stringify([COL.ctaCteCliente]))}`),
    todo<ItemOrden>(
      BOARD_ORDENES,
      `id name state ${VALORES.replace('COLS', JSON.stringify([COL_OP.obra, COL_OP.idOp, COL_OP.nroPvc, COL_OP.nroAluminio]))}`,
    ),
  ])

  /* Lo que se busca de cada orden, colgado de su obra. */
  const deObra = new Map<string, string[]>()
  for (const o of ordenes) {
    if (o.state === 'archived' || o.state === 'deleted') continue
    const v = (id: string) => o.column_values.find((c) => c.id === id)
    const obraId = String(v(COL_OP.obra)?.linked_item_ids?.[0] ?? '')
    if (!obraId) continue
    const idOp = (v(COL_OP.idOp)?.text ?? '').trim()
    /* "IDOP-041" se encuentra también como "idop 41": los ceros de adelante no se escriben. */
    const sinCeros = idOp.replace(/^(\D*)0+(\d)/, '$1$2')
    const textos = [idOp, sinCeros !== idOp ? sinCeros : '', v(COL_OP.nroPvc)?.text, v(COL_OP.nroAluminio)?.text]
      .map((t) => (t ?? '').trim())
      .filter(Boolean)
    deObra.set(obraId, [...(deObra.get(obraId) ?? []), ...textos])
  }

  const cuentaDe = (i: ItemObra) =>
    String(i.column_values.find((c) => c.id === COL.ctaCteCliente)?.linked_item_ids?.[0] ?? '')
  const cuentas = await nombresDe([...new Set(obras.map(cuentaDe).filter(Boolean))])

  return obras.map((i) => {
    const cliente = sinCodigo(cuentas.get(cuentaDe(i)) ?? '')
    return { id: String(i.id), nombre: i.name, buscables: [cliente, ...(deObra.get(String(i.id)) ?? [])] }
  })
})

/**
 * El botón Buscar de la consulta, directo a Monday: obras cuyo NOMBRE contiene lo escrito, y obras
 * de las órdenes cuyo nombre lo contiene (el nombre de la OP lleva el IDOP y el N°: "Obra - IDOP-059
 * - Aluminio A1"). Sirve para lo que el índice de la sesión todavía no tiene.
 */
export async function buscarObrasConsulta(termino: string): Promise<{ id: string; nombre: string }[]> {
  const t = termino.trim()
  const [porNombre, porOrden] = await Promise.all([
    buscarObras(t, 50).then((r) => r.filas.map((f) => ({ id: f.id, nombre: f.nombre }))),
    mondayApi<{ boards: { items_page: { items: { column_values: Valor[] }[] } }[] }>(
      `query ($q: ItemsQuery) {
        boards(ids: [${BOARD_ORDENES}]) {
          items_page(limit: 50, query_params: $q) {
            items { column_values(ids: ["${COL_OP.obra}"]) { id ... on BoardRelationValue { linked_item_ids display_value } } }
          }
        }
      }`,
      { q: { rules: [{ column_id: 'name', compare_value: [t], operator: 'contains_text' }] } },
    )
      .then((d) =>
        (d.boards[0]?.items_page.items ?? []).flatMap((i) => {
          const c = i.column_values[0]
          const id = c?.linked_item_ids?.[0]
          return id ? [{ id: String(id), nombre: (c?.display_value ?? '').trim() || String(id) }] : []
        }),
      )
      .catch(() => [] as { id: string; nombre: string }[]),
  ])
  const unicas = new Map<string, { id: string; nombre: string }>()
  for (const o of [...porNombre, ...porOrden]) if (!unicas.has(o.id)) unicas.set(o.id, o)
  return [...unicas.values()]
}
