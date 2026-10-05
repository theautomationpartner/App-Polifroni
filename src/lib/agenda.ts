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

export type TipoTurno = 'colocacion' | 'reparacion' | 'entrega' | 'medicion'

/** De dónde salen los elementos que se pueden elegir para el turno. */
export type OrigenTurno = 'obras' | 'pendientes'

export interface DefTipoTurno {
  id: TipoTurno
  titulo: string
  /** La etiqueta de `✋ Tipo de Turno` en el tablero. */
  etiqueta: string
  icono: string
  origen: OrigenTurno
  /** Filtro de `✋Etapa de Produccion` de la obra. `null` = todas las obras del cliente. */
  etapa: string | null
}

/** Las etiquetas de `✋Etapa de Produccion` que filtran las obras (RN-03, RN-04). */
export const ETAPA_A_COLOCAR = 'A Colocar'
export const ETAPA_A_MEDIR = 'A Medir'

export const TIPOS_TURNO: readonly DefTipoTurno[] = [
  { id: 'colocacion', titulo: 'Colocación', etiqueta: 'Colocacion', icono: 'fa-hammer', origen: 'obras', etapa: ETAPA_A_COLOCAR },
  { id: 'reparacion', titulo: 'Reparación', etiqueta: 'Reparacion', icono: 'fa-screwdriver-wrench', origen: 'obras', etapa: null },
  { id: 'entrega', titulo: 'Entrega/Reparto', etiqueta: 'Reparto', icono: 'fa-truck', origen: 'pendientes', etapa: null },
  { id: 'medicion', titulo: 'Medición', etiqueta: 'MEDIR', icono: 'fa-ruler-combined', origen: 'obras', etapa: ETAPA_A_MEDIR },
]

export const defTipo = (t: TipoTurno): DefTipoTurno => TIPOS_TURNO.find((d) => d.id === t)!

/**
 * El tipo a partir de la etiqueta del tablero. Los turnos viejos tienen tipos que la app no carga
 * (TERMINACIONES, SELLAR): ésos devuelven `null` y se muestran con su etiqueta tal cual.
 */
export function tipoDeEtiqueta(etiqueta: string): TipoTurno | null {
  const e = etiqueta.trim().toLowerCase()
  return TIPOS_TURNO.find((d) => d.etiqueta.toLowerCase() === e)?.id ?? null
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Estados del turno
 * ──────────────────────────────────────────────────────────────────────────────── */

export type EstadoTurno = 'pendiente' | 'asignado' | 'cumplido' | 'cancelado'

/** Las etiquetas de `🤖 Estado Turno`, tal cual están en el tablero. */
export const ETIQUETA_TURNO: Record<EstadoTurno, string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignada',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
}

/** Rótulo y color de cada estado: los del tablero, para que pantalla y tablero se lean igual. */
export const VISTA_TURNO: Record<EstadoTurno, { rotulo: string; color: string }> = {
  pendiente: { rotulo: 'Pendiente', color: '#c4c4c4' },
  asignado: { rotulo: 'Asignado', color: '#579bfc' },
  cumplido: { rotulo: 'Cumplido', color: '#00c875' },
  cancelado: { rotulo: 'Cancelado', color: '#df2f4a' },
}

/** Sin etiqueta —un turno cargado a mano que nadie movió— está pendiente. */
export function estadoDeTurno(etiqueta: string): EstadoTurno {
  const e = etiqueta.trim()
  const hallado = (Object.keys(ETIQUETA_TURNO) as EstadoTurno[]).find((k) => ETIQUETA_TURNO[k] === e)
  return hallado ?? 'pendiente'
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
  if (!d.hora) f.push('Elegí la hora del turno.')
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
  const fecha = `📅 *Fecha:* ${d.fecha ? fechaHoraCorta(d.fecha, d.hora) : NO_ESP}`
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
    `📅 *Fecha:* ${d.fecha ? fechaHoraCorta(d.fecha, d.hora) : NO_ESP}`,
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
    `📅  *Fecha:* ${d.fecha ? fechaHoraCorta(d.fecha, d.hora) : NO_ESP}`,
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
      `📅 *Fecha:* ${d.fecha ? fechaHoraCorta(d.fecha, d.hora) : NO_ESP}`,
      `📍 *Ubicacion:* ${oNoEsp(d.ubicacion)}`,
      `⛏️ *Material:* ${oNoEsp(d.material)}`,
    ].join(SALTO),
    'Solo en caso de *CANCELACION* responder.',
    '¡Muchas gracias!\n🏠 Polifroni Aberturas\n🤖 Automatizado por The Automation Partner',
  ].join(PARRAFO)
}
