/**
 * Las reglas del área Obras · "Facturar una Obra" (13/10/2026).
 *
 * Lo que se fija acá:
 *  · los importes de la obra salen de las MISMAS fórmulas del tablero 🪟 Obras:
 *      Saldo              = Total pactado − Importe cancelado + Diferencia
 *      % Cancelado        = Importe cancelado / (Total pactado + Diferencia)
 *      Pend de facturar   = Diferencia + Total pactado − Facturado
 *    (la fórmula de Monday a veces llega vacía mientras recalcula: se rearma con sus partes);
 *  · se listan las obras con algo pendiente de facturar (distinto de cero) y sólo se puede facturar
 *    un monto mayor a cero y que no pase lo pendiente;
 *  · cada obra elegida es UN comprobante de 🧾 Facturación obra, con UN renglón "Fabricacion de
 *    Aberturas para Obra" (así lo arma hoy el botón "Emitir Factura" de la obra): IVA 21 %,
 *    condición Cuenta Corriente, vencimiento a 30 días;
 *  · el mensaje de WhatsApp es la plantilla del escenario de Make, con los mismos datos.
 *
 * Este archivo no habla con Monday: son reglas puras, probadas en `tests/facturacion.test.ts`.
 */

/* ────────────────────────────────────────────────────────────────────────────────
 * Los importes de la obra
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Redondeo a centavos: los importes de Monday vienen con decimales sueltos (189354.54545…). */
export const aCentavos = (n: number): number => Math.round(n * 100) / 100

/** Las partes con que el tablero calcula lo pendiente de una obra. */
export interface PartesObra {
  /** ✋Total Obra Pactado. */
  total: number
  /** Diferencia (suma de las diferencias de obra cargadas como subelementos). */
  diferencia: number
  /** 🤖 Importe Total Cancelado (lo cobrado con recibos). */
  cancelado: number
  /** 🤖 $ Facturado (lo ya facturado sobre la obra). */
  facturado: number
}

/** 🤖 $ Pend de Facturar: Diferencia + Total pactado − Facturado. */
export const pendienteDeFacturar = (o: PartesObra): number => aCentavos(o.diferencia + o.total - o.facturado)

/** 🤖 Saldo: Total pactado − Importe cancelado + Diferencia. */
export const saldoObra = (o: PartesObra): number => aCentavos(o.total - o.cancelado + o.diferencia)

/**
 * 🤖 % Cancelado, de 0 a 100. El tablero lo da como texto ("96%"); si vino vacío se calcula con las
 * partes. `null`: no hay base (sin total pactado ni diferencia).
 */
export function porcentajeCanceladoObra(texto: string, o: PartesObra): number | null {
  const t = String(texto ?? '').replace('%', '').replace(',', '.').trim()
  const n = Number(t)
  if (t && Number.isFinite(n)) return n
  const base = o.total + o.diferencia
  return base ? Math.round((o.cancelado / base) * 1000) / 10 : null
}

/**
 * Qué parte de la obra ya se facturó, de 0 a 100: Facturado / (Total pactado + Diferencia). `null`: no
 * hay base (sin total pactado ni diferencia).
 */
export function porcentajeFacturado(o: PartesObra): number | null {
  const base = o.total + o.diferencia
  return base ? Math.round((o.facturado / base) * 1000) / 10 : null
}

/** Una obra con algo para facturar: lo pendiente no es cero (al centavo). */
export const conPendienteDeFacturar = (o: PartesObra): boolean => Math.abs(pendienteDeFacturar(o)) >= 0.01

/**
 * Se puede elegir para facturar: lo pendiente es POSITIVO. Una obra con lo pendiente en negativo se
 * facturó de más: se lista (lo pendiente no es cero), pero no se le emite una factura.
 */
export const facturable = (o: PartesObra): boolean => pendienteDeFacturar(o) >= 0.01

/* ────────────────────────────────────────────────────────────────────────────────
 * Qué se factura
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Qué se factura de la obra (etapa 2). */
export type TipoFacturacion = 'saldo' | 'diferencia' | 'notaCredito'

/**
 * Las opciones de "¿Qué querés facturar?". La diferencia queda apagada (regla del usuario, 13/10/2026).
 */
export const TIPOS_FACTURACION: readonly { id: TipoFacturacion; titulo: string; habilitado: boolean }[] = [
  { id: 'saldo', titulo: 'Saldo Pend de Facturar', habilitado: true },
  { id: 'diferencia', titulo: 'Diferencia', habilitado: false },
  { id: 'notaCredito', titulo: 'Nota de Crédito', habilitado: true },
]

export const tipoHabilitado = (t: TipoFacturacion | null): boolean =>
  !!t && !!TIPOS_FACTURACION.find((x) => x.id === t)?.habilitado

/** Es una nota de crédito: anula parte de lo facturado (va en negativo en la obra). */
export const esNotaCredito = (t: TipoFacturacion | null): boolean => t === 'notaCredito'

/** Cómo se nombra el comprobante en pantalla ("la factura" / "la nota de crédito"). */
export const NOMBRE_COMPROBANTE = {
  factura: { titulo: 'Factura', articulo: 'la factura', tipoTablero: 'Factura' },
  notaCredito: { titulo: 'Nota de Crédito', articulo: 'la nota de crédito', tipoTablero: 'Nota de Credito' },
} as const
export const nombreComprobante = (t: TipoFacturacion | null) => NOMBRE_COMPROBANTE[esNotaCredito(t) ? 'notaCredito' : 'factura']

/**
 * Cómo queda la obra con el comprobante: lo que cancela (o anula) de lo pendiente, el nuevo total
 * facturado y lo que queda pendiente de facturar.
 *  - Saldo: suma a lo facturado y baja lo pendiente.
 *  - Nota de crédito: la operación inversa; resta de lo facturado y vuelve a lo pendiente.
 */
export function proyeccion(
  o: { facturado: number; pendiente: number },
  monto: number,
  tipo: TipoFacturacion | null,
): { monto: number; nuevoFacturado: number; quedaPendiente: number } {
  const m = aCentavos(Math.max(0, monto))
  const signo = esNotaCredito(tipo) ? -1 : 1
  return {
    monto: m,
    nuevoFacturado: aCentavos(o.facturado + signo * m),
    quedaPendiente: aCentavos(o.pendiente - signo * m),
  }
}

/**
 * Formatea el importe MIENTRAS se escribe, como el importe del anticipo de La Batea (registrar cobro):
 * "30409" → "30.409"; la coma agrega hasta dos centavos ("30409,5" → "30.409,5"). Devuelve el texto
 * para el campo y su valor.
 */
export function formatearImporte(entrada: string): { texto: string; valor: number } {
  const limpio = entrada.replace(/\./g, '').replace(/[^\d,]/g, '')
  const iComa = limpio.indexOf(',')
  const enteroRaw = (iComa >= 0 ? limpio.slice(0, iComa) : limpio).replace(/^0+(?=\d)/, '')
  const decRaw = iComa >= 0 ? limpio.slice(iComa + 1).replace(/,/g, '').slice(0, 2) : ''
  const enteroFmt = (enteroRaw || (iComa >= 0 ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const texto = iComa >= 0 ? `${enteroFmt},${decRaw}` : enteroFmt
  const valor = aCentavos(Number(`${enteroRaw || '0'}.${decRaw || '0'}`))
  return { texto, valor }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El monto a facturar
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Un importe escrito a mano: "1.297.684", "1297684,50", "$ 1.297.684,5". Con coma, la coma es el
 * decimal; sin coma, los puntos que agrupan de a tres son de miles. `null`: no es un número.
 */
export function importeEscrito(texto: string): number | null {
  const t = String(texto ?? '').trim().replace(/\s|\$/g, '')
  if (!t) return null
  const limpio = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** "1297684.5" → "1.297.684,50": como se escribe y se muestra un importe en la app. */
export const importeEditable = (n: number): string =>
  aCentavos(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "$ 1.297.684,50". */
export const pesos = (n: number): string => `$ ${importeEditable(n)}`

/**
 * Qué tiene de malo el monto a facturar de una obra, dicho para el usuario. `null`: está bien. Tiene
 * que ser un importe mayor a cero, con dos decimales a lo sumo, y no pasar lo pendiente de facturar.
 */
export function problemaMonto(texto: string, pendiente: number): string | null {
  const n = importeEscrito(texto)
  if (n === null) return 'Ingresá el monto a facturar.'
  if (n <= 0) return 'El monto a facturar tiene que ser mayor a cero.'
  if (Math.abs(aCentavos(n) - n) > 1e-9) return 'El monto admite dos decimales como máximo.'
  if (aCentavos(n) > aCentavos(pendiente)) return `El monto no puede superar lo pendiente de facturar (${pesos(pendiente)}).`
  return null
}

/** El motivo de la nota de crédito: obligatorio (queda en ✋ Observaciones del comprobante). */
export const MAX_MOTIVO = 500
export function problemaMotivo(texto: string): string | null {
  const t = String(texto ?? '').trim()
  if (!t) return 'Escribí el motivo de la nota de crédito.'
  if (t.length > MAX_MOTIVO) return `El motivo admite ${MAX_MOTIVO} caracteres como máximo.`
  return null
}

/**
 * Lo mismo para la nota de crédito: mayor a cero, dos decimales a lo sumo, y sin pasar lo que se puede
 * anular de la factura asociada (su importe menos las notas de crédito que ya tiene).
 */
export function problemaMontoNotaCredito(texto: string, disponible: number): string | null {
  const n = importeEscrito(texto)
  if (n === null) return 'Ingresá el monto de la nota de crédito.'
  if (n <= 0) return 'El monto de la nota de crédito tiene que ser mayor a cero.'
  if (Math.abs(aCentavos(n) - n) > 1e-9) return 'El monto admite dos decimales como máximo.'
  if (aCentavos(n) > aCentavos(disponible))
    return `El monto no puede superar lo que queda por anular de la factura asociada (${pesos(disponible)}).`
  return null
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El comprobante
 * ──────────────────────────────────────────────────────────────────────────────── */

/** La alícuota de IVA del renglón de la obra (la que pone hoy el botón "Emitir Factura"). */
export const ALICUOTA_IVA = 21

/** El renglón del comprobante, como lo nombra el tablero. */
export const CONCEPTO_FACTURA = 'Fabricacion de Aberturas para Obra'

/** Días hasta el vencimiento del pago (Fecha Vto. Pago = emisión + 30). */
export const DIAS_VENCIMIENTO = 30

/** El importe final (con IVA) partido en neto e IVA, como lo calcula el tablero. */
export function desglose(final: number): { neto: number; iva: number; total: number } {
  const neto = final / (1 + ALICUOTA_IVA / 100)
  return { neto: aCentavos(neto), iva: aCentavos(final - neto), total: aCentavos(final) }
}

/** "2026-10-13". La fecha LOCAL: con `toISOString` a la noche ya sería mañana. */
export function fechaIso(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/** "13/10/2026". */
export function fechaCorta(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Las fechas del comprobante: emisión, el servicio (el mismo día) y el vencimiento del pago. */
export function fechasComprobante(hoy: Date): { emision: string; desde: string; hasta: string; vencimiento: string } {
  const vto = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_VENCIMIENTO)
  const emision = fechaIso(hoy)
  return { emision, desde: emision, hasta: emision, vencimiento: fechaIso(vto) }
}

/**
 * La letra que va a tener la factura, según la condición frente al IVA del cliente: a un Responsable
 * Inscripto, "A"; a cualquier otro, "B". La pone ARCA al emitir: esto es sólo lo que se anticipa en el
 * resumen. `null`: no se sabe (sin la condición cargada).
 */
export function letraEsperada(condicionFiscal: string): 'A' | 'B' | null {
  const c = condicionFiscal.trim().toLowerCase()
  if (!c || c.startsWith('sin info')) return null
  return c.includes('inscripto') ? 'A' : 'B'
}

/** El CUIT/CUIL/DNI tal como lo pide la columna numérica del tablero: sólo dígitos. */
export const documentoFiscal = (texto: string): string => String(texto ?? '').replace(/\D/g, '')

/**
 * Qué tiene de malo el CUIT/DNI a facturar. Vacío está permitido (se factura a Consumidor Final sin
 * documento, como hoy): `null`. Si se escribe, tiene que ser un DNI (7 u 8 dígitos) o un CUIT/CUIL (11).
 */
export function problemaDocumento(texto: string): string | null {
  const d = documentoFiscal(texto)
  if (!d) return null
  if (d.length === 7 || d.length === 8 || d.length === 11) return null
  return 'El CUIT/CUIL debe tener 11 dígitos, o el DNI 7 u 8.'
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El estado del comprobante en el tablero
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * `🤖 Estado Comprobante` (status) de 🧾 Facturación obra, por índice:
 *  · 3 "Crear Comprobante": lo que dispara la emisión en ARCA (hoy lo pone el botón "✋ Emitir
 *    Comprobante"). La app lo escribe para emitir.
 *  · 0 "Creando Comprobante": ARCA está emitiendo.
 *  · 1 "Comprobante Creado": emitido, con su PDF, número y CAE.
 *  · 2 "Error - Mirar Comentarios": no se pudo; el motivo está en las actualizaciones del ítem.
 */
export const INDICE_COMPROBANTE = { creando: 0, creado: 1, error: 2, crear: 3 } as const

export type FaseComprobante = 'sinEmitir' | 'emitiendo' | 'emitido' | 'error'

export function faseComprobante(indice: number | null | undefined): FaseComprobante {
  if (indice === INDICE_COMPROBANTE.creado) return 'emitido'
  if (indice === INDICE_COMPROBANTE.error) return 'error'
  if (indice === INDICE_COMPROBANTE.creando || indice === INDICE_COMPROBANTE.crear) return 'emitiendo'
  return 'sinEmitir'
}

/**
 * `🤖Estado Envio` (color_mm3kg5dm): la app escribe SÓLO "Enviado" (1) después de mandar el WhatsApp.
 * NUNCA "Enviar" (3): es lo que dispara el envío del escenario de Make, y la factura saldría dos veces.
 */
export const INDICE_ENVIO_FACTURA = { enviado: 1 } as const

/* ────────────────────────────────────────────────────────────────────────────────
 * El mensaje
 * ──────────────────────────────────────────────────────────────────────────────── */

/** "1900000" → "1.900.000,00": el `formatNumber(…; 2; ","; ".")` de la plantilla de Make. */
export const montoMensaje = (n: number): string => importeEditable(n)

/** "1111 - CLIENTE TEST" → "CLIENTE TEST": el código de la cuenta no va en un saludo. */
const sinCodigo = (n: string) => n.replace(/^\s*\d+\s*-\s*/, '').trim()

/**
 * El WhatsApp de UN comprobante, la plantilla del escenario de Make tal cual (pedido del usuario,
 * 13/10/2026): el saludo con el nombre de la cuenta corriente, el tipo de comprobante, la fecha del
 * envío y el monto facturado. Después del texto sale el PDF del comprobante.
 */
export function textoFactura(d: { nombre: string; tipo: string; fecha: Date; monto: number }): string {
  return [
    `👋 Hola ${sinCodigo(d.nombre)}`,
    '',
    'Adjuntamos el PDF del comprobante facturado. Si tenés alguna consulta sobre éste o tu cuenta, por favor respondé a este mensaje o contactanos.',
    '',
    `📄 *Tipo de Comprobante:* ${d.tipo || 'Factura'}`,
    `📅 *Fecha:* ${fechaCorta(d.fecha)}`,
    `💰 *Monto Facturado:* $${montoMensaje(d.monto)}`,
    '',
    'Polifroni Aberturas.',
    '🤖 Automatizado por The Automation Partner',
  ].join('\n')
}
