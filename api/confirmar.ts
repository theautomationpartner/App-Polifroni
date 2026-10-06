/**
 * Serverless Function (Vercel) — el enlace de confirmación de la Orden de Producción y del
 * presupuesto. `vercel.json` reescribe `/confirmar` a esta función. Ver `api/_confirmarHttp.ts`.
 *
 * Es PÚBLICA a propósito (la abre el cliente, sin sesión de Monday): no pasa por el guardián ni por el
 * portero (`middleware.ts`). La protege la firma del enlace.
 *
 * Variables: CONFIRMACION_SECRET, MONDAY_TOKEN (o MONDAY_API_TOKEN).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { manejarConfirmar } from './_confirmarHttp.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await manejarConfirmar(req, res)
}
