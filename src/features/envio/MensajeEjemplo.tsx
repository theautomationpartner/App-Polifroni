import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Rol } from '@/lib/destinatario'

/**
 * Cómo le llega el mensaje de WhatsApp a quien recibe la orden, con datos de EJEMPLO.
 *
 * El texto real lo arma el escenario de Make con el nombre del destinatario. Acá se muestra lo mismo
 * sin variables: sirve para saber qué va a leer la otra persona antes de apretar "Enviar", no para
 * editarlo.
 *
 * El primer envío y el reenvío son mensajes distintos. En el reenvío el cierre depende de quién lo
 * recibe: al responsable de confirmar le llega el enlace para confirmar; al otro destinatario, sólo
 * el recordatorio (es el `if(72.confirmador = true; …)` del escenario). Con los dos destinatarios se
 * puede ver el de cada uno.
 */
export function MensajeEjemplo({
  destinatario,
  roles = [],
  confirmador = null,
  reenvio = false,
  onClose,
}: {
  /** "Cliente", "Constructor" o "Ambos". */
  destinatario: string
  /** A quiénes se envía. */
  roles?: readonly Rol[]
  /** El responsable de confirmar la orden. */
  confirmador?: Rol | null
  /** Se reenvía una orden que ya espera la confirmación. */
  reenvio?: boolean
  onClose: () => void
}) {
  /** De quién es el mensaje que se está viendo (con dos destinatarios, se elige). */
  const [viendo, setViendo] = useState<Rol | null>(confirmador ?? roles[0] ?? null)
  const recibeEnlace = !reenvio || !confirmador || viendo === confirmador

  return (
    <Modal
      title={reenvio ? 'Mensaje que se reenvía' : 'Mensaje que se envía'}
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

      {reenvio && roles.length === 2 && (
        <div className="msj-quien" role="tablist" aria-label="Ver el mensaje de">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={viendo === r}
              className={`msj-quien-op ${viendo === r ? 'msj-quien-op--on' : ''}`}
              onClick={() => setViendo(r)}
            >
              {r}
              {r === confirmador && <span className="msj-quien-tag">Confirmador</span>}
            </button>
          ))}
        </div>
      )}

      <div className="msj-chat">
        {reenvio ? (
          <div className="msj-burbuja">
            <p>
              Hola <strong>Juan</strong> 👋
            </p>
            <p>
              🔁 Te <strong>REENVIAMOS</strong> la <strong>Orden de Producción</strong> para que puedas
              revisarla y, si está todo bien, confirmarla.
            </p>
            <p>Te pedimos que verifiques con atención estos ítems:</p>
            <ul>
              <li>Datos del cliente, teléfono y dirección de obra</li>
              <li>Color de las aberturas</li>
              <li>Tipologías de las aberturas</li>
              <li>Manos de apertura (los gráficos están vistos desde el interior)</li>
              <li>Composición de los vidrios</li>
              <li>Mosquiteros: si los incluiste en la compra, chequeá que figuren en la orden</li>
            </ul>
            <p>Si necesitás hacer algún cambio o detectás un error, avisanos y lo corregimos.</p>
            {recibeEnlace ? (
              <p>
                📌 <strong>RECORDÁ</strong> que para comenzar con la produccion necesitamos tu
                confirmacion. Podes confirmar clickeando este link:{' '}
                <span className="msj-link">enlace para confirmar la orden</span>
              </p>
            ) : (
              <p>📌 Recordá que, una vez aprobada, la orden pasa directamente a producción.</p>
            )}
            <p>¡Gracias por tu confianza!</p>
            <p>
              Polifroni Aberturas
              <br />
              Automatizado por <strong>The Automation Partner</strong>
            </p>
            <span className="msj-adj">
              <i className="fas fa-file-pdf" /> Orden_de_Produccion_Final.pdf
            </span>
          </div>
        ) : (
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
        )}
      </div>
      <p className="msj-nota">
        {reenvio && viendo
          ? `Así le llega al ${viendo === 'Cliente' ? 'cliente' : 'constructor'}${
              confirmador ? (viendo === confirmador ? ', con el enlace para confirmar' : ', sin el enlace: confirma el otro destinatario') : ''
            }.`
          : `Le llega ${
              destinatario === 'Ambos'
                ? 'al cliente y al constructor, a cada uno con su enlace para confirmar'
                : destinatario === 'Constructor'
                  ? 'al constructor'
                  : 'al cliente'
            }.`}
      </p>
    </Modal>
  )
}
