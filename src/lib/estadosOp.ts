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

/** Las etiquetas de `🤖Estado OP`, tal cual están (o van a estar) en el tablero. */
export const ETIQUETA_OP = {
  generada: 'Generada',
  pendiente: 'Enviada Pend Confirmar',
  confirmada: 'Confirmada',
  rechazada: 'NO Confirmado',
  /* Las dos que siguen no existían en el tablero: se crean la primera vez que se escriben
     (`create_labels_if_missing`), así el tablero no necesita un cambio manual antes de usarlas. */
  taller: 'Enviada a Taller',
  cancelada: 'Cancelada',
  /* La marca el team Produccion cuando el taller terminó la orden ("Completar producción"). */
  completada: 'Produccion Completada',
} as const

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
  switch (etiqueta.trim()) {
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
  generada: { rotulo: 'Generada · sin enviar', color: '#fdab3d', icono: 'fa-file-circle-check' },
  pendiente: { rotulo: 'Pend de Confirmar', color: '#fdab3d', icono: 'fa-hourglass-half' },
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
