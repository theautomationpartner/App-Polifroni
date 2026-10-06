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
import type { DocumentoConfirmacion } from './_confirmacion.js'
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
 * Si el documento todavía espera la respuesta.
 *  - `pendiente`: se muestra el formulario.
 *  - `confirmada` / `rechazada`: ya respondió alguien; se muestra qué.
 *  - `cerrada`: la OP siguió su camino (cancelada, en el taller, …) y ya no admite respuesta.
 */
export type SituacionRespuesta = 'pendiente' | 'confirmada' | 'rechazada' | 'cerrada'

/** Una OP sólo se responde en "Enviada Pend Confirmar". */
export function situacionOp(etiqueta: string): SituacionRespuesta {
  const e = etiqueta.trim()
  if (e === ETIQUETAS.op.pendiente || e === ETIQUETAS.op.pendienteAnterior) return 'pendiente'
  if (e === ETIQUETAS.op.confirmada) return 'confirmada'
  if (e === ETIQUETAS.op.rechazada) return 'rechazada'
  return 'cerrada'
}

/** Un presupuesto se responde mientras `🤖 Estado de Confirmacion` esté vacío. */
export function situacionPresupuesto(etiqueta: string): SituacionRespuesta {
  const e = etiqueta.trim()
  if (!e) return 'pendiente'
  if (e === ETIQUETAS.presupuesto.confirmada) return 'confirmada'
  if (e === ETIQUETAS.presupuesto.rechazada) return 'rechazada'
  return 'cerrada'
}

export const LIMITES = { motivo: 1000, ubicacion: 200, coordinador: 120 } as const

export type Respuesta =
  | { tipo: 'confirmar'; ubicacion: string; coordinador: string }
  | { tipo: 'rechazar'; motivo: string }

/** Saca los caracteres de control (deja los saltos de línea del motivo) y los espacios de los bordes. */
const limpio = (v: unknown, multilinea = false): string =>
  String(v ?? '')
    .replace(multilinea ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ')
    .trim()

/**
 * Lo que mandó el formulario, validado. Rechazar exige el motivo. Confirmar una OP exige, además, la
 * ubicación de la obra y el coordinador; confirmar un presupuesto no pide nada más.
 */
export function leerRespuesta(
  documento: DocumentoConfirmacion,
  campos: Record<string, unknown>,
): { ok: true; respuesta: Respuesta } | { ok: false; error: string } {
  const r = limpio(campos.respuesta)
  if (r === 'rechazar') {
    const motivo = limpio(campos.motivo, true)
    if (!motivo) return { ok: false, error: 'Contanos qué hay que corregir.' }
    if (motivo.length > LIMITES.motivo) return { ok: false, error: `El motivo puede tener hasta ${LIMITES.motivo} caracteres.` }
    return { ok: true, respuesta: { tipo: 'rechazar', motivo } }
  }
  if (r === 'confirmar') {
    if (documento === 'presupuesto') return { ok: true, respuesta: { tipo: 'confirmar', ubicacion: '', coordinador: '' } }
    const ubicacion = limpio(campos.ubicacion)
    const coordinador = limpio(campos.coordinador)
    if (!ubicacion || !coordinador) return { ok: false, error: 'Completá la ubicación de la obra y el coordinador.' }
    if (ubicacion.length > LIMITES.ubicacion || coordinador.length > LIMITES.coordinador) {
      return { ok: false, error: 'La ubicación o el coordinador son demasiado largos.' }
    }
    return { ok: true, respuesta: { tipo: 'confirmar', ubicacion, coordinador } }
  }
  return { ok: false, error: 'Elegí si confirmás o no.' }
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
  parent_item?: { id: string; name: string } | null
}

const porId = (i: ItemLeido) => Object.fromEntries(i.column_values.map((c) => [c.id, c])) as Record<string, CV | undefined>
const txt = (c?: CV) => (c?.text ?? '').trim()
const vigente = (i: ItemLeido) => i.state !== 'archived' && i.state !== 'deleted'

async function porClave(consulta: Consulta, board: number, columna: string, clave: string, columnas: string[], conPadre: boolean) {
  const d = await consulta<{ boards: { items_page: { items: ItemLeido[] } }[] }>(
    `query ($c: CompareValue!, $cols: [String!]) {
      boards(ids: [${board}]) {
        items_page(limit: 5, query_params: { rules: [{ column_id: "${columna}", compare_value: $c, operator: any_of }] }) {
          items {
            id name state ${conPadre ? 'parent_item { id name }' : ''}
            column_values(ids: $cols) { id text ... on BoardRelationValue { display_value linked_item_ids } }
          }
        }
      }
    }`,
    { c: [clave], cols: columnas },
  )
  /* La clave es un UUID: hay una sola. Se compara igual, por si Monday matchea de más. */
  return (d.boards[0]?.items_page.items ?? []).filter(vigente).find((i) => txt(porId(i)[columna]).toLowerCase() === clave)
}

export async function buscarDocumento(
  documento: DocumentoConfirmacion,
  clave: string,
  consulta: Consulta = consultaMonday,
): Promise<Documento | null> {
  if (documento === 'op') {
    const i = await porClave(consulta, BOARD_ORDENES, COL_OP.clave, clave, Object.values(COL_OP), false)
    if (!i) return null
    const c = porId(i)
    const tipo = txt(c[COL_OP.tipo])
    const numero = txt(c[COL_OP.nroAluminio]) || txt(c[COL_OP.nroPvc])
    const etiqueta = txt(c[COL_OP.estado])
    return {
      documento,
      id: String(i.id),
      padreId: String(c[COL_OP.obra]?.linked_item_ids?.[0] ?? ''),
      titulo: ['Orden de Producción', numero ? `N° ${numero}` : '', tipo ? `· ${tipo}` : ''].filter(Boolean).join(' '),
      detalle: (c[COL_OP.obra]?.display_value ?? '').trim(),
      etiqueta,
      situacion: situacionOp(etiqueta),
    }
  }
  const i = await porClave(consulta, BOARD_SUB_PRESUPUESTOS, COL_SUB_PRES.clave, clave, Object.values(COL_SUB_PRES), true)
  if (!i) return null
  const c = porId(i)
  const etiqueta = txt(c[COL_SUB_PRES.confirmacion])
  const carpinteria = [txt(c[COL_SUB_PRES.tipo]), txt(c[COL_SUB_PRES.color])].filter(Boolean).join(' · ')
  return {
    documento,
    id: String(i.id),
    padreId: String(i.parent_item?.id ?? ''),
    titulo: `Presupuesto ${i.name}`.trim(),
    detalle: carpinteria,
    etiqueta,
    situacion: situacionPresupuesto(etiqueta),
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
