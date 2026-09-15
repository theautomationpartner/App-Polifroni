import type { ReactNode } from 'react'

export type TonoAviso = 'info' | 'ok' | 'warn' | 'err'

const ICONO: Record<TonoAviso, string> = {
  info: 'fa-circle-info',
  ok: 'fa-circle-check',
  warn: 'fa-triangle-exclamation',
  err: 'fa-circle-exclamation',
}

/**
 * Renglón de aviso dentro de un paso: por qué algo no se puede hacer todavía, o cómo terminó lo
 * que se acaba de hacer. No interrumpe —para eso están las ventanas—, acompaña al control que
 * explica.
 */
export function Aviso({ tono = 'info', children }: { tono?: TonoAviso; children: ReactNode }) {
  return (
    <div className={`aviso aviso--${tono}`} role={tono === 'err' ? 'alert' : 'status'}>
      <i className={`fas ${ICONO[tono]}`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

/**
 * Etiqueta de estado del tablero, con SU color. Monday pinta el fondo entero de la celda, así que
 * acá se hace lo mismo: el color es lo que se reconoce de un vistazo, no el texto.
 */
export function EstadoBadge({
  label,
  estado,
}: {
  label?: string
  estado: { texto: string; color: string }
}) {
  if (!estado.texto) {
    return (
      <span className="sbadge sbadge--vacio">
        {label && <span className="sbadge-l">{label}:</span>} sin definir
      </span>
    )
  }
  return (
    <span
      className={`sbadge ${estado.color ? 'sbadge--monday' : ''}`}
      style={estado.color ? { background: estado.color } : undefined}
    >
      {label && <span className="sbadge-l">{label}:</span>} {estado.texto}
    </span>
  )
}
