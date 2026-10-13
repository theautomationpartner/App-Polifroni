import { useEffect, useState } from 'react'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { Modal } from '@/components/ui/Modal'
import { ordenesDeObra, type ResumenOrden } from '@/services/monday'

/** Una OP elegida para el turno: su id y su nombre, para la constancia. */
export interface OpElegida {
  id: string
  nombre: string
}

/** Cómo se nombra una OP en la constancia y en el resumen: "N° 2291 · IDOP-059". */
export const nombreOp = (o: ResumenOrden): string =>
  [o.numero ? `N° ${o.numero}` : '', o.idOp].filter(Boolean).join(' · ') || o.nombre

/** Las OP que ya no van a un turno: las canceladas y las de producción completada. */
const OP_FUERA = new Set(['cancelada', 'completada'])

/**
 * "Ver OP": las órdenes de producción de una obra, en una ventana superpuesta a la del turno. Se
 * pueden tildar varias para vincularlas al turno, y es OPCIONAL: cerrarla sin elegir nada no frena
 * nada. Muestra el número de orden y el estado de cada una; no lista las canceladas ni las de
 * producción completada.
 */
export function ModalOrdenes({
  obraNombre,
  ordenesIds,
  elegidas,
  onListo,
  onClose,
}: {
  obraNombre: string
  ordenesIds: string[]
  elegidas: string[]
  onListo: (ops: OpElegida[]) => void
  onClose: () => void
}) {
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [error, setError] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(elegidas))

  useEffect(() => {
    let vivo = true
    ordenesDeObra(ordenesIds)
      .then((l) => vivo && setOrdenes(l.filter((o) => !OP_FUERA.has(o.estadoOrden))))
      .catch(() => {
        if (!vivo) return
        setOrdenes([])
        setError(true)
      })
    return () => {
      vivo = false
    }
  }, [ordenesIds])

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const listo = () =>
    onListo((ordenes ?? []).filter((o) => marcadas.has(o.id)).map((o) => ({ id: o.id, nombre: nombreOp(o) })))

  return (
    <Modal
      title="Órdenes de producción de la obra"
      icon={<i className="fas fa-industry modal-icon--info" />}
      onClose={onClose}
      className="ag-modal ag-modal-ops anticipos-v2"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn btn-primary btn-marca" disabled={ordenes === null} onClick={listo}>
            <i className="fas fa-check" /> Vincular {marcadas.size === 1 ? '1 orden' : `${marcadas.size} órdenes`}
          </button>
        </>
      }
    >
      <p className="modal-clave">{obraNombre}</p>
      <p className="modal-nota">Tildá las órdenes que van con este turno. Es opcional.</p>
      <div className="ant-tabla-wrap">
        <table className="ant-tabla ant-tabla--fija">
          <colgroup>
            <col className="ant-w-check" />
            <col style={{ width: '55%' }} />
            <col style={{ width: '45%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="ant-col-check" />
              <th>Número de orden</th>
              <th className="ant-col-cen">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ordenes === null ? (
              <tr>
                <td colSpan={3} className="ant-aviso">
                  <i className="fas fa-spinner fa-spin" /> Buscando las órdenes de la obra...
                </td>
              </tr>
            ) : ordenes.length === 0 ? (
              <tr>
                <td colSpan={3} className="ant-aviso">
                  <i className="fas fa-circle-info" />{' '}
                  {error
                    ? 'No se pudieron leer las órdenes desde Monday.'
                    : 'La obra no tiene órdenes de producción vigentes (las canceladas y las de producción completada no se listan).'}
                </td>
              </tr>
            ) : (
              ordenes.map((o) => {
                const on = marcadas.has(o.id)
                return (
                  <tr key={o.id} className={`ant-row ${on ? 'ant-row--on' : ''}`}>
                    <td className="ant-col-check">
                      <input
                        type="checkbox"
                        className="ant-check"
                        checked={on}
                        onChange={() => alternar(o.id)}
                        aria-label={`Elegir ${nombreOp(o)}`}
                      />
                    </td>
                    <td>
                      <span className="ant-nro">{o.numero ? `N° ${o.numero}` : 'Sin N°'}</span>
                      <span className="ant-detalle">{[o.idOp, o.tipo].filter(Boolean).join(' · ') || '—'}</span>
                    </td>
                    <td className="ant-col-cen">
                      <EstadoOrdenBadge estado={o.estadoOrden} chico />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
