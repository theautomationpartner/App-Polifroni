import { Modal } from './Modal'
import { useApp, useDispatch } from '@/state/hooks'

/**
 * Aviso global de que Monday no respondió.
 *
 * Existe para que ningún fallo de la API quede sólo en la consola: la app dice QUÉ no se pudo
 * hacer —"no se pudo adjuntar la Orden ETMO"— y deja reintentar, en vez de quedarse en silencio
 * con una pantalla que parece estar bien.
 */
export function ModalErrorMonday() {
  const { errorMonday } = useApp()
  const dispatch = useDispatch()
  if (!errorMonday) return null

  return (
    <Modal
      title="No se pudo completar la acción"
      icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
      onClose={() => dispatch({ type: 'cerrarError' })}
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: 'cerrarError' })}
        >
          Entendido
        </button>
      }
    >
      Monday no respondió al intentar <strong>{errorMonday}</strong>. Probá de nuevo en unos
      segundos; si sigue igual, revisá el token de la app.
    </Modal>
  )
}
