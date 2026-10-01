/**
 * Estado global de la app: la sección, la operación, a quién se envía, en qué etapa va y con qué
 * obra y qué orden se está trabajando.
 *
 * Mismo patrón que La Batea: un reducer con acciones explícitas y dos contextos separados (estado
 * y dispatch), así quien sólo despacha no se vuelve a dibujar cuando el estado cambia.
 */
import type { Medicion } from '@/features/op/DatosMedicion'
import { medicionInicial } from '@/features/op/DatosMedicion'
import type { Abertura } from '@/features/op/observaciones'
import type { VidrioLeido } from '@/services/monday/ordenes'
import type { ArchivoObra, Destino, Obra, Operacion, Paso, Proceso, Usuario, UsuarioActual } from '@/types'

/** Orden de las etapas de "Enviar Orden de Producción". Manda el stepper. */
export const PASOS: readonly Paso[] = ['obra', 'carga', 'envio']

export const indiceDe = (paso: Paso): number => Math.max(0, PASOS.indexOf(paso))

/** Las operaciones de la sección Producción, en el orden del selector del encabezado. */
export const OPERACIONES: readonly { id: Operacion; titulo: string }[] = [
  { id: 'enviar', titulo: 'ENVIAR ORDEN DE PRODUCCION' },
  { id: 'consultar', titulo: 'CONSULTAR ORDENES DE PRODUCCION' },
]

/** A quién se envía, tal como lo lista la pregunta de la primera etapa. */
export const DESTINOS: readonly { id: Destino; titulo: string }[] = [
  { id: 'cliente', titulo: 'A Cliente/Constructor' },
  { id: 'taller', titulo: 'Al Taller' },
]

/**
 * Lo que se va cargando de la OP entre la etapa 2 y la 3.
 *
 * Vive en el estado global —y no en cada pantalla— porque el stepper deja ir y volver entre
 * etapas: el documento, los datos de la medición y las observaciones tienen que seguir ahí.
 */
export interface BorradorOp {
  /** La OP del tablero de órdenes. `null` hasta que tiene algo que guardar (ver `abrirOrden`). */
  ordenId: string | null
  /** PVC: el PDF original de HETMO ya adjunto en la OP. */
  etmo: ArchivoObra[]
  /** Aluminio: el PDF elegido en la computadora (se sube al continuar). */
  archivo: File | null
  /** Aluminio: el archivo que ya se subió, para no volver a subirlo si no cambió. */
  archivoSubido: File | null
  medicion: Medicion
  aberturas: Abertura[]
  vidrios: VidrioLeido[]
  /** La OP final ya existe (PVC: se generó; Aluminio: se cargó). Habilita el envío. */
  generada: boolean
  /**
   * PVC: la OP final que armó la app con la lectura de la IA. Vive en la app hasta "Finalizar
   * Operación": recién ahí se adjunta a la OP del tablero (ver `registrarPvc`).
   */
  opFinal: File | null
  /** PVC: la lectura de la IA con que se armó `opFinal`; de ahí salen las cantidades de vidrios. */
  lecturaOp: unknown
  /** PVC: el N° de OP de HETMO que leyó la IA. */
  nOpHetmo: string
  /** PVC: la OP final que ya quedó adjunta en Monday, para no volver a subirla en un reintento. */
  opFinalSubida: File | null
  /** PVC: los subelementos ya se crearon para esta OP final; un reintento no los duplica. */
  subelementosDe: File | null
  /**
   * El envío que se hizo con el PDF de la app (Aluminio: el cargado; PVC: la OP final generada),
   * ANTES de que quede registrado en Monday. Se registra al finalizar la operación.
   */
  envio: EnvioLocal | null
}

/** Un envío hecho con el documento de la app: a quiénes, cuándo y el link que devolvió Make. */
export interface EnvioLocal {
  roles: ('Cliente' | 'Constructor')[]
  link: string
  /** ISO. */
  cuando: string
}

export const borradorInicial = (): BorradorOp => ({
  ordenId: null,
  etmo: [],
  archivo: null,
  archivoSubido: null,
  medicion: medicionInicial(),
  aberturas: [],
  vidrios: [],
  generada: false,
  opFinal: null,
  lecturaOp: null,
  nOpHetmo: '',
  opFinalSubida: null,
  subelementosDe: null,
  envio: null,
})

/** El cierre de una operación: qué se hizo, en la ventana que pregunta a dónde seguir. */
export interface Exito {
  texto: string
  detalle?: string
}

export interface AppState {
  /** `null` = pantalla de las tres secciones. */
  proceso: Proceso | null
  /** `null` = todavía no se eligió qué operación se va a hacer. */
  operacion: Operacion | null
  /** A quién se envía la orden. `null` hasta que se contesta la pregunta de la etapa 1. */
  destino: Destino | null
  /**
   * Al cliente o constructor: se ENVÍA UNA YA CARGADA en vez de cargar una nueva. Se elige en la
   * ventana de la obra con órdenes asignadas, y "pisa" el tipo de la obra: la etapa 2 pasa a ser
   * la tabla de órdenes y la 3, sólo el envío (sin emitir, aunque sea PVC).
   */
  existente: boolean
  paso: Paso
  /** Índice de la etapa más avanzada a la que se llegó: el stepper navega hasta ahí. */
  pasoMax: number
  obra: Obra | null
  /** Al taller: la OP elegida en la tabla. Desde la consulta: la OP que se abrió. */
  ordenId: string | null
  borrador: BorradorOp
  /** La orden ya salió en esta operación: el botón de envío queda en verde y fijo. */
  enviado: boolean
  /** Con valor, se muestra el cierre de la operación (y después se vuelve al inicio). */
  exito: Exito | null
  /** Hay un envío o una generación corriendo: no se puede salir a mitad de camino. */
  accionEnCurso: string | null
  errorMonday: string | null
  usuario: UsuarioActual | null
  usuarios: Usuario[]
  responsableId: string | null
}

export const initialState: AppState = {
  proceso: null,
  operacion: null,
  destino: null,
  existente: false,
  paso: 'obra',
  pasoMax: 0,
  obra: null,
  ordenId: null,
  borrador: borradorInicial(),
  enviado: false,
  exito: null,
  accionEnCurso: null,
  errorMonday: null,
  usuario: null,
  usuarios: [],
  responsableId: null,
}

export type Action =
  | { type: 'setProceso'; proceso: Proceso | null }
  /** Elegir (o cambiar) la operación. Arranca de cero: lo cargado era de la otra operación. */
  | { type: 'setOperacion'; operacion: Operacion }
  /** Contestar "¿A quién vas a enviarle la orden?". Cambiarla empieza la carga de nuevo. */
  | { type: 'setDestino'; destino: Destino }
  | { type: 'goto'; paso: Paso }
  /** `existente`: se va a enviar una OP ya cargada de la obra (ver `AppState.existente`). */
  | { type: 'setObra'; obra: Obra; existente?: boolean }
  | { type: 'refrescarObra'; obra: Obra }
  | { type: 'salirDeLaObra' }
  | { type: 'setBorrador'; cambios: Partial<BorradorOp> }
  | { type: 'elegirOrden'; ordenId: string | null }
  /** Abre una OP puntual desde la consulta, directo en la etapa de envío. */
  | { type: 'abrirOrden'; obra: Obra; destino: Destino; ordenId: string }
  | { type: 'setEnviado' }
  | { type: 'exito'; exito: Exito }
  | { type: 'setAccionEnCurso'; motivo: string | null }
  | { type: 'errorMonday'; accion: string }
  | { type: 'cerrarError' }
  | { type: 'reset' }
  | { type: 'setUsuario'; usuario: UsuarioActual | null }
  | { type: 'setUsuarios'; usuarios: Usuario[] }
  | { type: 'setResponsable'; id: string }

/** Lo que es de la SESIÓN y sobrevive a volver al inicio: quién es y a nombre de quién emite. */
const sesionDe = (s: AppState) => ({ usuario: s.usuario, usuarios: s.usuarios, responsableId: s.responsableId })

/** El trabajo sobre la obra: se descarta al cambiar de obra, de destino o de operación. */
const sinTrabajo = {
  obra: null,
  existente: false,
  ordenId: null,
  borrador: borradorInicial(),
  enviado: false,
  paso: 'obra' as Paso,
  pasoMax: 0,
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setProceso':
      return { ...initialState, ...sesionDe(state), proceso: action.proceso }

    case 'setOperacion':
      if (state.accionEnCurso) return state
      return { ...state, ...sinTrabajo, operacion: action.operacion, destino: null }

    case 'setDestino':
      if (state.accionEnCurso || state.destino === action.destino) return state
      return { ...state, ...sinTrabajo, destino: action.destino }

    /* Hacia atrás, a cualquier etapa; hacia adelante, sólo hasta la más avanzada alcanzada (o la
       siguiente, que es a donde lleva "Continuar"). */
    case 'goto': {
      if (state.accionEnCurso) return state
      const i = indiceDe(action.paso)
      if (i > state.pasoMax + 1) return state
      return { ...state, paso: action.paso, pasoMax: Math.max(state.pasoMax, i) }
    }

    /* Elegir la obra es terminar la etapa 1. Otra obra que la que había descarta lo cargado. */
    case 'setObra': {
      /* Otra obra —o la misma con otro camino (cargar una nueva / enviar una ya cargada)— arranca
         de cero: lo cargado era para el otro recorrido. */
      const otra = state.obra?.id !== action.obra.id || (action.existente ?? false) !== state.existente
      return {
        ...state,
        ...(otra ? { ordenId: null, borrador: borradorInicial(), enviado: false, pasoMax: 0 } : {}),
        obra: action.obra,
        existente: action.existente ?? false,
        paso: 'carga',
        pasoMax: Math.max(otra ? 0 : state.pasoMax, 1),
      }
    }

    case 'refrescarObra':
      return { ...state, obra: action.obra }

    case 'salirDeLaObra':
      if (state.accionEnCurso) return state
      return { ...state, ...sinTrabajo }

    case 'setBorrador':
      return { ...state, borrador: { ...state.borrador, ...action.cambios } }

    case 'elegirOrden':
      return { ...state, ordenId: action.ordenId }

    case 'abrirOrden':
      return {
        ...state,
        operacion: 'enviar',
        destino: action.destino,
        /* Desde la consulta la OP ya existe: al cliente se la ENVÍA, no se emite de nuevo. */
        existente: action.destino === 'cliente',
        obra: action.obra,
        ordenId: action.ordenId,
        borrador: { ...borradorInicial(), ordenId: action.ordenId, generada: true },
        enviado: false,
        paso: 'envio',
        pasoMax: 2,
      }

    case 'setEnviado':
      return { ...state, enviado: true }

    case 'exito':
      return { ...state, exito: action.exito, accionEnCurso: null }

    case 'setAccionEnCurso':
      return state.accionEnCurso === action.motivo ? state : { ...state, accionEnCurso: action.motivo }

    case 'errorMonday':
      return { ...state, errorMonday: action.accion }

    case 'cerrarError':
      return { ...state, errorMonday: null }

    /* Volver al inicio es volver a la pantalla de las tres secciones. */
    case 'reset':
      return { ...initialState, ...sesionDe(state) }

    case 'setUsuario':
      return { ...state, usuario: action.usuario, responsableId: state.responsableId ?? action.usuario?.id ?? null }

    case 'setUsuarios':
      return { ...state, usuarios: action.usuarios }

    case 'setResponsable':
      return state.usuario?.isAdmin ? { ...state, responsableId: action.id } : state

    default:
      return state
  }
}
