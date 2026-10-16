/**
 * El robot de Tempoglass, vía `/api/tempoglass` (ver `api/_tempoglass.ts`). Corre en el servidor:
 * el navegador no puede entrar a otro sitio, y las credenciales no salen de Vercel.
 *
 * El servidor responde una línea por paso, en vivo: `onAvance` recibe cada una a medida que llega,
 * y la promesa termina con el resultado (o con el paso en que falló).
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

export interface ObraTempoglass {
  /** "Id.Int.Obra" de Tempoglass: "4715". */
  id: string
  nombre: string
  descripcion: string
}

/** Por dónde va el robot. */
export type AvanceTempoglass = { etapa: 'sesion' } | { etapa: 'logueado' } | { etapa: 'buscando'; nombre: string }

export type ResultadoTempoglass =
  | { etapa: 'fin'; ok: true; buscado: string; resultados: ObraTempoglass[]; encontrada: ObraTempoglass | null }
  /** Tempoglass no respondió lo esperado en `paso` (credenciales, login, obras, buscar, conexion). */
  | { etapa: 'error'; paso: string; mensaje: string }

/** Entra a Tempoglass y busca la obra por su nombre. Sólo lee: no crea nada allá. */
export async function buscarObraTempoglass(
  nombre: string,
  onAvance: (avance: AvanceTempoglass) => void,
): Promise<ResultadoTempoglass> {
  const r = await fetch('/api/tempoglass', {
    method: 'POST',
    headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nombre }),
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
  if (!resultado) throw new Error('Tempoglass: el robot terminó sin resultado')
  return resultado
}
