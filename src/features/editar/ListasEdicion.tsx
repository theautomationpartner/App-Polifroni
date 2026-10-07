import { Modal } from '@/components/ui/Modal'
import { cambio, type FilaListaAbertura, type FilaListaVidrio, type Par } from '@/lib/edicionOp'

/** Un dato de la lista: tal cual, o —si la edición lo cambia— el viejo tachado en rojo y el nuevo en verde. */
function Dato({ p, num = false }: { p: Par; num?: boolean }) {
  if (!cambio(p)) return <span className={num ? 'ed-l-num' : undefined}>{p.ahora || <span className="ant-sd">—</span>}</span>
  return (
    <span className="ed-l-cambio">
      {p.antes && <span className="ed-viejo">{p.antes}</span>}
      <span className="ed-nuevo">{p.ahora || 'Se quita'}</span>
    </span>
  )
}

const Etiqueta = ({ texto, quita = false }: { texto: string; quita?: boolean }) => (
  <span className={`ed-ab ${quita ? 'ed-ab--quita' : 'ed-ab--nueva'}`}>{texto}</span>
)

/** La lista completa de aberturas de la orden, con lo que la edición cambia o agrega. */
export function ListaAberturasModal({
  filas,
  nueva,
  onClose,
}: {
  filas: FilaListaAbertura[] | null
  /** Ya hay una edición generada con cambios: "Lista nueva de aberturas". */
  nueva: boolean
  onClose: () => void
}) {
  return (
    <Modal
      title={nueva ? 'Lista nueva de aberturas' : 'Lista de aberturas'}
      icon={<i className="fas fa-table-cells-large modal-icon--marca" />}
      className="modal-box--ancho ed-lista-modal"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary btn-marca" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      {nueva && (
        <p className="ed-nota">
          En <span className="ed-viejo">rojo tachado</span>, lo que tenía la orden; en <span className="ed-nuevo">verde</span>, lo
          nuevo.
        </p>
      )}
      <div className="ed-l-scroll">
        {filas === null ? (
          <p className="ed-nota">
            <i className="fas fa-spinner fa-spin" /> Leyendo las aberturas de la orden...
          </p>
        ) : (
          <table className="ed-l-tabla">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Abertura</th>
                <th>Color</th>
                <th>Medidas (mm)</th>
                <th>Cantidad</th>
                <th>Vidrios</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.modelo} className={f.nueva ? 'ed-l-nueva' : undefined}>
                  <td className="ed-l-modelo">
                    {f.modelo} {f.nueva && <Etiqueta texto="Nueva" />}
                  </td>
                  <td>
                    <Dato p={f.descripcion} />
                  </td>
                  <td>
                    <Dato p={f.color} />
                  </td>
                  <td>
                    <Dato p={f.medidas} num />
                  </td>
                  <td>
                    <Dato p={f.cantidad} num />
                  </td>
                  <td>
                    <Dato p={f.vidrios} num />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}

/** La lista completa de vidrios de la orden, abertura por abertura, con lo que la edición cambia. */
export function ListaVidriosModal({
  filas,
  nueva,
  onClose,
}: {
  filas: FilaListaVidrio[] | null
  nueva: boolean
  onClose: () => void
}) {
  return (
    <Modal
      title={nueva ? 'Lista nueva de vidrios' : 'Lista de vidrios'}
      icon={<i className="fas fa-border-all modal-icon--marca" />}
      className="modal-box--ancho ed-lista-modal"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary btn-marca" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      {nueva && (
        <p className="ed-nota">
          En <span className="ed-viejo">rojo tachado</span>, lo que tenía la orden; en <span className="ed-nuevo">verde</span>, lo
          nuevo.
        </p>
      )}
      <div className="ed-l-scroll">
        {filas === null ? (
          <p className="ed-nota">
            <i className="fas fa-spinner fa-spin" /> Leyendo los vidrios de la orden...
          </p>
        ) : filas.length === 0 ? (
          <p className="ed-nota">La orden no tiene vidrios.</p>
        ) : (
          <table className="ed-l-tabla">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Vidrio</th>
                <th>Composición</th>
                <th>Ancho (mm)</th>
                <th>Alto (mm)</th>
                <th>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.modelo}-${f.n}`} className={f.nuevo ? 'ed-l-nueva' : f.quitado ? 'ed-l-quitado' : undefined}>
                  <td className="ed-l-modelo">{f.modelo}</td>
                  <td>
                    Vidrio {f.n} {f.nuevo && <Etiqueta texto="Nuevo" />}
                    {f.quitado && <Etiqueta texto="Se quita" quita />}
                  </td>
                  <td>
                    <Dato p={f.tipo} />
                  </td>
                  <td>
                    <Dato p={f.ancho} num />
                  </td>
                  <td>
                    <Dato p={f.alto} num />
                  </td>
                  <td>
                    <Dato p={f.cantidad} num />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
