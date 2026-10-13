import { Fragment, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Rol } from '@/lib/destinatario'
import { etiquetaPresupuesto, textoPresupuestos } from '@/lib/presupuesto'
import type { PresupuestoAEnviar } from './EnvioPresupuestos'

/**
 * Una línea con el formato de WhatsApp: lo que va entre asteriscos, en negrita. Cada enlace de
 * confirmación (la marca que el servidor reemplaza por el enlace firmado) se muestra como en la vista
 * de la OP (`msj-link`), sin la dirección.
 */
function Linea({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*]+\*|\[\[ENLACE_CONFIRMACION(?::[^\]]*)?\]\])/g).map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : /^\[\[ENLACE_CONFIRMACION/.test(p) ? (
          <span key={i} className="msj-link">
            enlace para confirmar
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * Cómo le llega el WhatsApp de los presupuestos a cada destinatario: la misma ventana de "Ver el
 * mensaje que le llega" de la OP (`MensajeEjemplo`), con la burbuja del chat y los PDF que salen
 * después, uno por mensaje.
 *
 * El texto NO se repite acá: es el mismo `textoPresupuestos` que manda el envío, con el nombre real de
 * cada destinatario. Al responsable de confirmar le llega, además, un enlace por cada presupuesto que
 * tiene que confirmar; con dos destinatarios se puede ver el de cada uno.
 */
export function MensajePresupuesto({
  nombres,
  confirmador,
  presupuestos,
  aConfirmar,
  reenvio = false,
  onClose,
}: {
  nombres: { rol: Rol; nombre: string }[]
  /** El responsable de confirmar (o nadie: la confirmación es opcional). */
  confirmador: Rol | null
  presupuestos: PresupuestoAEnviar[]
  /** Los que el responsable tiene que confirmar. */
  aConfirmar: string[]
  /** Un reenvío: el texto lo dice. */
  reenvio?: boolean
  onClose: () => void
}) {
  const [viendo, setViendo] = useState(() => Math.max(0, nombres.findIndex((n) => n.rol === confirmador)))
  const actual = nombres[viendo] ?? { rol: 'Cliente' as Rol, nombre: 'Juan' }
  const confirma = !!confirmador && actual.rol === confirmador
  /* En la vista no hay claves todavía (se generan al enviar): la marca sólo dice dónde va el enlace. */
  const confirmables = confirma
    ? presupuestos
        .filter((p) => aConfirmar.includes(p.id))
        .map((p) => ({ etiqueta: etiquetaPresupuesto({ nombreArchivo: p.archivo.name, tipo: p.tipo, color: p.color }), clave: p.clave ?? 'clave' }))
    : []
  const parrafos = textoPresupuestos(actual.nombre, Math.max(1, presupuestos.length), new Date(), confirmables, reenvio).split(/\n{2,}/)

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
        {nombres.length ? 'Así le llega, con su nombre.' : 'Ejemplo con datos de muestra.'} Después del texto sale cada
        PDF, en su mensaje.
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
        </div>
        {(presupuestos.length ? presupuestos.map((p) => p.archivo.name) : ['Presupuesto.pdf']).map((n) => (
          <div key={n} className="msj-burbuja msj-burbuja--adj">
            <span className="msj-adj">
              <i className="fas fa-file-pdf" /> {n}
            </span>
          </div>
        ))}
      </div>
      <p className="msj-nota">
        {`Así le llega ${actual.rol === 'Constructor' ? 'al constructor' : 'al cliente'}`}
        {!confirmador
          ? ', sin enlaces: no se pidió confirmación.'
          : confirma
            ? `, con ${confirmables.length === 1 ? 'el enlace' : 'un enlace por presupuesto'} para confirmar.`
            : ', sin enlaces: confirma el otro destinatario.'}
      </p>
    </Modal>
  )
}
