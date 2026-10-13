/**
 * Lo que sigue a la confirmación de un presupuesto por el enlace de WhatsApp (regla del usuario,
 * 13/10/2026). Reemplaza a dos escenarios de Make:
 *  - "[TAP] Cuando el estado de un subelemento cambia a Confirmado -> Asignar tipo, color, presupuesto
 *    y total padre al item".
 *  - "[TAP] Cuando Se Crea Obra -> Crear Nuevo Item En Tablero "Obras"" (el botón ✋Crear Obra).
 *
 * Quien confirma sólo espera el paso 2 (el ítem); la constancia, la obra y la cuenta corriente siguen
 * en segundo plano (`enSegundoPlano`). En orden:
 *  1. La constancia: una actividad "Confirmacion Presupuesto Obra" en Emails & Activities del cliente
 *     (o del constructor, si la bolsa no tiene cliente), con lo mismo que decía el update.
 *  2. El ítem (la bolsa): tipo de carpintería, color, PDF y Total Pactado del presupuesto confirmado, y
 *     "Ganado". Si al subelemento le falta alguno, no se escribe nada en el ítem: el subelemento queda
 *     "Error de Confirmacion" con un update que dice qué falta.
 *  3. La obra, con los datos del ítem: cuenta corriente del cliente, constructor (o "SIN ARQUITECTO"),
 *     total, tipo, "Ganado/Aceptado/Anticipo" y el PDF; el ítem queda vinculado a ella y "Creado". Si
 *     falta un dato básico, o el ítem ya tenía una obra, no se crea: el ítem queda "Error Creacion" con
 *     un update que dice por qué. Del formulario del enlace (regla del usuario, 13/10/2026) toma:
 *     quién coordina (✋Coordinar Entrega, y su celular en ✋Cel a Coordinar) y la dirección de la obra
 *     (✋Ubicación Obra, ubicada en el mapa con `geocodificarNominatim`). ✋Asignado a: es quien creó la
 *     bolsa en la app (🤖Creado por).
 *  4. El registro de la obra en la cuenta corriente del cliente: lo que hacía la rama "Si aun no se
 *     registro" del escenario "[TAP] Cuando el estado cambia a Ganado -> Enviar A Cliente", en UNA
 *     mutation: el movimiento "Venta-Sin Fact" (con el saldo que dejó el último movimiento de la cuenta)
 *     y la obra "Registrado en Cta Cte". Después, el PDF del presupuesto en el movimiento.
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
  /** 🤖Creado por: el usuario de la app que creó la bolsa (la completa la app). */
  creadoPor: 'multiple_person_mm83jvyr',
} as const

const COL_CLIENTE = { cuentas: 'board_relation_mkt5f7n4', celular: 'phone_mksydcv6', ubicacion: 'location_mkt9ewya' } as const

export const COL_OBRA = {
  ctaCte: 'board_relation_mkthtd70',
  arquitecto: 'board_relation_mksz3v0h',
  /** ✋Coordinar Entrega: Cliente | Arquitecto | Constructor. */
  coordinarEntrega: 'color_mkszp1kw',
  celCoordinar: 'phone_mktkekah',
  ubicacion: 'location_mksz7r97',
  presupuestoAceptado: 'file_mktkp9dp',
  etapaVenta: 'deal_stage',
  etapaProduccion: 'color_mm1kddt0',
  tipo: 'color_mkw92ypr',
  total: 'deal_value',
  aceptacion: 'deal_expected_close_date',
  presupuestos: 'board_relation_mm1zmz3k',
  asignado: 'multiple_person_mktj4r09',
  idObra: 'pulse_id_mktm8dq9',
  /** 🤖 Validacion Registracion de Obra en cta cte. */
  validacionCtaCte: 'color_mm1z5tfm',
  /** 🤖Envio de Pres Final Aceptado. */
  envioPresFinal: 'date_mkv02q87',
} as const

/** Los movimientos de la cuenta corriente: subelementos de 🔄 Cuentas Corrientes Cliente (9617990698). */
export const COL_MOV = {
  movimiento: 'status',
  saldoInicial: 'numeric_mksekr2c',
  ventas: 'numeric_mkse7apk',
  cobros: 'numeric_mksegwwc',
  pdf: 'file_mktd8tc6',
  /** 🪟 Obras: de dos vías con 🤖Movimiento Cta Cte Cliente de la obra. */
  obras: 'board_relation_mm1z4t8n',
  /** Estado: el escenario lo deja en "Boton" (no se sabe para qué; se replica igual). */
  estado: 'color_mktkhpgs',
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
 * La dirección de la obra en el mapa
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface Punto {
  lat: string
  lng: string
}

/** Ubica en el mapa la dirección que escribió quien confirmó. `cerca`: la ubicación del cliente. */
export type Geocodificar = (texto: string, cerca: Punto | null) => Promise<Punto | null>

/**
 * Casi todos los clientes son de Tandil: una dirección sin ciudad ("Pujol 1147") se busca ahí. Sin
 * ciudad, la misma calle existe en varios lugares (La Matanza, Caballito, Tandil...).
 */
const CIUDAD_POR_DEFECTO = 'Tandil, Buenos Aires, Argentina'

/**
 * La dirección, con OpenStreetMap (Nominatim: sin clave; pide un User-Agent propio y no más de un
 * pedido por segundo, de sobra para esto). En orden: cerca del cliente (si tiene ubicación); si la
 * dirección no trae ciudad, en Tandil; si la trae, en todo el país. `null` si no se encuentra.
 */
export const geocodificarNominatim: Geocodificar = async (texto, cerca) => {
  const conCiudad = texto.includes(',')
  const base = { format: 'jsonv2', limit: '1', countrycodes: 'ar', 'accept-language': 'es' }
  const intentos: Record<string, string>[] = []
  if (cerca) {
    const lat = Number(cerca.lat)
    const lng = Number(cerca.lng)
    intentos.push({ ...base, q: texto, viewbox: `${lng - 0.25},${lat + 0.25},${lng + 0.25},${lat - 0.25}`, bounded: '1' })
  }
  intentos.push({ ...base, q: conCiudad ? `${texto}, Argentina` : `${texto}, ${CIUDAD_POR_DEFECTO}` })
  for (const q of intentos) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(q)}`, {
      headers: { 'user-agent': 'polifroni-app/1.0 (The Automation Partner)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) continue
    const [lugar] = (await r.json()) as { lat?: string; lon?: string }[]
    if (lugar?.lat && lugar.lon) return { lat: lugar.lat, lng: lugar.lon }
  }
  return null
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
  /** 🤖Creado por de la bolsa: personas y equipos, tal cual. */
  creadoPor: { id: number; kind: string }[]
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
      colsPadre: [COL_BOLSA.cliente, COL_BOLSA.arquitecto, COL_BOLSA.idPresupuesto, COL_BOLSA.obras, COL_BOLSA.creadoPor],
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
    creadoPor: personasDe(b[COL_BOLSA.creadoPor]),
  }
}

/** Las personas de una columna de persona (su `value`: `{"personsAndTeams":[{"id":1,"kind":"person"}]}`). */
function personasDe(c?: CV): { id: number; kind: string }[] {
  try {
    const v = JSON.parse(c?.value ?? 'null') as { personsAndTeams?: { id: number | string; kind?: string }[] } | null
    return (v?.personsAndTeams ?? []).map((x) => ({ id: Number(x.id), kind: x.kind ?? 'person' })).filter((x) => x.id > 0)
  } catch {
    return []
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

/** El ✋Cel-WHATSAPP de un contacto (la columna es la misma en Clientes y en Constructor/Arquitecto). */
async function celularDe(consulta: Consulta, id: string): Promise<string> {
  const d = await consulta<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { column_values(ids: $cols) { id text } } }`,
    { ids: [id], cols: [COL_CLIENTE.celular] },
  )
  return txt(d.items[0]?.column_values[0]).replace(/\D/g, '')
}

/** La obra que quedó vinculada a la bolsa (la columna es de dos vías: la crea la obra al nacer). */
async function obraVinculada(consulta: Consulta, bolsaId: string): Promise<string> {
  const d = await consulta<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { column_values(ids: $cols) { ${CAMPOS_CV} } } }`,
    { ids: [bolsaId], cols: [COL_BOLSA.obras] },
  )
  return vinculados(d.items[0]?.column_values[0])[0] ?? ''
}

/** El ID de la obra (IDOBRA-787) y si ya está registrada en la cuenta corriente. */
async function leerObra(consulta: Consulta, obraId: string): Promise<{ idObra: string; registrada: boolean }> {
  const d = await consulta<{ items: { column_values: CV[] }[] }>(
    `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { column_values(ids: $cols) { id text } } }`,
    { ids: [obraId], cols: [COL_OBRA.idObra, COL_OBRA.validacionCtaCte] },
  )
  const c = porId(d.items[0]?.column_values)
  return { idObra: txt(c[COL_OBRA.idObra]), registrada: txt(c[COL_OBRA.validacionCtaCte]) === 'Registrado en Cta Cte' }
}

/** Los movimientos de la cuenta, en el orden del tablero: el saldo del nuevo sale del último. */
async function movimientosDe(consulta: Consulta, cuentaId: string): Promise<{ saldoInicial: number; ventas: number; cobros: number }[]> {
  const d = await consulta<{ items: { subitems: { column_values: CV[] }[] | null }[] }>(
    `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { subitems { column_values(ids: $cols) { id text } } } }`,
    { ids: [cuentaId], cols: [COL_MOV.saldoInicial, COL_MOV.ventas, COL_MOV.cobros] },
  )
  return (d.items[0]?.subitems ?? []).map((s) => {
    const c = porId(s.column_values)
    return { saldoInicial: numeroDe(c[COL_MOV.saldoInicial]) ?? 0, ventas: numeroDe(c[COL_MOV.ventas]) ?? 0, cobros: numeroDe(c[COL_MOV.cobros]) ?? 0 }
  })
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

/**
 * El 🤖Saldo Inicial de un movimiento nuevo: el saldo final del último de la cuenta (su saldo inicial +
 * ventas − cobros), o 0 si es el primero. Es la fórmula del escenario de Make.
 */
export const saldoInicialNuevo = (movs: { saldoInicial: number; ventas: number; cobros: number }[]): number => {
  const u = movs[movs.length - 1]
  return u ? u.saldoInicial + u.ventas - u.cobros : 0
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

export const textoFalloObra = () =>
  `<p>⚠️ <b>Error al crear la obra</b> ⚠️</p>` +
  `<p>Monday no respondió al crear la obra del presupuesto confirmado. Revisá el tablero de Obras y, si no está, creala a mano.</p>`

export const textoSinCtaCte = () =>
  `<p>⚠️ <b>Error al registrar la obra en la cuenta corriente</b> ⚠️</p>` +
  `<p>La obra se creó, pero no se pudo registrar su venta en la cuenta corriente del cliente. Revisá la cuenta antes de registrarla a mano, para no duplicar el movimiento.</p>`

export const textoSinUbicacion = (ubicacion: string) =>
  `<p>📍 <b>Ubicación de la obra sin cargar</b></p>` +
  `<p>Quien confirmó el presupuesto indicó la dirección <b>${ubicacion.replace(/[<>&"]/g, '')}</b>, pero no se pudo ubicar en el mapa. Cargala a mano en ✋Ubicación Obra.</p>`

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
    ubicacion = '',
    coordinador = null,
    cuando = new Date(),
  }: {
    subId: string
    /** El título de la actividad. */
    titulo: string
    /** El HTML de la actividad: el mismo que tenía el update. */
    contenido: string
    /** La dirección de la obra que escribió quien confirmó. */
    ubicacion?: string
    /** Quién coordina la obra, según el formulario. */
    coordinador?: 'Cliente' | 'Arquitecto' | null
    cuando?: Date
  },
  consulta: Consulta,
  archivos: Archivos = archivosMonday(consulta),
  geocodificar: Geocodificar = geocodificarNominatim,
  /**
   * Dónde corre lo que sigue a los datos del ítem (constancia, obra, cuenta corriente). Con él, esta
   * función vuelve apenas el ítem quedó completo; sin él, espera todo (los tests).
   */
  enSegundoPlano?: (tarea: Promise<void>) => void,
): Promise<void> {
  const escribir = (board: number, id: string, valores: Record<string, unknown>, crear = false) =>
    consulta(mutacionColumnas, { board: String(board), id, valores: JSON.stringify(valores), crear }, { escritura: true })
  const update = (id: string, cuerpo: string) =>
    consulta(`mutation ($id: ID!, $cuerpo: String!) { create_update(item_id: $id, body: $cuerpo) { id } }`, { id, cuerpo }, { escritura: true })
  /** Lo que sigue a crear la obra va por separado y con un reintento: si algo falla, lo demás se hace igual. */
  const intentar = async (que: string, f: () => Promise<unknown>) => {
    for (let vez = 1; vez <= 2; vez++) {
      try {
        await f()
        return
      } catch (e) {
        if (vez === 2) console.warn(`[confirmar] no se pudo ${que}`, e)
      }
    }
  }

  const p = await leerConfirmado(consulta, subId)
  if (!p) throw new Error(`no se encontró el presupuesto ${subId} ni su ítem en el tablero`)

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

  /* Lo de acá en adelante NO lo espera quien confirmó (regla del usuario, 13/10/2026): la constancia,
     la obra y la cuenta corriente siguen después de responderle (`enSegundoPlano`). */
  const despues = async (): Promise<void> => {
    /* La constancia en el cliente (o en el constructor). */
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
    /* Quién coordina, y su celular: el del arquitecto si lo eligieron a él (y es uno de verdad). */
    const coordinaArquitecto = coordinador === 'Arquitecto' && !!p.arquitectoId && p.arquitectoId !== SIN_ARQUITECTO_ID
    if (coordinador) v[COL_OBRA.coordinarEntrega] = { label: coordinador }
    const celular = coordinaArquitecto ? await celularDe(consulta, p.arquitectoId).catch(() => '') : cliente.celular
    if (celular) v[COL_OBRA.celCoordinar] = { phone: celular, countryShortName: 'AR' }
    /* La dirección que escribió quien confirmó, en el mapa. Sin dirección (un enlace viejo), la del cliente. */
    const direccion = ubicacion.trim()
    const punto = direccion
      ? await geocodificar(direccion, cliente.ubicacion).catch((e) => {
          console.warn('[confirmar] no se pudo ubicar la dirección de la obra', e)
          return null
        })
      : null
    if (p.creadoPor.length) v[COL_OBRA.asignado] = { personsAndTeams: p.creadoPor }
    if (punto) v[COL_OBRA.ubicacion] = { ...punto, address: direccion }
    else if (!direccion && cliente.ubicacion) v[COL_OBRA.ubicacion] = cliente.ubicacion

    let obraId: string
    try {
      const d = await consulta<{ create_item: { id: string } }>(
        `mutation ($nombre: String!, $valores: JSON!) {
          create_item(board_id: ${BOARD_OBRAS}, group_id: "${GRUPO_OBRAS}", item_name: $nombre, column_values: $valores, create_labels_if_missing: false) { id }
        }`,
        { nombre: p.bolsaNombre, valores: JSON.stringify(v) },
        { escritura: true },
      )
      obraId = String(d.create_item.id)
    } catch (e) {
      /* Monday a veces responde con error aunque la obra SÍ se creó (el tablero tiene columnas
         conectadas): antes de darla por fallida se mira si quedó vinculada a la bolsa. */
      obraId = await obraVinculada(consulta, p.bolsaId).catch(() => '')
      if (!obraId) {
        await intentar('marcar el error de creación', () => escribir(BOARD_PRESUPUESTOS, p.bolsaId, { [COL_BOLSA.creacionObra]: { index: INDICE.errorCreacion } }))
        await intentar('avisar el error de creación', () => update(p.bolsaId, textoFalloObra()))
        throw e
      }
      console.warn('[confirmar] Monday respondió con error al crear la obra, pero quedó creada', obraId, e)
    }

    /* Cada cosa por su lado: que falle una no frena las otras. El vínculo bolsa → obra NO se escribe: la
       relación es de dos vías y de un solo ítem; la obra ya lo dejó al nacer (✋🤖Presupuestos), y
       volver a escribirlo desde la bolsa Monday lo rechaza (ColumnValueException) y se perdía "Creado". */
    await intentar('marcar la obra como creada', () =>
      escribir(BOARD_PRESUPUESTOS, p.bolsaId, { [COL_BOLSA.creacionObra]: { index: INDICE.creado } }),
    )
    for (const pdf of pdfs) await intentar('subir el PDF a la obra', () => archivos.subir(obraId, COL_OBRA.presupuestoAceptado, pdf))
    if (direccion && !punto) await intentar('avisar la ubicación sin cargar', () => update(obraId, textoSinUbicacion(direccion)))

    /* 4. El registro en la cuenta corriente. Sin reintento: si Monday falla a mitad, repetirlo podría
       duplicar el movimiento; queda un update en la obra para revisarlo. */
    try {
      const obra = await leerObra(consulta, obraId)
      if (obra.registrada) return
      const hoy = hoyAr(cuando)
      const d = await consulta<{ mov: { id: string } }>(
        `mutation ($cuenta: ID!, $nombre: String!, $mov: JSON!, $obra: ID!, $valoresObra: JSON!) {
          mov: create_subitem(parent_item_id: $cuenta, item_name: $nombre, column_values: $mov, create_labels_if_missing: false) { id }
          obra: change_multiple_column_values(board_id: ${BOARD_OBRAS}, item_id: $obra, column_values: $valoresObra, create_labels_if_missing: false) { id }
        }`,
        {
          cuenta: cliente.cuentaId,
          nombre: [obra.idObra, p.bolsaNombre].filter(Boolean).join(' - '),
          mov: JSON.stringify({
            [COL_MOV.movimiento]: { label: 'Venta-Sin Fact' },
            [COL_MOV.saldoInicial]: String(saldoInicialNuevo(await movimientosDe(consulta, cliente.cuentaId))),
            [COL_MOV.ventas]: String(p.total),
            [COL_MOV.estado]: { label: 'Boton' },
            /* De dos vías: la obra queda vinculada a su movimiento sin otra escritura. */
            [COL_MOV.obras]: { item_ids: [Number(obraId)] },
          }),
          obra: obraId,
          valoresObra: JSON.stringify({
            [COL_OBRA.envioPresFinal]: { date: hoy },
            [COL_OBRA.validacionCtaCte]: { label: 'Registrado en Cta Cte' },
            [COL_OBRA.aceptacion]: { date: hoy },
          }),
        },
        { escritura: true },
      )
      const movId = String(d.mov.id)
      for (const pdf of pdfs) await intentar('subir el PDF al movimiento', () => archivos.subir(movId, COL_MOV.pdf, pdf))
    } catch (e) {
      console.warn('[confirmar] no se pudo registrar la obra en la cuenta corriente', e)
      await intentar('avisar el registro sin hacer', () => update(obraId, textoSinCtaCte()))
    }
  }

  if (enSegundoPlano) enSegundoPlano(despues().catch((e) => console.warn('[confirmar] falló lo que sigue a la confirmación', e)))
  else await despues()
}
