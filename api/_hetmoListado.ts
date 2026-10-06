/**
 * Lectura con Claude del listado completo de HETMO: lo que arma la Orden de Producción final
 * (número y versión del listado, y cada modelo con sus medidas, vidrios, tapajuntas y la ubicación
 * de su dibujo). Reemplaza la lectura que hacía el escenario de Make `leer-documento`: el PDF llega
 * directo desde la app, sin que la OP exista todavía en Monday.
 *
 * La salida va atada al JSON Schema con structured outputs. Su forma es la que espera
 * `armarDatosOp` (`src/features/op/opFinal/datos.ts`).
 */
import { consultarClaude, prompt } from './_hetmo.js'

const texto = (description: string) => ({ type: ['string', 'null'], description })
const entero = (description: string) => ({ type: ['integer', 'null'], description })

const MODELO = {
  type: 'object',
  additionalProperties: false,
  required: ['codigo', 'descripcion', 'color', 'ancho', 'alto', 'cantidad', 'vidrios', 'taps', 'hojaIdx', 'slot'],
  properties: {
    codigo: texto(
      "El texto completo que sigue a 'Modelo:', incluido el 'DT n' si esta, tal cual. Ej: V1 DT 1, V2 DT1, V27/28 DT 6.",
    ),
    descripcion: texto(
      "La linea que sigue a 'Uds:' + ' - ' + la linea de abajo. Si no hay segunda linea, solo la primera. Copiada tal cual, sin reescribir.",
    ),
    color: texto("El valor de la linea 'Color:'. Ej: Lenga."),
    ancho: texto(
      "TEXTO, no numero. El PRIMER numero de 'Medidas:', con el punto de miles tal cual aparece. Solo digitos y puntos. Ej: 500, 1.530, 2.450. Nunca con coma.",
    ),
    alto: texto("TEXTO, no numero. El SEGUNDO numero de 'Medidas:', con el punto de miles. Ej: 700, 1.800, 2.020."),
    cantidad: entero("El numero que sigue a 'Uds:'. Siempre 1 o mas."),
    vidrios: {
      type: 'array',
      description:
        "UNA entrada por CADA linea 'Vid:' del modelo, en el orden en que aparecen. Un modelo puede tener 1, 2, 3 o mas lineas Vid (ej. oscilobatiente con pano fijo abajo, corredera con fijo lateral). No unificar, no sumar, no descartar ninguna. Lista vacia [] solo si el modelo no tiene ninguna linea Vid (mosquiteros).",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'ancho', 'alto', 'ud'],
        properties: {
          tipo: texto('El tipo de vidrio de esa linea Vid. Ej: 4/12/4 INC, 3+3/12/4 INC.'),
          ancho: texto('TEXTO. Primer numero de medida de esa linea Vid, con punto de miles tal cual. Ej: 843, 1.134.'),
          alto: texto('TEXTO. Segundo numero de medida de esa linea Vid. Ej: 1.013.'),
          ud: entero("El numero que sigue a 'ud:' en ESA linea Vid."),
        },
      },
    },
    taps: {
      type: 'array',
      description: 'Los tapajuntas del modelo. Son exactamente 4, o ninguno (lista vacia). Nunca 1, 2 ni 3.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cod', 'medida'],
        properties: {
          cod: texto("TEXTO. El codigo de 5 digitos que sigue a 'Tap:'. Ej: 91305, 91316."),
          medida: texto('TEXTO, con punto de miles tal cual aparece. Ej: 570, 1.870, 2.520. Nunca con coma.'),
        },
      },
    },
    hojaIdx: {
      type: 'integer',
      description:
        'En que hoja del listado de HETMO esta este modelo, EMPEZANDO A CONTAR DESDE 0. Hoja 1 = 0, hoja 2 = 1. Nunca negativo.',
    },
    slot: {
      type: 'string',
      enum: ['a', 'b', 'full', 'none'],
      description:
        "Donde esta el modelo en su hoja: 'a' si esta en la mitad de arriba, 'b' si esta en la mitad de abajo. 'none' cuando la orden vino como foto y no se puede recortar el dibujo.",
    },
  },
}

const ESQUEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['numeroListado', 'version', 'paginas'],
  properties: {
    numeroListado: texto(
      "TEXTO. El numero del listado HETMO, del encabezado ('Numero : 9.205'), con el punto de miles tal cual aparece. Ej: 9.205. Nunca 9205. null si no se lee con seguridad.",
    ),
    version: texto(
      "TEXTO. La version del listado HETMO, del encabezado ('Version:. 1'). Suele ser un digito suelto. El punto que a veces aparece entre los dos puntos y el numero NO es parte del valor: 'Version:. 1' es '1'. null si no se lee con seguridad.",
    ),
    paginas: {
      type: 'array',
      description: 'Una entrada por hoja de la orden final. Al menos una.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nro', 'esUltima', 'filas'],
        properties: {
          nro: { type: 'integer', description: 'Numero de pagina, empezando en 1.' },
          esUltima: { type: 'boolean', description: 'true SOLO en la ultima pagina; false en todas las demas.' },
          filas: {
            type: 'array',
            description: 'Renglones de la grilla. Como maximo 3 renglones por pagina.',
            items: {
              type: 'array',
              description: 'Modelos del renglon. Como maximo 3; el ultimo renglon puede tener 1 o 2.',
              items: MODELO,
            },
          },
        },
      },
    },
  },
}

export interface LecturaListado {
  numeroListado: string | null
  version: string | null
  paginas: unknown[]
}

export async function leerListado(pdf: Buffer): Promise<LecturaListado> {
  const lectura = (await consultarClaude(pdf, {
    sistema: prompt('listado-hetmo.sistema'),
    esquema: ESQUEMA,
    pedido: prompt('listado-hetmo.pedido'),
    /* Un listado largo trae decenas de modelos, cada uno con sus vidrios y tapajuntas. */
    maxTokens: 64000,
  })) as Partial<LecturaListado>
  return {
    numeroListado: lectura?.numeroListado ?? null,
    version: lectura?.version ?? null,
    paginas: Array.isArray(lectura?.paginas) ? lectura.paginas : [],
  }
}
