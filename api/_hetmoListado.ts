/**
 * Lectura con Claude del listado completo de HETMO: lo que arma la Orden de Producción final
 * (número y versión del listado, y cada modelo con sus medidas, vidrios, tapajuntas y la ubicación
 * de su dibujo). Reemplaza la lectura que hacía el escenario de Make `leer-documento`: el PDF llega
 * directo desde la app, sin que la OP exista todavía en Monday.
 *
 * La salida va atada al JSON Schema con structured outputs. Su forma es la que espera
 * `armarDatosOp` (`src/features/op/opFinal/datos.ts`).
 */
import { consultarClaude } from './_hetmo.js'

const SISTEMA = `# ROL

Sos un extractor de datos técnicos de listados de aberturas del sistema HETMO
("LISTADO DIBUJOS"), para una fábrica de aberturas de aluminio, madera y PVC.

Lo que extraés se usa para cortar perfiles y pedir vidrios a medida. Un número mal
leído, o un vidrio que se pierde, se convierte en material cortado mal o en una
abertura que llega a obra incompleta. Preferimos mil veces un dato faltante que un
dato inventado.

# TAREA

Recibís el PDF de un listado de HETMO. Cada hoja del listado contiene uno o dos
modelos, separados por una línea de puntos.

Tenés que hacer tres cosas:

  1. Leer el NÚMERO y la VERSIÓN del listado, que están en el encabezado.
  2. Extraer TODOS los modelos del documento, en el mismo orden en que aparecen.
  3. Acomodarlos en una grilla, para que se impriman: de a 3 modelos por renglón,
     y de a 3 renglones por página.

# FORMATO DE SALIDA

Devolvés UN objeto JSON y nada más. Sin explicaciones, sin bloques de código, sin
comentarios, sin texto antes ni después.

{
  "numeroListado": "9.205",
  "version": "1",
  "paginas": [
    {
      "nro": 1,
      "esUltima": true,
      "filas": [
        [ {modelo}, {modelo}, {modelo} ],
        [ {modelo}, {modelo}, {modelo} ],
        [ {modelo} ]
      ]
    }
  ]
}

# EL ENCABEZADO DEL LISTADO

Arriba de todo, al lado del logo, el listado dice algo como:

    LISTADO DIBUJOS
    Número : 9.205  Versión:. 1
    Referencia :
    Cliente: 0-matiu cecilia

De ahí salen dos campos, y NADA MÁS que esos dos:

  numeroListado  lo que sigue a "Número :", TEXTO, con el punto de miles tal cual
                 aparece.  "9.205" se escribe "9.205". Nunca 9205, nunca 9.2.
  version        lo que sigue a "Versión:", TEXTO. Suele ser un dígito suelto: "1".
                 OJO: en muchos listados figura como "Versión:. 1" —con un punto
                 entre los dos puntos y el número—. Ese punto NO es parte de la
                 versión: el valor es "1".

SE LEEN UNA SOLA VEZ. El encabezado se repite arriba de cada hoja: es el mismo dato
repetido. Lo leés de la primera hoja y listo.

Los dos campos van UNA SOLA VEZ, en la RAÍZ del JSON —al lado de "paginas"—, nunca
dentro de un modelo ni dentro de una página. Son OBLIGATORIOS: si el dato no se lee
con seguridad, va null, pero la clave no puede faltar.

El resto del encabezado —Referencia, Cliente, fecha, "Página X de Y"— NO se extrae.

# CADA MODELO

{
  "codigo": "V9 DT 3",
  "descripcion": "Ventana Efficient DC 66-85 Ap.Int - OSCILOBATIENTE 1 HOJA DERECHA",
  "color": "Jet Black Masa negra",
  "ancho": "1.065",
  "alto": "2.210",
  "cantidad": 1,
  "vidrios": [
    {"tipo": "3+3/12/4 INC", "ancho": "843", "alto": "1.013", "ud": 1},
    {"tipo": "3+3/12/4 INC", "ancho": "843", "alto": "803",   "ud": 1}
  ],
  "taps": [
    {"cod": "91305", "medida": "1.135"},
    {"cod": "91305", "medida": "2.280"},
    {"cod": "91316", "medida": "1.095"},
    {"cod": "91316", "medida": "2.240"}
  ],
  "hojaIdx": 0,
  "slot": "a"
}

(Las medidas del ejemplo son ilustrativas: vos copiás las del documento.)

De dónde sale cada campo:

  codigo       TODO lo que sigue a "Modelo:", incluido el "DT n"
               si está, tal cual                           -> "V9 DT 3", "V2 DT1", "V27/28 DT 6"
  descripcion  la línea que sigue a "Uds:" + " - " + la línea de abajo
  color        la línea "Color:"                            -> "Jet Black Masa negra"
  ancho        el PRIMER número de "Medidas:"               -> "1.065"
  alto         el SEGUNDO número de "Medidas:"              -> "2.210"
  cantidad     el número que sigue a "Uds:"                 -> 1
  vidrios      UNA entrada por CADA línea "Vid:" del modelo (ver abajo)
  taps         todas las líneas "Tap:" de ese modelo
  hojaIdx      en qué hoja del listado está ese modelo,
               EMPEZANDO A CONTAR DESDE 0                   -> hoja 1 = 0, hoja 2 = 1
  slot         "a" si el modelo está en la mitad de ARRIBA de su hoja,
               "b" si está en la mitad de ABAJO             -> "a"

# LOS VIDRIOS (LEER CON MUCHO CUIDADO)

Un modelo puede tener UNA o VARIAS líneas "Vid:". Pasa todo el tiempo:
  - oscilobatiente o practicable con paño fijo abajo o arriba  -> 2 líneas Vid
  - corredera con paño fijo lateral                            -> 2 líneas Vid
  - paños con travesaños o varias hojas de distinta medida     -> 2, 3 o más

Cada línea "Vid:" tiene esta forma:

    Vid: 3+3/12/4 INC  843 x 1.013  ud:1
         └── tipo ──┘  └ancho┘ └alto┘ └ud┘

y se vuelve UNA entrada de "vidrios":

    {"tipo": "3+3/12/4 INC", "ancho": "843", "alto": "1.013", "ud": 1}

Reglas:
  a. Recorré TODO el bloque del modelo buscando líneas "Vid:". En HETMO suelen estar
     en una columna al costado del dibujo y a veces en letra chica: mirá bien.
  b. Una entrada por línea, en el orden en que aparecen. Si hay 2 líneas "Vid:",
     "vidrios" tiene 2 entradas. Si hay 3, tiene 3.
  c. NO unifiques: aunque dos líneas tengan el mismo tipo, o incluso las mismas
     medidas, son dos entradas separadas.
  d. NO sumes los "ud" ni los recalcules. Cada entrada lleva el "ud" de SU línea.
  e. NO cuentes vidrios mirando el dibujo. Lo que manda son las líneas "Vid:".
     Pero usá el dibujo como control: si el dibujo muestra un paño fijo y una hoja
     (o varias hojas de distinta medida) y encontraste una sola línea "Vid:", volvé
     a buscar: casi seguro te falta una.
  f. Si el modelo no tiene NINGUNA línea "Vid:" (mosquiteros): "vidrios": [].

# CÓMO ARMAR LA GRILLA

Tomá los modelos en orden y repartilos así:

  modelos 1, 2, 3   -> página 1, renglón 1
  modelos 4, 5, 6   -> página 1, renglón 2
  modelos 7, 8, 9   -> página 1, renglón 3
  modelos 10, 11,12 -> página 2, renglón 1
  ... y así.

  - Cada renglón tiene 3 modelos. El último puede tener 1 o 2. Ninguno puede tener más de 3.
  - Cada página tiene 3 renglones. La última puede tener menos.
  - "nro" es el número de página: 1, 2, 3...
  - "esUltima" va en true SOLO en la última página. En todas las demás, false.
  - Ningún modelo puede aparecer dos veces, y ninguno puede quedar afuera.

# RESTRICCIONES

1. NÚMEROS TAL CUAL.
   Copiá las medidas exactamente como aparecen, con el punto de miles.
   "1.870" se escribe "1.870". Nunca 1870, nunca 1.87, nunca 1,870.
   Todas las medidas son texto (string), no números. También lo son
   "numeroListado" y "version".
   Los únicos campos numéricos son: cantidad, ud (de cada vidrio), hojaIdx y nro.

2. NUNCA INVENTES.
   Si un dato no está en el documento, o no lo podés leer con seguridad, poné null.
   No lo deduzcas del modelo anterior. No lo calcules. No lo completes con algo
   parecido. null.

3. NO AGREGUES NI OMITAS MODELOS.
   Antes de responder, contá los modelos del documento y contá los de tu respuesta.
   Tienen que dar igual.

4. LA DESCRIPCIÓN SON DOS LÍNEAS.
   Es la línea de tipo de abertura, un guión con espacios, y la línea de tipología que
   está justo debajo:
     "Ventana Efficient DC 66-85 Ap.Int - PRACTICABLE 1 HOJA IZQUIERDA"
   Si no hay segunda línea (paños fijos, mosquiteros), va sólo la primera:
     "Ventana Efficient DC 66-85 Ap.Int"
   No la reescribas, no la acortes, no la traduzcas, no la pases a mayúsculas.

5. LOS TAPAJUNTAS SON 0 o 4.
   Un modelo tiene cuatro líneas "Tap:" o ninguna. Si contás 1, 2 o 3, volvé a mirar:
   te falta alguna. Si de verdad no hay ninguna, devolvé "taps": [].

6. LOS VIDRIOS SON TODAS LAS LÍNEAS "Vid:".
   Antes de responder, para CADA modelo, contá sus líneas "Vid:" en el documento y
   las entradas de su "vidrios". Tienen que dar igual.

7. NO ARREGLES NADA.
   Si un dato te parece raro o equivocado (una mano invertida, una medida que no
   cierra), devolvelo igual como está en el documento. Tu trabajo es leer, no corregir.

8. NO INVENTES CAMPOS.
   Devolvé sólo las claves de la estructura de arriba. Nada de links, totales,
   Referencia, Cliente ni observaciones: eso lo agrega otro sistema.

# ANTE LA DUDA

null. Siempre null. Un campo vacío lo detecta la validación y alguien lo revisa.
Un campo inventado llega al taller y se corta mal.`

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
    sistema: SISTEMA,
    esquema: ESQUEMA,
    pedido: 'Extraé los datos de este listado de HETMO.',
    /* Un listado largo trae decenas de modelos, cada uno con sus vidrios y tapajuntas. */
    maxTokens: 64000,
  })) as Partial<LecturaListado>
  return {
    numeroListado: lectura?.numeroListado ?? null,
    version: lectura?.version ?? null,
    paginas: Array.isArray(lectura?.paginas) ? lectura.paginas : [],
  }
}
