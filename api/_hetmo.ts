/**
 * Lectura con Claude de la orden de HETMO ("LISTADO DIBUJOS") de una OP de PVC.
 *
 * El PDF llega DIRECTO desde la app, sin pasar por Monday: la lectura no espera a que exista la OP
 * ni a que el archivo esté subido. Viaja como bytes crudos (no en base64), así un archivo que pasó el
 * filtro de subida (`prepararArchivoParaSubir`) entra en el tope de 4,5 MB del cuerpo de Vercel. El
 * base64 —un tercio más pesado— se arma recién acá, en el pedido a Anthropic, cuyo límite es de
 * 32 MB.
 *
 * Una sola consigna devuelve las dos listas: `vidrios` (una por línea "Vid:") y `observaciones` (una
 * por modelo). La salida va atada al JSON Schema con structured outputs: la respuesta siempre
 * parsea, y la consigna se queda con lo que importa —no inventar, copiar los números tal cual—.
 */
import Anthropic from '@anthropic-ai/sdk'

/** El modelo de la lectura. Un número mal leído es un vidrio que se tira: va el más capaz de la línea Opus. */
const MODELO = 'claude-opus-5-5'

/** Qué se le pide al documento. La consigna es la misma; cambia en qué se pone el foco. */
export type ModoLectura = 'vidrios' | 'observaciones'

export interface VidrioHetmo {
  modelo: string | null
  composicion: string | null
  comp1: string | null
  camara: string | null
  comp2: string | null
  terminacion: string | null
  ancho: string | null
  alto: string | null
  cant: number | null
}

export interface LecturaHetmo {
  observaciones: { nombre: string; observacion: string | null }[]
  vidrios: VidrioHetmo[]
}

/** Lo que falló, dicho para quien mira la pantalla. El detalle técnico va al log. */
export class ErrorLectura extends Error {
  constructor(
    mensaje: string,
    readonly status = 502,
  ) {
    super(mensaje)
  }
}

const SISTEMA = `# ROL
Sos un analizador y extractor de datos de los listados de aberturas del sistema HETMO ("LISTADO DIBUJOS"), para una fábrica de aberturas de aluminio y PVC.
Lo que extraés se usa para pedir vidrios a medida. Un número mal leído es un vidrio que se fabrica mal y se tira. Preferimos mil veces un dato faltante (null) que un dato inventado.

# TAREA
Recibís el documento (texto y/o imágenes) de las hojas de un listado de HETMO. Cada hoja contiene uno o varios modelos (dibujos de las aberturas con sus cotas y descripciones).
Tenés que devolver DOS listas separadas:
  A. "observaciones": una entrada por cada modelo, con su observación.
  B. "vidrios": una entrada por cada línea "Vid:" del documento, con sus datos desarmados.

# A. OBSERVACIONES
1. Contá exactamente cuántos modelos hay en todo el documento (cada uno arranca con la etiqueta "Modelo:").
2. Identificá el nombre exacto de cada modelo, tal cual aparece después de "Modelo:" (ej: "v1", "v2", "V6", "M6").
3. Buscá cualquier texto que corresponda a "Observaciones", "Notas" o comentarios adicionales de fabricación.
4. El array "observaciones" tiene EXACTAMENTE una entrada por modelo, en el orden en que aparecen. Si contaste 7 modelos, son 7 objetos.
5. Si el documento tiene una observación general, repetila en cada elemento. Si cada modelo tiene la suya, asignala al modelo que corresponde. Si no hay ninguna observación, "observacion" va en null en todos.

# B. VIDRIOS
Cada línea que empieza con "Vid:" es UN vidrio. Tiene esta forma:
    Vid: 3+3/12/4 INC  696 x 1.696  ud:1
y se desarma así:
    composición   3+3/12/4   ->  comp1 = "3+3"   camara = "12"   comp2 = "4"
    terminación   INC        ->  terminacion = "INC"
    medidas       696 x 1.696 -> ancho = "696"   alto = "1.696"
    cantidad      ud:1       ->  cant = 1
Resultado:
    { "modelo": "v2", "composicion": "3+3/12/4", "comp1": "3+3", "camara": "12", "comp2": "4", "terminacion": "INC", "ancho": "696", "alto": "1.696", "cant": 1 }

De dónde sale cada campo:
  modelo        el nombre del modelo al que pertenece esa línea Vid (el "Modelo:" del bloque).
  composicion   la composición completa tal cual, sin la terminación: "3+3/12/4", "4/9/4".
  comp1         lo que está ANTES de la primera barra "/":   "3+3", "4".
  camara        lo que está ENTRE las dos barras:            "12", "9".
  comp2         lo que está DESPUÉS de la segunda barra:     "4", "5".
  terminacion   el texto que sigue a la composición, antes de las medidas: "INC". Si no hay, null.
  ancho         el PRIMER número de la medida (antes de la "x").
  alto          el SEGUNDO número de la medida (después de la "x").
  cant          el número que sigue a "ud:".

Reglas de vidrios:
  a. Una entrada por CADA línea "Vid:", en el orden en que aparecen en el documento. Un mismo modelo puede tener 1, 2 o más líneas "Vid:" (por ejemplo una hoja y un paño fijo): van todas, cada una por separado.
  b. NO unifiques líneas aunque sean iguales. NO sumes cantidades. Cada entrada lleva el "ud" de SU línea.
  c. Las líneas "Vid:" suelen estar en la columna de la derecha, arriba de las líneas "Tap:". Revisá todo el bloque del modelo.
  d. Los modelos sin línea "Vid:" (mosquiteros, por ejemplo) NO generan ninguna entrada en "vidrios".
  e. Si la composición NO tiene exactamente dos barras (por ejemplo un vidrio simple "4" o un triple "4/12/4/12/4"), copiala entera en "composicion" y poné comp1, camara y comp2 en null. No la partas a la fuerza.
  f. Si el documento no tiene ninguna línea "Vid:", "vidrios" es un array vacío [].

# FORMATO DE SALIDA
Devolvés UN objeto JSON y nada más. Sin explicaciones, sin bloques de código, sin comentarios, sin texto antes ni después.
{ "observaciones": [ { "nombre": "v1", "observacion": null }, { "nombre": "v2", "observacion": null } ],
  "vidrios": [ { "modelo": "v1", "composicion": "4/12/4", "comp1": "4", "camara": "12", "comp2": "4", "terminacion": "INC", "ancho": "278", "alto": "478", "cant": 1 },
               { "modelo": "v2", "composicion": "3+3/12/4", "comp1": "3+3", "camara": "12", "comp2": "4", "terminacion": "INC", "ancho": "696", "alto": "1.696", "cant": 1 } ] }

# RESTRICCIONES
1. LA CANTIDAD ES LA CLAVE. "observaciones" tiene exactamente una entrada por modelo. "vidrios" tiene exactamente una entrada por línea "Vid:". Antes de responder, contá las dos cosas en el documento y en tu respuesta: tienen que coincidir.
2. NÚMEROS TAL CUAL. Todas las medidas y componentes van como TEXTO, copiados exactamente como aparecen, con el punto de miles. "1.696" se escribe "1.696". Nunca 1696, nunca 1.7, nunca 1,696. El único campo numérico de los vidrios es "cant".
3. NUNCA INVENTES. Si un dato no está o no se lee con seguridad, va null. No lo deduzcas del dibujo, de otro modelo ni de las medidas de la abertura.
4. NO ARREGLES NADA. Si una medida te parece rara, devolvela igual. Tu trabajo es leer, no corregir.
5. NADA DE TEXTO ADICIONAL. Tu respuesta debe ser parseable directamente con JSON.parse().`

const texto = (description: string) => ({ type: ['string', 'null'], description })

const ESQUEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['observaciones', 'vidrios'],
  properties: {
    observaciones: {
      type: 'array',
      description: 'Una entrada por cada modelo del documento, en el orden en que aparecen.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'observacion'],
        properties: {
          nombre: { type: 'string', description: 'El nombre exacto del modelo, tal cual después de "Modelo:".' },
          observacion: texto('La observación de fabricación del modelo, o null si no tiene.'),
        },
      },
    },
    vidrios: {
      type: 'array',
      description: 'Una entrada por cada línea "Vid:" del documento, en orden. Vacío si no hay ninguna.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['modelo', 'composicion', 'comp1', 'camara', 'comp2', 'terminacion', 'ancho', 'alto', 'cant'],
        properties: {
          modelo: texto('El modelo al que pertenece la línea Vid.'),
          composicion: texto('La composición completa, sin la terminación: "3+3/12/4".'),
          comp1: texto('Lo que está antes de la primera barra. null si no hay exactamente dos barras.'),
          camara: texto('Lo que está entre las dos barras. null si no hay exactamente dos barras.'),
          comp2: texto('Lo que está después de la segunda barra. null si no hay exactamente dos barras.'),
          terminacion: texto('El texto entre la composición y las medidas ("INC"), o null.'),
          ancho: texto('El primer número de la medida, tal cual, con el punto de miles.'),
          alto: texto('El segundo número de la medida, tal cual, con el punto de miles.'),
          cant: { type: ['integer', 'null'], description: 'El número que sigue a "ud:".' },
        },
      },
    },
  },
}

/** El foco de cada pasada. El documento y la consigna van igual: la segunda pasada lee del caché. */
const PEDIDO: Record<ModoLectura, string> = {
  vidrios:
    'Analizá este listado de HETMO. Prestá especial atención a las líneas "Vid:": contalas en todo el documento y devolvé una entrada por cada una.',
  observaciones:
    'Analizá este listado de HETMO. Prestá especial atención a los modelos y sus observaciones: contá los "Modelo:" de todo el documento y devolvé una entrada por cada uno.',
}

/**
 * Una lectura del PDF con Claude, atada a un JSON Schema. La comparten las dos consignas: la de
 * vidrios y observaciones (acá) y la del listado completo que arma la OP final (`_hetmoListado.ts`).
 */
export async function consultarClaude(
  pdf: Buffer,
  { sistema, esquema, pedido, maxTokens }: { sistema: string; esquema: Record<string, unknown>; pedido: string; maxTokens: number },
): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new ErrorLectura('Ocurrio un error al intentar procesar el documento con IA. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ERROR_API_KEY_ANTRHOPIC', 503)
  }
  /* Un PDF empieza con "%PDF": cualquier otra cosa se corta acá, antes de gastar una llamada. */
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new ErrorLectura('El documento no es un PDF.', 400)
  }
  const datos = pdf.toString('base64')
  const client = new Anthropic()

  /* Streaming: un listado largo con razonamiento puede tardar más de lo que aguanta un pedido sin
     stream. `finalMessage()` junta la respuesta entera. */
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: maxTokens,
    /* Si Opus rechaza el pedido por una política de seguridad, la API lo vuelve a correr en el
       modelo de respaldo que corresponda, en el mismo pedido. */
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    /* `high`: leer bien cada número importa más que la demora. */
    output_config: { effort: 'high', format: { type: 'json_schema', schema: esquema } },
    system: [{ type: 'text', text: sistema }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: datos },
            /* El documento queda en caché: la pasada siguiente con la misma consigna (vidrios →
               observaciones) llega a los pocos segundos con el mismo PDF. */
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: pedido },
        ],
      },
    ],
  })
  const mensaje = await stream.finalMessage()

  if (mensaje.stop_reason === 'refusal') throw new ErrorLectura('La IA no pudo procesar este documento.')
  if (mensaje.stop_reason === 'max_tokens') throw new ErrorLectura('El documento es demasiado largo para leerlo de una vez.')

  /* Con structured outputs el texto ES el JSON. Si hubo un respaldo, el último bloque de texto es el
     del modelo que terminó la respuesta. */
  const bloques = mensaje.content.filter((b) => b.type === 'text')
  const salida = bloques[bloques.length - 1]?.text ?? ''
  try {
    return JSON.parse(salida) as unknown
  } catch {
    throw new ErrorLectura('La IA devolvió una respuesta que no se pudo leer.')
  }
}

export async function leerHetmo(pdf: Buffer, modo: ModoLectura): Promise<LecturaHetmo> {
  const lectura = (await consultarClaude(pdf, {
    sistema: SISTEMA,
    esquema: ESQUEMA,
    pedido: PEDIDO[modo],
    maxTokens: 32000,
  })) as Partial<LecturaHetmo>
  return {
    observaciones: Array.isArray(lectura?.observaciones) ? lectura.observaciones : [],
    vidrios: Array.isArray(lectura?.vidrios) ? lectura.vidrios : [],
  }
}
