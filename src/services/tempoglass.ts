/**
 * El robot de Tempoglass, vía `/api/tempoglass` (ver `api/_tempoglass.ts`). Corre en el servidor:
 * el navegador no puede entrar a otro sitio, y las credenciales no salen de Vercel.
 */
import { cabecerasPropias, verificarRespuesta } from '@/services/monday/sdk'

export interface ObraTempoglass {
  /** "Id.Int.Obra" de Tempoglass: "4715". */
  id: string
  nombre: string
  descripcion: string
}

export type BusquedaTempoglass =
  | { ok: true; buscado: string; resultados: ObraTempoglass[]; encontrada: ObraTempoglass | null }
  /** Tempoglass no respondió lo esperado en `paso` (login, obras, buscar…). */
  | { ok: false; paso: string; mensaje: string }

/** Entra a Tempoglass y busca la obra por su nombre. Sólo lee: no crea nada allá. */
export async function buscarObraTempoglass(nombre: string): Promise<BusquedaTempoglass> {
  const r = await fetch('/api/tempoglass', {
    method: 'POST',
    headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nombre }),
  })
  await verificarRespuesta(r, 'Tempoglass')
  return (await r.json()) as BusquedaTempoglass
}
