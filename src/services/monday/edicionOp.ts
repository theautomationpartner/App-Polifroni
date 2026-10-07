/**
 * Editar Órdenes de Producción, del lado de Monday: qué OP se pueden editar, sus aberturas (los
 * subelementos) y el reemplazo de la OP editada.
 *
 * Editar NO modifica la OP: la CANCELA, con un motivo que dice qué se editó, y crea una OP nueva
 * con el mismo número, el mismo nombre + " V2" (o la versión que siga), los mismos datos y el mismo
 * estado. Si la OP final nueva se envía en la etapa de envío, el envío registra lo suyo; si no, la
 * nueva conserva también la clave del enlace, el recordatorio y el link de la anterior. Una que era
 * "Generada Pend de Enviar" se completa después desde "Consultar órdenes" ("Completar Carga"). La nueva lleva el PDF original más el dibujo nuevo en `🤖OP OriginaL`, la OP final
 * regenerada en `🤖Op V2 Mejorada` y sus subelementos: los de las aberturas que no se tocaron se
 * copian tal cual (con las correcciones que se les hayan hecho a mano), y los de las editadas se
 * arman de nuevo.
 */
import { mismaAbertura, partirTipoVidrio, type AberturaEditable, type ModeloListado } from '@/lib/edicionOp'
import { indiceDeEtiqueta, indiceDeValor } from '@/lib/estadosOp'
import { modeloDeSubelemento } from '@/lib/subelementosOp'
import { BOARD_ORDENES, BOARD_SUB_ORDENES } from './columns'
import { subirArchivo } from './obras'
import {
  COL_OBS,
  COL_OP,
  cancelarOrden,
  cuentasDeObras,
  filasDeSubelementos,
  insertarSubelementos,
  listarOrdenes,
  vincularOrdenEnObra,
  type FilaMonday,
  type ResumenOrden,
} from './ordenes'
import { mondayApi } from './sdk'

/** Una OP en la búsqueda de "Editar": la orden, su cliente y cuántas aberturas y vidrios tiene. */
export interface OrdenEditable extends ResumenOrden {
  cliente: string
  /** `null` mientras no se leyeron sus subelementos. */
  aberturas: number | null
  vidrios: number | null
}

/** Un subelemento de una OP, con el texto de cada columna (ids de `COL_OBS`). */
export interface SubelementoOrden {
  id: string
  nombre: string
  textos: Record<string, string>
}

const COLS_SUB = Object.values(COL_OBS)

/** De a 50 OP por pedido: cada una trae todos sus subelementos con sus columnas. */
async function porTandas<T>(ids: string[], leer: (tanda: string[]) => Promise<T[]>): Promise<T[]> {
  const salida: T[] = []
  for (let i = 0; i < ids.length; i += 50) salida.push(...(await leer(ids.slice(i, i + 50))))
  return salida
}
const COLS_VIDRIO = [COL_OBS.comp1, COL_OBS.camara, COL_OBS.comp2, COL_OBS.ancho, COL_OBS.alto, COL_OBS.cantidad]
const tieneVidrio = (s: SubelementoOrden) => COLS_VIDRIO.some((c) => s.textos[c])

/**
 * Las OP que se pueden editar: las de PVC que no están canceladas ni con la producción completada
 * (ni a medio cargar). Las de Aluminio no: su OP final es el PDF que se subió, no hay lectura que
 * volver a armar. Cada una con el cliente de su obra (de la cuenta corriente vinculada).
 */
export async function ordenesEditables(): Promise<OrdenEditable[]> {
  const todas = (await listarOrdenes()).filter(
    (o) => /pvc/i.test(o.tipo) && o.estadoOrden !== 'cancelada' && o.estadoOrden !== 'completada' && o.estadoOrden !== 'borrador',
  )
  const cuentas = await cuentasDeObras(todas.map((o) => o.obraId)).catch(() => ({}) as Awaited<ReturnType<typeof cuentasDeObras>>)
  return todas.map((o) => ({ ...o, cliente: cuentas[o.obraId]?.cliente ?? '', aberturas: null, vidrios: null }))
}

/** Los subelementos de varias OP, por OP, en el orden del tablero. */
export async function subelementosDeOrdenes(ids: string[]): Promise<Record<string, SubelementoOrden[]>> {
  const salida: Record<string, SubelementoOrden[]> = {}
  if (!ids.length) return salida
  const items = await porTandas(ids, async (tanda) => {
    const d = await mondayApi<{
      items: { id: string; subitems: { id: string; name: string; column_values: { id: string; text: string | null }[] }[] | null }[]
    }>(
      `query ($ids: [ID!]) { items(ids: $ids) { id subitems { id name column_values(ids: ${JSON.stringify(COLS_SUB)}) { id text } } } }`,
      { ids: tanda },
    )
    return d.items ?? []
  })
  for (const op of items) {
    salida[String(op.id)] = (op.subitems ?? []).map((s) => ({
      id: String(s.id),
      nombre: s.name.trim(),
      textos: Object.fromEntries(s.column_values.map((c) => [c.id, (c.text ?? '').trim()])),
    }))
  }
  return salida
}

/** Cuántas aberturas (modelos distintos) y cuántos vidrios hay en los subelementos de una OP. */
export function contarSubelementos(subs: SubelementoOrden[]): { aberturas: number; vidrios: number } {
  return {
    aberturas: new Set(subs.map((s) => modeloDeSubelemento(s.nombre).toUpperCase())).size,
    vidrios: subs.filter(tieneVidrio).length,
  }
}

const num = (t: string): number | null => {
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return t && Number.isFinite(n) ? n : null
}

/**
 * Las aberturas de la OP, de sus subelementos: uno por abertura o uno por vidrio ("V1 - Vidrio 1",
 * "V1 - Vidrio 2"); en las OP anteriores, una fila de observación y una por vidrio con el mismo
 * nombre. Se agrupan por modelo, en el orden del tablero.
 */
export function aberturasDeSubelementos(subs: SubelementoOrden[]): AberturaEditable[] {
  const porModelo = new Map<string, AberturaEditable>()
  for (const s of subs) {
    const modelo = modeloDeSubelemento(s.nombre).toUpperCase()
    let a = porModelo.get(modelo)
    if (!a) {
      a = { modelo, descripcion: '', color: '', ancho: '', alto: '', cantidad: null, observacion: '', vidrios: [] }
      porModelo.set(modelo, a)
    }
    const t = s.textos
    a.descripcion ||= t[COL_OBS.nombre] ?? ''
    a.color ||= t[COL_OBS.color] ?? ''
    a.ancho ||= t[COL_OBS.anchoAbertura] ?? ''
    a.alto ||= t[COL_OBS.altoAbertura] ?? ''
    a.cantidad ??= num(t[COL_OBS.cantidadAberturas] ?? '')
    a.observacion ||= t[COL_OBS.texto] ?? ''
    if (tieneVidrio(s)) {
      a.vidrios.push({
        comp1: t[COL_OBS.comp1] ?? '',
        camara: t[COL_OBS.camara] ?? '',
        comp2: t[COL_OBS.comp2] ?? '',
        ancho: t[COL_OBS.ancho] ?? '',
        alto: t[COL_OBS.alto] ?? '',
        cantidad: num(t[COL_OBS.cantidad] ?? ''),
      })
    }
  }
  return [...porModelo.values()]
}

/** Un subelemento copiado tal cual, de sus textos a los valores de Monday. */
function copiaDe(s: SubelementoOrden): FilaMonday {
  const t = s.textos
  const valores: Record<string, unknown> = {}
  if (t[COL_OBS.texto]) valores[COL_OBS.texto] = { text: t[COL_OBS.texto] }
  for (const c of [COL_OBS.nombre, COL_OBS.color, COL_OBS.anchoAbertura, COL_OBS.altoAbertura, COL_OBS.ancho, COL_OBS.alto]) {
    if (t[c]) valores[c] = t[c]
  }
  for (const c of [COL_OBS.cantidadAberturas, COL_OBS.cantidad]) {
    const n = num(t[c] ?? '')
    if (n != null) valores[c] = String(n)
  }
  for (const c of [COL_OBS.comp1, COL_OBS.camara, COL_OBS.comp2]) {
    if (t[c]) valores[c] = { labels: [t[c]] }
  }
  return { nombre: s.nombre, valores }
}

/** Las filas de una abertura editada: una por vidrio ("V1 - Vidrio 1"), con su observación. */
function filasDeModelo(m: ModeloListado, observacion: string): FilaMonday[] {
  const nombre = String(m.codigo ?? '').trim().toUpperCase()
  return filasDeSubelementos(
    [
      {
        nombre,
        texto: observacion,
        datos: {
          descripcion: m.descripcion,
          color: m.color ? m.color.toUpperCase() : null,
          ancho: m.ancho,
          alto: m.alto,
          cantidad: m.cantidad,
        },
      },
    ],
    m.vidrios.map((v) => ({
      modelo: nombre,
      ...partirTipoVidrio(v.tipo),
      ancho: v.ancho,
      alto: v.alto,
      /* El subelemento lleva el total a pedir: la línea por las aberturas del modelo. */
      cant: v.ud != null && m.cantidad != null ? v.ud * m.cantidad : v.ud,
    })),
  )
}

/**
 * Los subelementos de la OP nueva. Los de las aberturas no editadas se copian tal cual; los de cada
 * abertura editada se reemplazan, en su lugar, por las filas de su modelo nuevo (con la observación
 * que tenía). Una OP sin subelementos los arma todos desde los modelos.
 */
export function subelementosDeEdicion(
  viejos: SubelementoOrden[],
  modelos: ModeloListado[],
  editados: ModeloListado[],
  /** Las observaciones por abertura, como quedaron en el formulario (por modelo, en mayúsculas). */
  observaciones?: ReadonlyMap<string, string>,
): FilaMonday[] {
  const obsDe = (modelo: string, vieja: string) => {
    const clave = modelo.trim().toUpperCase()
    return observaciones?.has(clave) ? (observaciones.get(clave) ?? '') : vieja
  }
  if (!viejos.length) return modelos.flatMap((m) => filasDeModelo(m, obsDe(String(m.codigo ?? ''), '')))
  const filas: FilaMonday[] = []
  const hechos = new Set<ModeloListado>()
  /* La observación va en el primer subelemento de cada abertura. */
  const conObs = new Set<string>()
  for (const s of viejos) {
    const modelo = modeloDeSubelemento(s.nombre)
    const vieja =
      viejos.find((x) => mismaAbertura(modeloDeSubelemento(x.nombre), modelo) && x.textos[COL_OBS.texto])?.textos[COL_OBS.texto] ?? ''
    const editado = editados.find((m) => mismaAbertura(m.codigo, modelo))
    if (!editado) {
      const fila = copiaDe(s)
      const clave = modelo.toUpperCase()
      delete fila.valores[COL_OBS.texto]
      const texto = obsDe(modelo, vieja).trim()
      if (texto && !conObs.has(clave)) fila.valores[COL_OBS.texto] = { text: texto }
      conObs.add(clave)
      filas.push(fila)
      continue
    }
    if (hechos.has(editado)) continue
    hechos.add(editado)
    filas.push(...filasDeModelo(editado, obsDe(modelo, vieja)))
  }
  for (const m of editados) if (!hechos.has(m)) filas.push(...filasDeModelo(m, obsDe(String(m.codigo ?? ''), '')))
  return filas
}

/**
 * Las columnas que la OP nueva copia de la editada: sus datos (obra, número, medición, responsable,
 * vidrios, destinatarios, quién confirma) y su estado. La clave del enlace, el recordatorio y el link
 * se copian sólo si la nueva NO se envía (ver `reemplazarOrdenEditada`). Los estados de envío no se
 * copian nunca, ni los estados de registro de Make: los dispararían.
 */
const COLS_COPIA = [
  COL_OP.personas,
  COL_OP.obra,
  COL_OP.tipo,
  COL_OP.nroPvc,
  COL_OP.nroAluminio,
  COL_OP.medidoPor,
  COL_OP.fechaMedicion,
  COL_OP.confirmador,
  COL_OP.estadoVidrios,
  COL_OP.observacion,
  COL_OP.nOpHetmo,
  COL_OP.destinatarios,
  COL_OP.estado,
  COL_OP.clave,
  COL_OP.recordatorio,
  COL_OP.linkPdf,
]
const ESTADOS = new Set<string>([COL_OP.tipo, COL_OP.estadoVidrios])
const TEXTOS = new Set<string>([COL_OP.nroPvc, COL_OP.nroAluminio, COL_OP.medidoPor, COL_OP.nOpHetmo])

/** Las columnas de la OP editada, como valores para escribirlas en la nueva. */
async function columnasACopiar(
  ordenId: string,
): Promise<{
  valores: Record<string, unknown>
  /** La clave del enlace, el recordatorio y el link del envío anterior. */
  delEnvio: Record<string, unknown>
  obraId: string
  destinatarios: string[]
  clave: string
}> {
  const d = await mondayApi<{
    items: { column_values: { id: string; text: string | null; value: string | null; linked_item_ids?: string[] }[] }[]
  }>(
    `query ($id: [ID!]) { items(ids: $id) { column_values(ids: ${JSON.stringify(COLS_COPIA)}) { id text value ... on BoardRelationValue { linked_item_ids } } } }`,
    { id: [ordenId] },
  )
  const valores: Record<string, unknown> = {}
  const delEnvio: Record<string, unknown> = {}
  let obraId = ''
  let destinatarios: string[] = []
  let clave = ''
  for (const c of d.items[0]?.column_values ?? []) {
    const texto = (c.text ?? '').trim()
    let v: Record<string, unknown> = {}
    try {
      v = (JSON.parse(c.value ?? 'null') as Record<string, unknown> | null) ?? {}
    } catch {
      v = {}
    }
    if (c.id === COL_OP.obra || c.id === COL_OP.destinatarios) {
      const ids = (c.linked_item_ids ?? []).map(Number).filter(Boolean)
      if (ids.length) valores[c.id] = { item_ids: ids }
      if (c.id === COL_OP.obra) obraId = String(ids[0] ?? '')
      else destinatarios = ids.map(String)
    } else if (c.id === COL_OP.estado) {
      /* El estado, por índice: el nombre de la etiqueta cambia en el tablero, el índice no. */
      const indice = indiceDeValor(c.value) ?? indiceDeEtiqueta(texto)
      if (indice != null) valores[c.id] = { index: indice }
      else if (texto) valores[c.id] = { label: texto }
    } else if (c.id === COL_OP.clave) {
      clave = texto
      if (texto) delEnvio[c.id] = texto
    } else if (c.id === COL_OP.recordatorio) {
      if (v.date) delEnvio[c.id] = { date: v.date }
    } else if (c.id === COL_OP.linkPdf) {
      if (v.url) delEnvio[c.id] = { url: v.url, text: v.text ?? 'Ver Orden De Produccion' }
    } else if (ESTADOS.has(c.id)) {
      if (texto) valores[c.id] = { label: texto }
    } else if (TEXTOS.has(c.id)) {
      if (texto) valores[c.id] = texto
    } else if (c.id === COL_OP.personas) {
      if (Array.isArray(v.personsAndTeams) && v.personsAndTeams.length) valores[c.id] = { personsAndTeams: v.personsAndTeams }
    } else if (c.id === COL_OP.fechaMedicion) {
      if (v.date) valores[c.id] = { date: v.date }
    } else if (c.id === COL_OP.confirmador) {
      if (texto) valores[c.id] = { labels: [texto] }
    } else if (c.id === COL_OP.observacion) {
      if (texto) valores[c.id] = { text: texto }
    }
  }
  return { valores, delEnvio, obraId, destinatarios, clave }
}

/**
 * A quiénes se había enviado la OP (`🤖Destinatarios`), como roles: el ítem que es el constructor de
 * la obra es "Constructor"; cualquier otro, "Cliente". Son los destinatarios que el envío de la
 * orden editada trae elegidos de entrada.
 */
export async function destinatariosDeOrden(
  ordenId: string,
  constructorIds: readonly string[],
): Promise<('Cliente' | 'Constructor')[]> {
  const { destinatarios } = await columnasACopiar(ordenId)
  const roles = new Set<'Cliente' | 'Constructor'>()
  for (const id of destinatarios) roles.add(constructorIds.map(String).includes(id) ? 'Constructor' : 'Cliente')
  return (['Cliente', 'Constructor'] as const).filter((r) => roles.has(r))
}

export interface EntradaReemplazo {
  vieja: ResumenOrden
  nombreNuevo: string
  /**
   * La OP final nueva NO se envía: la nueva conserva la clave del enlace, el recordatorio y el link
   * de la anterior. Si se envía, el envío registra los suyos.
   */
  conservarEnvio: boolean
  /** Los PDF de `🤖OP OriginaL` de la nueva, en orden: los de la editada y, al final, el dibujo nuevo. */
  originales: File[]
  opFinal: File
  subelementos: FilaMonday[]
  motivo: string
  /** Los datos de la medición, como quedaron en el formulario de la edición. */
  medicion?: { medidoPor: string; fecha: string; observacion: string }
  /** Un reintento: la OP nueva que ya se creó. No se crea otra; se completa ésa. */
  existente?: string | null
  /** Apenas existe la nueva: para guardarla y que un reintento no cree otra. */
  onCreada?: (id: string) => void
  /** Cada paso, para la ventana de espera. */
  avance?: (texto: string) => void
}

const cambiar = (id: string, valores: Record<string, unknown>) =>
  mondayApi(
    `mutation ($id: ID!, $valores: JSON!) {
      change_multiple_column_values(board_id: ${BOARD_ORDENES}, item_id: $id, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { id, valores: JSON.stringify(valores) },
  )

/**
 * Reemplaza la OP editada: crea la nueva (mismos datos y estado, nombre con la versión), le sube los
 * documentos y los subelementos, la suma a la obra y RECIÉN AL FINAL cancela la anterior con el
 * motivo. Si algo falla antes, la anterior sigue viva: nunca queda la obra sin su OP.
 *
 * La clave del enlace se borra de la anterior: si la nueva no se envía, la conserva ella (el enlace
 * que ya tiene el cliente confirma la OP vigente); si se envía, sale con su propio enlace.
 */
export async function reemplazarOrdenEditada(e: EntradaReemplazo): Promise<string> {
  const avance = e.avance ?? (() => {})
  avance('Creando la orden nueva')
  const { valores, delEnvio, obraId, clave } = await columnasACopiar(e.vieja.id)
  let id = e.existente ?? ''
  if (!id) {
    const d = await mondayApi<{ create_item: { id: string } }>(
      `mutation ($nombre: String!) { create_item(board_id: ${BOARD_ORDENES}, item_name: $nombre) { id } }`,
      { nombre: e.nombreNuevo },
    )
    id = d.create_item.id
    e.onCreada?.(id)
  }
  const conVidrios = e.subelementos.some((f) => COLS_VIDRIO.some((c) => f.valores[c] != null))
  await cambiar(id, {
    ...valores,
    ...(e.medicion
      ? {
          [COL_OP.medidoPor]: e.medicion.medidoPor,
          [COL_OP.fechaMedicion]: e.medicion.fecha ? { date: e.medicion.fecha } : null,
          [COL_OP.observacion]: { text: e.medicion.observacion },
        }
      : {}),
    ...(e.conservarEnvio ? delEnvio : {}),
    [COL_OP.tieneVidrios]: conVidrios ? { checked: 'true' } : null,
  })

  avance('Subiendo los documentos')
  /* Un reintento reemplaza lo que haya quedado a medias. */
  await cambiar(id, { [COL_OP.etmo]: { clear_all: true }, [COL_OP.opFinal]: { clear_all: true } }).catch(() => {})
  for (const archivo of e.originales) await subirArchivo(id, COL_OP.etmo, archivo)
  await subirArchivo(id, COL_OP.opFinal, e.opFinal)

  /* Los subelementos se disparan y NO se esperan (en tandas, como al generar una OP de PVC): la OP
     ya quedó con sus datos y sus documentos. Un reintento borra antes los que hubieran quedado. */
  avance('Cargando las aberturas y sus vidrios')
  void (async () => {
    if (e.existente) {
      const previas = (await subelementosDeOrdenes([id]))[id] ?? []
      for (const s of previas) await mondayApi(`mutation ($id: ID!) { delete_item(item_id: $id) { id } }`, { id: s.id })
    }
    await insertarSubelementos(id, e.subelementos)
  })().catch((err) => console.warn('[editar] no se pudieron crear los subelementos de la OP nueva', err))
  if (obraId) await vincularOrdenEnObra(obraId, id).catch((err) => console.warn('[editar] no se pudo sumar la OP a la obra', err))

  avance('Cancelando la orden anterior')
  /* Sin quién la canceló: en una edición no hace falta ese dato. */
  await cancelarOrden(e.vieja.id, e.motivo, null)
  if (clave) {
    await cambiar(e.vieja.id, { [COL_OP.clave]: '' }).catch((err) => console.warn('[editar] no se pudo quitar la clave de la OP cancelada', err))
  }
  return id
}

/** Para los tests y el diagnóstico: el tablero de los subelementos. */
export const TABLERO_SUBELEMENTOS = BOARD_SUB_ORDENES
