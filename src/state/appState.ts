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
import { turnoInicial, type BorradorTurno } from '@/features/agenda/borrador'
import { presupuestoInicial, type BorradorPresupuesto } from '@/features/presupuesto/borrador'
import { edicionInicial, type BorradorEdicion } from '@/features/editar/borrador'
import type { OrdenEditable } from '@/services/monday/edicionOp'
import { puedeEntrar, puedeOperar } from '@/lib/permisos'
import type { Destino, Obra, Operacion, Paso, Proceso, Rol, Usuario, UsuarioActual } from '@/types'

/** Orden de las etapas de "Cargar y Enviar Órdenes de Producción". Manda el stepper. */
export const PASOS: readonly Paso[] = ['obra', 'carga', 'envio']

export const indiceDe = (paso: Paso): number => Math.max(0, PASOS.indexOf(paso))

/** Las operaciones de cada área, en el orden del selector del encabezado. */
export const OPERACIONES: readonly { id: Operacion; titulo: string; proceso: Proceso }[] = [
  { id: 'enviar', titulo: 'CARGAR Y ENVIAR ORDENES DE PRODUCCION', proceso: 'obras' },
  { id: 'consultar', titulo: 'CONSULTAR ORDENES DE PRODUCCION', proceso: 'obras' },
  { id: 'editar', titulo: 'EDITAR ORDENES DE PRODUCCION', proceso: 'obras' },
  { id: 'vidrios', titulo: 'SOLICITUD DE CORTES DE VIDRIO', proceso: 'obras' },
  { id: 'crearTurno', titulo: 'CREAR TURNOS', proceso: 'agenda' },
  { id: 'gestionarTurnos', titulo: 'CONSULTAR Y GESTIONAR TURNOS', proceso: 'agenda' },
  { id: 'presupuestos', titulo: 'CREAR Y CARGAR PRESUPUESTOS', proceso: 'presupuesto' },
  { id: 'gestionarPresupuestos', titulo: 'CONSULTAR Y GESTIONAR PRESUPUESTOS', proceso: 'presupuesto' },
]

/**
 * Las operaciones de un área que sus roles habilitan (la suma de sus teams): las que ofrecen su pantalla y el selector del
 * encabezado. Las que su team no habilita no se muestran.
 */
export const operacionesDe = (proceso: Proceso | null, roles: readonly Rol[] | null | undefined) =>
  OPERACIONES.filter((o) => o.proceso === proceso && puedeOperar(roles, o.id))

/**
 * ¿Se le muestra el área? Una construida, si alguno de sus roles tiene alguna operación en ella;
 * una "Próximamente" (`id` null), sólo al admin: el resto no ve áreas que no son las suyas.
 */
export const areaVisible = (id: Proceso | null, roles: readonly Rol[] | null | undefined): boolean =>
  id ? areaPermitida(id, roles) : Boolean(roles?.includes('admin'))

/** ¿Puede entrar al área? Sólo si alguno de sus roles tiene alguna operación en ella. */
export const areaPermitida = (proceso: Proceso, roles: readonly Rol[] | null | undefined): boolean =>
  puedeEntrar(roles, proceso, OPERACIONES)

/** Las operaciones que se recorren por etapas, con el stepper del encabezado. */
export const conEtapas = (operacion: Operacion | null): boolean =>
  operacion === 'enviar' ||
  operacion === 'editar' ||
  operacion === 'vidrios' ||
  operacion === 'crearTurno' ||
  operacion === 'presupuestos'

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
  /** PVC: el PDF de HETMO tal como se cargó. Vive en la app hasta Finalizar: la IA lo lee de acá y
      recién al finalizar se sube a la OP (`🤖OP OriginaL`). */
  hetmo: File | null
  /** El documento de HETMO fue una foto, convertida a PDF al cargarla. */
  hetmoDeFoto: boolean
  /** El N° de orden del borrador ya está reservado en la base (se reserva al cargar el documento). */
  numeroReservado: boolean
  /** Aluminio: el PDF elegido en la computadora (se sube al continuar). */
  archivo: File | null
  /** El original que ya se subió a la OP al finalizar, para no volver a subirlo en un reintento. */
  archivoSubido: File | null
  medicion: Medicion
  /** PVC: las aberturas que leyó la IA en la orden de HETMO, cada una con su caja de observación. */
  aberturas: Abertura[]
  /** PVC: el usuario abrió las cajas de observación ("Cargar observaciones"). Si no, no van a la OP. */
  obsHabilitadas: boolean
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
  /**
   * La clave del enlace de confirmación (`nuevaClave`). Se genera al primer envío y queda fija para
   * esta orden: un reintento manda el MISMO enlace, y al finalizar se guarda en la OP
   * (`🤖Clave Confirmacion`).
   */
  claveConfirmacion: string | null
}

/** Un envío hecho con el documento de la app: a quiénes, cuándo y el link que devolvió Make. */
export interface EnvioLocal {
  roles: ('Cliente' | 'Constructor')[]
  /** El responsable de confirmar la orden (con un solo destinatario, ése). */
  confirmador: 'Cliente' | 'Constructor' | null
  /** La clave del enlace de confirmación que salió en el mensaje. */
  clave: string
  link: string
  /** ISO. */
  cuando: string
}

export const borradorInicial = (): BorradorOp => ({
  ordenId: null,
  hetmo: null,
  hetmoDeFoto: false,
  numeroReservado: false,
  archivo: null,
  archivoSubido: null,
  medicion: medicionInicial(),
  aberturas: [],
  obsHabilitadas: false,
  vidrios: [],
  generada: false,
  opFinal: null,
  lecturaOp: null,
  nOpHetmo: '',
  opFinalSubida: null,
  subelementosDe: null,
  envio: null,
  claveConfirmacion: null,
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
  paso: Paso
  /** Índice de la etapa más avanzada a la que se llegó: el stepper navega hasta ahí. */
  pasoMax: number
  obra: Obra | null
  /** Al taller: la OP elegida en la tabla. Desde la consulta: la OP que se abrió. */
  ordenId: string | null
  borrador: BorradorOp
  /** La orden ya salió en esta operación: el botón de envío queda en verde y fijo. */
  enviado: boolean
  /** Solicitud de cortes de vidrio: las OP (enviadas al taller) cuyos vidrios se piden. */
  vidriosOps: string[]
  /** Agenda · Crear Turno: lo que se va cargando del turno. */
  turno: BorradorTurno
  /** Presupuesto · Crear y Cargar: lo elegido y cargado del presupuesto. */
  presupuesto: BorradorPresupuesto
  /** Editar Órdenes de Producción: la orden elegida y sus subelementos. */
  edicion: BorradorEdicion
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
  paso: 'obra',
  pasoMax: 0,
  obra: null,
  ordenId: null,
  borrador: borradorInicial(),
  enviado: false,
  vidriosOps: [],
  turno: turnoInicial(),
  presupuesto: presupuestoInicial(),
  edicion: edicionInicial(),
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
  /** Solicitud de cortes de vidrio: qué OP se incluyen. */
  | { type: 'setVidriosOps'; ids: string[] }
  /** Agenda · Crear Turno: lo elegido en cada etapa. */
  | { type: 'setTurno'; cambios: Partial<BorradorTurno> }
  /** Presupuesto · Crear y Cargar: lo elegido en cada etapa. */
  | { type: 'setPresupuesto'; cambios: Partial<BorradorPresupuesto> }
  /** Editar OP: elegir la orden es terminar la etapa 1. Otra orden descarta lo leído de la anterior. */
  | { type: 'elegirOrdenEdicion'; orden: OrdenEditable }
  | { type: 'setEdicion'; cambios: Partial<BorradorEdicion> }
  /**
   * Presupuesto: cambiar entre crear uno nuevo y cargar otro empieza de nuevo (lo elegido era para
   * el otro camino).
   */
  | { type: 'setModoPresupuesto'; modo: BorradorPresupuesto['modo'] }
  /**
   * Agenda · Reprogramar: el turno original ya se canceló; se abre "Crear Turno" con sus datos y
   * en la etapa de los datos, para elegir la fecha nueva.
   */
  | { type: 'reprogramarTurno'; turno: Partial<BorradorTurno> }
  /** Contestar "¿A quién vas a enviarle la orden?". Cambiarla empieza la carga de nuevo. */
  | { type: 'setDestino'; destino: Destino }
  | { type: 'goto'; paso: Paso }
  | { type: 'setObra'; obra: Obra }
  | { type: 'refrescarObra'; obra: Obra }
  | { type: 'salirDeLaObra' }
  | { type: 'setBorrador'; cambios: Partial<BorradorOp> }
  | { type: 'elegirOrden'; ordenId: string | null }
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
  ordenId: null,
  borrador: borradorInicial(),
  enviado: false,
  vidriosOps: [] as string[],
  turno: turnoInicial(),
  presupuesto: presupuestoInicial(),
  edicion: edicionInicial(),
  paso: 'obra' as Paso,
  pasoMax: 0,
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /* Un área u operación que el team no habilita no se abre, la pida quien la pida. */
    case 'setProceso':
      if (action.proceso && !areaPermitida(action.proceso, state.usuario?.roles)) return state
      return { ...initialState, ...sesionDe(state), proceso: action.proceso }

    case 'setOperacion':
      if (state.accionEnCurso || !puedeOperar(state.usuario?.roles, action.operacion)) return state
      return { ...state, ...sinTrabajo, operacion: action.operacion, destino: null }

    case 'setVidriosOps':
      return { ...state, vidriosOps: action.ids }

    case 'setTurno':
      return { ...state, turno: { ...state.turno, ...action.cambios } }

    case 'setPresupuesto':
      return { ...state, presupuesto: { ...state.presupuesto, ...action.cambios } }

    case 'elegirOrdenEdicion': {
      const otra = state.edicion.orden?.id !== action.orden.id
      return {
        ...state,
        edicion: otra ? { ...edicionInicial(), orden: action.orden } : { ...state.edicion, orden: action.orden },
        paso: 'carga',
        pasoMax: otra ? 1 : Math.max(state.pasoMax, 1),
      }
    }

    case 'setEdicion':
      return { ...state, edicion: { ...state.edicion, ...action.cambios } }

    case 'setModoPresupuesto':
      if (state.accionEnCurso || state.presupuesto.modo === action.modo) return state
      return { ...state, ...sinTrabajo, presupuesto: { ...presupuestoInicial(), modo: action.modo } }

    /* Lo despacha la gestión al terminar de cancelar, todavía con su espera publicada: la espera
       termina acá, porque la pantalla que la publicó se va. */
    case 'reprogramarTurno': {
      const turno = { ...turnoInicial(), ...action.turno }
      const conCliente = Boolean(turno.cliente)
      return {
        ...state,
        ...sinTrabajo,
        proceso: 'agenda',
        operacion: 'crearTurno',
        destino: null,
        turno,
        paso: conCliente ? 'carga' : 'obra',
        pasoMax: conCliente ? 1 : 0,
        accionEnCurso: null,
      }
    }

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
      const otra = state.obra?.id !== action.obra.id
      return {
        ...state,
        ...(otra ? { ordenId: null, borrador: borradorInicial(), enviado: false, pasoMax: 0 } : {}),
        obra: action.obra,
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
