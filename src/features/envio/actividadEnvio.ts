import { destinoDe, type Rol } from '@/lib/destinatario'
import { ACTIVIDAD, crearActividad, html } from '@/services/monday'
import type { Obra } from '@/types'

/** Los datos de la orden que van en la actividad. Salen de la OP del tablero o de lo cargado en la app. */
export interface DatosActividadEnvio {
  idOp: string
  numero: string
  nOpHetmo: string
  tipo: string
  medidoPor: string
  /** `YYYY-MM-DD`. */
  fechaMedicion: string
  observacion: string
}

/**
 * La actividad "OP Enviada" (o "OP Reenviada") en la línea de tiempo de la obra: cuándo, qué orden,
 * a quiénes —nombre y teléfono de cada uno—, la medición y el link al PDF que devolvió el envío.
 */
export async function registrarActividadEnvio(
  obra: Obra,
  o: DatosActividadEnvio,
  roles: readonly Rol[],
  esReenvio: boolean,
  link: string,
  ahora = new Date(),
): Promise<void> {
  const ds = roles.map((r) => destinoDe(obra, r))
  const cuando = `${ahora.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} - ${ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`
  const renglon = (t: string, v: string) => `<p><b>${t}:</b> ${v ? html(v) : '—'}</p>`
  const contenido = [
    renglon(esReenvio ? 'Fecha De Reenvío' : 'Fecha De Envío', cuando),
    renglon('Orden', o.idOp),
    renglon(/alum/i.test(o.tipo) ? 'N° OP Aluminio' : 'N° OP PVC', o.numero),
    renglon('N° OP Original', o.nOpHetmo),
    renglon('Tipo', o.tipo),
    ...ds.map(
      (d) =>
        `<p><b>Enviada A ${html(d.tipo)}:</b> ${html(d.nombre || '—')} — <b>Teléfono:</b> ${html(d.whatsapp || 'sin teléfono')}</p>`,
    ),
    renglon('Medido Por', o.medidoPor),
    renglon('Fecha De Medición', o.fechaMedicion ? o.fechaMedicion.split('-').reverse().join('/') : ''),
    renglon('Observación', o.observacion),
    link ? `<p><b>Link PDF:</b> <a href="${html(link)}">${html(link)}</a></p>` : renglon('Link PDF', ''),
  ].join('')
  await crearActividad({
    itemId: obra.id,
    actividadId: ACTIVIDAD.opEnviada,
    titulo: esReenvio ? 'OP Reenviada' : 'OP Enviada',
    resumen: `${o.idOp || `N° ${o.numero}`} ${esReenvio ? 'reenviada' : 'enviada'} a ${ds.map((d) => `${d.tipo} ${d.nombre}`.trim()).join(' y ')}`,
    contenido,
    url: link || undefined,
    telefono: ds[0]?.whatsapp || undefined,
    cuando: ahora,
  })
}

/** El link al PDF que devuelve el escenario de envío (`link_op`, o sus nombres de antes). */
export const linkDeRespuesta = (cuerpo: Record<string, unknown> | null): string =>
  [cuerpo?.link_op, cuerpo?.linkPdf, cuerpo?.shareLink, cuerpo?.webContentLink]
    .map((v) => String(v ?? '').trim())
    .find((v) => /^https?:\/\//i.test(v)) ?? ''
