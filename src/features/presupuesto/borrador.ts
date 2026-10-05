import type { Rol } from '@/lib/destinatario'
import type { ModoPresupuesto } from '@/lib/presupuesto'
import type { BolsaPresupuesto, Contacto } from '@/services/monday/presupuestos'

/**
 * Lo que se va cargando en "Crear y Cargar Presupuestos" entre sus dos etapas.
 *
 * Vive en el estado global —como el borrador de la OP y el del turno— porque el stepper deja ir y
 * volver entre etapas: lo elegido y el PDF cargado tienen que seguir ahí.
 *
 * En Monday no se escribe NADA hasta que el presupuesto sale: recién al finalizar se crea la bolsa
 * (al crear uno nuevo) y su subelemento con el PDF. Lo que ya quedó escrito se anota acá, para que un
 * reintento no lo duplique.
 */
export interface BorradorPresupuesto {
  /** Crear una bolsa nueva o cargar otro presupuesto en una abierta. `null` = todavía no se eligió. */
  modo: ModoPresupuesto | null
  /** Crear: el cliente y/o el constructor elegidos. Cargar: los de la bolsa elegida. */
  cliente: Contacto | null
  arquitecto: Contacto | null
  /** Cargar otro: la bolsa elegida (en "Solicitud de Presupuesto"). */
  bolsa: BolsaPresupuesto | null
  /** El PDF del presupuesto. Vive en la app hasta finalizar. */
  archivo: File | null
  tipo: string
  color: string
  /** El envío ya salió: a quiénes y cuándo. Se registra al finalizar. */
  envio: { roles: Rol[]; cuando: string } | null
  /* Lo que ya quedó en Monday (para que un reintento no lo repita). */
  bolsaId: string | null
  subitemId: string | null
  archivoSubido: File | null
}

export const presupuestoInicial = (): BorradorPresupuesto => ({
  modo: null,
  cliente: null,
  arquitecto: null,
  bolsa: null,
  archivo: null,
  tipo: '',
  color: '',
  envio: null,
  bolsaId: null,
  subitemId: null,
  archivoSubido: null,
})

/** Ya hay a quién mandarle el presupuesto: se puede pasar a la carga. */
export const conDestinatario = (p: BorradorPresupuesto): boolean =>
  p.modo === 'cargar' ? !!p.bolsa : !!(p.cliente || p.arquitecto)

/** Hay algo elegido o cargado del presupuesto: salir lo descarta, y se pregunta antes. */
export const presupuestoEnCurso = (p: BorradorPresupuesto): boolean =>
  !!(p.cliente || p.arquitecto || p.bolsa || p.archivo)
