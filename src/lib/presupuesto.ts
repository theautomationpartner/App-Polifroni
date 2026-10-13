/**
 * Reglas del área Presupuesto, sin Monday: a quién se manda, cómo se anota en el tablero y el texto
 * del WhatsApp. Probadas en `tests/presupuesto.test.ts`.
 *
 * Un presupuesto es de un cliente, de un constructor/arquitecto o de los dos. Todos los que se le
 * mandan se juntan en una misma "bolsa" (el ítem del tablero), uno por subelemento.
 */
import { ROLES, sinCodigo, type DatosContacto, type Rol } from '@/lib/destinatario'
import type { BolsaPresupuesto, PresupuestoEnviado } from '@/services/monday/presupuestos'

export { nuevaClave } from '@/lib/claveConfirmacion'

/** Qué se hace en "Crear y Cargar Presupuestos": una bolsa nueva, u otro presupuesto en una existente. */
export type ModoPresupuesto = 'crear' | 'cargar'

export const MODOS_PRESUPUESTO: readonly { id: ModoPresupuesto; titulo: string }[] = [
  { id: 'crear', titulo: 'Crear nuevo presupuesto' },
  { id: 'cargar', titulo: 'Cargar otro presupuesto sobre uno ya existente' },
]

/** Lo mínimo de un contacto para mandarle el presupuesto. */
export interface ContactoEnvio {
  nombre: string
  /** Sólo dígitos. */
  celular: string
  email?: string
}

/** El ítem comodín "SIN ARQUITECTO" de 👤 Constructor/Arquitecto: el que se usa cuando no hay ninguno. */
export const SIN_ARQUITECTO_ID = '10910009068'

/**
 * ¿Es el comodín "SIN ARQUITECTO" (por su id o por su nombre)? No es una persona: no se le envía nada
 * ni coordina una obra (regla del usuario, 13/10/2026).
 */
export const esSinArquitecto = (c: { id: string; nombre: string } | null | undefined): boolean =>
  !!c && (c.id === SIN_ARQUITECTO_ID || /^(\d+\s*-\s*)?sin\s+(arquitecto|constructor)\b/i.test(c.nombre.trim()))

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
 * Dónde va el enlace para confirmar UN presupuesto en el texto que arma la app: el servidor cambia cada
 * marca por el enlace firmado con esa clave (`api/_whatsappHttp.ts`, `marcaPresupuesto`). Lleva la clave
 * adentro porque un mismo mensaje puede pedir confirmar varios presupuestos, cada uno con el suyo.
 */
export const marcaPresupuesto = (clave: string): string => `[[ENLACE_CONFIRMACION:${clave}]]`

/** Un presupuesto en el mensaje: cómo se lo nombra y, si hay que confirmarlo, su clave. */
export interface PresupuestoEnMensaje {
  etiqueta: string
  /** La clave del enlace, sólo en los que el responsable tiene que confirmar. */
  clave: string | null
}

/** "Presupuesto_Cocina.pdf" + Aluminio + Negro → "Presupuesto_Cocina (Aluminio · Negro)". */
export function etiquetaPresupuesto(p: { nombreArchivo: string; tipo: string; color: string }): string {
  const nombre = p.nombreArchivo.replace(/\.[^.]+$/, '').trim() || 'Presupuesto'
  const datos = [p.tipo, p.color].filter((x) => x.trim()).join(' · ')
  return datos ? `${nombre} (${datos})` : nombre
}

/**
 * El texto del WhatsApp con que salen los presupuestos, en el formato de WhatsApp (*negrita*): la
 * plantilla del usuario (05/10/2026), con el texto genérico para uno o varios presupuestos (regla del
 * 09/10/2026: "Le adjuntamos los presupuestos solicitados..."). Después del texto sale cada PDF, como
 * un mensaje aparte. La fecha es la del envío.
 *
 * `confirmar`: sólo el responsable de confirmar recibe el párrafo con los enlaces —uno por cada
 * presupuesto que tiene que confirmar (todos, o uno solo)—. Al otro destinatario, o si no se pidió
 * confirmación, le llega sin él. Los enlaces van como `marcaPresupuesto(clave)`: los firma el servidor.
 *
 * Es el único lugar donde está: lo muestra "Ver el mensaje que le llega" y lo manda el envío.
 */
export function textoPresupuestos(
  nombre: string,
  cantidad: number,
  fecha: Date = new Date(),
  confirmar: readonly PresupuestoEnMensaje[] = [],
  /** Un reenvío desde Consultar y Gestionar (regla del usuario, 13/10/2026): el mensaje lo dice. */
  reenvio = false,
): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const dia = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
  const varios = cantidad > 1
  const aConfirmar = confirmar.filter((p) => p.clave)
  let parrafoConfirmar = ''
  if (aConfirmar.length === 1) {
    const p = aConfirmar[0]
    parrafoConfirmar = `\n\n✅ Si lo indicado en ${varios ? `el presupuesto *${p.etiqueta}*` : 'el presupuesto'} te parece correcto, podés confirmarlo haciendo click en el siguiente enlace: ${marcaPresupuesto(p.clave ?? '')}`
  } else if (aConfirmar.length > 1) {
    parrafoConfirmar = `\n\n✅ Si lo indicado en los presupuestos te parece correcto, podés confirmar cada uno haciendo click en su enlace:\n${aConfirmar
      .map((p) => `• *${p.etiqueta}*: ${marcaPresupuesto(p.clave ?? '')}`)
      .join('\n')}`
  }
  return `👋Hola *${sinCodigo(nombre) || 'Cliente'}*,

${reenvio ? '🔁 Te *REENVIAMOS* ' : 'Le adjuntamos '}${varios ? 'los presupuestos solicitados' : 'el presupuesto solicitado'}. Si tenés alguna consulta sobre ${varios ? 'estos' : 'este'} o tu cuenta, por favor respondé a este mensaje o contactanos.

📄 *Concepto:* ${reenvio ? 'Reenvío de ' : ''}${varios ? `${reenvio ? 'presupuestos' : 'Presupuestos'} (${cantidad})` : reenvio ? 'presupuesto' : 'Presupuesto'}
📅 *Fecha:* ${dia}${parrafoConfirmar}

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

export const ETIQUETA_GANADO = 'Ganado'
export const ETIQUETA_PERDIDO = 'Perdido'
const ETIQUETA_VENCIDO = 'Presupuesto vencido'

/**
 * Los índices de `🤖Estado Presupuesto` de las bolsas que YA NO se gestionan: Ganado (0) y Perdido
 * (2). La consulta lista los presupuestos de todas las demás (regla del usuario, 13/10/2026).
 */
export const INDICES_CERRADOS: number[] = [0, 2]

/** ¿La bolsa en este estado se gestiona? Todas menos las Ganadas y las Perdidas. */
export const gestionable = (etiqueta: string): boolean => ![ETIQUETA_GANADO, ETIQUETA_PERDIDO].includes(etiqueta.trim())

/**
 * ¿Se puede CONFIRMAR un presupuesto de una bolsa en este estado? Una vencida no (regla del usuario,
 * 05/10/2026): sólo se puede dar por perdido.
 */
export const ganable = (etiqueta: string): boolean => gestionable(etiqueta) && etiqueta.trim() !== ETIQUETA_VENCIDO

/** La respuesta de un presupuesto (`🤖 Estado de Confirmacion`). */
export type SituacionPresupuesto = 'pendiente' | 'confirmado' | 'rechazado' | 'error'

export function situacionDe(confirmacion: string): SituacionPresupuesto {
  const e = confirmacion.trim()
  if (!e) return 'pendiente'
  if (e === 'Rechazado') return 'rechazado'
  if (e === 'Confirmado') return 'confirmado'
  return 'error'
}

/** ¿El presupuesto ya salió por WhatsApp? Su `🤖 Estado de Envio` lo dice (no el estado de la bolsa). */
export const yaEnviado = (estadoEnvio: string): boolean => estadoEnvio.trim() === 'Enviado'

/**
 * Qué se puede hacer con un presupuesto (regla del usuario, 13/10/2026). Sólo con uno que todavía no
 * tiene respuesta:
 *  - Enviar (si nunca salió) o Reenviar (si ya salió). Hace falta el PDF.
 *  - Confirmar: hace falta el PDF y que la bolsa no esté vencida.
 *  - Perdido (rechazarlo).
 */
export function accionesPresupuesto(
  estadoBolsa: string,
  p: { estadoEnvio: string; confirmacion: string; pdf: unknown },
): { envio: 'enviar' | 'reenviar' | null; confirmar: boolean; perder: boolean } {
  /* Sin respuesta y en una bolsa que se sigue gestionando (no recién Ganada o Perdida). */
  if (situacionDe(p.confirmacion) !== 'pendiente' || !gestionable(estadoBolsa)) return { envio: null, confirmar: false, perder: false }
  return {
    envio: p.pdf ? (yaEnviado(p.estadoEnvio) ? 'reenviar' : 'enviar') : null,
    confirmar: !!p.pdf && ganable(estadoBolsa),
    perder: true,
  }
}

export type FiltroGestion = 'todos' | 'paraEnviar' | 'enviados' | 'rechazados'

export const FILTROS_GESTION: readonly { id: FiltroGestion; titulo: string }[] = [
  { id: 'todos', titulo: 'Todos' },
  { id: 'paraEnviar', titulo: 'Para enviar' },
  { id: 'enviados', titulo: 'Pend. de confirmar' },
  { id: 'rechazados', titulo: 'Rechazados' },
]

export function pasaFiltro(filtro: FiltroGestion, p: { estadoEnvio: string; confirmacion: string }): boolean {
  const s = situacionDe(p.confirmacion)
  if (filtro === 'todos') return true
  if (filtro === 'rechazados') return s === 'rechazado'
  if (filtro === 'paraEnviar') return s === 'pendiente' && !yaEnviado(p.estadoEnvio)
  return s === 'pendiente' && yaEnviado(p.estadoEnvio)
}

/** Las bolsas que ya no reciben presupuestos: "cargar otro" no las lista (regla del usuario, 13/10/2026). */
const BOLSA_CERRADA = [ETIQUETA_GANADO, ETIQUETA_PERDIDO]

/**
 * Cargar otro presupuesto: de las bolsas del cliente, las que no están Ganadas ni Perdidas. Los
 * presupuestos ya enviados de TODAS ellas se listan (por fecha de envío); los nuevos van a la más
 * reciente (el id de Monday crece con el tiempo). `null` si no queda ninguna.
 */
export function bolsaParaCargar(
  bolsas: (BolsaPresupuesto & { estado: string })[],
): { bolsa: BolsaPresupuesto; enviados: PresupuestoEnviado[] } | null {
  const abiertas = bolsas.filter((b) => !BOLSA_CERRADA.includes(b.estado.trim()))
  if (!abiertas.length) return null
  const bolsa = abiertas.reduce((m, b) => (Number(b.id) > Number(m.id) ? b : m))
  const enviados = abiertas
    .flatMap((b) => b.presupuestos)
    .sort((a, b) => a.fechaEnvio.localeCompare(b.fechaEnvio) || Number(a.id) - Number(b.id))
  return { bolsa, enviados }
}

/** `✋Tipo` de la obra (Aluminio | PVC) según el tipo de carpintería del presupuesto. */
export const tipoObraDe = (tipoCarpinteria: string): 'PVC' | 'Aluminio' | '' =>
  !tipoCarpinteria.trim() ? '' : /pvc/i.test(tipoCarpinteria) ? 'PVC' : 'Aluminio'

/**
 * El color de la etiqueta del tipo de carpintería (regla del usuario, 09/10/2026): PVC en verde y el
 * aluminio —"Aluminio", "Alumino", "Aluminio A30New"— en amarillo, los colores de Monday.
 */
export const colorTipoCarpinteria = (tipo: string): string =>
  tipoObraDe(tipo) === 'PVC' ? '#00c875' : tipoObraDe(tipo) === 'Aluminio' ? '#ffcb00' : '#c4c4c4'

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

/** 1297684 → "$ 1.297.684"; 1731694.48 → "$ 1.731.694,48". */
export function formatoImporte(n: number): string {
  const entero = Number.isInteger(n)
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`
}

