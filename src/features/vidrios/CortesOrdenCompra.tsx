import type { Corte } from '@/lib/vidrios'

/**
 * Los cortes que van en la orden de compra: los vidrios de todas las órdenes elegidas, juntos —cada
 * renglón es una medida de una composición, con todas sus piezas—.
 *
 * La card mide lo mismo que el resumen de al lado (ver `.vid-cortes-card`): con varias OP la lista
 * crece, y se recorre con su propio scroll, no con el de la página. La cabecera de la tabla y el
 * total quedan siempre a la vista.
 */
export function CortesOrdenCompra({ cortes, error }: { cortes: Corte[] | null; error: boolean }) {
  const total = (cortes ?? []).reduce((n, c) => n + c.cantidad, 0)

  return (
    <div className="card card-pad vid-cortes-card">
      <h3 className="resumen-title">Cortes de la orden de compra</h3>
      <p className="vid-cortes-desc">
        Los vidrios de las órdenes elegidas, juntos: cada renglón es una medida de una composición, con todas sus
        piezas.
      </p>

      <div className="vid-cortes-scroll">
        <table className="ant-tabla vid-cortes">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Composición (mm)</th>
              <th className="vid-num">Ancho</th>
              <th className="vid-num">Alto</th>
              <th className="vid-num">Piezas</th>
            </tr>
          </thead>
          <tbody>
            {cortes === null ? (
              <tr>
                <td colSpan={5} className="ant-aviso">
                  <i className="fas fa-spinner fa-spin" /> Armando la solicitud...
                </td>
              </tr>
            ) : cortes.length === 0 ? (
              <tr>
                <td colSpan={5} className="ant-aviso">
                  <i className="fas fa-circle-info" />{' '}
                  {error ? 'No se pudieron leer los vidrios desde Monday.' : 'Las órdenes elegidas no tienen vidrios.'}
                </td>
              </tr>
            ) : (
              cortes.map((c) => (
                <tr key={`${c.composicion}|${c.ancho}|${c.alto}`} className="ant-row" title={c.origen.join('\n')}>
                  <td>
                    <span className={`vid-tipo ${c.dvh ? 'vid-tipo--dvh' : ''}`}>{c.dvh ? 'DVH' : 'Simple'}</span>
                  </td>
                  <td>
                    {c.dvh ? (
                      <span className="vid-capas" title="Vidrio 1 · Cámara · Vidrio 2">
                        <span className="vid-capa">{c.comp1 || '—'}</span>
                        <span className="vid-capa vid-capa--camara">{c.camara || '—'}</span>
                        <span className="vid-capa">{c.comp2 || '—'}</span>
                      </span>
                    ) : (
                      <span className="vid-capas">
                        <span className="vid-capa">{c.composicion}</span>
                      </span>
                    )}
                  </td>
                  <td className="vid-num">{c.ancho}</td>
                  <td className="vid-num">{c.alto}</td>
                  <td className="vid-num vid-cant">
                    {c.cantidad}
                    {c.sinCantidad && (
                      <i className="fas fa-triangle-exclamation vid-falta-ic" title="Algún vidrio no trae la cantidad: revisala" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {cortes && cortes.length > 0 && (
        <div className="vid-cortes-total">
          <span>
            Total · {cortes.length} {cortes.length === 1 ? 'corte' : 'cortes'}
          </span>
          <span className="vid-cant">
            {total} {total === 1 ? 'pieza' : 'piezas'}
          </span>
        </div>
      )}
    </div>
  )
}
