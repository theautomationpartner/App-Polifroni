/**
 * Las reglas del área Agenda: los tipos de turno, el ciclo de vida de un turno y los mensajes que
 * recibe el cliente. Este archivo no habla con Monday: es la regla sola, para poder probarla sin red
 * (`npm run test:agenda`).
 *
 *   Crear turno ──¿enviar asignación?──▶ Asignada ─┐
 *        │                                         ├──confirmar──▶ Cumplido
 *        └──────────────no──────────────▶ Pendiente┘
 *                                          │  ▲ enviar asignación (desde la gestión)
 *                     cancelar / reprogramar ▼
 *                                       Cancelado ──reprogramar──▶ (turno nuevo)
 *
 * Los textos de las etiquetas son los del tablero 📅 Agenda, tal cual: la app compara contra lo que
 * Monday devuelve ("Asignada", no "Asignado").
 */

/* ────────────────────────────────────────────────────────────────────────────────
 * Tipos de turno
 * ──────────────────────────────────────────────────────────────────────────────── */

export type TipoTurno = 'colocacion' | 'reparacion' | 'entrega' | 'medicion' | 'terminacion'

/** De dónde salen los elementos que se pueden elegir para el turno. */
export type OrigenTurno = 'obras' | 'pendientes'

export interface DefTipoTurno {
  id: TipoTurno
  titulo: string
  /** La etiqueta de `✋ Tipo de Turno` en el tablero. */
  etiqueta: string
  /**
   * El índice de esa etiqueta. Se escribe por índice y no por texto: en el tablero se renombran
   * etiquetas ("MEDIR" pasó a "Medicion") y el índice es lo que no cambia.
   */
  indice: number
  /** Otros nombres que tuvo la etiqueta, para leer los turnos viejos. */
  alias?: string[]
  icono: string
  origen: OrigenTurno
  /** Filtro de `✋Etapa de Produccion` de la obra. `null` = todas las obras del cliente. */
  etapa: string | null
}

/** Las etiquetas de `✋Etapa de Produccion` que filtran las obras (RN-03, RN-04). */
export const ETAPA_A_COLOCAR = 'A Colocar'
export const ETAPA_A_MEDIR = 'A Medir'

export const TIPOS_TURNO: readonly DefTipoTurno[] = [
  { id: 'colocacion', titulo: 'Colocación', etiqueta: 'Colocacion', indice: 1, icono: 'fa-hammer', origen: 'obras', etapa: ETAPA_A_COLOCAR },
  { id: 'reparacion', titulo: 'Reparación', etiqueta: 'Reparacion', indice: 2, icono: 'fa-screwdriver-wrench', origen: 'obras', etapa: null },
  { id: 'entrega', titulo: 'Entrega/Reparto', etiqueta: 'Reparto', indice: 0, alias: ['Entrega/Reparto', 'Entrega'], icono: 'fa-truck', origen: 'pendientes', etapa: null },
  { id: 'medicion', titulo: 'Medición', etiqueta: 'Medicion', indice: 4, alias: ['MEDIR'], icono: 'fa-ruler-combined', origen: 'obras', etapa: ETAPA_A_MEDIR },
  /* La etiqueta TERMINACIONES está DESACTIVADA en el tablero: hay que reactivarla en Monday para que
     un turno de Terminación se pueda registrar (la API no escribe etiquetas desactivadas). */
  { id: 'terminacion', titulo: 'Terminación', etiqueta: 'TERMINACIONES', indice: 3, alias: ['Terminacion'], icono: 'fa-paint-roller', origen: 'obras', etapa: null },
]

export const defTipo = (t: TipoTurno): DefTipoTurno => TIPOS_TURNO.find((d) => d.id === t)!

/**
 * El tipo a partir de la etiqueta del tablero. Los turnos viejos tienen tipos que la app no carga
 * (TERMINACIONES, SELLAR): ésos devuelven `null` y se muestran con su etiqueta tal cual.
 */
export function tipoDeEtiqueta(etiqueta: string): TipoTurno | null {
  const e = sinTildes(etiqueta)
  if (!e) return null
  return TIPOS_TURNO.find((d) => [d.etiqueta, ...(d.alias ?? [])].some((x) => sinTildes(x) === e))?.id ?? null
}

/** Minúsculas y sin tildes: "Medición" y "MEDICION" son la misma etiqueta. */
function sinTildes(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Estados del turno
 * ──────────────────────────────────────────────────────────────────────────────── */

export type EstadoTurno = 'pendiente' | 'asignado' | 'cumplido' | 'cancelado'

/** Las etiquetas de `🤖 Estado Turno`, tal cual están hoy en el tablero. */
export const ETIQUETA_TURNO: Record<EstadoTurno, string> = {
  pendiente: 'Pendiente de Enviar',
  asignado: 'Asignado-Enviado',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
}

/**
 * Los índices de esas etiquetas. El estado se ESCRIBE por índice: las etiquetas se renombran en el
 * tablero ("Asignada" pasó a "Asignado-Enviado" y "Pendiente" a "Pendiente de Enviar") y escribir
 * un texto que ya no existe hace fallar la escritura entera.
 */
export const INDICE_TURNO: Record<EstadoTurno, number> = {
  asignado: 0,
  cumplido: 1,
  cancelado: 2,
  pendiente: 5,
}

/** Rótulo y color de cada estado: los del tablero, para que pantalla y tablero se lean igual. */
export const VISTA_TURNO: Record<EstadoTurno, { rotulo: string; color: string }> = {
  pendiente: { rotulo: 'Pendiente de Enviar', color: '#c4c4c4' },
  asignado: { rotulo: 'Enviado', color: '#579bfc' },
  cumplido: { rotulo: 'Cumplido', color: '#00c875' },
  cancelado: { rotulo: 'Cancelado', color: '#df2f4a' },
}

/**
 * El estado a partir de la etiqueta. Se lee por cómo EMPIEZA ("Asignad…", "Cumplid…",
 * "Cancelad…"), así un renombre como "Asignado-Enviado" no lo rompe. Sin etiqueta —un turno
 * cargado a mano que nadie movió— o con "Pendiente…", está pendiente.
 */
export function estadoDeTurno(etiqueta: string): EstadoTurno {
  const e = sinTildes(etiqueta)
  if (e.startsWith('asignad')) return 'asignado'
  if (e.startsWith('cumplid')) return 'cumplido'
  if (e.startsWith('cancelad')) return 'cancelado'
  return 'pendiente'
}

/** Un turno está activo mientras no se cumplió ni se canceló. */
export const activo = (e: EstadoTurno): boolean => e === 'pendiente' || e === 'asignado'

export type AccionTurno = 'asignar' | 'reprogramar' | 'cancelar' | 'confirmar'

/**
 * Qué se puede hacer con un turno según su estado. Cumplido y Cancelado son finales: un turno
 * cancelado se reprograma creando otro, no reabriéndolo (RN-11).
 */
export function admiteTurno(e: EstadoTurno, accion: AccionTurno): boolean {
  /* Sólo se asigna el que está sin asignar; confirmar, cancelar o reprogramar, sólo el asignado. */
  if (accion === 'asignar') return e === 'pendiente'
  return e === 'asignado'
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Colocación: aprobación de la obra por su saldo
 * ──────────────────────────────────────────────────────────────────────────────── */

export type Aprobacion = 'aprobada' | 'noAprobada'

/** Las etiquetas de `Estado de Aprobacion` en el tablero. */
export const ETIQUETA_APROBACION: Record<Aprobacion, string> = {
  aprobada: 'Aprobado',
  noAprobada: 'NO Aprobado',
}

/**
 * RN-08: saldo > 0 → No aprobada; saldo = 0 → Aprobada. Un saldo negativo (a favor del cliente)
 * tampoco deja nada por cobrar: aprobada. Sin saldo legible no se decide: `null`, y la pantalla lo
 * dice en vez de inventar un "aprobada".
 */
export function aprobacionPorSaldo(saldo: number | null): Aprobacion | null {
  if (saldo === null || !Number.isFinite(saldo)) return null
  return saldo > 0 ? 'noAprobada' : 'aprobada'
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Elementos del cliente: obras y pendientes de entrega
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface ObraDeCliente {
  id: string
  nombre: string
  /** `✋Etapa de Produccion`, tal cual. */
  etapa: string
  etapaColor: string
  /** `✋Tipo`: PVC / Aluminio. */
  material: string
  ubicacion: string
  celCoordinar: string
  /** `🤖 Saldo`. `null` si no se pudo leer ni reconstruir. */
  saldo: number | null
  /** `🤖 % Cancelado` (lo cobrado, de 0 a 100). `null` si la fórmula no contesta. */
  pctCancelado: number | null
  /** Ids de sus OP en el tablero de órdenes: de sus subelementos salen las aberturas. */
  ordenesIds: string[]
}

export interface PendienteDeCliente {
  id: string
  nombre: string
  producto: string
  /** `🤖Q VTA`: lo vendido. */
  vendido: number
  /** `🤖Pend de Entrega`: lo que falta entregar. */
  pendiente: number
  /** `🤖Estado De Entrega`. */
  estado: string
}

/** RN-03 a RN-05: las obras del cliente que corresponden al tipo de turno. */
export function obrasParaTipo(tipo: TipoTurno, obras: readonly ObraDeCliente[]): ObraDeCliente[] {
  const def = defTipo(tipo)
  if (def.origen !== 'obras') return []
  if (!def.etapa) return [...obras]
  const etapa = def.etapa.toLowerCase()
  return obras.filter((o) => o.etapa.trim().toLowerCase() === etapa)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Alta del turno
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Colocación y Reparación pueden ser "Sin Obra": no se elige ninguna obra del cliente. */
export const admiteSinObra = (t: TipoTurno | null): boolean => t === 'colocacion' || t === 'reparacion'

export interface DatosAlta {
  clienteId: string | null
  tipo: TipoTurno | null
  elementoId: string | null
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`, en la hora local: el turno es en un día Y a una hora. */
  hora?: string
  /** Colocación y Reparación: con o sin obra. Por defecto, con obra. */
  conObra?: boolean
  /** Reparación: el tipo de reparación (`✋ Tipo de Reparacion`). */
  tipoReparacion?: string
}

/** RN-01: lo que falta para poder registrar el turno, dicho como lo que hay que completar. */
export function faltantesAlta(d: DatosAlta, hoy: string): string[] {
  const f: string[] = []
  const sinObra = admiteSinObra(d.tipo) && d.conObra === false
  if (!d.clienteId) f.push('Elegí el cliente.')
  if (!d.tipo) f.push('Elegí el tipo de turno.')
  else if (!d.elementoId && !sinObra) f.push(defTipo(d.tipo).origen === 'pendientes' ? 'Elegí el pendiente a entregar.' : 'Elegí la obra.')
  if (d.tipo === 'reparacion' && !d.tipoReparacion?.trim()) f.push('Elegí el tipo de reparación.')
  if (!d.fecha) f.push('Elegí la fecha del turno.')
  else if (d.fecha < hoy) f.push('La fecha del turno no puede ser anterior a hoy.')
  return f
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Fecha y hora del turno en la columna de Monday
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * La fecha y la hora del turno como las guarda la columna date de Monday: la hora va en UTC (probado
 * contra el tablero: las 00:00 de Argentina quedan como `"time":"03:00:00"`). Se arma desde la hora
 * LOCAL que se eligió en la pantalla. Sin hora, sólo la fecha.
 */
export function aColumnaFecha(fecha: string, hora?: string): { date: string; time?: string } {
  if (!hora) return { date: fecha }
  const local = new Date(`${fecha}T${hora}:00`)
  if (Number.isNaN(local.getTime())) return { date: fecha }
  const iso = local.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) }
}

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * La fecha y la hora LOCALES de la columna date de Monday (su `value`, con la hora en UTC). Los
 * turnos cargados a mano antes de pedir la hora tienen las 00:00: eso es "sin hora", y vuelve vacía.
 */
export function deColumnaFecha(valor: { date?: string; time?: string | null } | null | undefined): { fecha: string; hora: string } {
  const date = valor?.date ?? ''
  if (!date) return { fecha: '', hora: '' }
  if (!valor?.time) return { fecha: date, hora: '' }
  const d = new Date(`${date}T${valor.time}Z`)
  if (Number.isNaN(d.getTime())) return { fecha: date, hora: '' }
  const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`
  return { fecha, hora: hora === '00:00' ? '' : hora }
}

/**
 * Las claves del cuándo en los mensajes: la fecha y, si el turno la tiene, el rango horario
 * aproximado (la hora del turno). Sin fecha, "NO ESPECIFICADO". `sep`: el espacio tras el ícono (la cancelación
 * lleva dos, como su plantilla).
 */
function clavesCuando(d: { fecha: string; hora?: string }, sep = ' '): string[] {
  const fecha = `📅${sep}*Fecha:* ${d.fecha ? fechaCorta(d.fecha) : NO_ESP}`
  /* El rango horario es opcional: sin él, el mensaje lleva sólo la fecha. */
  return d.hora ? [fecha, `🕐${sep}*Rango Horario Aproximado:* ${d.hora} hs`] : [fecha]
}

/** "15/10/2026 14:30 hs", o sólo la fecha si el turno no tiene hora. */
export function fechaHoraCorta(fecha: string, hora?: string): string {
  if (!fecha) return ''
  return hora ? `${fechaCorta(fecha)} ${hora} hs` : fechaCorta(fecha)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Confirmación: el estado de finalización (sólo Colocación)
 * ──────────────────────────────────────────────────────────────────────────────── */

export type ResultadoColocacion = 'total' | 'parcial'

/** Medición: se pudo medir, o no (las mochetas no estaban como indicaba el presupuesto). */
export type ResultadoMedicion = 'medido' | 'noMedido'

export const ROTULO_MEDICION: Record<ResultadoMedicion, string> = {
  medido: 'Medido exitosamente',
  noMedido: 'NO se pudo medir',
}

export interface Finalizacion {
  colocacion?: ResultadoColocacion
  medicion?: ResultadoMedicion
}

/**
 * Qué pide cada tipo al confirmar: Colocación, si fue total o parcial; Medición, si se pudo medir.
 * Reparación y Entrega/Reparto se confirman sin dato de finalización.
 */
export const DATO_FINALIZACION: Record<TipoTurno, string | null> = {
  colocacion: 'Resultado de la colocación',
  entrega: null,
  reparacion: null,
  medicion: 'Resultado de la medición',
  terminacion: null,
}

/** Lo que falta para confirmar: el resultado de la colocación o de la medición. */
export function faltantesFinalizacion(tipo: TipoTurno | null, f: Finalizacion): string[] {
  if (tipo === 'colocacion' && !f.colocacion) return ['Indicá si la colocación fue total o parcial.']
  if (tipo === 'medicion' && !f.medicion) return ['Indicá si se pudo medir.']
  return []
}

/**
 * La etiqueta que deja la confirmación de una colocación: va en `✋ Colocacion/Entrega` del turno y
 * en `✋Etapa de Produccion` de la obra (la que refleja el espejo "Etapa de Porduccion" del turno).
 * Las dos columnas tienen las etiquetas "Colocacion Total" y "Colocacion Parcial".
 */
export function etiquetaResultado(tipo: TipoTurno | null, f: Finalizacion): string | null {
  if (tipo === 'colocacion' && f.colocacion) return f.colocacion === 'total' ? 'Colocacion Total' : 'Colocacion Parcial'
  return null
}

/**
 * El estado de finalización en una línea, para la constancia y la actividad. El de la medición no
 * tiene columna en la Agenda: queda en esas dos.
 */
export function textoResultado(tipo: TipoTurno | null, f: Finalizacion): string {
  if (tipo === 'colocacion' && f.colocacion) return f.colocacion === 'total' ? 'Colocación total' : 'Colocación parcial'
  if (tipo === 'medicion' && f.medicion) return ROTULO_MEDICION[f.medicion]
  return ''
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Mensajes al cliente
 * ──────────────────────────────────────────────────────────────────────────────── */

/** "2026-10-15" → "jueves 15/10/2026". La fecha se arma en hora local: no corre un día. */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const dia = d.toLocaleDateString('es-AR', { weekday: 'long' })
  return `${dia} ${m[3]}/${m[2]}/${m[1]}`
}

/** "2026-10-15" → "15/10/2026". */
export const fechaCorta = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * El nombre del cliente para el saludo: "1111 - PEREZ JUAN" → "Perez Juan". Va entero y no sólo el
 * de pila: en el tablero conviven personas y empresas ("MARTINEZ Y STANECK S.A"), y adivinar cuál
 * palabra es el nombre saludaría a una empresa por su sigla.
 */
export function saludo(nombre: string): string {
  return nombre
    .replace(/^\s*\d+\s*-\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, esp: string, letra: string) => esp + letra.toUpperCase())
}

/** Lo que el mensaje no tiene, dicho como el escenario: "NO ESPECIFICADO". */
const NO_ESP = 'NO ESPECIFICADO'
const oNoEsp = (v: string | number | null | undefined) => (v == null || String(v).trim() === '' ? NO_ESP : String(v).trim())

/** "1111 - PEREZ JUAN" → "PEREZ JUAN": el código de la cuenta no va en un saludo. */
const sinCodigo = (n: string) => n.replace(/^\s*\d+\s*-\s*/, '').trim()

/** El saldo como se le escribe al cliente: "1.250.000" (con decimales sólo si los tiene). */
export const saldoTexto = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

export interface DatosAsignacion {
  cliente: string
  tipo: TipoTurno | null
  /** La etiqueta de `✋ Tipo de Turno`: es el "Servicio" del mensaje. */
  etiquetaTipo: string
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM` local; sin ella, el mensaje lleva sólo la fecha. */
  hora?: string
  ubicacion: string
  material: string
  /** Colocación: cuántas aberturas se colocan. */
  aberturas?: number | string | null
  /** Colocación sin aprobar: la obra y su saldo, para el aviso de saldo pendiente. */
  obra?: string
  saldo?: number | null
  aprobacion?: Aprobacion | null
}

/**
 * El aviso de saldo pendiente de una colocación No aprobada (RN-08). Sin el saldo a la vista no se
 * inventa un número: el aviso sale igual, sin el importe.
 */
export function avisoSaldoPendiente(obra: string, saldo: number | null | undefined): string {
  const lineas = [
    `Para la obra *${oNoEsp(obra)}* existe saldo pendiente:`,
    saldo != null && Number.isFinite(saldo) ? `💵 *Saldo*: $${saldoTexto(saldo)}` : '',
  ].filter(Boolean)
  return `${lineas.join(SALTO)}${PARRAFO}Para la *COLOCACION* de las aberturas se requiere el pago total del presupuesto.`
}

const SALTO = '\n'
const PARRAFO = '\n\n'

const CIERRE = ['Solo en caso de *CANCELACION* responder.', '¡Muchas gracias!\nPolifroni Aberturas\nAutomatizado por The Automation Partner'].join(
  PARRAFO,
)

/**
 * El mensaje de asignación del turno, con las plantillas de cada tipo (las del escenario de Make):
 * Colocación lleva la cantidad de aberturas y, si la obra no está aprobada, el aviso del saldo;
 * Reparación (y Medición, que no tiene una propia) y Entrega/Reparto, servicio, fecha, ubicación y
 * material. Lo que falta sale "NO ESPECIFICADO".
 */
export function mensajeAsignacion(d: DatosAsignacion): string {
  const nombre = sinCodigo(d.cliente)
  const servicio = `✅ *Servicio:* ${oNoEsp(d.etiquetaTipo)}`
  const fecha = clavesCuando(d).join(SALTO)
  const ubicacion = `📍 *Ubicacion:* ${oNoEsp(d.ubicacion)}`
  const material = `⛏️ *Material:* ${oNoEsp(d.material)}`

  if (d.tipo === 'colocacion') {
    return [
      `Hola, *${nombre}* 👋`,
      'Te informamos que ha sido agendado:',
      [servicio, fecha, ubicacion, material, `🪟 *Cantidad de Aberturas*: ${oNoEsp(d.aberturas)}`].join(SALTO),
      d.aprobacion === 'noAprobada' ? avisoSaldoPendiente(d.obra ?? '', d.saldo) : '',
      CIERRE,
    ]
      .filter(Boolean)
      .join(PARRAFO)
  }
  if (d.tipo === 'entrega') {
    return [
      `Hola, *${nombre}*👋`,
      'Te informamos que tu servicio ha sido programado con éxito. Los detalles son:',
      [servicio, fecha, ubicacion, material].join(SALTO),
      CIERRE,
    ].join(PARRAFO)
  }
  return [
    `Hola, *${nombre}* 👋`,
    ['Te informamos que ha sido agendado:', servicio, fecha, ubicacion, material].join(SALTO),
    CIERRE,
  ].join(PARRAFO)
}

/** Lo que llevan los avisos de un turno ya registrado (confirmación y cancelación). */
export interface DatosAviso {
  /** A quién se saluda: Colocación, la cuenta de la obra; Reparación y Entrega, el cliente. */
  cliente: string
  tipo: TipoTurno | null
  /** La etiqueta de `✋ Tipo de Turno` (el "Servicio" de la cancelación). */
  etiquetaTipo: string
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM` local; sin ella, el mensaje lleva sólo la fecha. */
  hora?: string
  ubicacion: string
  material: string
  /** Colocación: `✋ Cant Aberturas`. */
  aberturas?: number | string | null
}

const FIRMA_TAP = 'Polifroni Aberturas\nAutomatizado por The Automation Partner'

/** "Hola, *X* 👋" — Entrega/Reparto lo escribe pegado, como su plantilla. */
const saludoAviso = (tipo: TipoTurno | null, cliente: string) =>
  tipo === 'entrega' ? `Hola,*${sinCodigo(cliente)}*👋` : `Hola, *${sinCodigo(cliente)}* 👋`

/**
 * El mensaje de confirmación del turno cumplido, con la plantilla de cada tipo. El "Servicio" es el
 * resultado que quedó en `✋ Colocacion/Entrega` (o el tipo, si el turno no tiene uno). Colocación
 * lleva además la cantidad de aberturas. Medición, que no tiene plantilla propia, usa la de Reparación.
 */
export function mensajeConfirmacion(d: DatosAviso & { servicio: string }): string {
  const datos = [
    `✅ *Servicio:* ${oNoEsp(d.servicio)}`,
    ...clavesCuando(d),
    `📍 *Ubicación:* ${oNoEsp(d.ubicacion)}`,
    `⛏️ *Material:* ${oNoEsp(d.material)}`,
    d.tipo === 'colocacion' ? `🪟 *Cantidad de Aberturas*: ${oNoEsp(d.aberturas)}` : '',
  ].filter(Boolean)
  return [
    saludoAviso(d.tipo, d.cliente),
    'Te informamos que el servicio se ha cumplido con Exito',
    datos.join(SALTO),
    `¡Muchas gracias!\n${FIRMA_TAP}`,
  ].join(PARRAFO)
}

/**
 * El mensaje de cancelación del turno, con la plantilla de cada tipo: el "Servicio" es el tipo de
 * turno, y Colocación lleva además la cantidad de aberturas. Medición usa la de Reparación.
 */
export function mensajeCancelacion(d: DatosAviso): string {
  const datos = [
    `🪟  *Servicio:* ${oNoEsp(d.etiquetaTipo)}`,
    ...clavesCuando(d, '  '),
    `📍 *Ubicación:* ${oNoEsp(d.ubicacion)}`,
    `⛏️ *Material:* ${oNoEsp(d.material)}`,
    d.tipo === 'colocacion' ? `🪟 *Cantidad de Aberturas*: ${oNoEsp(d.aberturas)}` : '',
  ].filter(Boolean)
  return [`Hola, *${sinCodigo(d.cliente)}* 👋`, 'Te informamos que el turno ha sido *CANCELADO:*', datos.join(SALTO), FIRMA_TAP].join(
    PARRAFO,
  )
}

/**
 * El mensaje de confirmación de una medición, según cómo terminó: medida (la OP sale en los próximos
 * días) o sin poder medir (las mochetas no estaban como indicaba el presupuesto; hay que pedir otro
 * turno).
 */
export function mensajeMedicion(cliente: string, resultado: ResultadoMedicion): string {
  const cuerpo =
    resultado === 'medido'
      ? 'Fuimos a medir y en los proximos dias se enviara la orden de produccion.'
      : 'Te informamos que no se pudo medir porque las mochetas NO se encontraban en las condiciones indicadas en el presupuesto. Por favor, vuelve a contactarnos para solicitar un nuevo turno.'
  const gracias = resultado === 'medido' ? 'Gracias!' : 'Gracias!.'
  return [`Hola, *${sinCodigo(cliente)}* 👋`, cuerpo, `${gracias}\n${FIRMA_TAP}`].join(PARRAFO)
}

/**
 * El mensaje de reasignación del turno nuevo de una reprogramación: el turno quedó reagendado, con
 * su servicio, la fecha (y hora) nueva, la ubicación y el material. Su envío deja el turno nuevo
 * "Asignada".
 */
export function mensajeReagendado(d: DatosAviso): string {
  return [
    `Hola, *${sinCodigo(d.cliente)}* 👋`,
    [
      'Te informamos que ha sido reagendado el siguiente turno:',
      `✅ *Servicio:* ${oNoEsp(d.etiquetaTipo)}`,
      ...clavesCuando(d),
      `📍 *Ubicacion:* ${oNoEsp(d.ubicacion)}`,
      `⛏️ *Material:* ${oNoEsp(d.material)}`,
    ].join(SALTO),
    'Solo en caso de *CANCELACION* responder.',
    '¡Muchas gracias!\n🏠 Polifroni Aberturas\n🤖 Automatizado por The Automation Partner',
  ].join(PARRAFO)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Calendario: la selección de la etapa 2, la disponibilidad del horario y los colores
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Los tipos que se eligen para un turno sobre una OBRA. Los pendientes de entrega son Reparto. */
export const TIPOS_DE_OBRA: readonly TipoTurno[] = ['colocacion', 'medicion', 'reparacion', 'terminacion']

/** Los tipos de turno que se eligen al dar de alta un turno, antes de las obras y los pendientes. */
export const TIPOS_ALTA: readonly TipoTurno[] = ['colocacion', 'medicion', 'reparacion', 'terminacion', 'entrega']

/**
 * Lo elegido en la etapa 2 del turno nuevo. Primero el TIPO de turno; después:
 *  - Reparto/Entrega: sólo pendientes de entrega (sin obra).
 *  - Los demás: "Con Obra" (tildado de entrada) y, con obra, UNA —con sus OP, opcionales—; más los
 *    pendientes de entrega que se quieran (opcionales), que viajan en el mismo turno.
 */
export interface SeleccionTurno {
  /** La clave del tipo de turno elegido (`TipoConfig.clave`): un tipo conocido o uno nuevo del tablero. */
  tipo: string | null
  /** "Con Obra": tildado, se listan las obras del cliente; destildado, el turno va sin obra. */
  conObra: boolean
  obraId: string | null
  pendientesIds: string[]
  /** Las OP de la obra que se vinculan al turno. Opcionales. */
  opIds: string[]
}

export const seleccionVacia = (): SeleccionTurno => ({ tipo: null, conObra: true, obraId: null, pendientesIds: [], opIds: [] })

/** La clave del tipo de turno elegido. */
export const tipoDeSeleccion = (s: SeleccionTurno): string | null => s.tipo

/** ¿Se listan las obras? Con un tipo elegido que no sea Reparto (Reparto lleva sólo pendientes). */
export const listaObras = (s: SeleccionTurno): boolean => s.tipo !== null && s.tipo !== 'entrega'

/** Elegir el tipo. Reparto no lleva obra: si había una elegida, se descarta (con sus OP). */
export function elegirTipo(s: SeleccionTurno, tipo: string): SeleccionTurno {
  return tipo === 'entrega' ? { ...s, tipo, obraId: null, opIds: [] } : { ...s, tipo }
}

/** Tildar o destildar "Con Obra". Destildado, la obra elegida se descarta (con sus OP); los pendientes quedan. */
export function cambiarConObra(s: SeleccionTurno, conObra: boolean): SeleccionTurno {
  return conObra ? { ...s, conObra } : { ...s, conObra, obraId: null, opIds: [] }
}

/** Tildar una obra: es una sola. Otra obra (o destildarla) descarta sus OP. */
export function elegirObra(s: SeleccionTurno, obraId: string): SeleccionTurno {
  return { ...s, obraId: s.obraId === obraId ? null : obraId, opIds: [] }
}

/** Tildar o destildar un pendiente: se pueden elegir varios. */
export function alternarPendiente(s: SeleccionTurno, pendienteId: string): SeleccionTurno {
  const ya = s.pendientesIds.includes(pendienteId)
  return { ...s, pendientesIds: ya ? s.pendientesIds.filter((x) => x !== pendienteId) : [...s.pendientesIds, pendienteId] }
}

/** La cantidad de aberturas a colocar, como se tipea: un entero mayor a 0. */
export const aberturasValidas = (texto: string | undefined): boolean => /^\d+$/.test((texto ?? '').trim()) && Number(texto) > 0

/**
 * Lo que falta para pasar de la etapa 2:
 *  - el tipo de turno;
 *  - Reparto: al menos un pendiente, SÓLO si el cliente tiene pendientes por entregar (`hayPendientes`);
 *  - los demás, con "Con Obra": la obra; y en Colocación, la cantidad de aberturas a colocar
 *    (`aberturas`, lo tipeado en la fila de la obra). Sin obra, nada más. Los pendientes son opcionales.
 */
export function faltantesSeleccion(s: SeleccionTurno, c: { hayPendientes: boolean; aberturas?: string }): string[] {
  if (!s.tipo) return ['Elegí el tipo de turno.']
  if (s.tipo === 'entrega') {
    return c.hayPendientes && s.pendientesIds.length === 0 ? ['Tildá al menos un pendiente de entrega.'] : []
  }
  if (s.conObra && !s.obraId) return ['Tildá la obra del turno (o destildá «Con Obra» para cargar un turno sin obra).']
  if (s.tipo === 'colocacion' && s.conObra && s.obraId && !aberturasValidas(c.aberturas)) {
    return ['Indicá la cantidad de aberturas a colocar de la obra.']
  }
  return []
}

/**
 * Lo que falta para confirmar el turno en la etapa 3: la fecha y, en Reparación, su tipo. El rango
 * horario aproximado (la hora) es opcional.
 */
export function faltantesRegistro(d: { tipo: TipoTurno | null; fecha: string; hora: string; tipoReparacion?: string }, hoy: string): string[] {
  const f: string[] = []
  if (!d.fecha) f.push('Elegí la fecha del turno.')
  else if (d.fecha < hoy) f.push('La fecha del turno no puede ser anterior a hoy.')
  if (d.tipo === 'reparacion' && !d.tipoReparacion?.trim()) f.push('Elegí el tipo de reparación.')
  return f
}

/**
 * ¿El horario ya está tomado? Un horario —la misma fecha y la misma hora— está ocupado mientras
 * tenga un turno ACTIVO (Pendiente o Asignado); se libera cuando ese turno se cumple o se cancela.
 * Los turnos sin hora (los viejos, cargados a las 00:00) no ocupan ningún horario. `excepto`: el
 * turno que se está moviendo, que no se pisa a sí mismo.
 */
export function horarioOcupado(
  turnos: readonly { id: string; estado: EstadoTurno; fecha: string; hora: string }[],
  fecha: string,
  hora: string,
  excepto?: string,
): boolean {
  if (!fecha || !hora) return false
  return turnos.some((t) => t.id !== excepto && activo(t.estado) && t.fecha === fecha && t.hora === hora)
}

/** El material de la obra de un turno, como se filtra en el calendario. */
export type MaterialTurno = 'pvc' | 'aluminio' | 'sin'

export const MATERIALES: { id: MaterialTurno; titulo: string }[] = [
  { id: 'pvc', titulo: 'PVC' },
  { id: 'aluminio', titulo: 'Aluminio' },
  { id: 'sin', titulo: 'Sin material' },
]

/** "PVC" → pvc, "Aluminio" → aluminio; cualquier otra cosa (o nada) es "sin material". */
export function materialDe(material: string): MaterialTurno {
  const m = sinTildes(material ?? '')
  if (m === 'pvc') return 'pvc'
  if (m === 'aluminio') return 'aluminio'
  return 'sin'
}

const COLOR_MATERIAL: Record<MaterialTurno, { fondo: string; texto: string }> = {
  pvc: { fondo: '#00c875', texto: '#ffffff' },
  aluminio: { fondo: '#ffcb00', texto: '#3d3200' },
  sin: { fondo: '#c4c4c4', texto: '#1f2937' },
}

/** El color del turno en el calendario, por el material de la obra: PVC verde, Aluminio amarillo. */
export function colorDeMaterial(material: string): { fondo: string; texto: string } {
  return COLOR_MATERIAL[materialDe(material)]
}

/** El color de un material (el del filtro). */
export const colorMaterial = (m: MaterialTurno) => COLOR_MATERIAL[m].fondo

/**
 * El color del porcentaje de cancelación (lo cobrado) de una obra: rojo por debajo del 70 %,
 * amarillo del 70 % al 90 % y verde del 90 % al 100 %.
 */
export function colorCancelacion(pct: number | null): 'rojo' | 'amarillo' | 'verde' | null {
  if (pct === null || !Number.isFinite(pct)) return null
  if (pct < 70) return 'rojo'
  if (pct < 90) return 'amarillo'
  return 'verde'
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Calendario: el color de cada tipo de turno
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Los colores de `✋ Tipo de Turno` en el tablero. La pantalla los lee del tablero
 * (`coloresTipoTurno`), así un cambio de color en Monday se ve igual; éstos quedan para cuando no
 * se pudieron leer.
 */
export const COLOR_TIPO_TURNO: Record<TipoTurno, string> = {
  colocacion: '#00c875',
  reparacion: '#df2f4a',
  entrega: '#fdab3d',
  medicion: '#9d50dd',
  terminacion: '#007eb5',
}

/** El gris de un turno sin tipo, o de un tipo que la app no carga. */
export const COLOR_SIN_TIPO = '#c4c4c4'

/** La clave con que se busca una etiqueta: sin tildes ni mayúsculas ("MEDICIÓN" = "medicion"). */
export const claveEtiqueta = sinTildes

/**
 * El color de un tipo de turno: el de su etiqueta en el tablero (`colores`, por clave de etiqueta),
 * o el conocido; sin tipo, gris.
 */
export function colorDeTipo(tipo: TipoTurno | null, etiqueta: string, colores: Record<string, string> | null): string {
  const delTablero = colores?.[claveEtiqueta(etiqueta || (tipo ? defTipo(tipo).etiqueta : ''))]
  if (delTablero) return delTablero
  return tipo ? COLOR_TIPO_TURNO[tipo] : COLOR_SIN_TIPO
}


/** Una semana del calendario, de lunes (`inicio`) a domingo (`fin`), en `YYYY-MM-DD`. */
export interface SemanaCal {
  inicio: string
  fin: string
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Las semanas del mes de `fecha` (`YYYY-MM-DD`), de lunes a domingo: todas las que tienen al menos
 * un día del mes —las filas del calendario de ese mes—.
 */
export function semanasDelMes(fecha: string): SemanaCal[] {
  const [a, m] = fecha.split('-').map(Number)
  const primero = new Date(a, m - 1, 1)
  const ultimo = new Date(a, m, 0)
  /* El lunes de la semana del día 1 (getDay: domingo 0). */
  const lunes = new Date(a, m - 1, 1 - ((primero.getDay() + 6) % 7))
  const semanas: SemanaCal[] = []
  for (let d = lunes; d <= ultimo; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    semanas.push({ inicio: isoLocal(d), fin: isoLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)) })
  }
  return semanas
}

/** Cómo va la entrega de un pendiente, por sus cantidades. */
export type EntregaPendiente = 'pendiente' | 'parcial' | 'entregado'

/**
 * Nada entregado: "pendiente" (rojo); algo entregado y algo por entregar: "parcial" (naranja); nada
 * por entregar: "entregado" (verde).
 */
export function entregaDePendiente(vendido: number, porEntregar: number): EntregaPendiente {
  if (porEntregar <= 0) return 'entregado'
  return vendido - porEntregar > 0 ? 'parcial' : 'pendiente'
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Los tipos de turno configurables (tablero ⚙️Configuracion - Sistema)
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Un tipo de turno de la configuración. Si su nombre es el de un tipo que la app conoce (Colocación,
 * Reparto…, sin importar tildes ni mayúsculas) lo toma, con su comportamiento propio (aberturas,
 * pendientes, tipo de reparación); si no, es un tipo nuevo, que se agenda como un turno común.
 */
export interface TipoConfig {
  /** La clave del tipo: la id del tipo conocido, o "x-" y el nombre sin tildes para uno nuevo. */
  clave: string
  /** Cómo se muestra: el título del tipo conocido, o el nombre tal como está en el tablero. */
  titulo: string
  /** El tipo conocido, o `null` si es nuevo. */
  conocido: TipoTurno | null
}

/** El tipo de turno de un nombre del tablero de configuración. */
export function tipoConfigDe(nombre: string): TipoConfig {
  const conocido = tipoDeEtiqueta(nombre)
  if (conocido) return { clave: conocido, titulo: defTipo(conocido).titulo, conocido }
  return { clave: `x-${claveEtiqueta(nombre)}`, titulo: nombre.trim(), conocido: null }
}

/** Los tipos de siempre, por si no se puede leer la configuración. */
export const TIPOS_POR_DEFECTO: TipoConfig[] = TIPOS_TURNO.map((d) => ({ clave: d.id, titulo: d.titulo, conocido: d.id }))

/**
 * La clave del tipo de un turno, para cruzarlo con la configuración: la del tipo conocido o, si es
 * otro, la de su etiqueta (SELLAR → "x-sellar", la misma que el "Sellar" del tablero). Sin tipo, "".
 */
export function claveDeTurno(t: { tipo: TipoTurno | null; etiquetaTipo: string }): string {
  if (t.tipo) return t.tipo
  return t.etiquetaTipo.trim() ? `x-${claveEtiqueta(t.etiquetaTipo)}` : ''
}

/**
 * Los tipos de la configuración, a partir de los ítems del grupo: los que son "Tipo de Turno", en su
 * orden y sin repetidos.
 */
export function tiposDeConfig(items: readonly { nombre: string; tipoConfig: string }[]): TipoConfig[] {
  const vistos = new Set<string>()
  const tipos: TipoConfig[] = []
  for (const it of items) {
    if (claveEtiqueta(it.tipoConfig) !== 'tipo de turno' || !it.nombre.trim()) continue
    const t = tipoConfigDe(it.nombre)
    if (vistos.has(t.clave)) continue
    vistos.add(t.clave)
    tipos.push(t)
  }
  return tipos
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Editar un turno: qué cambió respecto del original
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Los datos de un turno que se pueden editar (la fecha y la hora no: eso es reprogramar). */
export interface DatosEdicionTurno {
  clienteId: string
  /** La clave del tipo (`TipoConfig.clave`). */
  tipo: string | null
  obraId: string | null
  pendientesIds: readonly string[]
  opIds: readonly string[]
  aberturas: number | null
  /** Reparación: el nombre del tipo de reparación. */
  tipoReparacion: string
}

export type CampoTurno = 'cliente' | 'tipo' | 'obra' | 'pendientes' | 'ops' | 'aberturas' | 'tipoReparacion'

const mismosIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

/**
 * Los datos que cambiaron: sólo ésos se escriben en el turno. Las aberturas cuentan sólo en
 * Colocación y el tipo de reparación sólo en Reparación (el tipo nuevo); los pendientes y las OP,
 * sin importar el orden.
 */
export function cambiosTurno(antes: DatosEdicionTurno, despues: DatosEdicionTurno): CampoTurno[] {
  const c: CampoTurno[] = []
  if (antes.clienteId !== despues.clienteId) c.push('cliente')
  if (antes.tipo !== despues.tipo) c.push('tipo')
  if ((antes.obraId ?? '') !== (despues.obraId ?? '')) c.push('obra')
  if (!mismosIds(antes.pendientesIds, despues.pendientesIds)) c.push('pendientes')
  if (!mismosIds(antes.opIds, despues.opIds)) c.push('ops')
  if (despues.tipo === 'colocacion' && antes.aberturas !== despues.aberturas) c.push('aberturas')
  if (despues.tipo === 'reparacion' && antes.tipoReparacion.trim() !== despues.tipoReparacion.trim()) c.push('tipoReparacion')
  return c
}
