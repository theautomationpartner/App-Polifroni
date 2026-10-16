/**
 * Serverless Function (Vercel) — el robot de Tempoglass (ver `api/_tempoglass.ts`).
 *
 *   POST { nombre: "IDOP-053 - PVC 2282" }
 *     → { ok: true, buscado, resultados: [{ id, nombre, descripcion }], encontrada }
 *     → { ok: false, paso, mensaje }      Tempoglass no respondió lo esperado en ese paso
 *
 * Por ahora sólo BUSCA la obra: entra, abre Obras y escribe en el buscador. No crea ni cambia nada
 * en Tempoglass.
 *
 * Sólo admin: la solicitud de cortes de vidrio, desde donde se llama, es una operación del admin.
 */
import type { ServerResponse } from 'node:http'
import { exigirRuta } from './_equipos.js'
import { endpointDatos, type Pedido } from './_http.js'
import { buscarObraTempoglass, ErrorTempoglass } from './_tempoglass.js'

interface Cuerpo {
  nombre?: unknown
}

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  await endpointDatos<Cuerpo>(req, res, async ({ sesion, cuerpo }) => {
    exigirRuta(sesion, 'tempoglass')
    const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : ''
    if (!nombre || nombre.length > 120) throw new SyntaxError('falta el nombre de la obra')

    try {
      return { ok: true, ...(await buscarObraTempoglass(nombre)) }
    } catch (e) {
      /* Un paso de Tempoglass que no dio lo esperado no es un error de la app: se devuelve cuál fue,
         para que la pantalla lo diga. Lo demás (red caída, timeout) también se cuenta como Tempoglass. */
      if (e instanceof ErrorTempoglass) return { ok: false, paso: e.paso, mensaje: e.message }
      console.warn('[tempoglass] falla inesperada', e)
      return { ok: false, paso: 'conexion', mensaje: 'Tempoglass no respondió.' }
    }
  })
}
