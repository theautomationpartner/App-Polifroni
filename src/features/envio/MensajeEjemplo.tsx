import { Modal } from '@/components/ui/Modal'

/**
 * Cómo le llega el mensaje de WhatsApp a quien recibe la orden, con datos de EJEMPLO.
 *
 * El texto real lo arma el escenario de Make con el nombre del destinatario y el enlace para
 * confirmar, que va siempre. Acá se muestra lo mismo sin variables: sirve para saber qué va a leer la
 * otra persona antes de apretar "Enviar", no para editarlo.
 */
export function MensajeEjemplo({
  destinatario,
  onClose,
}: {
  /** "Cliente" o "Constructor": quien recibe el enlace y confirma. */
  destinatario: string
  onClose: () => void
}) {
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
          {/* El enlace va SIEMPRE, sea el cliente o el constructor quien confirme: sin él, la
              orden se podía fabricar sin que nadie la validara. */}
          <p>
            Una vez aprobada, la orden pasa directamente a producción.{' '}
            <strong>La tenés que confirmar por acá:</strong>{' '}
            <span className="msj-link">enlace para confirmar la orden</span>
          </p>
          <p>¡Gracias por tu confianza!</p>
          <p>🏠 Polifroni Aberturas</p>
          <span className="msj-adj">
            <i className="fas fa-file-pdf" /> Orden_de_Produccion_Final.pdf
          </span>
        </div>
      </div>
      <p className="msj-nota">
        Le llega a{' '}
        {destinatario === 'Ambos'
          ? 'el cliente y al constructor, a cada uno con su enlace para confirmar'
          : destinatario === 'Constructor'
            ? 'el constructor'
            : 'el cliente'}
        .
      </p>
    </Modal>
  )
}
