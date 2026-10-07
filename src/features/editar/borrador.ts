/**
 * Lo que se va armando en "Editar Órdenes de Producción", entre una etapa y otra.
 *
 * Vive en el estado global —como el borrador de la OP— porque el stepper deja ir y volver: la orden
 * elegida, sus subelementos y la OP final nueva ya generada tienen que seguir ahí.
 */
import type { Medicion } from '@/features/op/DatosMedicion'
import type { Abertura } from '@/features/op/observaciones'
import type { CambioCampo, LecturaListadoOp, ModeloListado } from '@/lib/edicionOp'
import type { OrdenEditable, SubelementoOrden } from '@/services/monday/edicionOp'
import type { Obra } from '@/types'

/** La OP final nueva, generada en la app con lo que la IA detectó. Todavía no está en Monday. */
export interface EdicionGenerada {
  /** El PDF de la OP final nueva. */
  archivo: File
  /** La lectura con que se armó (se guarda en la base para poder volver a editarla). */
  lectura: LecturaListadoOp
  modelos: ModeloListado[]
  /** Las aberturas que cambiaron o se agregaron: sus subelementos se arman de nuevo. */
  editados: ModeloListado[]
  cambios: CambioCampo[]
  nuevas: ModeloListado[]
  /** Los documentos de los dibujos de la OP editada (`🤖OP OriginaL`), en orden. */
  documentos: File[]
  /** El dibujo nuevo de HETMO: va detrás de `documentos`. */
  dibujo: File
  /** "… V2". */
  nombreNuevo: string
}

export interface BorradorEdicion {
  /** La OP a editar (etapa 1). */
  orden: OrdenEditable | null
  /** Sus subelementos, leídos al entrar a la etapa 2. `null` = todavía no. */
  subelementos: SubelementoOrden[] | null
  /** La obra de la orden (la OP final la nombra; el envío le escribe a sus contactos). */
  obra: Obra | null
  /** Los datos de la medición (medido por, fecha, observación de la OP): arrancan con los de la OP. */
  medicion: Medicion | null
  /** La observación de cada abertura: arranca con la de la OP. */
  observaciones: Abertura[] | null
  /** La OP final nueva, cuando ya se generó. Habilita la etapa de envío y "Finalizar Edición". */
  generada: EdicionGenerada | null
  /**
   * La OP nueva ("… V2") ya registrada en Monday (se registra apenas se genera la OP final nueva, con
   * la anterior cancelada). Un reintento del registro no crea otra.
   */
  nuevaId: string | null
}

export const edicionInicial = (): BorradorEdicion => ({
  orden: null,
  subelementos: null,
  obra: null,
  medicion: null,
  observaciones: null,
  generada: null,
  nuevaId: null,
})
