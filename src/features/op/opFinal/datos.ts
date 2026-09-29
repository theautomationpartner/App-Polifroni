/**
 * Los datos de la Orden de Producción final, armados en la app.
 *
 * Es el módulo 59 del escenario de generación ("armarTemplateData") pasado a TypeScript: toma lo
 * que Claude leyó del listado HETMO (`datos` en la respuesta del webhook) y los datos de la obra y
 * de la medición, y devuelve lo que dibuja el PDF. De paso corrige dos cosas que el módulo hacía
 * mal con la lectura actual:
 *
 *  - Los vidrios. El módulo leía `vidrio`/`vUd` sueltos, de cuando la IA devolvía uno solo por
 *    modelo; la lectura de hoy trae `vidrios` (una entrada por línea "Vid:"). El total de DVH
 *    daba siempre 0 y la tarjeta no mostraba ninguno.
 *  - Las observaciones. El módulo comparaba "V1" (lo que escribe el operario) contra "V1 DT 1" (el
 *    código completo que lee la IA), así que cualquier modelo con "DT" perdía su observación y la
 *    mandaba al pie. Acá se compara contra el código sin el "DT".
 *
 * Nada se descarta en silencio: lo que no se puede imprimir bien vuelve como `errores` (frenan la
 * generación) o `avisos` (se genera igual, con una raya donde falta el dato).
 */
import { normalizarNombre, type Abertura } from '../observaciones'

export type Slot = 'a' | 'b' | 'full' | 'none'

export interface VidrioOp {
  tipo: string | null
  ancho: string | null
  alto: string | null
  ud: number | null
}

export interface TapOp {
  cod: string | null
  medida: string | null
}

/** Un modelo, tal como lo imprime la tarjeta. */
export interface ModeloOp {
  codigo: string | null
  descripcion: string | null
  color: string | null
  ancho: string | null
  alto: string | null
  cantidad: number | null
  vidrios: VidrioOp[]
  taps: TapOp[]
  /** Hoja del listado HETMO donde está el dibujo, desde 0. `null` si la IA no lo dijo. */
  hojaIdx: number | null
  slot: Slot
  observacion: string | null
}

export interface PaginaOp {
  nro: number
  esUltima: boolean
  /** Hasta 3 renglones de hasta 3 modelos. */
  filas: ModeloOp[][]
  /** Algún modelo de la hoja tiene observación: se reserva el bloque en TODAS sus tarjetas. */
  hayObs: boolean
  /** Líneas "Vid:" del modelo que más tiene en la hoja: fija el alto del bloque de datos. */
  maxVidrios: number
}

export interface DatosOp {
  obra: string
  direccion: string
  celular: string
  nroOrden: string
  fecha: string
  vista: string
  medidoPor: string
  numeroListado: string | null
  version: string | null
  paginas: PaginaOp[]
  totalPaginas: number
  totales: { aberturas: number; dvh: number; mosquiteros: number }
  /** Observaciones que no encontraron su modelo: van al pie para no perderlas. */
  observacionesSueltas: string | null
  /** La observación de la OP (paso 2, "Observación" de la medición): va al pie, debajo de "Medido por". */
  observacionOp: string | null
  /** Cuántas hojas del HETMO hacen falta para los dibujos (el `hojaIdx` más alto + 1). */
  hojasNecesarias: number
}

export interface EntradaOp {
  /** Lo que devolvió Claude: el objeto `datos` del webhook, o su texto JSON. */
  lectura: unknown
  obra: string
  direccion: string
  celular: string
  nroOrden: string
  /** DD/MM/AAAA. */
  fecha: string
  medidoPor: string
  /** La observación de la OP: la que se escribe junto a "Medido por" en el paso 2. */
  observacionOp?: string
  vista?: string
  /** Las observaciones escritas en el paso 2, una por abertura. */
  aberturas: Abertura[]
}

export interface ResultadoDatos {
  datos: DatosOp | null
  errores: string[]
  avisos: string[]
}

const MODELOS_POR_FILA = 3
const FILAS_POR_PAGINA = 3

/* ── Medidas de la hoja, en mm ─────────────────────────────────────────────
   Las usa `DocumentoOp` para dibujar y `enPaginas` para saber cuántos renglones entran en una A4:
   la hoja es SIEMPRE una A4 vertical, así que lo que no entra va a la hoja siguiente. */
/** Alto del bloque de vidrio + tapajuntas con UNA línea "Vid:" (el de la plantilla). */
export const ALTO_DATOS_MM = 20.5
/** Lo que suma cada línea "Vid:" de más. */
export const ALTO_VIDRIO_MM = 3.6
/** El bloque de la observación de cada tarjeta, en las hojas que tienen alguna. */
export const ALTO_OBS_MM = 12
/** Renglones que puede ocupar la observación de la OP en el pie. */
export const LINEAS_OBS_OP = 3
/*
 * Lo que ocupa cada parte, CALIBRADO contra react-pdf: se armaron hojas de 1 a 3 renglones con 1 a 8
 * líneas "Vid:", con y sin observaciones y con y sin pie, y se midió cuáles entran en una A4. Estos
 * números dejan ~5 mm de margen sobre lo medido (un nombre de obra en dos renglones, redondeos):
 * nunca prometen más de lo que entra, así que la hoja no se corta ni se estira.
 */
/** Alto útil para los renglones: la A4 menos el encabezado y el margen. */
const DISPONIBLE_MM = 263.5
/** Lo fijo de un renglón: código, descripción, color, medidas, cantidad, márgenes y el dibujo en su
    alto mínimo (12 mm). El dibujo crece con lo que sobra de la hoja, hasta 44 mm. */
const ALTO_FILA_FIJO_MM = 42
/** El pie: los cuatro totales y la observación de la OP con todos sus renglones. */
const ALTO_PIE_MM = 32.5

const altoFilas = (filas: ModeloOp[][]): number => {
  const modelos = filas.flat()
  const maxVidrios = Math.max(1, ...modelos.map((m) => m.vidrios.length))
  const hayObs = modelos.some((m) => m.observacion)
  const fila = ALTO_FILA_FIJO_MM + ALTO_DATOS_MM + (maxVidrios - 1) * ALTO_VIDRIO_MM + (hayObs ? ALTO_OBS_MM + 0.6 : 0)
  return fila * filas.length
}

const altoSueltas = (sueltas: string | null): number =>
  sueltas ? 5 + (sueltas.split('\n').length + 1) * 4.4 : 0

/** Texto recortado, o `null` si no hay nada. */
function texto(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t ? t : null
}

/** Entero ≥ 0, o `null`. */
function entero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** La lectura puede llegar como objeto o como el texto JSON crudo del módulo de Claude. */
function comoObjeto(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      return comoObjeto(JSON.parse(v))
    } catch {
      return null
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function aModelo(v: unknown): ModeloOp | null {
  const m = comoObjeto(v)
  if (!m) return null
  const slot = String(m.slot ?? '').trim().toLowerCase()
  return {
    codigo: texto(m.codigo),
    descripcion: texto(m.descripcion),
    color: texto(m.color),
    ancho: texto(m.ancho),
    alto: texto(m.alto),
    cantidad: entero(m.cantidad),
    vidrios: (Array.isArray(m.vidrios) ? m.vidrios : [])
      .map(comoObjeto)
      .filter((x): x is Record<string, unknown> => x != null)
      .map((x) => ({ tipo: texto(x.tipo), ancho: texto(x.ancho), alto: texto(x.alto), ud: entero(x.ud) })),
    taps: (Array.isArray(m.taps) ? m.taps : [])
      .map(comoObjeto)
      .filter((x): x is Record<string, unknown> => x != null)
      .map((x) => ({ cod: texto(x.cod), medida: texto(x.medida) })),
    hojaIdx: entero(m.hojaIdx),
    slot: slot === 'a' || slot === 'b' || slot === 'none' ? slot : 'full',
    observacion: null,
  }
}

/** "V1 DT 1" → "V1": la parte del código que escribe el operario en la observación. */
const claveModelo = (codigo: string | null): string =>
  normalizarNombre(String(codigo ?? '').split(/\s+/)[0] ?? '')

/**
 * Cuántas aberturas lleva cada modelo ("Uds:" del listado), por su nombre: "V2" → 2.
 *
 * Sale de la MISMA lectura que arma la OP final. La usan los subelementos de vidrio: cada línea
 * "Vid:" dice los vidrios de UNA abertura, y el subelemento lleva el total del modelo.
 */
export function cantidadesPorModelo(lectura: unknown): Map<string, number> {
  const cantidades = new Map<string, number>()
  const l = comoObjeto(lectura)
  const crudos = (Array.isArray(l?.paginas) ? l.paginas : []).flatMap((p) => {
    const filas = comoObjeto(p)?.filas
    return (Array.isArray(filas) ? filas : []).flatMap((f) => (Array.isArray(f) ? f : [f]))
  })
  for (const m of crudos.map(aModelo)) {
    if (!m?.codigo || m.cantidad == null) continue
    cantidades.set(claveModelo(m.codigo), m.cantidad)
    cantidades.set(normalizarNombre(m.codigo), m.cantidad)
  }
  return cantidades
}

/** La cantidad de un modelo por el nombre con que lo nombra otra lectura ("V2", "v2", "V2 DT 1"). */
export const cantidadDe = (cantidades: Map<string, number>, modelo: string): number | null =>
  cantidades.get(normalizarNombre(modelo)) ?? cantidades.get(claveModelo(modelo)) ?? null

const nombreModelo = (m: ModeloOp, i: number): string =>
  m.codigo ? `Modelo ${m.codigo}` : `El modelo n° ${i + 1}`

/**
 * Las hojas: A4 vertical, de a 3 modelos por renglón y hasta 3 renglones, en el orden en que los
 * leyó la IA.
 *
 * Un renglón pasa a la hoja siguiente cuando no entra: los modelos con muchas líneas "Vid:" hacen
 * renglones más altos, y la última hoja además lleva el pie. Así la hoja nunca se estira ni se
 * corta: cualquiera sea la cantidad de aberturas, se imprime vertical y entera.
 */
function enPaginas(modelos: ModeloOp[], sueltas: string | null): PaginaOp[] {
  const renglones: ModeloOp[][] = []
  for (let i = 0; i < modelos.length; i += MODELOS_POR_FILA) {
    renglones.push(modelos.slice(i, i + MODELOS_POR_FILA))
  }
  const disponible = DISPONIBLE_MM
  const hojas: ModeloOp[][][] = []
  let actual: ModeloOp[][] = []
  for (const r of renglones) {
    const conEste = [...actual, r]
    if (actual.length && (conEste.length > FILAS_POR_PAGINA || altoFilas(conEste) > disponible)) {
      hojas.push(actual)
      actual = [r]
    } else {
      actual = conEste
    }
  }
  if (actual.length) hojas.push(actual)
  /* La última lleva el pie: si con él no entra, sus últimos renglones pasan a una hoja nueva. */
  const pie = ALTO_PIE_MM + altoSueltas(sueltas)
  for (;;) {
    const ultima = hojas[hojas.length - 1]
    if (!ultima || altoFilas(ultima) + pie <= disponible) break
    if (ultima.length === 1) {
      /* Un solo renglón con el pie no entra: el pie va solo en una hoja más. */
      hojas.push([])
      break
    }
    const nueva: ModeloOp[][] = []
    while (ultima.length > 1 && altoFilas(ultima) + pie > disponible) nueva.unshift(ultima.pop() as ModeloOp[])
    hojas.push(nueva)
  }
  return hojas.map((filas, i) => {
    const deLaPagina = filas.flat()
    return {
      nro: i + 1,
      esUltima: i === hojas.length - 1,
      filas,
      hayObs: deLaPagina.some((m) => m.observacion),
      maxVidrios: Math.max(1, ...deLaPagina.map((m) => m.vidrios.length)),
    }
  })
}

export function armarDatosOp(e: EntradaOp): ResultadoDatos {
  const errores: string[] = []
  const avisos: string[] = []

  /* ── La lectura de Claude ─────────────────────────────────────────────── */
  const lectura = comoObjeto(e.lectura)
  if (!lectura) {
    return {
      datos: null,
      errores: ['La automatización no devolvió la lectura del listado HETMO ("datos" en la respuesta).'],
      avisos,
    }
  }
  /* La grilla de la IA se aplana y se vuelve a armar acá: si agrupó mal (4 en un renglón, un
     modelo repetido entre páginas), la orden sale igual con 3 por renglón y 3 renglones por hoja. */
  const crudos = (Array.isArray(lectura.paginas) ? lectura.paginas : []).flatMap((p) => {
    const pagina = comoObjeto(p)
    const filas = Array.isArray(pagina?.filas) ? pagina.filas : []
    return filas.flatMap((f) => (Array.isArray(f) ? f : [f]))
  })
  const modelos = crudos.map(aModelo).filter((m): m is ModeloOp => m != null)
  if (modelos.length === 0) {
    errores.push('La lectura del listado HETMO no trae ningún modelo.')
  }
  if (crudos.length !== modelos.length) {
    avisos.push(`${crudos.length - modelos.length} entrada(s) de la lectura no son modelos y se descartaron.`)
  }

  const numeroListado = texto(lectura.numeroListado)
  /* En el listado figura "Versión:. 1": si la IA arrastra el punto o los dos puntos, se sacan. */
  const version = texto(lectura.version)?.replace(/^[.:\s]+/, '') || null
  if (!numeroListado) avisos.push('No se pudo leer el N° de listado HETMO: el encabezado va con una raya.')
  if (!version) avisos.push('No se pudo leer la versión del listado HETMO: el encabezado va con una raya.')

  /* ── Los datos de la obra y de la medición ────────────────────────────── */
  const obligatorio = (valor: string, que: string) => {
    const t = valor.trim()
    if (!t) errores.push(`Falta ${que}.`)
    return t
  }
  const obra = obligatorio(e.obra, 'el nombre de la obra')
  const direccion = obligatorio(e.direccion, 'la dirección de la obra')
  const celular = obligatorio(e.celular, 'el celular a coordinar de la obra')
  const nroOrden = obligatorio(e.nroOrden, 'el número de la orden')
  const fecha = obligatorio(e.fecha, 'la fecha')
  const medidoPor = e.medidoPor.trim()
  if (!medidoPor) avisos.push('Falta "Medido por": el pie va sin ese dato.')

  /* ── Cada modelo ───────────────────────────────────────────────────────── */
  const vistos = new Map<string, number>()
  modelos.forEach((m, i) => {
    const quien = nombreModelo(m, i)
    const faltan = (
      [
        ['código', m.codigo],
        ['descripción', m.descripcion],
        ['color', m.color],
        ['ancho', m.ancho],
        ['alto', m.alto],
        ['cantidad', m.cantidad],
      ] as const
    )
      .filter(([, v]) => v == null)
      .map(([k]) => k)
    if (faltan.length) avisos.push(`${quien}: no se leyó ${faltan.join(', ')}.`)
    if (m.taps.length !== 0 && m.taps.length !== 4) {
      avisos.push(`${quien}: tiene ${m.taps.length} tapajuntas (lo normal es 0 o 4).`)
    }
    if (m.vidrios.some((v) => v.tipo == null || v.ancho == null || v.alto == null || v.ud == null)) {
      avisos.push(`${quien}: hay una línea de vidrio con datos que no se leyeron.`)
    }
    if (m.hojaIdx == null) avisos.push(`${quien}: la IA no dijo en qué hoja está el dibujo; va sin dibujo.`)
    if (m.codigo) {
      const clave = m.codigo.toUpperCase()
      vistos.set(clave, (vistos.get(clave) ?? 0) + 1)
    }
  })
  for (const [codigo, veces] of vistos) {
    if (veces > 1) avisos.push(`Modelo ${codigo} aparece ${veces} veces en la lectura.`)
  }

  /* ── Las observaciones, cada una a su modelo ─────────────────────────── */
  const porNombre = new Map<string, string>()
  for (const a of e.aberturas) {
    const t = a.texto.trim()
    if (!t) continue
    const clave = normalizarNombre(a.nombre)
    porNombre.set(clave, porNombre.has(clave) ? `${porNombre.get(clave)}\n${t}` : t)
  }
  const usadas = new Set<string>()
  for (const m of modelos) {
    const clave = [claveModelo(m.codigo), normalizarNombre(m.codigo ?? '')].find((c) => porNombre.has(c))
    if (clave) {
      m.observacion = porNombre.get(clave) ?? null
      usadas.add(clave)
    }
  }
  const sueltas = [...porNombre].filter(([k]) => !usadas.has(k)).map(([k, t]) => `Modelo ${k}: ${t}`)
  if (sueltas.length) {
    avisos.push(`${sueltas.length} observación(es) no encontraron su modelo en el listado y van al pie.`)
  }

  /* ── Totales del pie ──────────────────────────────────────────────────── */
  const totales = { aberturas: 0, dvh: 0, mosquiteros: 0 }
  for (const m of modelos) {
    const cantidad = m.cantidad ?? 0
    /* Un mosquitero se reconoce por la descripción: "no tiene vidrio" también lo cumpliría un
       paño ciego, que SÍ es una abertura. */
    if (/mosquitero/i.test(m.descripcion ?? '')) totales.mosquiteros += cantidad
    else totales.aberturas += cantidad
    /* DVH = doble vidriado hermético: se reconoce por la cámara ("4/12/4"). */
    const dvhPorUnidad = m.vidrios
      .filter((v) => (v.tipo ?? '').includes('/'))
      .reduce((s, v) => s + (v.ud ?? 0), 0)
    totales.dvh += dvhPorUnidad * cantidad
  }

  const observacionesSueltas = sueltas.length ? sueltas.join('\n') : null
  const paginas = enPaginas(modelos, observacionesSueltas)
  const hojasNecesarias = Math.max(0, ...modelos.map((m) => (m.hojaIdx == null ? 0 : m.hojaIdx + 1)))

  if (errores.length) return { datos: null, errores, avisos }
  return {
    datos: {
      obra,
      direccion,
      celular,
      nroOrden,
      fecha,
      vista: e.vista?.trim() || 'VISTA EXTERIOR',
      medidoPor,
      numeroListado,
      version,
      paginas,
      totalPaginas: paginas.length,
      totales,
      observacionesSueltas,
      observacionOp: e.observacionOp?.trim() || null,
      hojasNecesarias,
    },
    errores,
    avisos,
  }
}
