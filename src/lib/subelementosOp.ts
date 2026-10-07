/**
 * Los subelementos de una OP, armados antes de mandarlos a Monday (ver `crearSubelementos`). Sin
 * dependencias de Monday: se prueba en `tests/produccion.test.ts`.
 *
 * Cada subelemento es una ABERTURA, con sus datos (nombre, color, medidas y cantidad, de la lectura
 * de la IA). Su vidrio va en columnas propias (Comp 1, Cámara, Comp 2, Ancho, Alto, Cantidad), y
 * hay un juego por subelemento: una abertura con vidrios es un subelemento por vidrio, "V1 - Vidrio
 * 1", "V1 - Vidrio 2"…, cada uno con los datos de la abertura. La observación va en el primero. Una
 * abertura sin vidrio (un mosquitero) es un subelemento con su nombre solo: "M6".
 */

/** El modelo de un subelemento: "V1 - Vidrio 2" → "V1". Un nombre sin el sufijo queda igual. */
export const modeloDeSubelemento = (nombre: string): string => nombre.replace(/\s*-\s*Vidrio\s+\d+\s*$/i, '').trim()

/** Las columnas de un subelemento, por clave (los ids de Monday los pone quien las manda). */
export interface ValoresSubelemento {
  observacion?: string
  /** De la abertura. */
  descripcion?: string
  color?: string
  anchoAbertura?: string
  altoAbertura?: string
  cantidadAberturas?: number
  /** Del vidrio. */
  comp1?: string
  camara?: string
  comp2?: string
  ancho?: string
  alto?: string
  cantidad?: number
}

export interface FilaSubelemento {
  nombre: string
  valores: ValoresSubelemento
}

interface VidrioFila {
  modelo: string
  comp1: string | null
  camara: string | null
  comp2: string | null
  ancho: string | null
  alto: string | null
  cant: number | null
}

interface AberturaFila {
  nombre: string
  texto: string
  datos?: {
    descripcion: string | null
    color: string | null
    ancho: string | null
    alto: string | null
    cantidad: number | null
  }
}

const clave = (nombre: string) => nombre.trim().toUpperCase()

function deAbertura(a: AberturaFila): ValoresSubelemento {
  const d = a.datos
  if (!d) return {}
  const valores: ValoresSubelemento = {}
  if (lleno(d.descripcion)) valores.descripcion = lleno(d.descripcion)
  if (lleno(d.color)) valores.color = lleno(d.color)!.toUpperCase()
  if (lleno(d.ancho)) valores.anchoAbertura = lleno(d.ancho)
  if (lleno(d.alto)) valores.altoAbertura = lleno(d.alto)
  if (d.cantidad != null) valores.cantidadAberturas = d.cantidad
  return valores
}
const lleno = (v: string | null | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined)

function deVidrio(v: VidrioFila): ValoresSubelemento {
  const valores: ValoresSubelemento = {}
  if (lleno(v.comp1)) valores.comp1 = lleno(v.comp1)
  if (lleno(v.camara)) valores.camara = lleno(v.camara)
  if (lleno(v.comp2)) valores.comp2 = lleno(v.comp2)
  if (lleno(v.ancho)) valores.ancho = lleno(v.ancho)
  if (lleno(v.alto)) valores.alto = lleno(v.alto)
  if (v.cant != null) valores.cantidad = v.cant
  return valores
}

/**
 * Una fila por vidrio de cada abertura, en el orden de las aberturas; una abertura sin vidrio es una
 * fila sola. La observación (si se escribió) va en la primera fila de su abertura. Los vidrios de un
 * modelo que no está entre las aberturas van al final, con el nombre de su modelo.
 */
export function filasSubelementos(aberturas: AberturaFila[], vidrios: VidrioFila[]): FilaSubelemento[] {
  const filas: FilaSubelemento[] = []
  const usados = new Set<number>()
  for (const a of aberturas) {
    const nombre = clave(a.nombre)
    const observacion = lleno(a.texto)
    const propios = deAbertura(a)
    const suyos = vidrios.flatMap((v, i) => (clave(v.modelo) === nombre && !usados.has(i) ? [i] : []))
    if (suyos.length === 0) {
      filas.push({ nombre, valores: { ...(observacion ? { observacion } : {}), ...propios } })
      continue
    }
    suyos.forEach((i, n) => {
      usados.add(i)
      filas.push({
        nombre: `${nombre} - Vidrio ${n + 1}`,
        valores: { ...(n === 0 && observacion ? { observacion } : {}), ...propios, ...deVidrio(vidrios[i]) },
      })
    })
  }
  /* Vidrios de un modelo que no está entre las aberturas: se numeran igual, por modelo. */
  const sueltos = new Map<string, number>()
  vidrios.forEach((v, i) => {
    if (usados.has(i)) return
    const modelo = clave(v.modelo) || 'VIDRIO'
    const n = (sueltos.get(modelo) ?? 0) + 1
    sueltos.set(modelo, n)
    filas.push({ nombre: `${modelo} - Vidrio ${n}`, valores: deVidrio(v) })
  })
  return filas
}
