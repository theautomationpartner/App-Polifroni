/**
 * Reglas del área Presupuesto, sin Monday: a quién se manda, cómo se anota en el tablero y el texto
 * del WhatsApp. Probadas en `tests/presupuesto.test.ts`.
 *
 * Un presupuesto es de un cliente, de un constructor/arquitecto o de los dos. Todos los que se le
 * mandan se juntan en una misma "bolsa" (el ítem del tablero), uno por subelemento.
 */
import { ROLES, sinCodigo, type DatosContacto, type Rol } from '@/lib/destinatario'

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
 * El texto del WhatsApp con que sale el presupuesto, en el formato de WhatsApp (*negrita*). Va con el
 * PDF adjunto y SIN enlace de confirmación (el presupuesto no se confirma por la app).
 *
 * PROVISORIO: el usuario va a pasar el texto definitivo. Es el único lugar donde está: lo muestra
 * "Ver el mensaje que le llega" y lo manda el envío.
 */
export function textoPresupuesto(nombre: string): string {
  return `Hola *${sinCodigo(nombre) || 'Cliente'}* 👋

🧾 Te adjuntamos el *Presupuesto* de tus aberturas.

Revisalo con atención: tipo de carpintería, color, medidas y cantidades.

Si querés hacer algún cambio o tenés alguna consulta, respondé este mensaje y lo vemos.

¡Gracias por tu confianza!
🏠 Polifroni Aberturas`
}

/** `YYYY-MM-DD` de un instante, en la hora LOCAL (la fecha de envío que ve el usuario). */
export function fechaLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}
