/**
 * Edición de una OP de PVC: Claude lee el NUEVO dibujo de HETMO y, para cada abertura que el usuario
 * eligió editar, devuelve sus datos tal como figuran en ese dibujo —con la misma forma que la
 * lectura del listado que arma la OP final (`_hetmoListado.ts`)—.
 *
 * Además devuelve, en `nuevas`, las aberturas del dibujo nuevo que la OP todavía no tiene (para eso
 * recibe la lista de todos los modelos de la OP): se agregan a la orden.
 *
 * La IA no decide qué cambió: devuelve el modelo leído del dibujo nuevo, y la app lo compara campo
 * por campo con el de la OP (`lib/edicionOp.ts`). Así "Se editará X de A a B" sale de una
 * comparación exacta y no de un resumen redactado por la IA.
 */
import { consultarClaude, ErrorLectura, prompt } from './_hetmo.js'

const texto = (description: string) => ({ type: ['string', 'null'], description })
const entero = (description: string) => ({ type: ['integer', 'null'], description })

const MODELO = {
  type: 'object',
  additionalProperties: false,
  required: ['codigo', 'descripcion', 'color', 'ancho', 'alto', 'cantidad', 'vidrios', 'taps', 'hojaIdx', 'slot'],
  properties: {
    codigo: texto('El texto completo que sigue a "Modelo:" en el dibujo nuevo, tal cual.'),
    descripcion: texto(
      'La línea que sigue a "Uds:" + " - " + la línea de abajo ("Pos:"), tal cual. Única excepción: si la primera línea tiene el código de perfil "66-100", a la segunda se le saca la palabra "IZQUIERDA".',
    ),
    color: texto('El valor de la línea "Color:", tal cual.'),
    ancho: texto('TEXTO. El PRIMER número de "Medidas:", con el punto de miles tal cual.'),
    alto: texto('TEXTO. El SEGUNDO número de "Medidas:", con el punto de miles tal cual.'),
    cantidad: entero('El número que sigue a "Uds:".'),
    vidrios: {
      type: 'array',
      description: 'UNA entrada por CADA línea "Vid:" del modelo, en orden. Vacía si no tiene ninguna.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'ancho', 'alto', 'ud'],
        properties: {
          tipo: texto('El tipo de vidrio de esa línea Vid. Ej: 4/12/4 INC, 3+3/12/4 INC.'),
          ancho: texto('TEXTO. Primer número de medida de esa línea Vid, con punto de miles tal cual.'),
          alto: texto('TEXTO. Segundo número de medida de esa línea Vid, con punto de miles tal cual.'),
          ud: entero('El número que sigue a "ud:" en ESA línea Vid.'),
        },
      },
    },
    taps: {
      type: 'array',
      description: 'Los tapajuntas del modelo ("Tap:"): exactamente 4, o ninguno.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cod', 'medida'],
        properties: {
          cod: texto('El código de 5 dígitos que sigue a "Tap:".'),
          medida: texto('TEXTO, con punto de miles tal cual.'),
        },
      },
    },
    hojaIdx: entero('En qué hoja del DIBUJO NUEVO está el modelo, contando desde 0.'),
    slot: {
      type: 'string',
      enum: ['a', 'b', 'full', 'none'],
      description: '"a" mitad de arriba de su hoja, "b" mitad de abajo, "none" si el dibujo es una foto.',
    },
  },
}

/*
 * UNA sola lista: las aberturas pedidas y las nuevas, cada una con su `estado`. Dos listas con el
 * modelo cada una superan el tope de la API de 16 campos que admiten null en un esquema; el
 * servidor las separa después (ver `leerEdicion`).
 */
const ESQUEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['aberturas'],
  properties: {
    aberturas: {
      type: 'array',
      description:
        'Primero una entrada por cada abertura pedida, en el mismo orden en que se pidieron. Después, una por cada abertura NUEVA del dibujo (las que no están en modelosExistentes).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['estado', 'codigoOriginal', 'modelo'],
        properties: {
          estado: {
            type: 'string',
            enum: ['encontrada', 'noEncontrada', 'nueva'],
            description:
              '"encontrada": abertura pedida que está en el dibujo nuevo. "noEncontrada": abertura pedida que el dibujo nuevo no trae. "nueva": abertura del dibujo que la orden no tiene.',
          },
          codigoOriginal: { type: 'string', description: 'El "codigo" pedido, tal cual. En las nuevas, el texto que sigue a "Modelo:".' },
          modelo: MODELO,
        },
      },
    },
  },
}

/** Una abertura a editar, como la manda la app: sus datos actuales en la OP. */
export interface AberturaPedida {
  codigo: string
  descripcion?: string | null
  color?: string | null
  ancho?: string | null
  alto?: string | null
  cantidad?: number | null
  vidrios?: unknown[]
  taps?: unknown[]
  /** Índices (desde 0) de los vidrios que el usuario eligió editar. */
  vidriosAEditar?: number[]
}

export interface LecturaEdicion {
  aberturas: { codigoOriginal: string; encontrada: boolean; modelo: Record<string, unknown> }[]
  /** Las aberturas del dibujo nuevo que la OP no tiene. */
  nuevas: Record<string, unknown>[]
}

/**
 * El cuerpo del pedido: 4 bytes con el largo del JSON (big endian), el JSON con las aberturas y,
 * detrás, los bytes del PDF. Así el PDF viaja crudo, como en las demás lecturas, sin base64.
 */
export function separarCuerpo(cuerpo: Buffer): { aberturas: AberturaPedida[]; modelosExistentes: string[]; pdf: Buffer } {
  if (cuerpo.length < 4) throw new ErrorLectura('No llegó el pedido de edición.', 400)
  const largo = cuerpo.readUInt32BE(0)
  if (largo <= 0 || largo > 200_000 || 4 + largo >= cuerpo.length) throw new ErrorLectura('El pedido de edición no tiene la forma esperada.', 400)
  let datos: { aberturas?: unknown; modelosExistentes?: unknown }
  try {
    datos = JSON.parse(cuerpo.subarray(4, 4 + largo).toString('utf8')) as { aberturas?: unknown; modelosExistentes?: unknown }
  } catch {
    throw new ErrorLectura('El pedido de edición no tiene la forma esperada.', 400)
  }
  const aberturas = Array.isArray(datos.aberturas) ? (datos.aberturas as AberturaPedida[]) : []
  if (!aberturas.length || aberturas.length > 200 || aberturas.some((a) => typeof a?.codigo !== 'string' || !a.codigo.trim())) {
    throw new ErrorLectura('Elegí al menos una abertura para editar.', 400)
  }
  const modelosExistentes = (Array.isArray(datos.modelosExistentes) ? datos.modelosExistentes : [])
    .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    .slice(0, 500)
  /* Las pedidas son de la OP aunque la app no las haya mandado en la lista. */
  for (const a of aberturas) if (!modelosExistentes.includes(a.codigo)) modelosExistentes.push(a.codigo)
  return { aberturas, modelosExistentes, pdf: cuerpo.subarray(4 + largo) }
}

export async function leerEdicion(pdf: Buffer, aberturas: AberturaPedida[], modelosExistentes: string[]): Promise<LecturaEdicion> {
  const pedido = prompt('hetmo-edicion.pedido')
    .replace('{{ABERTURAS}}', JSON.stringify(aberturas, null, 2))
    .replace('{{MODELOS_EXISTENTES}}', JSON.stringify(modelosExistentes))
  const lectura = (await consultarClaude(pdf, {
    sistema: prompt('hetmo-edicion.sistema'),
    esquema: ESQUEMA,
    pedido,
    maxTokens: 32000,
  })) as { aberturas?: { estado?: string; codigoOriginal?: string; modelo?: Record<string, unknown> }[] }
  const todas = Array.isArray(lectura?.aberturas) ? lectura.aberturas : []
  return {
    aberturas: todas
      .filter((a) => a.estado !== 'nueva')
      .map((a) => ({ codigoOriginal: String(a.codigoOriginal ?? ''), encontrada: a.estado === 'encontrada', modelo: a.modelo ?? {} })),
    nuevas: todas.filter((a) => a.estado === 'nueva' && a.modelo).map((a) => a.modelo!),
  }
}
