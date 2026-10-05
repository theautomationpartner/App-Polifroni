import type { TipoTurno } from '@/lib/agenda'
import type { ClienteTurno, ElementosCliente } from '@/services/monday/agenda'

/**
 * Lo que se va cargando del turno entre las tres etapas de "Crear Turno".
 *
 * Vive en el estado global —como el borrador de la OP— porque el stepper deja ir y volver entre
 * etapas: el cliente, lo leído de sus obras y lo elegido tienen que seguir ahí.
 */
export interface BorradorTurno {
  cliente: ClienteTurno | null
  /** Obras y pendientes del cliente, leídos una vez. `null` = todavía no se leyeron. */
  elementos: ElementosCliente | null
  /** Aberturas a colocar por obra (Colocación). `null` = todavía no se calcularon. */
  aberturas: Record<string, number | null> | null
  tipo: TipoTurno | null
  /** Colocación y Reparación: el turno es sobre una obra del cliente (por defecto) o sin obra. */
  conObra: boolean
  /** La obra o el pendiente elegido. */
  elementoId: string | null
  /** Colocación: la cantidad de aberturas, si se corrigió a mano. `null` = la calculada de la obra. */
  cantAberturas: number | null
  /** Reparación: el tipo de reparación (`✋ Tipo de Reparacion`). */
  tipoReparacion: string
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`, hora local: el turno es en un día y a una hora. */
  hora: string
  /** Se está reprogramando: el turno que se canceló para dar lugar a éste. */
  reprograma: { id: string; nombre: string } | null
  /** El turno ya quedó registrado en la Agenda: un reintento no lo vuelve a crear. */
  registradoId: string | null
}

export const turnoInicial = (): BorradorTurno => ({
  cliente: null,
  elementos: null,
  aberturas: null,
  tipo: null,
  conObra: true,
  elementoId: null,
  cantAberturas: null,
  tipoReparacion: '',
  fecha: '',
  hora: '',
  reprograma: null,
  registradoId: null,
})
