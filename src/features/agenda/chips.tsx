import { VISTA_TURNO, defTipo, type Aprobacion, type EstadoTurno, type TipoTurno } from '@/lib/agenda'

/**
 * Las pastillas de la Agenda. Son la misma `op-estado` de los estados de la OP —tinte del color de
 * la etiqueta en el tablero—, así un estado se lee igual en todas las áreas.
 */
function Pastilla({ color, icono, texto, chico = true }: { color: string; icono?: string; texto: string; chico?: boolean }) {
  return (
    <span className={`op-estado ${chico ? 'op-estado--sm' : ''}`} style={{ ['--op-c' as string]: color || '#c4c4c4' }}>
      {icono && <i className={`fas ${icono}`} aria-hidden="true" />}
      {texto}
    </span>
  )
}

const ICONO_ESTADO: Record<EstadoTurno, string> = {
  pendiente: 'fa-hourglass-half',
  asignado: 'fa-paper-plane',
  cumplido: 'fa-circle-check',
  cancelado: 'fa-ban',
}

export function EstadoTurnoChip({ estado }: { estado: EstadoTurno }) {
  const v = VISTA_TURNO[estado]
  return <Pastilla color={v.color} icono={ICONO_ESTADO[estado]} texto={v.rotulo} />
}

/** Los colores de `✋ Tipo de Turno` en el tablero. */
const COLOR_TIPO: Record<TipoTurno, string> = {
  colocacion: '#00c875',
  reparacion: '#df2f4a',
  entrega: '#fdab3d',
  medicion: '#9d50dd',
}

/** El tipo de turno. Los tipos viejos que la app no carga se muestran con su etiqueta, en gris. */
export function TipoTurnoChip({ tipo, etiqueta }: { tipo: TipoTurno | null; etiqueta: string }) {
  if (!tipo) return etiqueta ? <Pastilla color="#c4c4c4" texto={etiqueta} /> : <span className="ant-sd">—</span>
  const d = defTipo(tipo)
  return <Pastilla color={COLOR_TIPO[tipo]} icono={d.icono} texto={d.titulo} />
}

export function EtapaChip({ texto, color }: { texto: string; color: string }) {
  return texto ? <Pastilla color={color} texto={texto} /> : <span className="ant-sd">Sin etapa</span>
}

/** `chico`: la medida de las pastillas de las tablas. */
export function AprobacionChip({ aprobacion, chico = false }: { aprobacion: Aprobacion | null; chico?: boolean }) {
  if (!aprobacion) return <Pastilla color="#c4c4c4" icono="fa-circle-question" texto="Sin dato" chico={chico} />
  return aprobacion === 'aprobada' ? (
    <Pastilla color="#00c875" icono="fa-circle-check" texto="Aprobada" chico={chico} />
  ) : (
    <Pastilla color="#fdab3d" icono="fa-triangle-exclamation" texto="No aprobada" chico={chico} />
  )
}
