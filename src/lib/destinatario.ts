/**
 * A quién se le manda la OP para que la confirme.
 *
 * La orden va al cliente, al constructor o a los dos: se eligen en la lista de destinatarios del
 * envío. A CADA uno le llega el mensaje con el enlace de confirmación —antes al constructor le
 * llegaba sin él, y una orden se podía fabricar sin que nadie la validara—.
 *
 * Mientras la app no tenga un módulo de contactos, el rol lo da de dónde sale el dato: la cuenta
 * corriente es el cliente; el constructor/arquitecto vinculado a la obra, el constructor.
 *
 * Este archivo no habla con Monday: son reglas puras, probadas en `tests/destinatario.test.ts`.
 */

export type Rol = 'Cliente' | 'Constructor'

export const ROLES: readonly Rol[] = ['Cliente', 'Constructor']

/** Lo que hace falta de la obra para resolver al destinatario. */
export interface DatosContacto {
  ctaCteCliente: string
  celCliente: string
  emailCliente: string
  arquitecto: string
  celArquitecto: string
}

export interface Destino {
  tipo: Rol
  nombre: string
  /** Sólo dígitos, como lo espera el escenario. */
  whatsapp: string
  email: string
  /** El espejo traía más de un celular: se usa el primero, y hay que decirlo. */
  variosCelulares: boolean
}

/** "1111 - CLIENTE TEST" → "CLIENTE TEST": el código de la cuenta no va en un saludo. */
export const sinCodigo = (nombre: string) => nombre.replace(/^\s*\d+\s*-\s*/, '').trim()

/** Un espejo de Monday puede traer varios valores separados por coma: se usa el primero. */
const valores = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export const digitos = (v: string) => v.replace(/\D/g, '')

/**
 * Un celular escrito a mano, en la forma en que se guarda: sólo dígitos y, si vino con los 10 de
 * característica + número, con el 549 de los móviles adelante ("249 436-9123" → "5492494369123").
 */
export function normalizarCelular(texto: string): string {
  const d = digitos(texto)
  return /^\d{10}$/.test(d) ? `549${d}` : d
}

/** "SIN ARQUITECTO", "SIN CONSTRUCTOR": el tablero usa un ítem comodín cuando no hay nadie. */
const esComodin = (nombre: string) => /^sin\s+(arquitecto|constructor)/i.test(nombre.trim())

export function destinoDe(obra: DatosContacto, rol: Rol): Destino {
  const cliente = rol === 'Cliente'
  const cels = valores(cliente ? obra.celCliente : obra.celArquitecto)
  const nombre = sinCodigo(cliente ? obra.ctaCteCliente : obra.arquitecto)
  return {
    tipo: rol,
    nombre: esComodin(nombre) ? '' : nombre,
    whatsapp: digitos(cels[0] ?? ''),
    email: cliente ? (valores(obra.emailCliente)[0] ?? '') : '',
    variosCelulares: cels.length > 1,
  }
}

/**
 * Un celular argentino con el que WhatsApp puede mandar: 10 dígitos (característica + número),
 * con el 54 adelante (12) o con el 549 de los móviles (13). Lo que no cae en eso se frena antes
 * de mandar: el escenario lo intentaría igual y el mensaje no llegaría a nadie.
 */
export function celularValido(digs: string): boolean {
  if (/^549\d{10}$/.test(digs)) return true
  if (/^54\d{10}$/.test(digs)) return true
  return /^\d{10}$/.test(digs)
}

/** "5491122334455" → "+54 9 11 2233-4455". Si no reconoce la forma, lo devuelve tal cual. */
export function formatoCelular(digs: string): string {
  const m = /^(54)(9?)(\d{2})(\d{4})(\d{4})$/.exec(digs)
  if (m) return `+${m[1]}${m[2] ? ' 9' : ''} ${m[3]} ${m[4]}-${m[5]}`
  const l = /^(\d{2})(\d{4})(\d{4})$/.exec(digs)
  return l ? `${l[1]} ${l[2]}-${l[3]}` : digs
}

/** Los últimos 10 dígitos: el mismo número escrito con o sin 549 es el mismo número. */
const nucleo = (digs: string) => digs.slice(-10)

/**
 * Lo que impide mandar al destinatario elegido, dicho como lo que hay que resolver. Vacío = se
 * puede mandar.
 */
export function faltantesDestino(obra: DatosContacto, rol: Rol | ''): string[] {
  if (!rol) return ['Elegí si la orden va al cliente o al constructor.']
  const d = destinoDe(obra, rol)
  const quien = rol === 'Cliente' ? 'el cliente' : 'el constructor'
  const falta: string[] = []
  if (!d.nombre) {
    falta.push(
      rol === 'Cliente'
        ? 'La obra no tiene una cuenta corriente de cliente vinculada.'
        : 'La obra no tiene un constructor/arquitecto vinculado.',
    )
  }
  if (!d.whatsapp) falta.push(`No hay un celular de WhatsApp cargado para ${quien}.`)
  else if (!celularValido(d.whatsapp)) {
    falta.push(`El celular de ${quien} (${d.whatsapp}) no tiene un formato válido.`)
  }
  return falta
}

/**
 * Lo que conviene mirar antes de mandar, sin frenar: los casos en que el número podría no ser el
 * de la persona elegida.
 */
export function advertenciasDestino(obra: DatosContacto, rol: Rol | ''): string[] {
  if (!rol) return []
  const d = destinoDe(obra, rol)
  const otro = destinoDe(obra, rol === 'Cliente' ? 'Constructor' : 'Cliente')
  const avisos: string[] = []
  if (d.whatsapp && otro.whatsapp && nucleo(d.whatsapp) === nucleo(otro.whatsapp)) {
    avisos.push(
      'El cliente y el constructor tienen el MISMO celular. Verificá que el enlace le llegue a quien tiene que confirmar.',
    )
  }
  if (d.variosCelulares) {
    avisos.push(`Hay más de un celular cargado: se usa el primero (${formatoCelular(d.whatsapp)}).`)
  }
  return avisos
}

/**
 * Un teléfono como lo muestra Monday: "+54 249 452 2200". Con el 9 de los móviles, va aparte:
 * "+54 9 249 458 7833". Lo que no es un número argentino reconocible sale con el "+" y sus dígitos.
 */
export function formatoMonday(telefono: string): string {
  const d = telefono.replace(/\D/g, '')
  if (!d) return ''
  const conPais = d.startsWith('54') ? d.slice(2) : d.length === 10 ? d : ''
  if (!conPais) return `+${d}`
  const nueve = conPais.length === 11 && conPais.startsWith('9')
  const cuerpo = nueve ? conPais.slice(1) : conPais
  if (cuerpo.length !== 10) return `+${d}`
  return `+54 ${nueve ? '9 ' : ''}${cuerpo.slice(0, 3)} ${cuerpo.slice(3, 6)} ${cuerpo.slice(6)}`
}
