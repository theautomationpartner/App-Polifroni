import { Fragment } from 'react'
import { formatoCelular } from '@/lib/destinatario'

/** "*negrita*" de WhatsApp → <strong>. El resto va como texto: nada de HTML armado a mano. */
function conNegritas(linea: string) {
  return linea.split(/(\*[^*]+\*)/g).map((parte, i) =>
    /^\*[^*]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : <Fragment key={i}>{parte}</Fragment>,
  )
}

/**
 * Cómo le llega el mensaje al cliente: la misma burbuja de WhatsApp de la vista previa de la OP,
 * pero con el texto REAL —el que arma la app y el escenario manda tal cual—, no con datos de muestra.
 */
export function MensajeTurno({ texto, celular }: { texto: string; celular: string }) {
  return (
    <>
      <div className="msj-chat">
        <div className="msj-burbuja">
          {/* Un párrafo por línea en blanco; dentro de cada uno, los renglones como en WhatsApp. */}
          {texto.split('\n\n').map((p, i) => (
            <p key={i}>
              {p.split('\n').map((linea, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {conNegritas(linea)}
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      </div>
      <p className="msj-nota">
        {celular ? (
          <>
            <i className="fab fa-whatsapp" /> Le llega por WhatsApp al {formatoCelular(celular)}.
          </>
        ) : (
          <>
            <i className="fas fa-triangle-exclamation" /> El cliente no tiene un celular válido cargado: no se le puede
            mandar el mensaje.
          </>
        )}
      </p>
    </>
  )
}
