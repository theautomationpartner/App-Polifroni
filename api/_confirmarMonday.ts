/**
 * Lo que `/confirmar` lee y escribe en Monday, con el token del SERVIDOR. El ítem se busca por la
 * clave del enlace (`🤖Clave Confirmacion`), nunca por un id que mande el navegador: un enlace sólo
 * puede responder por el documento con que salió.
 *
 *  - OP:          🏭 Orden de Produccion (18432207111), la OP cuya `🤖Clave Confirmacion` es la clave.
 *  - Presupuesto: el SUBELEMENTO de 📄 Presupuestos (9984270591) con esa clave.
 *
 * Las reglas (qué estado admite una respuesta, qué se exige en cada una) no hablan con Monday y están
 * probadas en `tests/confirmar.test.ts`.
 */
import { formasDeClave, type DocumentoConfirmacion, type RolConfirmacion } from './_confirmacion.js'
import { mondayServidor } from './_mondayApi.js'

/** Hace la consulta. Por defecto, Monday con el token del servidor; los tests pasan otra. */
export type Consulta = <T>(query: string, variables: Record<string, unknown>, opciones?: { escritura?: boolean }) => Promise<T>

const consultaMonday: Consulta = (q, v, o) => mondayServidor(q, v, o)

/* ────────────────────────────────────────────────────────────────────────────────
 * Tableros y columnas
 * ──────────────────────────────────────────────────────────────────────────────── */

export const BOARD_ORDENES = 18432207111
const BOARD_OBRAS = 9617181553
export const BOARD_SUB_PRESUPUESTOS = 9984270591

export const COL_OP = {
  /** 🤖Clave Confirmacion (text). */
  clave: 'text_mm7wqqm2',
  estado: 'color_mm7g3ta4',
  tipo: 'color_mm7gbz9q',
  nroPvc: 'numeric_mm7ep0eq',
  nroAluminio: 'text_mm7gjg24',
  obra: 'board_relation_mm7e604m',
} as const

/** 🚫Confirmacion Op Cliente de la obra: la app la deja en "Pend de Confirmar" al enviar. */
const COL_OBRA_CONFIRMACION = 'color_mm73rxg7'

export const COL_SUB_PRES = {
  /** 🤖Clave Confirmacion (text). */
  clave: 'text_mm7wn1jz',
  /** 🤖 Estado de Confirmacion (status): Confirmado | Rechazado. */
  confirmacion: 'color_mm0dsv6p',
  /** 🤖Motivo (text). */
  motivo: 'text_mm7wmv13',
  tipo: 'dropdown_mkvgn9kx',
  color: 'dropdown_mkvgvy84',
} as const

/** Las etiquetas, tal cual están en los tableros. */
export const ETIQUETAS = {
  op: {
    /* Renombrada en el tablero el 06/10/2026: el nombre de antes se sigue aceptando al leer. */
    pendiente: 'Generada y Enviada Pend Confirmar',
    pendienteAnterior: 'Enviada Pend Confirmar',
    confirmada: 'Confirmada',
    /* No existe todavía en `🤖Estado OP`: se crea la primera vez (`create_labels_if_missing`), como
       hace la app con "Enviada a Taller" y "Cancelada". */
    rechazada: 'NO Confirmado',
  },
  obra: { confirmada: 'CONFIRMADO OP', rechazada: 'NO CONFIRMADO' },
  presupuesto: { confirmada: 'Confirmado', rechazada: 'Rechazado' },
} as const

/* ────────────────────────────────────────────────────────────────────────────────
 * Reglas
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Si el documento todavía espera la respuesta, y si no, por qué.
 *  - `pendiente`: se muestra el formulario.
 *  - `confirmada`: ya se confirmó. En la OP también cuenta si ya siguió adelante con esa confirmación
 *    (enviada al taller, producción completada): se muestra la pantalla de "¡Confirmamos tu pedido!".
 *  - `rechazada`: ya se pidió una revisión; se muestra "Recibimos tu observación".
 *  - `cancelada`: la OP se canceló (en general, para emitir una corregida).
 *  - `sinEnviar`: la OP todavía no se envió a confirmar (no debería pasar con un enlace real).
 */
export type SituacionRespuesta = 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada' | 'sinEnviar'

/** Las etiquetas de `🤖Estado OP` de una orden que ya pasó la confirmación del cliente. */
const OP_YA_CONFIRMADA: readonly string[] = [ETIQUETAS.op.confirmada, 'Enviada a Taller', 'Produccion Completada']

/** Una OP sólo se responde en "Generada y Enviada Pend Confirmar" (o su nombre anterior). */
export function situacionOp(etiqueta: string): SituacionRespuesta {
  const e = etiqueta.trim()
  if (e === ETIQUETAS.op.pendiente || e === ETIQUETAS.op.pendienteAnterior) return 'pendiente'
  if (OP_YA_CONFIRMADA.includes(e)) return 'confirmada'
  if (e === ETIQUETAS.op.rechazada) return 'rechazada'
  if (e === 'Cancelada') return 'cancelada'
  return 'sinEnviar'
}

/** Un presupuesto se responde mientras `🤖 Estado de Confirmacion` esté vacío. */
export function situacionPresupuesto(etiqueta: string): SituacionRespuesta {
  const e = etiqueta.trim()
  if (!e) return 'pendiente'
  if (e === ETIQUETAS.presupuesto.rechazada) return 'rechazada'
  return 'confirmada'
}

export const LIMITES = { motivo: 1000, ubicacion: 300, coordinador: 200 } as const

/** Presupuesto: al confirmar, su formulario pide además la ubicación y el coordinador de la obra. */
export type Respuesta = { tipo: 'confirmar'; ubicacion?: string; coordinador?: string } | { tipo: 'rechazar'; motivo: string }

/** Saca los caracteres de control (deja los saltos de línea del motivo) y los espacios de los bordes. */
const limpio = (v: unknown, multilinea = false): string =>
  String(v ?? '')
    .replace(multilinea ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ')
    .trim()

/**
 * Lo que mandó el formulario (los campos de los HTML: `estado_obra` = "Confirmar" | "No confirmar",
 * `motivo` y, en el presupuesto, `ubicacion` y `coordinador`), validado.
 *  - "No confirmar" exige el motivo.
 *  - Confirmar un presupuesto exige la ubicación y el coordinador (el paso 2 de su formulario).
 *  - Confirmar una OP no pide nada más.
 */
export function leerRespuesta(
  documento: DocumentoConfirmacion,
  campos: Record<string, unknown>,
): { ok: true; respuesta: Respuesta } | { ok: false; error: string } {
  const r = limpio(campos.estado_obra).toLowerCase()
  if (r === 'no confirmar') {
    const motivo = limpio(campos.motivo, true)
    if (!motivo) return { ok: false, error: 'Falta el motivo.' }
    if (motivo.length > LIMITES.motivo) return { ok: false, error: `El motivo puede tener hasta ${LIMITES.motivo} caracteres.` }
    return { ok: true, respuesta: { tipo: 'rechazar', motivo } }
  }
  if (r !== 'confirmar') return { ok: false, error: 'Falta la respuesta.' }
  if (documento === 'op') return { ok: true, respuesta: { tipo: 'confirmar' } }
  const ubicacion = limpio(campos.ubicacion)
  const coordinador = limpio(campos.coordinador)
  if (!ubicacion || !coordinador) return { ok: false, error: 'Falta la ubicación o el coordinador de la obra.' }
  if (ubicacion.length > LIMITES.ubicacion || coordinador.length > LIMITES.coordinador) {
    return { ok: false, error: 'La ubicación o el coordinador son demasiado largos.' }
  }
  return { ok: true, respuesta: { tipo: 'confirmar', ubicacion, coordinador } }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Lectura
 * ──────────────────────────────────────────────────────────────────────────────── */

/** El documento que se confirma, con lo que el formulario muestra de él. */
export interface Documento {
  documento: DocumentoConfirmacion
  /** La OP o el subelemento del presupuesto. */
  id: string
  /** OP: la obra. Presupuesto: la bolsa (el ítem padre). */
  padreId: string
  /** "Orden N° 2291 · PVC" / "Presupuesto IDPDF-1221". */
  titulo: string
  /** La obra de la OP, o el cliente de la bolsa del presupuesto. */
  detalle: string
  etiqueta: string
  situacion: SituacionRespuesta
  /** A quién se saluda: el cliente o el constructor (según quién confirma), sin el código de cuenta. */
  nombre: string
  /** Presupuesto rechazado: el motivo que quedó escrito, para mostrarlo de nuevo. */
  motivo: string
}

interface CV {
  id: string
  text: string | null
  display_value?: string
  linked_item_ids?: string[]
}
interface ItemLeido {
  id: string
  name: string
  state?: string
  column_values: CV[]
  parent_item?: { id: string; name: string; column_values?: CV[] } | null
}

const porId = (cvs: CV[] = []) => Object.fromEntries(cvs.map((c) => [c.id, c])) as Record<string, CV | undefined>
const txt = (c?: CV) => (c?.text ?? '').trim()
const vigente = (i: ItemLeido) => i.state !== 'archived' && i.state !== 'deleted'
/** "1111 - CLIENTE TEST" → "CLIENTE TEST": el código de la cuenta no va en un saludo. */
const sinCodigo = (n: string) => n.replace(/^\d+\s*-\s*/, '').trim()
/** El nombre del primer ítem vinculado en una columna de conexión. */
const vinculado = (c?: CV) => sinCodigo((c?.display_value || c?.text || '').split(',')[0] ?? '')

const CAMPOS_CV = `id text ... on BoardRelationValue { display_value linked_item_ids }`

/** Las columnas de la obra con el cliente (su cuenta corriente) y el constructor/arquitecto. */
const COL_OBRA_CONTACTO = { Cliente: 'board_relation_mkthtd70', Constructor: 'board_relation_mksz3v0h' } as const
/** Las columnas de la bolsa del presupuesto con el cliente y el constructor/arquitecto. */
const COL_BOLSA_CONTACTO = { Cliente: 'board_relation_mkvgt8r', Constructor: 'board_relation_mkvgk8yb' } as const

async function porClave(consulta: Consulta, board: number, columna: string, clave: string, columnas: string[], padre: string[] | null) {
  /* La clave puede estar guardada con guiones (UUID) o sin ellos (navegadores viejos). */
  const formas = formasDeClave(clave)
  const d = await consulta<{ boards: { items_page: { items: ItemLeido[] } }[] }>(
    `query ($c: CompareValue!, $cols: [String!]${padre ? ', $colsPadre: [String!]' : ''}) {
      boards(ids: [${board}]) {
        items_page(limit: 5, query_params: { rules: [{ column_id: "${columna}", compare_value: $c, operator: any_of }] }) {
          items {
            id name state ${padre ? `parent_item { id name column_values(ids: $colsPadre) { ${CAMPOS_CV} } }` : ''}
            column_values(ids: $cols) { ${CAMPOS_CV} }
          }
        }
      }
    }`,
    { c: formas, cols: columnas, ...(padre ? { colsPadre: padre } : {}) },
  )
  /* La clave es un UUID: hay una sola. Se compara igual, por si Monday matchea de más. */
  return (d.boards[0]?.items_page.items ?? [])
    .filter(vigente)
    .find((i) => formas.includes(txt(porId(i.column_values)[columna]).toLowerCase()))
}

/**
 * El documento del enlace, con el nombre de quien confirma (`rol`). `nombreDelEnlace` es el de los
 * enlaces del formato viejo, que lo traían: si viene, manda ése.
 */
export async function buscarDocumento(
  documento: DocumentoConfirmacion,
  clave: string,
  rol: RolConfirmacion,
  consulta: Consulta = consultaMonday,
  nombreDelEnlace: string | null = null,
): Promise<Documento | null> {
  if (documento === 'op') {
    const i = await porClave(consulta, BOARD_ORDENES, COL_OP.clave, clave, Object.values(COL_OP), null)
    if (!i) return null
    const c = porId(i.column_values)
    const tipo = txt(c[COL_OP.tipo])
    const numero = txt(c[COL_OP.nroAluminio]) || txt(c[COL_OP.nroPvc])
    const etiqueta = txt(c[COL_OP.estado])
    const obraId = String(c[COL_OP.obra]?.linked_item_ids?.[0] ?? '')
    return {
      documento,
      id: String(i.id),
      padreId: obraId,
      titulo: ['Orden de Producción', numero ? `N° ${numero}` : '', tipo ? `· ${tipo}` : ''].filter(Boolean).join(' '),
      detalle: (c[COL_OP.obra]?.display_value ?? '').trim(),
      etiqueta,
      situacion: situacionOp(etiqueta),
      nombre: nombreDelEnlace ?? (await nombreEnObra(consulta, obraId, rol)),
      motivo: '',
    }
  }
  const i = await porClave(
    consulta,
    BOARD_SUB_PRESUPUESTOS,
    COL_SUB_PRES.clave,
    clave,
    Object.values(COL_SUB_PRES),
    Object.values(COL_BOLSA_CONTACTO),
  )
  if (!i) return null
  const c = porId(i.column_values)
  const etiqueta = txt(c[COL_SUB_PRES.confirmacion])
  const carpinteria = [txt(c[COL_SUB_PRES.tipo]), txt(c[COL_SUB_PRES.color])].filter(Boolean).join(' · ')
  const bolsa = porId(i.parent_item?.column_values)
  return {
    documento,
    id: String(i.id),
    padreId: String(i.parent_item?.id ?? ''),
    titulo: `Presupuesto ${i.name}`.trim(),
    detalle: carpinteria,
    etiqueta,
    situacion: situacionPresupuesto(etiqueta),
    nombre: nombreDelEnlace ?? vinculado(bolsa[COL_BOLSA_CONTACTO[rol]]),
    motivo: txt(c[COL_SUB_PRES.motivo]),
  }
}

/** El nombre del cliente o del constructor de la obra. Si no se puede leer, sin nombre (el saludo lo omite). */
async function nombreEnObra(consulta: Consulta, obraId: string, rol: RolConfirmacion): Promise<string> {
  if (!obraId) return ''
  try {
    const d = await consulta<{ items: { column_values: CV[] }[] }>(
      `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { column_values(ids: $cols) { ${CAMPOS_CV} } } }`,
      { ids: [obraId], cols: [COL_OBRA_CONTACTO[rol]] },
    )
    return vinculado(porId(d.items[0]?.column_values)[COL_OBRA_CONTACTO[rol]])
  } catch (e) {
    console.warn('[confirmar] no se pudo leer el nombre de quien confirma', e)
    return ''
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Escritura
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Lo que el usuario escribió, listo para ir dentro del HTML de un update de Monday. */
export const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fechaAr = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)

/** El update que queda en el ítem: quién respondió, cuándo y lo que escribió. */
export function textoUpdate(doc: Documento, nombre: string, r: Respuesta, cuando: Date = new Date()): string {
  const que = doc.documento === 'op' ? 'la Orden de Producción' : 'el presupuesto'
  const renglones = [
    `<p><b>${r.tipo === 'confirmar' ? '✅ Confirmó' : '❌ No confirmó'} ${que}:</b> ${escaparHtml(nombre || 'el destinatario')}</p>`,
    `<p><b>Fecha:</b> ${fechaAr(cuando)} hs</p>`,
  ]
  if (r.tipo === 'rechazar') renglones.push(`<p><b>Motivo:</b> ${escaparHtml(r.motivo).replace(/\n/g, '<br>')}</p>`)
  if (r.tipo === 'confirmar' && r.ubicacion) renglones.push(`<p><b>Ubicación de la obra:</b> ${escaparHtml(r.ubicacion)}</p>`)
  if (r.tipo === 'confirmar' && r.coordinador) renglones.push(`<p><b>Coordinador de la obra:</b> ${escaparHtml(r.coordinador)}</p>`)
  renglones.push('<p><i>Respondido desde el enlace de confirmación de WhatsApp.</i></p>')
  return renglones.join('')
}

const mutacionColumnas = `mutation ($board: ID!, $id: ID!, $valores: JSON!) {
  change_multiple_column_values(board_id: $board, item_id: $id, column_values: $valores, create_labels_if_missing: true) { id }
}`

/**
 * Deja la respuesta en Monday. Lo que decide —el estado de la OP o del presupuesto— tiene que
 * escribirse; si falla, falla todo y el cliente puede volver a intentar con el mismo enlace. Lo demás
 * (la obra, el update) es constancia: si falla, se registra en el log y la respuesta queda igual.
 */
export async function registrarRespuesta(
  doc: Documento,
  nombre: string,
  r: Respuesta,
  consulta: Consulta = consultaMonday,
): Promise<void> {
  const escribir = (board: number, id: string, valores: Record<string, unknown>) =>
    consulta(mutacionColumnas, { board: String(board), id, valores: JSON.stringify(valores) }, { escritura: true })
  const confirma = r.tipo === 'confirmar'

  if (doc.documento === 'op') {
    await escribir(BOARD_ORDENES, doc.id, {
      [COL_OP.estado]: { label: confirma ? ETIQUETAS.op.confirmada : ETIQUETAS.op.rechazada },
    })
    if (doc.padreId) {
      await escribir(BOARD_OBRAS, doc.padreId, {
        [COL_OBRA_CONFIRMACION]: { label: confirma ? ETIQUETAS.obra.confirmada : ETIQUETAS.obra.rechazada },
      }).catch((e) => console.warn('[confirmar] no se pudo marcar la confirmación en la obra', e))
    }
  } else {
    await escribir(BOARD_SUB_PRESUPUESTOS, doc.id, {
      [COL_SUB_PRES.confirmacion]: { label: confirma ? ETIQUETAS.presupuesto.confirmada : ETIQUETAS.presupuesto.rechazada },
      [COL_SUB_PRES.motivo]: confirma ? '' : r.motivo.replace(/\s*\n\s*/g, ' ').slice(0, LIMITES.motivo),
    })
  }

  await consulta(
    `mutation ($id: ID!, $cuerpo: String!) { create_update(item_id: $id, body: $cuerpo) { id } }`,
    { id: doc.id, cuerpo: textoUpdate(doc, nombre, r) },
    { escritura: true },
  ).catch((e) => console.warn('[confirmar] no se pudo dejar el update de la respuesta', e))
}
