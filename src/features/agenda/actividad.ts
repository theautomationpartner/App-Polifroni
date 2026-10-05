import { defTipo, fechaHoraCorta } from '@/lib/agenda'
import { ACTIVIDAD_TURNO, html, ordenesDeLaObra, registrarActividadTurno, type Turno } from '@/services/monday'

/** Las operaciones de la gestión que dejan una actividad en el turno. */
export type OperacionTurno = 'asignacion' | 'confirmacion' | 'cancelacion' | 'reprogramacion'

/** El título de cada actividad (va en negrita) y la actividad personalizada de la cuenta que usa. */
const ACTIVIDAD: Record<OperacionTurno, { titulo: string; id: string }> = {
  asignacion: { titulo: 'ASIGNACION DE TURNO', id: ACTIVIDAD_TURNO.agenda },
  confirmacion: { titulo: 'CONFIRMACION Y CUMPLIMIENTO DE TURNO', id: ACTIVIDAD_TURNO.agenda },
  cancelacion: { titulo: 'CANCELACION DE TURNO', id: ACTIVIDAD_TURNO.cancelado },
  /* Reprogramar es cancelar este turno y crear otro: va como cancelación, con su propia actividad. */
  reprogramacion: { titulo: 'CANCELACION DE TURNO', id: ACTIVIDAD_TURNO.reprogramado },
}

/** Lo propio de cada operación, que se suma a la descripción. */
export interface DetalleActividad {
  /** Quien hizo la operación en la app. */
  autor: string
  /** Confirmación de una colocación: total o parcial. */
  resultado?: string
  /** Cancelación y reprogramación. */
  motivo?: string
  detalle?: string
  /** Reprogramación: la fecha del turno nuevo (`YYYY-MM-DD`) y su hora (`HH:MM`). */
  nuevaFecha?: string
  nuevaHora?: string
}

const fila = (titulo: string, valor: string) => `<p><b>${html(titulo)}:</b> ${html(valor)}</p>`

/**
 * Registra la operación como actividad en el widget Emails & Activities del turno: el título en
 * negrita, y en la descripción el tipo de turno, a qué obra y orden de producción está vinculado
 * —o a qué pendiente de entrega, en una entrega—, y quién es su responsable.
 *
 * Nunca frena la operación: el turno ya quedó escrito en Monday. Devuelve `false` si no se pudo
 * registrar, para avisarlo.
 */
export async function registrarActividad(op: OperacionTurno, t: Turno, d: DetalleActividad): Promise<boolean> {
  try {
    const { titulo, id } = ACTIVIDAD[op]
    const tipo = t.tipo ? defTipo(t.tipo).titulo : t.etiquetaTipo || 'Sin tipo'
    const entrega = t.tipo === 'entrega'
    const ordenes = !entrega && t.obraId ? await ordenesDeLaObra(t.obraId).catch(() => [] as string[]) : []

    const filas = [
      `<p><b>${html(titulo)}</b></p>`,
      fila('Tipo de turno', tipo),
      fila('Cliente', t.cliente || 'Sin cliente'),
      fila('Fecha del turno', t.fecha ? fechaHoraCorta(t.fecha, t.hora) : 'Sin fecha'),
      entrega
        ? fila('Pendiente de entrega', t.pendiente || 'Sin pendiente vinculado')
        : [
            fila('Obra', t.obra || 'Sin obra vinculada'),
            fila(ordenes.length > 1 ? 'Órdenes de producción' : 'Orden de producción', ordenes.join(', ') || 'Sin orden vinculada'),
          ].join(''),
      d.resultado ? fila('Estado de finalización', d.resultado) : '',
      d.motivo ? fila('Motivo', d.motivo) : '',
      d.detalle?.trim() ? fila('Detalle', d.detalle.trim()) : '',
      d.nuevaFecha ? fila('Reprogramado para', fechaHoraCorta(d.nuevaFecha, d.nuevaHora)) : '',
      fila('Responsable del turno', t.responsable || 'Sin responsable'),
      fila('Registrado por', d.autor || 'la app'),
    ]

    await registrarActividadTurno({
      turnoId: t.id,
      actividadId: id,
      titulo,
      resumen: [tipo, t.cliente, t.fecha ? fechaHoraCorta(t.fecha, t.hora) : ''].filter(Boolean).join(' · '),
      contenido: filas.filter(Boolean).join(''),
    })
    return true
  } catch (e) {
    console.warn('[agenda] no se pudo registrar la actividad', op, e)
    return false
  }
}
