/**
 * Actividades de la línea de tiempo de Monday CRM (Emails & Activities) sobre la obra.
 *
 * Son las "actividades personalizadas" de la cuenta —con su nombre, color e ícono— y se crean con
 * `create_timeline_item`. La consulta completa, para usarla también desde Make, está en
 * `formularios/actividades-monday.md`.
 */
import { mondayApi } from './sdk'

/** Ids de las actividades personalizadas de la cuenta (query `custom_activity`). */
export const ACTIVIDAD = {
  /** "OP Enviada" — avión de papel, verde. */
  opEnviada: '2a577f76-e14f-4e36-8ebc-68912434487a',
  /** "OP Confirmada x Client" — verde. */
  opConfirmada: 'e61dc320-5aa0-4d44-bef0-0f25fbbbf47b',
} as const

export interface NuevaActividad {
  itemId: string
  actividadId: string
  titulo: string
  /** Una línea: lo que se lee en la lista sin abrir la actividad. */
  resumen: string
  /** El detalle, en HTML simple (<p>, <b>, <a>): Monday lo muestra con formato. */
  contenido: string
  url?: string
  telefono?: string
  /** Cuándo pasó. Por defecto, ahora. */
  cuando?: Date
}

export async function crearActividad(a: NuevaActividad): Promise<string> {
  const d = await mondayApi<{ create_timeline_item: { id: string } }>(
    `mutation ($item: ID!, $act: String!, $title: String!, $summary: String, $content: String,
               $ts: ISO8601DateTime!, $url: String, $phone: String) {
      create_timeline_item(item_id: $item, custom_activity_id: $act, title: $title, summary: $summary,
                           content: $content, timestamp: $ts, url: $url, phone: $phone) { id }
    }`,
    {
      item: a.itemId,
      act: a.actividadId,
      title: a.titulo,
      summary: a.resumen,
      content: a.contenido,
      ts: (a.cuando ?? new Date()).toISOString(),
      url: a.url || null,
      phone: a.telefono || null,
    },
  )
  return d.create_timeline_item.id
}

/** Escapa texto para meterlo dentro del HTML del contenido. */
export const html = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
