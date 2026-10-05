import { Fragment, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Rol } from '@/lib/destinatario'
import { textoPresupuesto } from '@/lib/presupuesto'

/** Una línea con el formato de WhatsApp: lo que va entre asteriscos, en negrita. */
function Linea({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*]+\*)/g).map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}

/**
 * Cómo le llega el WhatsApp del presupuesto a cada destinatario: la misma ventana de "Ver el mensaje
 * que le llega" de la OP (`MensajeEjemplo`), con la burbuja del chat y el PDF adjunto.
 *
 * El texto NO se repite acá: es el mismo `textoPresupuesto` que manda el envío, con el nombre real de
 * cada destinatario. Con dos destinatarios se puede ver el de cada uno.
 */
export function MensajePresupuesto({
  nombres,
  onClose,
}: {
  nombres: { rol: Rol; nombre: string }[]
  onClose: () => void
}) {
  const [viendo, setViendo] = useState(0)
  const actual = nombres[viendo] ?? { rol: 'Cliente' as Rol, nombre: 'Juan' }
  const parrafos = textoPresupuesto(actual.nombre).split(/\n{2,}/)

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
        {nombres.length ? 'Así le llega, con su nombre.' : 'Ejemplo con datos de muestra.'} Va junto con el PDF del
        presupuesto.
      </p>

      {nombres.length === 2 && (
        <div className="msj-quien" role="tablist" aria-label="Ver el mensaje de">
          {nombres.map((n, i) => (
            <button
              key={n.rol}
              type="button"
              role="tab"
              aria-selected={viendo === i}
              className={`msj-quien-op ${viendo === i ? 'msj-quien-op--on' : ''}`}
              onClick={() => setViendo(i)}
            >
              {n.rol}
            </button>
          ))}
        </div>
      )}

      <div className="msj-chat">
        <div className="msj-burbuja">
          {parrafos.map((p, i) => (
            <p key={i}>
              {p.split('\n').map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Linea texto={l} />
                </Fragment>
              ))}
            </p>
          ))}
          <span className="msj-adj">
            <i className="fas fa-file-pdf" /> Presupuesto.pdf
          </span>
        </div>
      </div>
      <p className="msj-nota">
        {nombres.length === 2
          ? 'Le llega al cliente y al constructor, a cada uno con su nombre.'
          : `Le llega ${actual.rol === 'Constructor' ? 'al constructor' : 'al cliente'}.`}
      </p>
    </Modal>
  )
}
