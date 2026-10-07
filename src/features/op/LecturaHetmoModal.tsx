import { Modal } from '@/components/ui/Modal'
import type { VidrioLeido } from '@/services/monday'

/**
 * La ventana que sigue a la lectura de la orden de HETMO.
 *
 * Arriba, cuántas aberturas identificó la IA; abajo, los vidrios que encontró en ellas (o el aviso de
 * que no hay ninguno). Ofrece "Cargar observaciones", que sólo abre una caja por abertura: no vuelve
 * a leer el documento.
 */
export type FaseLecturaHetmo =
  | { fase: 'leido' }
  | { fase: 'error'; problema: string; reintentar: () => void }

interface Props {
  /** Cuántas aberturas identificó la IA. */
  aberturas: number
  vidrios: VidrioLeido[]
  estado: FaseLecturaHetmo
  /** Sin esta función (las cajas ya están abiertas) no se ofrece el botón. */
  onCargarObservaciones?: () => void
  onClose: () => void
}

const SOPORTE = 'Validá que la información sea correcta; caso contrario, contactá con el soporte de TAP.'

const celda = (v: string | null) => v || '—'

export function LecturaHetmoModal({ aberturas, vidrios, estado, onCargarObservaciones, onClose }: Props) {
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

  if (aberturas === 0) {
    return (
      <Modal
        title="No se encontraron aberturas"
        icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
        onClose={onClose}
        actions={
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Aceptar
          </button>
        }
      >
        La IA no identificó ninguna abertura (ningún «Modelo:») en esta orden. {SOPORTE}
      </Modal>
    )
  }

  return (
    <Modal
      title={`${aberturas} ${aberturas === 1 ? 'abertura leída' : 'aberturas leídas'}`}
      icon={<i className="fas fa-border-all modal-icon--info" />}
      onClose={onClose}
      className={hay ? 'modal-box--ancho' : undefined}
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Aceptar
          </button>
          {onCargarObservaciones && (
            <button type="button" className="btn btn-primary btn-marca" onClick={onCargarObservaciones}>
              <i className="fas fa-pen-to-square" /> Cargar observaciones
            </button>
          )}
        </>
      }
    >
      {hay ? (
        <>
          <p className="hl-subt">
            Se encontraron <strong>{vidrios.length}</strong> {vidrios.length === 1 ? 'vidrio' : 'vidrios'} en la orden
          </p>
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
        </>
      ) : (
        <p className="hl-subt hl-subt--warn">
          <i className="fas fa-triangle-exclamation modal-icon--warn" /> NO se encontraron vidrios especificados en las
          aberturas de esta orden. {SOPORTE}
        </p>
      )}
    </Modal>
  )
}
