/**
 * El ciclo de vida de una Orden de Producción.
 *
 * Una OP tiene UN estado, y vive en una sola columna: `🤖Estado OP` del tablero de órdenes. La
 * columna `🤖Estado De Envio OP` es técnica —dice si el último WhatsApp salió— y la app no la usa
 * para decidir nada: mostrar las dos juntas era justamente lo que hacía que una OP apareciera como
 * "Enviada" y "Generada" a la vez.
 *
 *   Borrador ──generar──▶ Generada ──enviar──▶ Enviada / Pend. confirmar ──cliente──▶ Confirmada
 *                            │                    │  ▲ reenviar                         │
 *                            │                    ▼  │                                  ▼
 *                            │               NO Confirmado                        Enviada a taller
 *                            │                    │                                     │ taller
 *                            │                    │                                     ▼
 *                            │                    │                          Produccion Completada
 *                            └────────────────────┴───────────── cancelar ──▶ Cancelada
 *
 * Regla de negocio: una OP NO se modifica ni se borra. Si el cliente pide un cambio, se cancela y
 * se genera otra: así queda escrito qué se mandó y qué se aprobó.
 *
 * Este archivo no habla con Monday: es la regla sola, para poder probarla sin red.
 */

/**
 * Los estados de `🤖Estado OP` como los nombra la APP (lo que se ve en pantalla). En el tablero las
 * etiquetas se renombran cada tanto —hoy "Generada" y "Pend de Confirmar"—, así que la app NO
 * escribe ni compara por nombre: escribe por índice (`INDICE_OP`) y, al leer, reconoce cualquier
 * nombre que la etiqueta haya tenido (`ALIAS_OP`) y lo muestra con el de acá.
 */
export const ETIQUETA_OP = {
  generada: 'Generada Pend de Enviar',
  pendiente: 'Enviada Pend de Confirmar',
  confirmada: 'Confirmada',
  rechazada: 'NO Confirmado',
  taller: 'Enviada a Taller',
  cancelada: 'Cancelada',
  /* La marca el team Produccion cuando el taller terminó la orden ("Completar producción"). */
  completada: 'Produccion Completada',
} as const

/**
 * El índice de cada etiqueta en `🤖Estado OP` (su `settings_str`). El índice NO cambia al renombrar
 * la etiqueta: es lo que se escribe. "NO Confirmado" ya no existe en el tablero (no tiene índice).
 * Si se agrega o se recrea una etiqueta, hay que revisar estos números.
 */
export const INDICE_OP: Partial<Record<keyof typeof ETIQUETA_OP, number>> = {
  completada: 0,
  confirmada: 1,
  cancelada: 2,
  pendiente: 3,
  taller: 4,
  generada: 6,
}

/**
 * Todos los nombres que tuvo cada etiqueta, para leer ítems y pedidos de cualquier momento: el de
 * hoy en el tablero, los anteriores y el de la app.
 */
const ALIAS_OP: Record<string, string> = {
  Generada: ETIQUETA_OP.generada,
  'Generada Pend de Enviar': ETIQUETA_OP.generada,
  'Pend de Confirmar': ETIQUETA_OP.pendiente,
  'Enviada Pend Confirmar': ETIQUETA_OP.pendiente,
  'Enviada Pend de Confirmar': ETIQUETA_OP.pendiente,
  'Generada y Enviada Pend Confirmar': ETIQUETA_OP.pendiente,
}

/** El nombre de la app para un índice de `🤖Estado OP`. */
const PORINDICE: Record<number, string> = Object.fromEntries(
  Object.entries(INDICE_OP).map(([k, i]) => [i, ETIQUETA_OP[k as keyof typeof ETIQUETA_OP]]),
)

/** El índice de la etiqueta, del `value` JSON de la columna (`{"index":3,…}`). `null` si no tiene. */
export function indiceDeValor(valorJson: string | null | undefined): number | null {
  try {
    const i = (JSON.parse(valorJson ?? 'null') as { index?: unknown } | null)?.index
    return typeof i === 'number' && Number.isInteger(i) ? i : null
  } catch {
    return null
  }
}

/**
 * La etiqueta con el nombre de la app: por su índice si se conoce, y si no por su nombre (cualquiera
 * de los que tuvo). Una etiqueta que la app no conoce se devuelve tal cual.
 */
export function etiquetaOp(texto: string, indice: number | null = null): string {
  if (indice != null && PORINDICE[indice]) return PORINDICE[indice]
  const t = texto.trim()
  return ALIAS_OP[t] ?? t
}

/** El índice a escribir para una etiqueta (con cualquiera de sus nombres). `null` si no tiene. */
export function indiceDeEtiqueta(etiqueta: string): number | null {
  const canonica = etiquetaOp(etiqueta)
  const clave = (Object.keys(ETIQUETA_OP) as (keyof typeof ETIQUETA_OP)[]).find((k) => ETIQUETA_OP[k] === canonica)
  return clave ? (INDICE_OP[clave] ?? null) : null
}

export type EstadoOrden =
  | 'borrador'
  | 'generada'
  | 'pendiente'
  | 'confirmada'
  | 'rechazada'
  | 'taller'
  | 'completada'
  | 'cancelada'

/**
 * El estado de una OP a partir de lo que dice el tablero.
 *
 * Sin etiqueta, decide el documento: con la OP final adjunta es una orden emitida de antes de que
 * existiera el estado (se la trata como Generada); sin él, es un borrador —se cargó el original y
 * no se llegó a generar—. Una etiqueta desconocida se lee igual que sin etiqueta: es preferible
 * ofrecer de menos que habilitar un envío sobre un estado que la app no entiende.
 */
export function estadoDeOrden(etiqueta: string, tieneOpFinal: boolean): EstadoOrden {
  switch (etiquetaOp(etiqueta)) {
    case ETIQUETA_OP.cancelada:
      return 'cancelada'
    case ETIQUETA_OP.completada:
      return 'completada'
    case ETIQUETA_OP.taller:
      return 'taller'
    case ETIQUETA_OP.confirmada:
      return 'confirmada'
    case ETIQUETA_OP.rechazada:
      return 'rechazada'
    case ETIQUETA_OP.pendiente:
      return 'pendiente'
    case ETIQUETA_OP.generada:
      return tieneOpFinal ? 'generada' : 'borrador'
    default:
      return tieneOpFinal ? 'generada' : 'borrador'
  }
}

/** Cómo se ve cada estado: el mismo rótulo y color en la consulta, el selector y la ficha. Los
    colores son los de `🤖Estado OP` en el tablero. */
export const VISTA_ESTADO: Record<EstadoOrden, { rotulo: string; color: string; icono: string }> = {
  borrador: { rotulo: 'Sin generar', color: '#c4c4c4', icono: 'fa-file-circle-question' },
  generada: { rotulo: 'Generada Pend de Enviar', color: '#fdab3d', icono: 'fa-file-circle-check' },
  pendiente: { rotulo: 'Enviada Pend de Confirmar', color: '#fdab3d', icono: 'fa-hourglass-half' },
  confirmada: { rotulo: 'Confirmada', color: '#00c875', icono: 'fa-circle-check' },
  rechazada: { rotulo: 'No confirmada', color: '#df2f4a', icono: 'fa-circle-xmark' },
  taller: { rotulo: 'Enviada a taller', color: '#9d50dd', icono: 'fa-industry' },
  completada: { rotulo: 'Producción completada', color: '#ff6d3b', icono: 'fa-flag-checkered' },
  cancelada: { rotulo: 'Cancelada', color: '#df2f4a', icono: 'fa-ban' },
}

/** Las acciones que se pueden hacer sobre UNA orden. */
export type AccionOrden = 'enviar' | 'reenviar' | 'taller' | 'cancelar'

/**
 * Qué se puede hacer con una OP en cada estado. Es la tabla del documento funcional (2.4).
 *
 * - Enviar y Reenviar son acciones DISTINTAS: cada una ve sólo las OP en su estado.
 * - Al taller sólo va una OP Confirmada. Sin la confirmación no se fabrica.
 * - Una OP rechazada no se reenvía: el cliente pidió un cambio, y un cambio es cancelar y generar
 *   otra.
 * - Enviada a taller, Producción completada y Cancelada no admiten ninguna de estas acciones. La
 *   única salida de Enviada a taller es completar la producción (ver `completable`).
 * - Un borrador se puede cancelar: es la forma de limpiar los que quedaron a medio hacer.
 */
const ACCIONES: Record<EstadoOrden, readonly AccionOrden[]> = {
  borrador: ['cancelar'],
  generada: ['enviar', 'cancelar'],
  pendiente: ['reenviar', 'cancelar'],
  confirmada: ['taller', 'cancelar'],
  rechazada: ['cancelar'],
  taller: [],
  completada: [],
  cancelada: [],
}

export const accionesDe = (estado: EstadoOrden): readonly AccionOrden[] => ACCIONES[estado]

export const admite = (estado: EstadoOrden, accion: AccionOrden): boolean =>
  ACCIONES[estado].includes(accion)

/** El estado en que tiene que estar una OP para que la acción la liste. */
export const ESTADO_REQUERIDO: Record<Exclude<AccionOrden, 'cancelar'>, EstadoOrden> = {
  enviar: 'generada',
  reenviar: 'pendiente',
  taller: 'confirmada',
}

/** A qué etiqueta pasa la OP cuando la acción termina bien. */
export const ETIQUETA_TRAS: Record<AccionOrden, string> = {
  enviar: ETIQUETA_OP.pendiente,
  /* Reenviar no cambia el estado: sigue esperando la misma confirmación. */
  reenviar: ETIQUETA_OP.pendiente,
  taller: ETIQUETA_OP.taller,
  cancelar: ETIQUETA_OP.cancelada,
}

/** Los estados que la consulta ofrece como filtro, en el orden del circuito. */
export const FILTROS_CONSULTA: readonly EstadoOrden[] = [
  'generada',
  'pendiente',
  'confirmada',
  'taller',
  'completada',
  'rechazada',
  'cancelada',
  'borrador',
]

/**
 * `🤖Estado de Envio OP al Taller` dice que la OP ya salió (o está saliendo) al taller: "Enviando..."
 * o "Enviado". Vacío, "NO enviada" o "Error de Envio" significan que todavía no le llegó.
 */
export const yaEnviadaAlTaller = (envioTaller: string | undefined): boolean =>
  /^(enviando|enviad[oa])/i.test((envioTaller ?? '').trim())

/**
 * Al taller sólo va una OP CONFIRMADA que todavía no se envió (o cuyo envío falló). Una orden que
 * ya está en el taller no se vuelve a mandar: duplicaría la fabricación.
 */
export const aptaParaTaller = (estado: EstadoOrden, envioTaller: string | undefined): boolean =>
  estado === 'confirmada' && !yaEnviadaAlTaller(envioTaller)

/** La OP ya llegó al taller (o está llegando): el estado final, o el envío en curso/hecho. */
export const enElTaller = (estado: EstadoOrden, envioTaller: string | undefined): boolean =>
  estado === 'taller' || (estado === 'confirmada' && yaEnviadaAlTaller(envioTaller))

/** "Completar producción": sólo una OP Enviada a taller pasa a Producción completada. */
export const completable = (estado: EstadoOrden): boolean => estado === 'taller'
