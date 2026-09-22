/**
 * Estado global de la app: qué proceso se eligió, en qué paso va y con qué obra se está trabajando.
 *
 * Mismo patrón que La Batea: un reducer con acciones explícitas y dos contextos separados (estado
 * y dispatch), así quien sólo despacha no se vuelve a dibujar cuando el estado cambia.
 */
import type { Obra, Paso, Proceso } from '@/types'

/** Orden de los pasos del proceso de Orden de Producción. Manda el stepper y la navegación. */
export const PASOS: readonly Paso[] = ['obra', 'etmo', 'op-final', 'envio', 'confirmacion']

/** Etiqueta de cada paso, la que se lee debajo del círculo del stepper. Corta a propósito. */
export const ETIQUETAS_PASO: Record<Paso, string> = {
  obra: 'Obra',
  etmo: 'Orden ETMO',
  'op-final': 'OP Final',
  envio: 'Envío al cliente',
  confirmacion: 'Confirmación y taller',
}

/**
 * El mismo paso, dicho como la ACCIÓN que se va a hacer. Es lo que muestra el selector de proceso
 * del encabezado: ahí no se está ubicando una etapa en una barra sino eligiendo qué hacer ahora,
 * y "Cargar Orden ETMO" contesta esa pregunta; "Orden ETMO", no.
 */
export const ACCIONES_PASO: Record<Paso, string> = {
  obra: 'Elegir la obra',
  etmo: 'Cargar Orden ETMO',
  'op-final': 'Generar la OP final',
  envio: 'Enviar la OP al cliente',
  confirmacion: 'Confirmar y enviar al taller',
}

export const indiceDe = (paso: Paso): number => Math.max(0, PASOS.indexOf(paso))

export interface AppState {
  /** `null` = pantalla de selección de procesos. */
  proceso: Proceso | null
  paso: Paso
  /** La obra en la que se está trabajando. Sin obra elegida, los pasos siguientes no se habilitan. */
  obra: Obra | null
  /**
   * Por dónde se entró al proceso.
   *
   * La barra de etapas muestra desde acá en adelante, renumerando desde 1. Quien elige "Generar la
   * OP final" en el paso 1 no tiene por delante cinco etapas sino tres, y dos círculos verdes de
   * cosas que no hizo no son información: son ruido que hay que descontar mentalmente cada vez.
   */
  entrada: Paso
  /** Acción que falló contra Monday, para el aviso global ("no se pudo <accion>"). */
  errorMonday: string | null
}

export const initialState: AppState = {
  proceso: null,
  paso: 'obra',
  obra: null,
  entrada: 'obra',
  errorMonday: null,
}

export type Action =
  | { type: 'setProceso'; proceso: Proceso | null }
  | { type: 'goto'; paso: Paso }
  | { type: 'setObra'; obra: Obra }
  /** Relee la obra sin tocar el paso en curso (después de escribir en el tablero). */
  | { type: 'refrescarObra'; obra: Obra }
  | { type: 'salirDeLaObra' }
  | { type: 'errorMonday'; accion: string }
  | { type: 'cerrarError' }
  | { type: 'reset' }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setProceso':
      return { ...initialState, proceso: action.proceso }

    /* A dónde se puede ir NO lo decide por dónde pasó el usuario sino el estado de la obra en el
       tablero (ver 'lib/pasos'), así que acá no hay progreso que recordar. */
    /* Saliendo del paso 1 se fija POR DÓNDE se entró: es la decisión que toma quien elige la
       acción, y la que la barra de etapas usa para saber qué mostrar. Después, moverse dentro del
       proceso no la cambia. */
    case 'goto':
      return {
        ...state,
        paso: action.paso,
        entrada: state.paso === 'obra' && action.paso !== 'obra' ? action.paso : state.entrada,
      }

    /* Elegir una obra REINICIA el avance: los pasos hablan de esta obra y de ninguna otra, así que
       lo alcanzado con la anterior no se hereda. */
    case 'setObra':
      return { ...state, obra: action.obra, paso: 'etmo', entrada: 'etmo' }

    case 'refrescarObra':
      return { ...state, obra: action.obra }

    case 'salirDeLaObra':
      return { ...state, obra: null, paso: 'obra', entrada: 'obra' }

    case 'errorMonday':
      return { ...state, errorMonday: action.accion }

    case 'cerrarError':
      return { ...state, errorMonday: null }

    case 'reset':
      return initialState

    default:
      return state
  }
}
