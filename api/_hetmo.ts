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
import { leerPrompt, type NombrePrompt } from './_prompts.js'

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

/**
 * Un prompt de la carpeta `prompts/` (ver `_prompts.ts`). Si falta o está vacío, el error dice qué
 * revisar: es un archivo que alguien editó, no una falla de la IA.
 */
export function prompt(nombre: NombrePrompt): string {
  try {
    return leerPrompt(nombre)
  } catch (e) {
    console.error('[hetmo] no se pudo leer el prompt', nombre, e)
    throw new ErrorLectura(
      `Ocurrio un error al intentar procesar el documento con IA. Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO: ERROR_PROMPT_IA (${nombre})`,
      500,
    )
  }
}

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
const PEDIDO: Record<ModoLectura, NombrePrompt> = {
  vidrios: 'hetmo-vidrios.pedido',
  observaciones: 'hetmo-observaciones.pedido',
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
    sistema: prompt('hetmo-vidrios-observaciones.sistema'),
    esquema: ESQUEMA,
    pedido: prompt(PEDIDO[modo]),
    maxTokens: 32000,
  })) as Partial<LecturaHetmo>
  return {
    observaciones: Array.isArray(lectura?.observaciones) ? lectura.observaciones : [],
    vidrios: Array.isArray(lectura?.vidrios) ? lectura.vidrios : [],
  }
}
