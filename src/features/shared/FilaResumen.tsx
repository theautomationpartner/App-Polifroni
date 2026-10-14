import type { ReactNode } from 'react'

/**
 * Un renglón del resumen (el `Fila` de La Batea): rótulo a la izquierda, valor a la derecha. Sin valor,
 * "--" en rojo; con `requerido`, el asterisco. Lo usan el "Resumen OP final a generar" y el "Resumen de
 * la facturación": los dos resúmenes son la misma pieza.
 */
export function Fila({ label, requerido = true, children }: { label: string; requerido?: boolean; children: ReactNode }) {
  const vacio = children === '' || children == null
  return (
    <div className="rrow">
      <span className="rlabel">
        {label}
        {requerido && <span className="rreq">*</span>}
      </span>
      <span className={`rvalue ${vacio ? 'rvalue--falta' : ''}`}>{vacio ? '--' : children}</span>
    </div>
  )
}
