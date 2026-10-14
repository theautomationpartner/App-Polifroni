import { Fragment, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Rol } from '@/lib/destinatario'
import { useApp } from '@/state/hooks'
import { textosDe } from './EnviarFactura'

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
 * Cómo le llega el WhatsApp de la factura a cada destinatario: la misma ventana de "Ver el mensaje que
 * le llega" de la OP y del presupuesto. Por cada comprobante, el texto (`textoFactura`, el mismo que
 * sale) y después su PDF. Antes de emitir, el monto es el elegido y el PDF todavía no tiene nombre.
 */
export function MensajeFactura({ nombres, onClose }: { nombres: { rol: Rol; nombre: string }[]; onClose: () => void }) {
  const { factura } = useApp()
  const [viendo, setViendo] = useState(0)
  const actual = nombres[viendo] ?? { rol: 'Cliente' as Rol, nombre: factura.cuenta?.nombre || 'Juan' }
  const textos = textosDe(factura, actual.nombre, new Date())

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
        {nombres.length ? 'Así le llega, con su nombre.' : 'Ejemplo con datos de muestra.'}{' '}
        {textos.length > 1 ? 'Sale un mensaje por comprobante, cada uno seguido de su PDF.' : 'Después del texto sale el PDF de la factura.'}
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
        {textos.map((t, k) => (
          <Fragment key={k}>
            <div className="msj-burbuja">
              {t.split(/\n{2,}/).map((p, i) => (
                <p key={i}>
                  {p.split('\n').map((l, j) => (
                    <Fragment key={j}>
                      {j > 0 && <br />}
                      <Linea texto={l} />
                    </Fragment>
                  ))}
                </p>
              ))}
            </div>
            <div className="msj-burbuja msj-burbuja--adj">
              <span className="msj-adj">
                <i className="fas fa-file-pdf" /> {factura.comprobantes[k]?.leido?.pdf?.nombre ?? 'Factura.pdf'}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </Modal>
  )
}
