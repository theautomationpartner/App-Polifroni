import { formatoCelular } from '@/lib/destinatario'
import type { BolsaPresupuesto, Contacto, TipoContacto } from '@/services/monday/presupuestos'

const oSinEsp = (v: string) => (v.trim() ? v : 'Sin especificar')

/** "2026-10-05" → "05/10/2026". */
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

const ROTULO: Record<TipoContacto, { id: string; vacio: string; icono: string }> = {
  Cliente: { id: 'ID Cliente', vacio: 'Sin cliente elegido', icono: 'fa-user' },
  Constructor: { id: 'ID Constructor/Arquitecto', vacio: 'Sin constructor/arquitecto elegido', icono: 'fa-helmet-safety' },
}

/** El punto verde o rojo de la ficha: si al contacto se le puede mandar el presupuesto. */
function EstadoCelular({ celular }: { celular: string }) {
  return (
    <div className="status-indicator">
      <span className="status-dot" style={{ background: celular ? '#00c875' : '#df2f4a' }} />
      {celular ? 'Con celular para enviarle el presupuesto' : 'Sin celular: no se le puede enviar'}
    </div>
  )
}

/**
 * El cliente o el constructor elegido, con la misma ficha del cliente de la Agenda: el ID, el nombre
 * y sus datos de contacto. Mientras se lee, cada caja queda en esqueleto y se rellena al resolverse.
 *
 * Los dos son opcionales (no todos los presupuestos llevan constructor): sin elegir, la ficha lo dice
 * en vez de quedar en esqueleto, que se leería como "cargando".
 */
export function ContactoFicha({
  tipo,
  contacto,
  cargando = false,
  onQuitar,
}: {
  tipo: TipoContacto
  contacto: Contacto | null
  cargando?: boolean
  onQuitar?: () => void
}) {
  const r = ROTULO[tipo]
  if (!contacto && !cargando) {
    return (
      <div className="card no-radius cliente-ficha pres-ficha-vacia">
        <i className={`fas ${r.icono}`} aria-hidden="true" /> {r.vacio}
      </div>
    )
  }
  return (
    <div className={`card no-radius cliente-ficha ${cargando ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {cargando || !contacto ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <div className="badges">
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">
                {r.id}: {contacto.id}
              </span>
              <h2 className="client-name">{contacto.nombre}</h2>
              <div className="badges">
                <span className="badge badge-gray">
                  Cel-WhatsApp: {contacto.celular ? formatoCelular(contacto.celular) : 'Sin cargar'}
                </span>
                <span className="badge badge-gray">E-mail: {oSinEsp(contacto.email)}</span>
              </div>
            </>
          )}
        </div>

        <div className="status-indicators">
          {cargando || !contacto ? (
            <span className="skeleton skeleton--estado" />
          ) : (
            <>
              <EstadoCelular celular={contacto.celular} />
              {onQuitar && (
                <button type="button" className="btn btn-out pres-quitar" onClick={onQuitar}>
                  <i className="fas fa-xmark" /> Quitar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * La bolsa elegida para cargarle otro presupuesto: a quién pertenece y lo que ya se le mandó. Es la
 * misma ficha, con los indicadores del último presupuesto abajo.
 */
export function BolsaFicha({ bolsa, cargando = false }: { bolsa: BolsaPresupuesto | null; cargando?: boolean }) {
  const vacio = !bolsa || cargando
  const ultimo = bolsa?.presupuestos[bolsa.presupuestos.length - 1] ?? null
  const val = (contenido: string | number) =>
    vacio ? <span className="skeleton skeleton--valor" /> : <span className="kpi-value">{contenido}</span>

  return (
    <div className={`card no-radius cliente-ficha ${vacio ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <div className="badges">
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">ID Presupuesto: {bolsa.idPresupuesto || bolsa.id}</span>
              <h2 className="client-name">{bolsa.nombre}</h2>
              <div className="badges">
                <span className={`badge ${bolsa.cliente ? 'badge-green' : 'badge-gray'}`}>
                  Cliente: <strong>{bolsa.cliente?.nombre || 'Sin cliente'}</strong>
                </span>
                <span className={`badge ${bolsa.arquitecto ? 'badge-green' : 'badge-gray'}`}>
                  Constructor/Arquitecto: <strong>{bolsa.arquitecto?.nombre || 'Sin constructor'}</strong>
                </span>
                <span className="badge badge-gray">Enviado a: {oSinEsp(bolsa.enviarA)}</span>
              </div>
            </>
          )}
        </div>

        <div className="status-indicators">
          {vacio ? (
            <span className="skeleton skeleton--estado" />
          ) : (
            <div className="status-indicator">
              <span className="status-dot" style={{ background: '#fdab3d' }} />
              Solicitud de Presupuesto
            </div>
          )}
        </div>
      </div>

      <hr className="divider" />

      <section className="credito-grupo">
        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">Presupuestos cargados</span>
            {val(bolsa?.presupuestos.length ?? 0)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Último envío</span>
            {val(ultimo?.fechaEnvio ? fechaCorta(ultimo.fechaEnvio) : '—')}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Último tipo de carpintería</span>
            {val(ultimo?.tipo || '—')}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Último color</span>
            {val(ultimo?.color || '—')}
          </div>
        </div>
      </section>
    </div>
  )
}
