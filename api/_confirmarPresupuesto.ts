/**
 * Lo que sigue a la confirmación de un presupuesto por el enlace de WhatsApp (regla del usuario,
 * 13/10/2026). Reemplaza a dos escenarios de Make:
 *  - "[TAP] Cuando el estado de un subelemento cambia a Confirmado -> Asignar tipo, color, presupuesto
 *    y total padre al item".
 *  - "[TAP] Cuando Se Crea Obra -> Crear Nuevo Item En Tablero "Obras"" (el botón ✋Crear Obra).
 *
 * En orden:
 *  1. La constancia: una actividad "Confirmacion Presupuesto Obra" en Emails & Activities del cliente
 *     (o del constructor, si la bolsa no tiene cliente), con lo mismo que decía el update.
 *  2. El ítem (la bolsa): tipo de carpintería, color, PDF y Total Pactado del presupuesto confirmado, y
 *     "Ganado". Si al subelemento le falta alguno, no se escribe nada en el ítem: el subelemento queda
 *     "Error de Confirmacion" con un update que dice qué falta.
 *  3. La obra, con los datos del ítem: cuenta corriente del cliente, constructor (o "SIN ARQUITECTO"),
 *     total, tipo, "Ganado/Aceptado/Anticipo" y el PDF; el ítem queda vinculado a ella y "Creado". Si
 *     falta un dato básico, o el ítem ya tenía una obra, no se crea: el ítem queda "Error Creacion" con
 *     un update que dice por qué.
 *
 * Todo esto es posterior a la respuesta, que ya quedó escrita: si algo falla se registra en el log y
 * la confirmación del cliente vale igual.
 */
import type { Consulta } from './_confirmarMonday.js'

/* ────────────────────────────────────────────────────────────────────────────────
 * Tableros y columnas
 * ──────────────────────────────────────────────────────────────────────────────── */

const BOARD_PRESUPUESTOS = 9984126961
const BOARD_SUB_PRESUPUESTOS = 9984270591
const BOARD_OBRAS = 9617181553
/** El grupo "Obras" del tablero de obras. */
const GRUPO_OBRAS = 'closed'
const BOARD_CUENTAS_ACTIVAS = 9617990272

/** La actividad personalizada "Confirmacion Presupuesto Obra" (creada el 13/10/2026). */
export const ACTIVIDAD_CONFIRMACION_PRESUPUESTO = '2d7f3b88-04ca-410d-922c-333264e77c6c'

export const COL_SUB = {
  tipo: 'dropdown_mkvgn9kx',
  color: 'dropdown_mkvgvy84',
  total: 'numeric_mm836j1t',
  pdf: 'file_mkvg4p64',
  /** 🤖 Estado de Confirmacion. */
  confirmacion: 'color_mm0dsv6p',
} as const

export const COL_BOLSA = {
  cliente: 'board_relation_mkvgt8r',
  arquitecto: 'board_relation_mkvgk8yb',
  idPresupuesto: 'pulse_id_mkvgv9tn',
  /** 🤖Estado Presupuesto. */
  estado: 'color_mkvg6w7v',
  tipo: 'dropdown_mkvgj7nt',
  color: 'dropdown_mkvgb6sb',
  /** 🤖 Presup Final pdf. */
  pdf: 'file_mkvg36ph',
  total: 'numeric_mkvgy282',
  /** 🤖Estado Creacion de la Obra. */
  creacionObra: 'color_mkvgdrvv',
  obras: 'board_relation_mm1z59qx',
} as const

const COL_CLIENTE = { cuentas: 'board_relation_mkt5f7n4', celular: 'phone_mksydcv6', ubicacion: 'location_mkt9ewya' } as const

export const COL_OBRA = {
  ctaCte: 'board_relation_mkthtd70',
  arquitecto: 'board_relation_mksz3v0h',
  celCoordinar: 'phone_mktkekah',
  ubicacion: 'location_mksz7r97',
  presupuestoAceptado: 'file_mktkp9dp',
  etapaVenta: 'deal_stage',
  etapaProduccion: 'color_mm1kddt0',
  tipo: 'color_mkw92ypr',
  total: 'deal_value',
  aceptacion: 'deal_expected_close_date',
  presupuestos: 'board_relation_mm1zmz3k',
} as const

/** Las etiquetas, por índice (su nombre puede cambiar en el tablero). */
export const INDICE = {
  /** 🤖Estado Presupuesto: Ganado. */
  ganado: 0,
  /** 🤖 Estado de Confirmacion: Error de Confirmacion. */
  errorConfirmacion: 2,
  /** 🤖Estado Creacion de la Obra: Error Creacion | Creado. */
  errorCreacion: 2,
  creado: 3,
  /** ✋Etapa de Venta de la obra: Ganado/Aceptado/Anticipo. */
  obraGanada: 1,
} as const

/** El ítem comodín "SIN ARQUITECTO" de 👤 Constructor/Arquitecto. */
const SIN_ARQUITECTO_ID = '10910009068'

/* ────────────────────────────────────────────────────────────────────────────────
 * Archivos: Monday no copia archivos entre columnas, se bajan y se vuelven a subir
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface Archivo {
  nombre: string
  datos: Blob
}

export interface Archivos {
  bajar(assetId: string): Promise<Archivo>
  subir(itemId: string, columna: string, archivo: Archivo): Promise<void>
}

/** Bajar y subir contra Monday, con el token del servidor. */
export function archivosMonday(consulta: Consulta): Archivos {
  return {
    async bajar(assetId) {
      const d = await consulta<{ assets: { name: string; public_url: string }[] }>(
        `query ($ids: [ID!]!) { assets(ids: $ids) { name public_url } }`,
        { ids: [assetId] },
      )
      const a = d.assets[0]
      if (!a?.public_url) throw new Error(`el archivo ${assetId} no tiene URL`)
      const r = await fetch(a.public_url)
      if (!r.ok) throw new Error(`no se pudo bajar el archivo ${assetId} (HTTP ${r.status})`)
      return { nombre: a.name || 'Presupuesto.pdf', datos: await r.blob() }
    },
    async subir(itemId, columna, archivo) {
      const token = (process.env.MONDAY_TOKEN ?? process.env.MONDAY_API_TOKEN)?.trim()
      if (!token) throw new Error('falta MONDAY_TOKEN')
      const form = new FormData()
      form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${Number(itemId)}, column_id: "${columna}", file: $file) { id } }`)
      form.append('variables[file]', archivo.datos, archivo.nombre)
      const r = await fetch('https://api.monday.com/v2/file', {
        method: 'POST',
        headers: { Authorization: token, 'API-Version': '2024-10' },
        body: form,
      })
      const json = (await r.json().catch(() => ({}))) as { errors?: { message: string }[] }
      if (!r.ok || json.errors?.length) throw new Error(`no se pudo subir el archivo: ${json.errors?.[0]?.message ?? `HTTP ${r.status}`}`)
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Lectura
 * ──────────────────────────────────────────────────────────────────────────────── */

interface CV {
  id: string
  text: string | null
  value?: string | null
  display_value?: string
  linked_item_ids?: string[]
  linked_items?: { id: string; state: string; board: { id: string } }[]
}

const porId = (cvs: CV[] = []) => Object.fromEntries(cvs.map((c) => [c.id, c])) as Record<string, CV | undefined>
const txt = (c?: CV) => (c?.text ?? '').trim()
const vinculados = (c?: CV) => (c?.linked_item_ids ?? []).map(String)
const CAMPOS_CV = `id text value ... on BoardRelationValue { display_value linked_item_ids }`

/** Los archivos de una columna de archivos (su `value`: `{"files":[{"assetId":…,"name":…}]}`). */
function archivosDe(c?: CV): string[] {
  try {
    const v = JSON.parse(c?.value ?? 'null') as { files?: { assetId?: number | string }[] } | null
    return (v?.files ?? []).map((f) => String(f.assetId ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

/** Un importe de una columna de números: `null` si está vacía o no es un número. */
function numeroDe(c?: CV): number | null {
  const t = txt(c)
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** El presupuesto confirmado (subelemento) y su bolsa, con lo que hace falta para los tres pasos. */
export interface Confirmado {
  subId: string
  subNombre: string
  tipo: string
  color: string
  total: number | null
  pdfs: string[]
  bolsaId: string
  bolsaNombre: string
  idPresupuesto: string
  clienteId: string
  arquitectoId: string
  /** La bolsa ya tenía una obra creada. */
  obraPrevia: boolean
}

export async function leerConfirmado(consulta: Consulta, subId: string): Promise<Confirmado | null> {
  const d = await consulta<{
    items: { id: string; name: string; column_values: CV[]; parent_item: { id: string; name: string; column_values: CV[] } | null }[]
  }>(
    `query ($ids: [ID!], $cols: [String!], $colsPadre: [String!]) {
      items(ids: $ids) {
        id name column_values(ids: $cols) { ${CAMPOS_CV} }
        parent_item { id name column_values(ids: $colsPadre) { ${CAMPOS_CV} } }
      }
    }`,
    {
      ids: [subId],
      cols: [COL_SUB.tipo, COL_SUB.color, COL_SUB.total, COL_SUB.pdf],
      colsPadre: [COL_BOLSA.cliente, COL_BOLSA.arquitecto, COL_BOLSA.idPresupuesto, COL_BOLSA.obras],
    },
  )
  const i = d.items[0]
  if (!i?.parent_item) return null
  const c = porId(i.column_values)
  const b = porId(i.parent_item.column_values)
  return {
    subId: String(i.id),
    subNombre: i.name,
    tipo: txt(c[COL_SUB.tipo]),
    color: txt(c[COL_SUB.color]),
    total: numeroDe(c[COL_SUB.total]),
    pdfs: archivosDe(c[COL_SUB.pdf]),
    bolsaId: String(i.parent_item.id),
    bolsaNombre: i.parent_item.name,
    idPresupuesto: txt(b[COL_BOLSA.idPresupuesto]),
    clienteId: vinculados(b[COL_BOLSA.cliente])[0] ?? '',
    arquitectoId: vinculados(b[COL_BOLSA.arquitecto])[0] ?? '',
    obraPrevia: vinculados(b[COL_BOLSA.obras]).length > 0,
  }
}

/** Lo que la obra toma del cliente: su cuenta corriente activa, su celular y su ubicación. */
interface DatosCliente {
  cuentaId: string
  celular: string
  ubicacion: { lat: string; lng: string; address: string } | null
}

async function leerCliente(consulta: Consulta, clienteId: string): Promise<DatosCliente> {
  const d = await consulta<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!], $cols: [String!]) {
      items(ids: $ids) {
        column_values(ids: $cols) { id text value ... on BoardRelationValue { linked_items { id state board { id } } } }
      }
    }`,
    { ids: [clienteId], cols: Object.values(COL_CLIENTE) },
  )
  const c = porId(d.items[0]?.column_values)
  /* Sólo las cuentas activas: las dadas de baja viven en ARCHIVADOS. */
  const cuenta = (c[COL_CLIENTE.cuentas]?.linked_items ?? []).find(
    (x) => x.state === 'active' && String(x.board.id) === String(BOARD_CUENTAS_ACTIVAS),
  )
  let ubicacion: DatosCliente['ubicacion'] = null
  try {
    const v = JSON.parse(c[COL_CLIENTE.ubicacion]?.value ?? 'null') as { lat?: string | number; lng?: string | number; address?: string } | null
    if (v?.lat != null && v.lng != null) ubicacion = { lat: String(v.lat), lng: String(v.lng), address: v.address ?? '' }
  } catch {
    /* Sin ubicación: la obra se crea sin ella. */
  }
  return { cuentaId: cuenta ? String(cuenta.id) : '', celular: txt(c[COL_CLIENTE.celular]).replace(/\D/g, ''), ubicacion }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Reglas (sin Monday)
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Lo que el presupuesto confirmado tiene que traer para pasarlo al ítem, con si está o no. */
export function datosConfirmacion(p: Confirmado): { nombre: string; ok: boolean }[] {
  return [
    { nombre: 'Tipo de Carpintería', ok: !!p.tipo },
    { nombre: 'Color', ok: !!p.color },
    { nombre: 'Presupuesto pdf', ok: p.pdfs.length > 0 },
    { nombre: 'Total Pactado', ok: p.total !== null && p.total > 0 },
  ]
}

/** Lo básico para crear la obra: los datos del ítem, el cliente y su cuenta corriente. */
export function datosObra(p: Confirmado, cuentaId: string): { nombre: string; ok: boolean }[] {
  return [
    ...datosConfirmacion(p).map((d) => (d.nombre === 'Presupuesto pdf' ? { ...d, nombre: 'Presup Final pdf' } : d)),
    { nombre: 'Cliente', ok: !!p.clienteId },
    { nombre: 'Cuenta corriente del cliente', ok: !!cuentaId },
  ]
}

/** El ✋Tipo de la obra: PVC o Aluminio (los aluminios del tablero son varios: "Alumino", "Aluminio A30New"...). */
export const tipoObraDe = (tipo: string): string => (!tipo.trim() ? '' : /pvc/i.test(tipo) ? 'PVC' : 'Aluminio')

const lista = (datos: { nombre: string; ok: boolean }[]) => datos.map((d) => `${d.ok ? '✅' : '❌'} ${d.nombre}`).join('<br>')

export const textoErrorConfirmacion = (p: Confirmado, datos: { nombre: string; ok: boolean }[]) =>
  `<p>⚠️ <b>Error al confirmar el presupuesto</b> ⚠️</p>` +
  `<p>El presupuesto ${p.subNombre} se confirmó, pero sus datos no se pasaron al presupuesto (ni se marcó Ganado) porque le falta lo marcado con ❌:</p>` +
  `<p>${lista(datos)}</p>`

export const textoErrorObra = (datos: { nombre: string; ok: boolean }[]) =>
  `<p>⚠️ <b>Error al crear la obra</b> ⚠️</p>` +
  `<p>No se creó la obra porque falta lo marcado con ❌:</p>` +
  `<p>${lista(datos)}</p>`

export const textoObraPrevia = (p: Confirmado) =>
  `<p>⚠️ <b>Error al crear la obra</b> ⚠️</p>` +
  `<p>Ya se creó una obra para el presupuesto <b>${p.idPresupuesto || p.bolsaNombre}</b>: no se crea otra. Para emitir una obra nueva, creá un presupuesto nuevo para el cliente.</p>`

/** La fecha de hoy en Argentina (`YYYY-MM-DD`). */
const hoyAr = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/* ────────────────────────────────────────────────────────────────────────────────
 * Los tres pasos
 * ──────────────────────────────────────────────────────────────────────────────── */

const mutacionColumnas = `mutation ($board: ID!, $id: ID!, $valores: JSON!, $crear: Boolean) {
  change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores, create_labels_if_missing: $crear) { id }
}`

export async function completarConfirmacion(
  {
    subId,
    titulo,
    contenido,
    cuando = new Date(),
  }: {
    subId: string
    /** El título de la actividad. */
    titulo: string
    /** El HTML de la actividad: el mismo que tenía el update. */
    contenido: string
    cuando?: Date
  },
  consulta: Consulta,
  archivos: Archivos = archivosMonday(consulta),
): Promise<void> {
  const escribir = (board: number, id: string, valores: Record<string, unknown>, crear = false) =>
    consulta(mutacionColumnas, { board: String(board), id, valores: JSON.stringify(valores), crear }, { escritura: true })
  const update = (id: string, cuerpo: string) =>
    consulta(`mutation ($id: ID!, $cuerpo: String!) { create_update(item_id: $id, body: $cuerpo) { id } }`, { id, cuerpo }, { escritura: true })

  const p = await leerConfirmado(consulta, subId)
  if (!p) throw new Error(`no se encontró el presupuesto ${subId} ni su bolsa`)

  /* 1. La constancia en el cliente (o en el constructor). */
  const contactoId = p.clienteId || p.arquitectoId
  if (contactoId) {
    await consulta(
      `mutation ($item: ID!, $actividad: String!, $titulo: String!, $content: String, $cuando: ISO8601DateTime!) {
        create_timeline_item(item_id: $item, custom_activity_id: $actividad, title: $titulo, content: $content, timestamp: $cuando) { id }
      }`,
      {
        item: contactoId,
        actividad: ACTIVIDAD_CONFIRMACION_PRESUPUESTO,
        titulo,
        content: contenido,
        cuando: cuando.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
      { escritura: true },
    ).catch((e) => console.warn('[confirmar] no se pudo registrar la actividad de la confirmación', e))
  }

  /* 2. El ítem, con los datos del presupuesto confirmado. */
  const datos = datosConfirmacion(p)
  const completo = datos.every((d) => d.ok)
  /* Los PDF se bajan antes de escribir nada: si no se pueden bajar, el ítem queda como estaba. */
  const pdfs = completo ? await Promise.all(p.pdfs.map((id) => archivos.bajar(id))) : []
  if (!completo) {
    await escribir(BOARD_SUB_PRESUPUESTOS, p.subId, { [COL_SUB.confirmacion]: { index: INDICE.errorConfirmacion } })
    await update(p.subId, textoErrorConfirmacion(p, datos))
  } else {
    /* Los dropdowns del ítem tienen etiquetas propias: si la del subelemento no está, se crea (como el
       escenario de Make). */
    await escribir(
      BOARD_PRESUPUESTOS,
      p.bolsaId,
      {
        [COL_BOLSA.tipo]: { labels: [p.tipo] },
        [COL_BOLSA.color]: { labels: [p.color] },
        [COL_BOLSA.total]: String(p.total),
        [COL_BOLSA.estado]: { index: INDICE.ganado },
        [COL_BOLSA.pdf]: { clear_all: true },
      },
      true,
    )
  }
  for (const pdf of pdfs) await archivos.subir(p.bolsaId, COL_BOLSA.pdf, pdf)

  /* 3. La obra. */
  if (p.obraPrevia) {
    await escribir(BOARD_PRESUPUESTOS, p.bolsaId, { [COL_BOLSA.creacionObra]: { index: INDICE.errorCreacion } })
    await update(p.bolsaId, textoObraPrevia(p))
    return
  }
  const cliente = p.clienteId ? await leerCliente(consulta, p.clienteId) : { cuentaId: '', celular: '', ubicacion: null }
  const basicos = datosObra(p, cliente.cuentaId)
  if (basicos.some((d) => !d.ok)) {
    await escribir(BOARD_PRESUPUESTOS, p.bolsaId, { [COL_BOLSA.creacionObra]: { index: INDICE.errorCreacion } })
    await update(p.bolsaId, textoErrorObra(basicos))
    return
  }

  const v: Record<string, unknown> = {
    [COL_OBRA.ctaCte]: { item_ids: [Number(cliente.cuentaId)] },
    [COL_OBRA.arquitecto]: { item_ids: [Number(p.arquitectoId || SIN_ARQUITECTO_ID)] },
    [COL_OBRA.etapaVenta]: { index: INDICE.obraGanada },
    [COL_OBRA.etapaProduccion]: { label: 'A Medir' },
    [COL_OBRA.total]: String(p.total),
    [COL_OBRA.aceptacion]: { date: hoyAr(cuando) },
    [COL_OBRA.presupuestos]: { item_ids: [Number(p.bolsaId)] },
    [COL_OBRA.tipo]: { label: tipoObraDe(p.tipo) },
  }
  if (cliente.celular) v[COL_OBRA.celCoordinar] = { phone: cliente.celular, countryShortName: 'AR' }
  if (cliente.ubicacion) v[COL_OBRA.ubicacion] = cliente.ubicacion
  const d = await consulta<{ create_item: { id: string } }>(
    `mutation ($nombre: String!, $valores: JSON!) {
      create_item(board_id: ${BOARD_OBRAS}, group_id: "${GRUPO_OBRAS}", item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
    }`,
    { nombre: p.bolsaNombre, valores: JSON.stringify(v) },
    { escritura: true },
  )
  const obraId = String(d.create_item.id)
  /* El vínculo y "Creado" van antes que los archivos: si la subida falla, igual no se crea otra obra. */
  await escribir(BOARD_PRESUPUESTOS, p.bolsaId, {
    [COL_BOLSA.obras]: { item_ids: [Number(obraId)] },
    [COL_BOLSA.creacionObra]: { index: INDICE.creado },
  })
  for (const pdf of pdfs) await archivos.subir(obraId, COL_OBRA.presupuestoAceptado, pdf)
}
