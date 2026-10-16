/**
 * El robot de Tempoglass, vía `/api/tempoglass` (ver `api/_tempoglass.ts`). Corre en el servidor:
 * el navegador no puede entrar a otro sitio, y las credenciales no salen de Vercel.
 *
 * El servidor responde una línea por paso, en vivo: `onAvance` recibe cada una a medida que llega,
 * y la promesa termina con el resultado (o con el paso en que falló).
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

export interface ObraTempoglass {
  /** "Id." de la obra en la tabla de Tempoglass: "4715". */
  id: string
  nombre: string
  descripcion: string
  url?: string
}

/** Por dónde va el robot. */
export type AvanceTempoglass =
  | { etapa: 'sesion' }
  | { etapa: 'logueado' }
  | { etapa: 'buscando'; nombre: string }
  | { etapa: 'obraSeleccionada'; obra: ObraTempoglass; idIntObra: string }
  | { etapa: 'creandoPedido' }
  /** El pedido ya existe en Tempoglass: un reintento lo retoma, no crea otro. */
  | { etapa: 'pedidoCreado'; pedido: string }
  | { etapa: 'importando'; pedido: string }
  | { etapa: 'importado'; renglones: number }
  | { etapa: 'cerrando'; pedido: string }
  /** Falló algo que se arregla entrando de nuevo, y entra de nuevo. */
  | { etapa: 'reintentando'; intento: number; de: number; motivo: string }

export type ResultadoTempoglass =
  | { etapa: 'fin'; ok: true; obra: ObraTempoglass; idIntObra: string; pedido: string; renglones: number }
  /** Tempoglass no respondió lo esperado en `paso` (login, buscar, pedido, importar, cerrar, …). */
  | { etapa: 'error'; paso: string; mensaje: string }

export interface PedidoParaTempoglass {
  /** El nombre EXACTO de la obra en Tempoglass. */
  nombre: string
  comentario: string
  /** `YYYY-MM-DD`. */
  fecha: string
  /** La planilla con el formato de Tempoglass (ver `pedidoTempoglassExcel`). */
  archivo: File
  esperado: { renglones: number; piezas: number }
  /** Un pedido que ya se creó en una corrida anterior: se retoma, no se crea otro. */
  retomar?: { pedido: string; obra: ObraTempoglass; idIntObra: string }
}

const base64 = async (archivo: Blob): Promise<string> => {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

/** Carga el pedido en Tempoglass: obra, cabecera, planilla y cierre. */
export async function cargarPedidoTempoglass(
  p: PedidoParaTempoglass,
  onAvance: (avance: AvanceTempoglass) => void,
): Promise<ResultadoTempoglass> {
  const r = await fetch('/api/tempoglass', {
    method: 'POST',
    headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      nombre: p.nombre,
      comentario: p.comentario,
      fecha: p.fecha,
      archivo: { nombre: p.archivo.name, base64: await base64(p.archivo) },
      esperado: p.esperado,
      retomar: p.retomar,
    }),
  })
  await verificarRespuesta(r, 'Tempoglass')
  if (!r.body) throw new Error('Tempoglass: respuesta vacía')

  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let pendiente = ''
  let resultado: ResultadoTempoglass | null = null
  for (;;) {
    const { value, done } = await lector.read()
    pendiente += value ?? ''
    /* Una línea por aviso; la última puede venir cortada y se completa con el próximo trozo. */
    const lineas = pendiente.split('\n')
    pendiente = done ? '' : (lineas.pop() ?? '')
    for (const linea of lineas) {
      if (!linea.trim()) continue
      const aviso = JSON.parse(linea) as AvanceTempoglass | ResultadoTempoglass
      if (aviso.etapa === 'fin' || aviso.etapa === 'error') resultado = aviso
      else onAvance(aviso)
    }
    if (done) break
  }
  /* Sin resultado: la conexión se cortó a mitad (la red, o la función que llegó a su tope). */
  if (!resultado) throw new Error('Tempoglass: se cortó la conexión con el robot')
  return resultado
}
