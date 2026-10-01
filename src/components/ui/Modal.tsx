import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  icon?: ReactNode
  /**
   * El cuerpo. Es OPCIONAL: hay ventanas cuyo título ya es toda la pregunta, y ahí un párrafo de
   * relleno no aclara nada —sólo pone algo entre la pregunta y los botones que la contestan—.
   */
  children?: ReactNode
  actions?: ReactNode
  onClose: () => void
  /**
   * `false`: no se cierra con la X ni clickeando afuera. Para las ventanas que piden una decisión
   * sin la cual la app no tiene a dónde ir (el cierre de una operación).
   */
  cerrable?: boolean
  /** Una clase más para la caja, para la ventana que necesita otro ancho. */
  className?: string
}

/** Ventana emergente centrada, con fondo oscurecido. Se cierra con la X o clickeando afuera. */
export function Modal({ title, icon, children, actions, onClose, cerrable = true, className }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={cerrable ? onClose : undefined}>
      <div
        className={`modal-box ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {cerrable && (
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        )}
        {icon && <div className="modal-icon">{icon}</div>}
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}
