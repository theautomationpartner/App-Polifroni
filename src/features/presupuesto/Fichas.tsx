import { formatoCelular } from '@/lib/destinatario'
import type { Contacto, TipoContacto } from '@/services/monday/presupuestos'

const oSinEsp = (v: string) => (v.trim() ? v : 'Sin especificar')

const ROTULO: Record<TipoContacto, { titulo: string; id: string; vacio: string; icono: string }> = {
  Cliente: { titulo: 'Cliente', id: 'ID Cliente', vacio: 'Sin cliente elegido', icono: 'fa-user' },
  Constructor: {
    titulo: 'Constructor/Arquitecto',
    id: 'ID Constructor/Arquitecto',
    vacio: 'Sin constructor/arquitecto elegido',
    icono: 'fa-helmet-safety',
  },
}

/** La card única de "cargar sobre uno existente" antes de elegir: puede ser cualquiera de los dos. */
const ROTULO_UNICO = {
  titulo: 'Cliente o Constructor/Arquitecto',
  id: 'ID',
  vacio: 'Sin cliente ni constructor/arquitecto elegido',
  icono: 'fa-address-card',
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
 * La card de un contacto (el cliente o el constructor): arriba qué es, con sus acciones —Editar y
 * Quitar—; abajo el ID, el nombre, sus datos de contacto y si se le puede enviar. Es la misma ficha del
 * cliente de la Agenda. La card del cliente lleva un borde suave: rojo mientras no hay cliente, verde
 * cuando se cargó uno.
 *
 * La estructura es SIEMPRE la misma, así la card no se achica: sin contacto (nunca elegido o quitado)
 * —y mientras se lee— cada dato es un bloque gris, como la ficha de la obra sin obra elegida, y las
 * acciones quedan apagadas.
 *
 * Editar: su comportamiento lo define el usuario más adelante. Sin `onEditar` queda apagado.
 */
function ContactoFicha({
  tipo,
  contacto,
  cargando = false,
  onQuitar,
  onEditar,
}: {
  /** `null`: la card única, todavía sin saber si va un cliente o un constructor. */
  tipo: TipoContacto | null
  contacto: Contacto | null
  cargando?: boolean
  onQuitar?: () => void
  onEditar?: () => void
}) {
  const r = tipo ? ROTULO[tipo] : ROTULO_UNICO
  /* Hay un contacto cargado y a la vista. */
  const lleno = !!contacto && !cargando
  const vacio = !contacto && !cargando
  return (
    <div
      className={[
        'card no-radius cliente-ficha pres-ficha',
        vacio ? 'pres-ficha--vacia' : '',
        /* El cliente (o la card única) se marca: rojo suave hasta que se carga uno, verde con él. */
        tipo !== 'Constructor' && !cargando ? (contacto ? 'pres-ficha--ok' : 'pres-ficha--falta') : '',
      ].join(' ')}
    >
      <div className="pres-ficha-cab">
        <h3 className="carga-sec-t">
          <i className={`fas ${r.icono}`} aria-hidden="true" /> {r.titulo}
        </h3>
        <div className="pres-ficha-acc">
          <button
            type="button"
            className="btn btn-primary pres-ficha-btn pres-ficha-btn--editar"
            disabled={!lleno || !onEditar}
            title={!lleno ? `Primero elegí ${tipo === 'Cliente' ? 'un cliente' : tipo ? 'un constructor/arquitecto' : 'un cliente o un constructor/arquitecto'}` : onEditar ? `Editar el ${r.titulo.toLowerCase()}` : 'Disponible próximamente'}
            onClick={onEditar}
          >
            <i className="fas fa-pen" /> Editar
          </button>
          <button type="button" className="btn btn-out pres-ficha-btn" disabled={!lleno || !onQuitar} onClick={onQuitar}>
            <i className="fas fa-xmark" /> Quitar
          </button>
        </div>
      </div>

      {lleno ? (
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
          <EstadoCelular celular={contacto.celular} />
        </>
      ) : (
        /* Sin contacto (o mientras se lee): cada dato es un bloque gris, como la ficha de la obra sin
           obra elegida. Van dentro de los MISMOS elementos y con su misma altura: la card no se achica. */
        <>
          <span className="client-id" aria-hidden="true">
            <span className="skeleton pres-sk pres-sk--id" />
          </span>
          <h2 className="client-name" aria-label={r.vacio}>
            <span className="skeleton pres-sk pres-sk--nombre" />
          </h2>
          <div className="badges" aria-hidden="true">
            <span className="skeleton pres-sk pres-sk--badge" />
            <span className="skeleton pres-sk pres-sk--badge" />
          </div>
          <div className="status-indicator" aria-hidden="true">
            <span className="skeleton pres-sk pres-sk--estado" />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * El cliente y el constructor/arquitecto elegidos, en UN componente: las dos cards lado a lado (una
 * debajo de la otra si no hay ancho).
 */
export function ContactosFichas({
  cliente,
  arquitecto,
  leyendo = null,
  onQuitar,
  onEditar,
}: {
  cliente: Contacto | null
  arquitecto: Contacto | null
  /** Se está leyendo el contacto elegido de ese tipo: su card queda en esqueleto. */
  leyendo?: TipoContacto | null
  onQuitar: (tipo: TipoContacto) => void
  onEditar?: (tipo: TipoContacto) => void
}) {
  return (
    <div className="pres-fichas">
      <ContactoFicha
        tipo="Cliente"
        contacto={leyendo === 'Cliente' ? null : cliente}
        cargando={leyendo === 'Cliente'}
        onQuitar={() => onQuitar('Cliente')}
        onEditar={onEditar ? () => onEditar('Cliente') : undefined}
      />
      <ContactoFicha
        tipo="Constructor"
        contacto={leyendo === 'Constructor' ? null : arquitecto}
        cargando={leyendo === 'Constructor'}
        onQuitar={() => onQuitar('Constructor')}
        onEditar={onEditar ? () => onEditar('Constructor') : undefined}
      />
    </div>
  )
}

/**
 * Cargar otro presupuesto sobre uno ya existente: UNA sola card, la del contacto que se buscó —el
 * cliente o el constructor/arquitecto—. Sin elegir, la card no dice de qué tipo es.
 */
export function ContactoUnicoFicha({
  cliente,
  arquitecto,
  leyendo = null,
  onQuitar,
  onEditar,
}: {
  cliente: Contacto | null
  arquitecto: Contacto | null
  leyendo?: TipoContacto | null
  onQuitar: (tipo: TipoContacto) => void
  onEditar?: (tipo: TipoContacto) => void
}) {
  const tipo: TipoContacto | null = leyendo ?? (cliente ? 'Cliente' : arquitecto ? 'Constructor' : null)
  const contacto = leyendo ? null : (cliente ?? arquitecto)
  return (
    <div className="pres-fichas pres-fichas--unica">
      <ContactoFicha
        tipo={tipo}
        contacto={contacto}
        cargando={!!leyendo}
        onQuitar={tipo ? () => onQuitar(tipo) : undefined}
        onEditar={tipo && onEditar ? () => onEditar(tipo) : undefined}
      />
    </div>
  )
}
