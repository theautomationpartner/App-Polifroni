import { ETAPA_A_COLOCAR, ETAPA_A_MEDIR } from '@/lib/agenda'
import { formatoCelular } from '@/lib/destinatario'
import type { ClienteTurno, ElementosCliente } from '@/services/monday/agenda'

const oSinEsp = (v: string) => (v.trim() ? v : 'Sin especificar')

const cuantas = (e: ElementosCliente | null, etapa: string) =>
  e ? e.obras.filter((o) => o.etapa.trim().toLowerCase() === etapa.toLowerCase()).length : 0

/**
 * El cliente elegido, con la misma ficha de la obra en Producción (`ObraFichaCliente`): arriba el
 * ID, el nombre y sus datos de contacto; abajo, cuántas obras y pendientes tiene para agendar.
 *
 * La ESTRUCTURA se muestra siempre: sin cliente —o mientras se lee— cada caja queda en esqueleto y
 * se rellena al resolverse, así la pantalla no salta.
 */
export function ClienteFicha({
  cliente,
  elementos,
  cargando = false,
}: {
  cliente: ClienteTurno | null
  elementos: ElementosCliente | null
  cargando?: boolean
}) {
  const vacio = !cliente || cargando
  const val = (contenido: string | number, clase = '') =>
    vacio ? <span className="skeleton skeleton--valor" /> : <span className={`kpi-value ${clase}`}>{contenido}</span>
  const pendientes = elementos ? elementos.pendientes.filter((p) => p.pendiente > 0).length : 0

  return (
    <div className={`card no-radius cliente-ficha ${vacio ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <span className="skeleton skeleton--linea skeleton--medio" />
              <div className="badges">
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">ID Cta Cte: {cliente.id}</span>
              <h2 className="client-name">{cliente.nombre}</h2>
              <span className="client-address">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c4cf1" strokeWidth="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Dirección: {oSinEsp(cliente.ubicacion)}
              </span>
              <div className="badges">
                {/* El cliente que queda vinculado en el turno: el asignado en la cuenta corriente. */}
                <span className={`badge ${cliente.clienteId ? 'badge-green' : 'badge--cond'}`}>
                  Cliente asignado: <strong>{cliente.clienteNombre || 'Sin cliente asignado'}</strong>
                </span>
                <span className="badge badge-gray">
                  Cel-WhatsApp: {cliente.celular ? formatoCelular(cliente.celular) : 'Sin cargar'}
                </span>
                <span className="badge badge-gray">E-mail: {oSinEsp(cliente.email)}</span>
              </div>
            </>
          )}
        </div>

        <div className="status-indicators">
          {vacio ? (
            <span className="skeleton skeleton--estado" />
          ) : (
            <div className="status-indicator">
              <span className="status-dot" style={{ background: cliente.celular ? '#00c875' : '#df2f4a' }} />
              {cliente.celular ? 'Con celular para avisarle el turno' : 'Sin celular: no se le pueden mandar avisos'}
            </div>
          )}
        </div>
      </div>

      <hr className="divider" />

      <section className="credito-grupo">
        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">Obras del cliente</span>
            {val(elementos?.obras.length ?? 0)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Obras a colocar</span>
            {val(cuantas(elementos, ETAPA_A_COLOCAR))}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Obras a medir</span>
            {val(cuantas(elementos, ETAPA_A_MEDIR))}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Pendientes de entrega</span>
            {val(pendientes)}
          </div>
        </div>
      </section>
    </div>
  )
}
