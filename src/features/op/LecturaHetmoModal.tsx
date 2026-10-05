import { Modal } from '@/components/ui/Modal'
import type { VidrioLeido } from '@/services/monday'

/**
 * La ventana que sigue a la lectura de la orden de HETMO.
 *
 * Primero muestra los vidrios que encontró la IA (o avisa que no hay ninguno) y ofrece generar las
 * observaciones. Esa segunda lectura corre EN la misma ventana, con su animación: si trae
 * aberturas la ventana se cierra sola (con una caja por abertura); si no hay ninguna, avisa ahí mismo.
 */
export type FaseLecturaHetmo =
  | { fase: 'vidrios' }
  | { fase: 'leyendoObs' }
  /** La lectura no encontró ninguna abertura (ningún "Modelo:"). */
  | { fase: 'sinObs' }
  | { fase: 'error'; problema: string; reintentar: () => void }

interface Props {
  vidrios: VidrioLeido[]
  estado: FaseLecturaHetmo
  onGenerarObservaciones: () => void
  onClose: () => void
}

const SOPORTE = 'Validá que la información sea correcta; caso contrario, contactá con el soporte de TAP.'

const celda = (v: string | null) => v || '—'

export function LecturaHetmoModal({ vidrios, estado, onGenerarObservaciones, onClose }: Props) {
  const leyendo = estado.fase === 'leyendoObs'
  const hay = vidrios.length > 0

  if (estado.fase === 'error') {
    return (
      <Modal
        title="No se pudo procesar el documento"
        icon={<i className="fas fa-circle-exclamation" />}
        onClose={onClose}
        actions={
          <>
            <button type="button" className="btn btn-out" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" onClick={estado.reintentar}>
              <i className="fas fa-rotate-right" /> Reintentar
            </button>
          </>
        }
      >
        {estado.problema}
      </Modal>
    )
  }

  if (estado.fase === 'sinObs') {
    return (
      <Modal
        title="No se encontraron aberturas"
        icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
        onClose={onClose}
        actions={
          <button type="button" className="btn btn-primary btn-marca" onClick={onClose}>
            Entendido
          </button>
        }
      >
        La orden no trae aberturas para cargarles observaciones. Si la información no es correcta,
        contactá con el soporte de TAP.
      </Modal>
    )
  }

  return (
    <Modal
      title={
        leyendo
          ? 'Generando observaciones'
          : hay
            ? `Se encontraron ${vidrios.length} ${vidrios.length === 1 ? 'vidrio' : 'vidrios'} en la orden`
            : 'No se encontraron vidrios en la orden'
      }
      icon={
        leyendo ? (
          <span className="hl-giro" aria-hidden />
        ) : hay ? (
          <i className="fas fa-border-all modal-icon--info" />
        ) : (
          <i className="fas fa-triangle-exclamation modal-icon--warn" />
        )
      }
      cerrable={!leyendo}
      onClose={onClose}
      className={hay && !leyendo ? 'modal-box--ancho' : undefined}
      actions={
        leyendo ? undefined : (
          <>
            <button type="button" className="btn btn-out" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary btn-marca" onClick={onGenerarObservaciones}>
              <i className="fas fa-wand-magic-sparkles" /> Generar observaciones
            </button>
          </>
        )
      }
    >
      {leyendo ? (
        <p className="hl-leyendo">La IA está leyendo los modelos de la orden y sus observaciones…</p>
      ) : hay ? (
        <div className="hl-tabla-wrap">
          <table className="hl-tabla">
            <thead>
              <tr>
                <th>Vidrio Comp 1</th>
                <th>Cámara</th>
                <th>Vidrio Comp 2</th>
                <th>Ancho</th>
                <th>Alto</th>
                <th>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {vidrios.map((v, i) => (
                <tr key={i} title={v.modelo ? `Modelo ${v.modelo}` : undefined}>
                  <td>{celda(v.comp1)}</td>
                  <td>{celda(v.camara)}</td>
                  <td>{celda(v.comp2)}</td>
                  <td>{celda(v.ancho)}</td>
                  <td>{celda(v.alto)}</td>
                  <td>{v.cant ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>NO se encontraron vidrios especificados en las aberturas de esta orden. {SOPORTE}</>
      )}
    </Modal>
  )
}
