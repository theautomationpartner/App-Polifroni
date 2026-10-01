import { VISTA_ESTADO, type EstadoOrden } from '@/lib/estadosOp'

/**
 * El estado de UNA orden, como pastilla. Es el único lugar donde se decide cómo se ve un estado:
 * la consulta, el selector y el documento lo muestran igual.
 */
export function EstadoOrdenBadge({ estado, chico = false }: { estado: EstadoOrden; chico?: boolean }) {
  const v = VISTA_ESTADO[estado]
  return (
    <span
      className={`op-estado ${chico ? 'op-estado--sm' : ''}`}
      style={{ ['--op-c' as string]: v.color }}
    >
      <i className={`fas ${v.icono}`} aria-hidden="true" />
      {v.rotulo}
    </span>
  )
}

/** Activa / inactiva, para la cuenta corriente del cliente. Sin dato, no se dibuja nada. */
export function CuentaBadge({ activa }: { activa: boolean | null | undefined }) {
  if (activa == null) return null
  return (
    <span
      className={`cuenta-estado ${activa ? 'cuenta-estado--ok' : 'cuenta-estado--baja'}`}
      title={activa ? 'La cuenta corriente está activa' : 'La cuenta corriente está dada de baja'}
    >
      <span className="cuenta-dot" aria-hidden="true" />
      {activa ? 'Cuenta activa' : 'Cuenta inactiva'}
    </span>
  )
}
