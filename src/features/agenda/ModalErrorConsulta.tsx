import { Modal } from '@/components/ui/Modal'

/**
 * Monday no contestó —token rotado, Monday caído o sin respuesta a tiempo—. Va en una ventana de
 * error con la cruz blanca sobre rojo, no en un renglón: no es algo que se arregle cambiando lo
 * escrito.
 */
export function ModalErrorConsulta({ accion, onClose }: { accion: string; onClose: () => void }) {
  return (
    <Modal
      title="No se pudo consultar Monday"
      icon={<i className="fas fa-xmark modal-icon--error" />}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary btn-entendido" onClick={onClose}>
          Entendido
        </button>
      }
    >
      Monday no respondió al intentar <strong>{accion}</strong>. Puede estar caído, demorado o con un problema de
      acceso. Reintentá en unos segundos; si la falla persiste, contactate con el soporte de TAP.
    </Modal>
  )
}

/** Cuánto se espera a Monday antes de darlo por caído: una consulta no puede quedar colgada. */
const TOPE_MONDAY_MS = 20_000

/** La consulta, o un error si Monday no contesta a tiempo. */
export function conTope<T>(consulta: Promise<T>): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const corte = setTimeout(() => rechazar(new Error('Monday no respondió a tiempo.')), TOPE_MONDAY_MS)
    consulta.then(
      (v) => {
        clearTimeout(corte)
        resolver(v)
      },
      (e) => {
        clearTimeout(corte)
        rechazar(e)
      },
    )
  })
}
