import { Fragment, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Rol } from '@/lib/destinatario'
import { MARCA_ENLACE } from '@/lib/claveConfirmacion'
import { textoPresupuesto } from '@/lib/presupuesto'

/**
 * Una línea con el formato de WhatsApp: lo que va entre asteriscos, en negrita. El enlace de
 * confirmación (la marca que el servidor reemplaza por el enlace firmado) se muestra como en la vista
 * de la OP (`msj-link`), sin la dirección entera.
 */
function Linea({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*]+\*|\[\[ENLACE_CONFIRMACION\]\])/g).map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : p === MARCA_ENLACE ? (
          <span key={i} className="msj-link" title={p}>
            enlace para confirmar el presupuesto
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * Cómo le llega el WhatsApp del presupuesto a cada destinatario: la misma ventana de "Ver el mensaje
 * que le llega" de la OP (`MensajeEjemplo`), con la burbuja del chat y el PDF adjunto.
 *
 * El texto NO se repite acá: es el mismo `textoPresupuesto` que manda el envío, con el nombre real de
 * cada destinatario. Al responsable de confirmar le llega, además, el enlace para confirmarlo; con dos
 * destinatarios se puede ver el de cada uno.
 */
export function MensajePresupuesto({
  nombres,
  confirmador,
  onClose,
}: {
  nombres: { rol: Rol; nombre: string }[]
  /** El responsable de confirmar el presupuesto. */
  confirmador: Rol | null
  onClose: () => void
}) {
  const [viendo, setViendo] = useState(() => Math.max(0, nombres.findIndex((n) => n.rol === confirmador)))
  const actual = nombres[viendo] ?? { rol: 'Cliente' as Rol, nombre: 'Juan' }
  const confirma = actual.rol === confirmador
  const parrafos = textoPresupuesto(actual.nombre, new Date(), confirma).split(/\n{2,}/)

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
              {n.rol === confirmador && <span className="msj-quien-tag">Confirmador</span>}
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
        {`Así le llega ${actual.rol === 'Constructor' ? 'al constructor' : 'al cliente'}`}
        {nombres.length === 2
          ? confirma
            ? ', con el enlace para confirmar.'
            : confirmador
              ? ', sin el enlace: confirma el otro destinatario.'
              : '. Elegí quién confirma el presupuesto: a ése le llega el enlace.'
          : ', con el enlace para confirmar.'}
      </p>
    </Modal>
  )
}
