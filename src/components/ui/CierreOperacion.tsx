import { Modal } from './Modal'

/**
 * El cierre de una operación, ya registrada en Monday: dice qué se hizo y pregunta a dónde seguir.
 *
 * Es una ventana de información, no un aviso: no hay nada que corregir. No se cierra con la X ni
 * clickeando afuera, porque detrás no queda una pantalla a la que volver: la operación terminó.
 *  - "Volver a Inicio": la app arranca de cero y se elige el área.
 *  - "Seleccionar Otra Operación": se queda en el área, para elegir otro envío o una consulta.
 */
export function CierreOperacion({
  texto,
  detalle,
  onInicio,
  onOtraOperacion,
}: {
  texto: string
  detalle?: string
  onInicio: () => void
  onOtraOperacion: () => void
}) {
  return (
    <Modal
      title={texto}
      icon={<i className="fas fa-circle-info modal-icon--info" />}
      onClose={onOtraOperacion}
      cerrable={false}
      className="modal-cierre"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onInicio}>
            <i className="fas fa-house" /> Volver a Inicio
          </button>
          <button type="button" className="btn btn-primary btn-marca" onClick={onOtraOperacion}>
            <i className="fas fa-list-check" /> Seleccionar Otra Operación
          </button>
        </>
      }
    >
      {detalle && <p className="modal-clave">{detalle}</p>}
      <p>¿Qué deseás hacer ahora?</p>
    </Modal>
  )
}
