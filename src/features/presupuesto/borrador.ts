import type { Rol } from '@/lib/destinatario'
import type { ModoPresupuesto } from '@/lib/presupuesto'
import type { BolsaPresupuesto, Contacto, PresupuestoEnviado } from '@/services/monday/presupuestos'

/**
 * Un presupuesto de la lista "Presupuestos a enviar": su PDF, su tipo de carpintería y su color. Cada
 * uno queda en Monday como un subelemento de la bolsa.
 */
export interface PresupuestoCargado {
  /** Id local de la fila (no es de Monday). */
  id: string
  archivo: File
  tipo: string
  color: string
  /** ✋Total Pactado del presupuesto (en pesos). */
  total: number
  /**
   * La clave del enlace de confirmación, sólo si el responsable tiene que confirmarlo. Se genera al
   * enviar y queda fija: un reintento manda el MISMO enlace, y al finalizar se guarda en su subelemento.
   */
  clave: string | null
  /* Lo que ya quedó en Monday (para que un reintento no lo repita). */
  subitemId: string | null
  pdfSubido: boolean
}

/**
 * Lo que se va cargando en "Crear y Cargar Presupuestos" entre sus tres etapas.
 *
 * Vive en el estado global —como el borrador de la OP y el del turno— porque el stepper deja ir y
 * volver entre etapas: lo elegido y los PDF cargados tienen que seguir ahí.
 *
 * En Monday no se escribe NADA hasta que los presupuestos salen: recién al finalizar se crea la bolsa
 * (al crear uno nuevo) y un subelemento por presupuesto, con su PDF. Lo que ya quedó escrito se anota
 * acá, para que un reintento no lo duplique.
 */
export interface BorradorPresupuesto {
  /** Crear una bolsa nueva o cargar otro presupuesto en una existente. `null` = todavía no se eligió. */
  modo: ModoPresupuesto | null
  /** Crear: el cliente y/o el constructor elegidos. Cargar: sólo el cliente. */
  cliente: Contacto | null
  arquitecto: Contacto | null
  /**
   * Cargar otro: la bolsa donde van los nuevos —la más reciente del cliente que no está Ganada ni
   * Perdida—. Se busca al continuar a la etapa 2.
   */
  bolsa: BolsaPresupuesto | null
  /** Cargar otro: los presupuestos ya enviados de TODAS las bolsas del cliente sin ganar ni perder. */
  enviados: PresupuestoEnviado[]
  /* El formulario de la etapa 2: el presupuesto que se está por agregar a la lista. */
  archivo: File | null
  tipo: string
  color: string
  /** El Total Pactado, tal como se escribe ("1.297.684"). */
  total: string
  /** "Presupuestos a enviar": los que ya se agregaron. Viven en la app hasta finalizar. */
  presupuestos: PresupuestoCargado[]
  /**
   * El envío ya salió: a quiénes, cuándo, quién confirma (o nadie: en el presupuesto la confirmación
   * es opcional) y qué presupuestos tiene que confirmar. Se registra al finalizar.
   */
  envio: { roles: Rol[]; cuando: string; confirmador: Rol | null; aConfirmar: string[] } | null
  /** La bolsa que ya quedó en Monday (un reintento no la vuelve a crear). */
  bolsaId: string | null
}

export const presupuestoInicial = (): BorradorPresupuesto => ({
  modo: null,
  cliente: null,
  arquitecto: null,
  bolsa: null,
  enviados: [],
  archivo: null,
  tipo: '',
  color: '',
  total: '',
  presupuestos: [],
  envio: null,
  bolsaId: null,
})

/**
 * Ya hay a quién mandarle el presupuesto: se puede pasar a la carga. Cargar otro: el cliente (sus
 * presupuestos se buscan al continuar).
 */
export const conDestinatario = (p: BorradorPresupuesto): boolean =>
  p.modo === 'cargar' ? !!p.cliente : !!(p.cliente || p.arquitecto)

/** Hay algo elegido o cargado del presupuesto: salir lo descarta, y se pregunta antes. */
export const presupuestoEnCurso = (p: BorradorPresupuesto): boolean =>
  !!(p.cliente || p.arquitecto || p.bolsa || p.archivo || p.presupuestos.length)

/** Un id local para una fila nueva de la lista. */
export const idFila = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
