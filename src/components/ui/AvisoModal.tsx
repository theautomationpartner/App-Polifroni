import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface AvisoModalProps {
  titulo: string
  /** Explicación de por qué no se puede avanzar. */
  children: ReactNode
  /** Datos concretos que faltan; se listan debajo del mensaje. */
  faltantes?: readonly string[]
  onClose: () => void
}

/**
 * Ventana de advertencia (la misma de La Batea): mismo ícono, tono y cierre en todos los puntos
 * donde el flujo se frena. Es informativa: la única acción es entender y volver.
 *
 * Es la contracara de no deshabilitar botones: el botón queda activo, y al tocarlo con algo
 * faltando se dice EXACTAMENTE qué falta, en vez de dejar a la persona adivinando por qué un
 * botón gris no responde.
 */
export function AvisoModal({ titulo, children, faltantes, onClose }: AvisoModalProps) {
  return (
    <Modal
      title={titulo}
      icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary btn-entendido" onClick={onClose}>
          Entendido
        </button>
      }
    >
      {children}
      {faltantes && faltantes.length > 0 && (
        <ul className="modal-faltantes">
          {faltantes.map((f) => (
            <li key={f}>
              <i className="fas fa-circle-xmark" /> {f}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
