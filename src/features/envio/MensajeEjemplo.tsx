import { Modal } from '@/components/ui/Modal'

/**
 * Cómo le llega el mensaje de WhatsApp a quien recibe la orden, con datos de EJEMPLO.
 *
 * El texto real lo arma el escenario de Make con el nombre del destinatario y, si es el cliente, el
 * enlace para confirmar. Acá se muestra lo mismo sin variables: sirve para saber qué va a leer la
 * otra persona antes de apretar "Enviar", no para editarlo.
 */
export function MensajeEjemplo({
  destinatario,
  onClose,
}: {
  /** "Cliente", "Constructor" o "Ambos": cambia el cierre del mensaje. */
  destinatario: string
  onClose: () => void
}) {
  const alCliente = destinatario !== 'Constructor'
  return (
    <Modal
      title="Mensaje que se envía"
      icon={<i className="fab fa-whatsapp msj-ic" />}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Entendido
        </button>
      }
    >
      <p className="modal-nota">
        Ejemplo con datos de muestra. Va junto con el PDF de la Orden de Producción.
      </p>
      <div className="msj-chat">
        <div className="msj-burbuja">
          <p>
            Hola <strong>Juan</strong> 👋
          </p>
          <p>
            🧾 Te adjuntamos <strong>Orden de Producción</strong>.
          </p>
          <p>Te pedimos por favor que verifiques con atención estos ítems:</p>
          <ul>
            <li>Datos del cliente, teléfono y dirección de obra.</li>
            <li>Color de aberturas.</li>
            <li>Tipologías de aberturas.</li>
            <li>Manos de apertura (los gráficos son vistos desde el interior).</li>
            <li>Composición de vidrios.</li>
            <li>Si la compra incluye mosquiteros, que figuren en la orden.</li>
          </ul>
          <p>Si necesitás realizar algún cambio o detectás un error, avisanos.</p>
          {alCliente ? (
            <p>
              Una vez aprobada, la orden pasa directamente a producción.{' '}
              <strong>La cual va a tener que confirmar por acá:</strong>{' '}
              <span className="msj-link">enlace para confirmar la orden</span>
            </p>
          ) : (
            <p>Una vez aprobada, la orden pasa directamente a producción.</p>
          )}
          <p>¡Gracias por tu confianza!</p>
          <p>🏠 Polifroni Aberturas</p>
          <span className="msj-adj">
            <i className="fas fa-file-pdf" /> Orden_de_Produccion_Final.pdf
          </span>
        </div>
      </div>
      {destinatario === 'Ambos' && (
        <p className="msj-nota">
          Con «Ambos», al constructor le llega el mismo mensaje sin el enlace para confirmar: la
          confirmación es del cliente.
        </p>
      )}
    </Modal>
  )
}
