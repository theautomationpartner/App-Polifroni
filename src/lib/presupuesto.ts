/**
 * Reglas del área Presupuesto, sin Monday: a quién se manda, cómo se anota en el tablero y el texto
 * del WhatsApp. Probadas en `tests/presupuesto.test.ts`.
 *
 * Un presupuesto es de un cliente, de un constructor/arquitecto o de los dos. Todos los que se le
 * mandan se juntan en una misma "bolsa" (el ítem del tablero), uno por subelemento.
 */
import { MARCA_ENLACE } from '@/lib/claveConfirmacion'
import { ROLES, sinCodigo, type DatosContacto, type Rol } from '@/lib/destinatario'

export { nuevaClave } from '@/lib/claveConfirmacion'

/** Qué se hace en "Crear y Cargar Presupuestos": una bolsa nueva, u otro presupuesto en una abierta. */
export type ModoPresupuesto = 'crear' | 'cargar'

export const MODOS_PRESUPUESTO: readonly { id: ModoPresupuesto; titulo: string }[] = [
  { id: 'crear', titulo: 'Crear nuevo presupuesto' },
  { id: 'cargar', titulo: 'Cargar otro presupuesto' },
]

/** Lo mínimo de un contacto para mandarle el presupuesto. */
export interface ContactoEnvio {
  nombre: string
  /** Sólo dígitos. */
  celular: string
  email?: string
}

/**
 * Los contactos del presupuesto en la forma de los datos de la obra, para usar las MISMAS reglas de
 * destinatario que el envío de la OP (`destinoDe`, `faltantesDestino`, `advertenciasDestino`).
 */
export function datosContacto(cliente: ContactoEnvio | null, arquitecto: ContactoEnvio | null): DatosContacto {
  return {
    ctaCteCliente: cliente?.nombre ?? '',
    celCliente: cliente?.celular ?? '',
    emailCliente: cliente?.email ?? '',
    arquitecto: arquitecto?.nombre ?? '',
    celArquitecto: arquitecto?.celular ?? '',
  }
}

/**
 * Cómo se escribe a quién se mandó en `✋Enviar a:` del tablero: Ambos | Cliente | Arquitecto. El
 * tablero llama "Arquitecto" a lo que la app llama "Constructor".
 */
export function etiquetaEnviarA(roles: readonly Rol[]): string {
  if (roles.includes('Cliente') && roles.includes('Constructor')) return 'Ambos'
  if (roles.includes('Cliente')) return 'Cliente'
  if (roles.includes('Constructor')) return 'Arquitecto'
  return ''
}

/** Al revés: los destinatarios que ya tenía la bolsa ("Ambos" son los dos). */
export function rolesDeEnviarA(texto: string): Rol[] {
  const t = texto.trim()
  if (t === 'Ambos') return [...ROLES]
  if (t === 'Cliente') return ['Cliente']
  if (t === 'Arquitecto' || t === 'Constructor') return ['Constructor']
  return []
}

/**
 * Los destinatarios con que arranca el envío: los que ya tenía la bolsa (al cargar otro presupuesto)
 * o, en una nueva, todos los contactos elegidos. Sólo los que existen.
 */
export function rolesIniciales(enviarA: string, hayCliente: boolean, hayArquitecto: boolean): Rol[] {
  const existe = (r: Rol) => (r === 'Cliente' ? hayCliente : hayArquitecto)
  const previos = rolesDeEnviarA(enviarA).filter(existe)
  if (previos.length) return previos
  return ROLES.filter(existe)
}

/** El nombre del ítem de una bolsa nueva: el cliente o, si no hay cliente, el constructor. */
export function nombreBolsa(cliente: ContactoEnvio | null, arquitecto: ContactoEnvio | null): string {
  return (cliente?.nombre || arquitecto?.nombre || '').trim()
}

/**
 * El texto del WhatsApp con que sale el presupuesto, en el formato de WhatsApp (*negrita*): la
 * plantilla del usuario (05/10/2026). Va con el PDF adjunto. La fecha es la del envío, como el
 * `formatDate(…triggerTime; "DD/MM/YYYY")` del escenario de Make.
 *
 * `conEnlace`: sólo el responsable de confirmar el presupuesto recibe el párrafo con el enlace para
 * confirmarlo; al otro destinatario le llega sin él. El enlace va como `MARCA_ENLACE`: lo pone el
 * servidor al enviar, firmado (la app no conoce el secreto con que se firma).
 *
 * Es el único lugar donde está: lo muestra "Ver el mensaje que le llega" y lo manda el envío.
 */
export function textoPresupuesto(nombre: string, fecha: Date = new Date(), conEnlace = false): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const dia = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
  const confirmar = conEnlace
    ? `\n\n✅ Si lo indicado en el presupuesto te parece correcto, podés confirmarlo haciendo click en el siguiente enlace: ${MARCA_ENLACE}`
    : ''
  return `👋Hola *${sinCodigo(nombre) || 'Cliente'}*,

Adjuntamos el presupuesto. Si tenés alguna consulta sobre este o tu cuenta, por favor respondé a este mensaje o contactanos.

📄 *Concepto:* Presupuesto
📅 *Fecha:* ${dia}${confirmar}

Polifroni Aberturas
Automatizado por *The Automation Partner*`
}

/** `YYYY-MM-DD` de un instante, en la hora LOCAL (la fecha de envío que ve el usuario). */
export function fechaLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Consultar y Gestionar Presupuestos
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Los estados de `🤖Estado Presupuesto` que se gestionan: los que todavía no se ganaron ni se
 * perdieron. "Pend. de confirmar" junta a los enviados y a las bolsas abiertas ("Solicitud de
 * Presupuesto", que también ya se enviaron desde la app). "Proyecto Ganado con otro pres" no se
 * lista: ya está resuelto.
 */
export const ESTADOS_GESTION = {
  enviado: { indice: 1, etiqueta: 'Presupuesto Enviado' },
  negociacion: { indice: 3, etiqueta: 'En Negociacion' },
  vencido: { indice: 4, etiqueta: 'Presupuesto vencido' },
  solicitud: { indice: 5, etiqueta: 'Solicitud de Presupuesto' },
} as const

export const ETIQUETA_GANADO = 'Ganado'
export const ETIQUETA_PERDIDO = 'Perdido'

/** Los índices que se piden a Monday para la consulta. */
export const INDICES_GESTION: number[] = Object.values(ESTADOS_GESTION).map((e) => e.indice)

/** ¿El presupuesto en este estado se puede ganar o dar por perdido? */
export const gestionable = (etiqueta: string): boolean =>
  Object.values(ESTADOS_GESTION).some((e) => e.etiqueta === etiqueta.trim())

/**
 * ¿Se puede GANAR un presupuesto en este estado? Uno vencido no (regla del usuario, 05/10/2026): sólo
 * se puede dar por perdido.
 */
export const ganable = (etiqueta: string): boolean =>
  gestionable(etiqueta) && etiqueta.trim() !== ESTADOS_GESTION.vencido.etiqueta

export type FiltroGestion = 'todos' | 'pendientes' | 'negociacion' | 'vencidos'

export const FILTROS_GESTION: readonly { id: FiltroGestion; titulo: string }[] = [
  { id: 'todos', titulo: 'Todos' },
  { id: 'pendientes', titulo: 'Pend. de confirmar' },
  { id: 'negociacion', titulo: 'En negociación' },
  { id: 'vencidos', titulo: 'Vencidos' },
]

export function pasaFiltro(filtro: FiltroGestion, etiqueta: string): boolean {
  const e = etiqueta.trim()
  if (filtro === 'todos') return gestionable(e)
  if (filtro === 'pendientes') return e === ESTADOS_GESTION.enviado.etiqueta || e === ESTADOS_GESTION.solicitud.etiqueta
  if (filtro === 'negociacion') return e === ESTADOS_GESTION.negociacion.etiqueta
  return e === ESTADOS_GESTION.vencido.etiqueta
}

/** `✋Tipo` de la obra (Aluminio | PVC) según el tipo de carpintería del presupuesto ganado. */
export const tipoObraDe = (tipoCarpinteria: string): 'PVC' | 'Aluminio' | '' =>
  !tipoCarpinteria.trim() ? '' : /pvc/i.test(tipoCarpinteria) ? 'PVC' : 'Aluminio'

/** "1.731.694,48" o "1731694.48" → 1731694.48. `null` si no es un importe válido. */
export function importeDe(texto: string): number | null {
  const t = texto.trim().replace(/\s|\$/g, '')
  if (!t) return null
  /* Con coma, la coma es el decimal y los puntos son de miles. Sin coma, puntos que agrupan de a
     tres también son de miles ("604.500"); si no, el punto es el decimal ("1731694.48"). */
  const n = Number(
    t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t,
  )
  return Number.isFinite(n) ? n : null
}

/** Lo que falta para ganar un presupuesto y crear su obra. Vacío = se puede. */
export function faltantesGanar(d: {
  presupuestoElegido: boolean
  conPdf: boolean
  total: string
  conCliente: boolean
  cuentas: number
  cuentaElegida: boolean
}): string[] {
  const f: string[] = []
  if (!d.presupuestoElegido) f.push('Elegí cuál de los presupuestos enviados es el ganado.')
  else if (!d.conPdf) f.push('El presupuesto elegido no tiene el PDF cargado en Monday.')
  const total = importeDe(d.total)
  if (total === null || total <= 0) f.push('Ingresá el Total Pactado (un importe mayor a cero).')
  if (!d.conCliente) f.push('El presupuesto no tiene un cliente vinculado: la obra se registra en la cuenta corriente del cliente.')
  else if (d.cuentas === 0) f.push('El cliente no tiene una cuenta corriente activa. Creala en Monday y volvé a intentar.')
  else if (!d.cuentaElegida) f.push('Elegí en qué cuenta corriente se registra la obra.')
  return f
}

/** El nombre del movimiento en la cuenta corriente, como lo deja hoy el escenario de Make. */
export const nombreMovimiento = (idObra: string, nombreObra: string): string =>
  [idObra.trim(), nombreObra.trim()].filter(Boolean).join(' - ')
