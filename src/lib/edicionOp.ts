/**
 * Editar Órdenes de Producción: la lógica pura, sin Monday ni la IA. Se prueba en
 * `tests/produccion.test.ts`.
 *
 * Una OP de PVC se arma con la LECTURA del listado HETMO (un modelo por abertura, con sus vidrios,
 * tapajuntas y dónde está su dibujo). Editarla es reemplazar en esa lectura los modelos de las
 * aberturas que cambiaron por las que la IA leyó del dibujo nuevo (y sumar las nuevas), y volver a armar la OP final. Acá se
 * decide qué cambia y cómo queda: la comparación campo por campo ("Se editará el ancho de 1.500 a
 * 1.600"), la lectura nueva, el nombre de la OP nueva y el motivo con que se cancela la anterior.
 */

export interface VidrioListado {
  tipo: string | null
  ancho: string | null
  alto: string | null
  ud: number | null
}

export interface TapListado {
  cod: string | null
  medida: string | null
}

/** Un modelo de la lectura del listado (la forma de `api/_hetmoListado.ts`). */
export interface ModeloListado {
  codigo: string | null
  descripcion: string | null
  color: string | null
  ancho: string | null
  alto: string | null
  cantidad: number | null
  vidrios: VidrioListado[]
  taps: TapListado[]
  hojaIdx: number | null
  slot: string
  /**
   * De qué documento sale su dibujo: el índice en los archivos de `🤖OP OriginaL` de la OP. 0 (o
   * sin dato) es el listado original; una OP editada suma el dibujo nuevo detrás.
   */
  archivoIdx?: number
}

export interface LecturaListadoOp {
  numeroListado: string | null
  version: string | null
  paginas: { nro: number; esUltima: boolean; filas: ModeloListado[][] }[]
}

/** Un vidrio de una abertura, como se muestra en la etapa 2. */
export interface VidrioEditable {
  comp1: string
  camara: string
  comp2: string
  ancho: string
  alto: string
  cantidad: number | null
}

/** Una abertura de la OP, como se lista en la etapa 2 ("Seleccionar aberturas"). */
export interface AberturaEditable {
  /** El modelo, como se llama en la OP: "V1", "V9 DT 3". */
  modelo: string
  descripcion: string
  color: string
  ancho: string
  alto: string
  cantidad: number | null
  observacion: string
  vidrios: VidrioEditable[]
}

/** Lo que se editará: "Se editará {campo} de {anterior} a {nuevo}". */
export interface CambioCampo {
  abertura: string
  campo: string
  anterior: string
  nuevo: string
}

const txt = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim())
const ent = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return v != null && String(v).trim() !== '' && Number.isFinite(n) ? Math.round(n) : null
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** Un modelo crudo (de la IA o de la base) con la forma de la lectura. */
export function aModeloListado(v: unknown): ModeloListado {
  const m = obj(v)
  return {
    codigo: txt(m.codigo),
    descripcion: txt(m.descripcion),
    color: txt(m.color),
    ancho: txt(m.ancho),
    alto: txt(m.alto),
    cantidad: ent(m.cantidad),
    vidrios: (Array.isArray(m.vidrios) ? m.vidrios : []).map((x) => {
      const o = obj(x)
      return { tipo: txt(o.tipo), ancho: txt(o.ancho), alto: txt(o.alto), ud: ent(o.ud) }
    }),
    taps: (Array.isArray(m.taps) ? m.taps : []).map((x) => {
      const o = obj(x)
      return { cod: txt(o.cod), medida: txt(o.medida) }
    }),
    hojaIdx: ent(m.hojaIdx),
    slot: txt(m.slot) ?? 'full',
    ...(ent(m.archivoIdx) != null ? { archivoIdx: ent(m.archivoIdx)! } : {}),
  }
}

/** Los modelos de la lectura, aplanados y en orden (la grilla la vuelve a armar la OP final). */
export function modelosDe(lectura: unknown): ModeloListado[] {
  const l = obj(lectura)
  return (Array.isArray(l.paginas) ? l.paginas : []).flatMap((p) => {
    const filas = obj(p).filas
    return (Array.isArray(filas) ? filas : []).flatMap((f) => (Array.isArray(f) ? f : [f])).map(aModeloListado)
  })
}

/** La lectura con otros modelos: una sola grilla, que `armarDatosOp` reparte en hojas. */
export function conModelos(lectura: unknown, modelos: ModeloListado[]): LecturaListadoOp {
  const l = obj(lectura)
  return {
    numeroListado: txt(l.numeroListado),
    version: txt(l.version),
    paginas: [{ nro: 1, esUltima: true, filas: [modelos] }],
  }
}

/** "v1 dt 1" → "V1 DT 1". */
export const claveModelo = (codigo: string | null | undefined): string =>
  String(codigo ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

/** "V1 DT 1" → "V1": el modelo como lo escribe el operario. */
const raiz = (codigo: string | null | undefined): string => claveModelo(codigo).split(' ')[0] ?? ''

/** La misma abertura con o sin el "DT n": "V1" y "V1 DT 1". */
export const mismaAbertura = (a: string | null | undefined, b: string | null | undefined): boolean =>
  claveModelo(a) === claveModelo(b) || (raiz(a) !== '' && raiz(a) === raiz(b) && (!claveModelo(a).includes(' ') || !claveModelo(b).includes(' ')))

/** "3+3/12/4 INC" → { comp1: "3+3", camara: "12", comp2: "4" }. Un vidrio simple va entero en comp1. */
export function partirTipoVidrio(tipo: string | null | undefined): { comp1: string; camara: string; comp2: string } {
  const composicion = String(tipo ?? '').trim().split(/\s+/)[0] ?? ''
  const partes = composicion.split('/')
  if (partes.length === 3 && partes.every(Boolean)) return { comp1: partes[0], camara: partes[1], comp2: partes[2] }
  return { comp1: composicion, camara: '', comp2: '' }
}

/** Las aberturas de la lectura, para la etapa 2 cuando la OP no tiene subelementos. */
export function aberturasDeLectura(lectura: unknown): AberturaEditable[] {
  return modelosDe(lectura).map((m) => ({
    modelo: claveModelo(m.codigo),
    descripcion: m.descripcion ?? '',
    color: (m.color ?? '').toUpperCase(),
    ancho: m.ancho ?? '',
    alto: m.alto ?? '',
    cantidad: m.cantidad,
    observacion: '',
    vidrios: m.vidrios.map((v) => ({
      ...partirTipoVidrio(v.tipo),
      ancho: v.ancho ?? '',
      alto: v.alto ?? '',
      cantidad: v.ud != null && m.cantidad != null ? v.ud * m.cantidad : v.ud,
    })),
  }))
}

const textoVidrio = (v: VidrioListado | undefined): string =>
  v ? [v.tipo, v.ancho && v.alto ? `${v.ancho} x ${v.alto}` : null, v.ud != null ? `ud: ${v.ud}` : null].filter(Boolean).join(' · ') : '—'
const textoTaps = (t: TapListado[]): string => (t.length ? t.map((x) => `${x.cod ?? '—'} ${x.medida ?? '—'}`).join(', ') : 'Sin tapajuntas')
const igual = (a: string | null, b: string | null) => (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()

/**
 * Una abertura editada: el modelo de la OP con lo que el dibujo nuevo dice de ella, y la lista de
 * lo que cambia.
 *
 *  - Sus datos (descripción, color, medidas, unidades, tapajuntas) pasan a ser los del dibujo
 *    nuevo. Un dato que la IA no pudo leer (null) NO borra el que había: queda el anterior.
 *  - Sus vidrios cambian SÓLO si el usuario eligió editarlos: los elegidos toman el del dibujo
 *    nuevo (o se quitan, si el dibujo ya no lo trae); los demás quedan como estaban. Con algún
 *    vidrio elegido, los que el dibujo nuevo agrega al final también se suman.
 *  - El dibujo pasa a ser el del documento nuevo (hoja y mitad que leyó la IA).
 *  - El nombre (código) queda el de la OP: la abertura sigue siendo la misma.
 */
export function editarModelo(
  viejo: ModeloListado,
  nuevo: ModeloListado,
  vidriosElegidos: readonly number[],
  archivoIdx: number,
): { modelo: ModeloListado; cambios: CambioCampo[] } {
  const abertura = claveModelo(viejo.codigo) || claveModelo(nuevo.codigo)
  const cambios: CambioCampo[] = []
  const campo = (nombre: string, a: string | null, b: string | null): string | null => {
    if (b == null) return a
    if (!igual(a, b)) cambios.push({ abertura, campo: nombre, anterior: a ?? '—', nuevo: b })
    return b
  }
  const descripcion = campo('la descripción', viejo.descripcion, nuevo.descripcion)
  const color = campo('el color', viejo.color, nuevo.color)
  const ancho = campo('el ancho (mm)', viejo.ancho, nuevo.ancho)
  const alto = campo('el alto (mm)', viejo.alto, nuevo.alto)
  const cantidadTxt = campo(
    'la cantidad de aberturas',
    viejo.cantidad == null ? null : String(viejo.cantidad),
    nuevo.cantidad == null ? null : String(nuevo.cantidad),
  )
  const cantidad = cantidadTxt == null ? null : Number(cantidadTxt)

  /* Un tapajuntas sin código ni medida es un renglón que la lectura no pudo leer: no cuenta como dato
     (si contara, la misma abertura "cambiaría" sólo por cómo se leyó). */
  const conDato = (t: TapListado[]) => t.filter((x) => x.cod || x.medida)
  let taps = viejo.taps
  if (conDato(nuevo.taps).length && textoTaps(conDato(nuevo.taps)) !== textoTaps(conDato(viejo.taps))) {
    cambios.push({ abertura, campo: 'los tapajuntas', anterior: textoTaps(conDato(viejo.taps)), nuevo: textoTaps(conDato(nuevo.taps)) })
    taps = nuevo.taps
  }

  let vidrios = viejo.vidrios
  if (vidriosElegidos.length) {
    const elegidos = new Set(vidriosElegidos)
    vidrios = []
    const largo = Math.max(viejo.vidrios.length, nuevo.vidrios.length)
    for (let i = 0; i < largo; i++) {
      const antes = viejo.vidrios[i]
      const despues = nuevo.vidrios[i]
      const nombre = `el vidrio ${i + 1}`
      if (i < viejo.vidrios.length && !elegidos.has(i)) {
        vidrios.push(antes)
        continue
      }
      if (!despues) {
        cambios.push({ abertura, campo: nombre, anterior: textoVidrio(antes), nuevo: 'Se quita' })
        continue
      }
      /* Lo que la IA no leyó de la línea queda como estaba. */
      const final: VidrioListado = antes
        ? {
            tipo: despues.tipo ?? antes.tipo,
            ancho: despues.ancho ?? antes.ancho,
            alto: despues.alto ?? antes.alto,
            ud: despues.ud ?? antes.ud,
          }
        : despues
      if (textoVidrio(final) !== textoVidrio(antes)) {
        cambios.push({ abertura, campo: antes ? nombre : `${nombre} (nuevo)`, anterior: textoVidrio(antes), nuevo: textoVidrio(final) })
      }
      vidrios.push(final)
    }
  }

  return {
    modelo: {
      codigo: viejo.codigo ?? nuevo.codigo,
      descripcion,
      color,
      ancho,
      alto,
      cantidad,
      vidrios,
      taps,
      hojaIdx: nuevo.hojaIdx,
      slot: nuevo.slot,
      archivoIdx,
    },
    cambios,
  }
}

/**
 * Las aberturas nuevas que leyó la IA: las que de verdad no están en la OP (se vuelve a comparar
 * acá, por si la IA trajo una que ya estaba), sin repetidas y con su dibujo en el documento nuevo.
 */
export function aberturasNuevas(leidas: readonly unknown[], existentes: readonly ModeloListado[], archivoIdx: number): ModeloListado[] {
  const nuevas: ModeloListado[] = []
  for (const crudo of leidas) {
    const m = aModeloListado(crudo)
    if (!claveModelo(m.codigo)) continue
    if (existentes.some((e) => mismaAbertura(e.codigo, m.codigo))) continue
    if (nuevas.some((n) => mismaAbertura(n.codigo, m.codigo))) continue
    nuevas.push({ ...m, codigo: claveModelo(m.codigo), archivoIdx })
  }
  return nuevas
}

/** "V10 - Ventana Efficient … con 2 vidrios": lo que dice la ventana de una abertura agregada. */
export function textoNueva(m: ModeloListado): string {
  const n = m.vidrios.length
  const vidrios = n === 0 ? 'sin vidrios' : `con ${n} ${n === 1 ? 'vidrio' : 'vidrios'}`
  return `${[claveModelo(m.codigo), m.descripcion].filter(Boolean).join(' - ')} ${vidrios}`
}

/** "OBRA - IDOP-030 - PVC 2281" → "… V2"; una ya editada sube: "… V2" → "… V3". */
export function nombreConVersion(nombre: string): string {
  const t = nombre.trim()
  const m = /^(.*?)\s+V(\d+)$/i.exec(t)
  return m ? `${m[1]} V${Number(m[2]) + 1}` : `${t} V2`
}

/** El motivo con que se cancela la OP anterior: a cuál la reemplaza y qué se editó. */
export function motivoEdicion(
  nombreNuevo: string,
  cambios: readonly CambioCampo[],
  sinCambios: readonly string[],
  nuevas: readonly ModeloListado[] = [],
): string {
  const lineas = [
    ...cambios.map((c) => `- ${c.abertura}: ${c.campo} de ${c.anterior} a ${c.nuevo}`),
    ...nuevas.map((m) => `- Se agregó la abertura ${textoNueva(m)}`),
  ]
  const dibujos = sinCambios.length ? [`- Dibujo actualizado sin cambios de datos: ${sinCambios.join(', ')}`] : []
  return [
    `Orden editada: se reemplaza por «${nombreNuevo}», generada con el nuevo dibujo de HETMO.`,
    'Cambios:',
    ...(lineas.length ? lineas : ['- Sin cambios de datos; se actualizó el dibujo.']),
    ...dibujos,
  ].join('\n')
}

/* ── Las listas de aberturas y vidrios (etapa 2): antes y después de la edición ───────────── */

/** Un dato en las listas: el de la OP y, si la edición lo cambia, el nuevo. */
export interface Par {
  antes: string
  ahora: string
}
const par = (antes: string, ahora: string): Par => ({ antes, ahora })
export const cambio = (p: Par): boolean => p.antes.trim().toUpperCase() !== p.ahora.trim().toUpperCase()

export interface FilaListaAbertura {
  modelo: string
  /** Abertura agregada por la edición (no estaba en la OP). */
  nueva: boolean
  descripcion: Par
  color: Par
  medidas: Par
  cantidad: Par
  vidrios: Par
}

export interface FilaListaVidrio {
  modelo: string
  /** El número del vidrio dentro de su abertura, desde 1. */
  n: number
  /** Vidrio que la edición agrega (`nuevo`) o quita (`quitado`). */
  nuevo: boolean
  quitado: boolean
  tipo: Par
  ancho: Par
  alto: Par
  /** Las piezas a pedir: la línea ("ud") por las aberturas del modelo. */
  cantidad: Par
}

const medidasDe = (m: ModeloListado | undefined) => (m && (m.ancho || m.alto) ? `${m.ancho ?? '—'} x ${m.alto ?? '—'}` : '')
const numTxt = (n: number | null | undefined) => (n == null ? '' : String(n))
const piezas = (v: VidrioListado | undefined, m: ModeloListado | undefined) =>
  v?.ud != null ? String(m?.cantidad != null ? v.ud * m.cantidad : v.ud) : ''

/**
 * Las aberturas para la lista: las de la OP y, con la edición generada (`final`), cada dato con su
 * valor nuevo; las agregadas, al final y marcadas. Sin `final`, antes y ahora son lo mismo.
 */
export function filasAberturas(base: readonly ModeloListado[], final: readonly ModeloListado[] | null): FilaListaAbertura[] {
  const fin = final ?? base
  const filas = base.map((b) => {
    const f = fin.find((x) => mismaAbertura(x.codigo, b.codigo)) ?? b
    return {
      modelo: claveModelo(b.codigo),
      nueva: false,
      descripcion: par(b.descripcion ?? '', f.descripcion ?? ''),
      color: par((b.color ?? '').toUpperCase(), (f.color ?? '').toUpperCase()),
      medidas: par(medidasDe(b), medidasDe(f)),
      cantidad: par(numTxt(b.cantidad), numTxt(f.cantidad)),
      vidrios: par(String(b.vidrios.length), String(f.vidrios.length)),
    }
  })
  const agregadas = fin
    .filter((f) => !base.some((b) => mismaAbertura(b.codigo, f.codigo)))
    .map((f) => ({
      modelo: claveModelo(f.codigo),
      nueva: true,
      descripcion: par('', f.descripcion ?? ''),
      color: par('', (f.color ?? '').toUpperCase()),
      medidas: par('', medidasDe(f)),
      cantidad: par('', numTxt(f.cantidad)),
      vidrios: par('', String(f.vidrios.length)),
    }))
  return [...filas, ...agregadas]
}

/** Los vidrios para la lista, abertura por abertura, con lo que la edición cambia, agrega o quita. */
export function filasVidrios(base: readonly ModeloListado[], final: readonly ModeloListado[] | null): FilaListaVidrio[] {
  const fin = final ?? base
  const modelos = [...base, ...fin.filter((f) => !base.some((b) => mismaAbertura(b.codigo, f.codigo)))]
  return modelos.flatMap((m) => {
    const b = base.find((x) => mismaAbertura(x.codigo, m.codigo))
    const f = fin.find((x) => mismaAbertura(x.codigo, m.codigo))
    const largo = Math.max(b?.vidrios.length ?? 0, f?.vidrios.length ?? 0)
    return Array.from({ length: largo }, (_, i) => {
      const vb = b?.vidrios[i]
      const vf = f?.vidrios[i]
      return {
        modelo: claveModelo(m.codigo),
        n: i + 1,
        nuevo: !vb && !!vf,
        quitado: !!vb && !vf,
        tipo: par(vb?.tipo ?? '', vf?.tipo ?? ''),
        ancho: par(vb?.ancho ?? '', vf?.ancho ?? ''),
        alto: par(vb?.alto ?? '', vf?.alto ?? ''),
        cantidad: par(piezas(vb, b), piezas(vf, f)),
      }
    })
  })
}

export const hayCambiosAberturas = (filas: readonly FilaListaAbertura[]): boolean =>
  filas.some((f) => f.nueva || [f.descripcion, f.color, f.medidas, f.cantidad, f.vidrios].some(cambio))
export const hayCambiosVidrios = (filas: readonly FilaListaVidrio[]): boolean =>
  filas.some((f) => f.nuevo || f.quitado || [f.tipo, f.ancho, f.alto, f.cantidad].some(cambio))
