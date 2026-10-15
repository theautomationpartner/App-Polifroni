import { useEffect, useId, useState } from 'react'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { conTope } from '@/features/agenda/ModalErrorConsulta'
import { formatoCelular } from '@/lib/destinatario'
import { CAMPOS_FICHA, erroresFicha, type CampoFicha } from '@/lib/fichaContacto'
import { guardarFichaContacto, leerFichaContacto, type FichaContacto } from '@/services/monday'
import type { Contacto, TipoContacto } from '@/services/monday/presupuestos'

const oSinEsp = (v: string) => (v.trim() ? v : 'Sin especificar')

const ROTULO: Record<TipoContacto, { titulo: string; id: string; vacio: string; icono: string; articulo: string }> = {
  Cliente: { titulo: 'Cliente', id: 'ID Cliente', vacio: 'Sin cliente elegido', icono: 'fa-user', articulo: 'el cliente' },
  Constructor: {
    titulo: 'Constructor/Arquitecto',
    id: 'ID Constructor/Arquitecto',
    vacio: 'Sin constructor/arquitecto elegido',
    icono: 'fa-helmet-safety',
    articulo: 'el constructor/arquitecto',
  },
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

/** Un campo del formulario: texto (con su ícono) o, en los estados, el desplegable de la app. */
function CampoContacto({
  campo: c,
  valor,
  opciones,
  error,
  deshabilitado,
  onCambio,
}: {
  campo: CampoFicha
  valor: string
  opciones: string[]
  error?: string
  deshabilitado: boolean
  onCambio: (v: string) => void
}) {
  const uid = useId()
  const icono = c.tipo === 'celular' ? 'fa-whatsapp fab' : c.tipo === 'email' ? 'fa-envelope' : c.id === 'name' ? 'fa-user' : 'fa-id-card'
  return (
    <div className="med-campo">
      <label className="med-l" htmlFor={`${uid}-c`}>
        {c.rotulo}
        {c.requerido ? ' *' : ''}
      </label>
      {c.tipo === 'estado' ? (
        <SelectBuscable
          id={`${uid}-c`}
          valor={valor}
          opciones={opciones.map((o) => ({ valor: o, texto: o }))}
          placeholder={`Elegí ${c.rotulo.toLowerCase()}`}
          disabled={deshabilitado}
          onElegir={onCambio}
        />
      ) : (
        <div className={`med-conic ${error ? 'pres-falta' : ''}`}>
          <i className={icono.includes('fab') ? icono : `fas ${icono}`} aria-hidden="true" />
          <input
            id={`${uid}-c`}
            className="med-input"
            type={c.tipo === 'email' ? 'email' : 'text'}
            inputMode={c.tipo === 'celular' || c.tipo === 'numero' ? 'numeric' : undefined}
            placeholder={c.placeholder}
            value={valor}
            disabled={deshabilitado}
            onChange={(e) => onCambio(e.target.value)}
          />
        </div>
      )}
      {error && <span className="pres-error">{error}</span>}
    </div>
  )
}

/**
 * El formulario de edición de un contacto, desplegado en su card (regla del usuario, 14/10/2026): los
 * datos que ya tiene en Monday, recién leídos. "Guardar" escribe en Monday SÓLO lo que cambió, en una
 * mutation, y la card queda con lo nuevo.
 */
function FormContacto({
  tipo,
  contacto,
  onCancelar,
  onGuardado,
}: {
  tipo: TipoContacto
  contacto: Contacto
  onCancelar: () => void
  onGuardado: (c: Contacto) => void
}) {
  const campos = CAMPOS_FICHA[tipo]
  const [ficha, setFicha] = useState<FichaContacto | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [errorLectura, setErrorLectura] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')

  useEffect(() => {
    let vivo = true
    conTope(leerFichaContacto(tipo, contacto.id))
      .then((f) => {
        if (!vivo) return
        setFicha(f)
        /* El celular, legible como en la card (al guardar se vuelve a dejar en dígitos). */
        setValores(
          Object.fromEntries(
            campos.map((c) => [c.id, c.tipo === 'celular' && f.valores[c.id] ? formatoCelular(f.valores[c.id]) : (f.valores[c.id] ?? '')]),
          ),
        )
      })
      .catch(() => vivo && setErrorLectura(true))
    return () => {
      vivo = false
    }
    // `campos` sale de `tipo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, contacto.id])

  const guardar = async () => {
    if (!ficha || guardando) return
    const e = erroresFicha(campos, valores)
    setErrores(e)
    if (Object.keys(e).length) return
    setGuardando(true)
    setErrorGuardar('')
    try {
      onGuardado(await guardarFichaContacto(tipo, contacto.id, ficha.valores, valores))
    } catch {
      setErrorGuardar('No se pudieron guardar los cambios en Monday. Probá de nuevo en unos segundos.')
    } finally {
      setGuardando(false)
    }
  }

  if (errorLectura) {
    return (
      <div className="pres-ficha-form">
        <p className="pres-error">No se pudieron leer los datos de {ROTULO[tipo].articulo} desde Monday.</p>
        <div className="pres-ficha-form-acc">
          <button type="button" className="btn btn-out" onClick={onCancelar}>
            Volver
          </button>
        </div>
      </div>
    )
  }
  if (!ficha) {
    return (
      <div className="pres-ficha-form pres-ficha-form--leyendo" role="status">
        <i className="fas fa-circle-notch spin" /> Leyendo los datos de {ROTULO[tipo].articulo}...
      </div>
    )
  }
  return (
    /* `carga-grid`: los campos en bordó, como en la carga del presupuesto. */
    <div className="pres-ficha-form carga-grid">
      <div className="pres-ficha-form-campos">
        {campos.map((c) => (
          <CampoContacto
            key={c.id}
            campo={c}
            valor={valores[c.id] ?? ''}
            opciones={ficha.opciones[c.id] ?? []}
            error={errores[c.id]}
            deshabilitado={guardando}
            onCambio={(v) => {
              setValores((x) => ({ ...x, [c.id]: v }))
              setErrores((x) => {
                const { [c.id]: _, ...resto } = x
                return resto
              })
            }}
          />
        ))}
      </div>
      {errorGuardar && <p className="pres-error">{errorGuardar}</p>}
      <div className="pres-ficha-form-acc">
        <button type="button" className="btn btn-out" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary btn-marca" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? (
            <>
              <i className="fas fa-circle-notch spin" /> Guardando...
            </>
          ) : (
            <>
              <i className="fas fa-floppy-disk" /> Guardar
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * La card de un contacto (el cliente o el constructor): arriba qué es, con sus acciones —el lápiz para
 * editarlo y Quitar—; abajo el ID, el nombre, sus datos de contacto y si se le puede enviar. Es la misma
 * ficha del cliente de la Agenda. La card del cliente lleva un borde suave: rojo mientras no hay
 * cliente, verde cuando se cargó uno.
 *
 * La estructura es SIEMPRE la misma, así la card no se achica: sin contacto (nunca elegido o quitado)
 * —y mientras se lee— cada dato es un bloque gris, como la ficha de la obra sin obra elegida, y las
 * acciones quedan apagadas.
 *
 * El lápiz (regla del usuario, 14/10/2026) despliega en la card el formulario con sus datos; al
 * guardar, se escriben en Monday y la card queda con lo nuevo (`onGuardado`).
 */
function ContactoFicha({
  tipo,
  contacto,
  cargando = false,
  onQuitar,
  onGuardado,
}: {
  tipo: TipoContacto
  contacto: Contacto | null
  cargando?: boolean
  onQuitar?: () => void
  onGuardado?: (c: Contacto) => void
}) {
  const r = ROTULO[tipo]
  const [editando, setEditando] = useState(false)
  /* Hay un contacto cargado y a la vista. */
  const lleno = !!contacto && !cargando
  const vacio = !contacto && !cargando
  /* Otro contacto (o ninguno): el formulario se cierra. */
  useEffect(() => setEditando(false), [contacto?.id])
  const puedeEditar = lleno && !!onGuardado
  return (
    <div
      className={[
        'card no-radius cliente-ficha pres-ficha',
        vacio ? 'pres-ficha--vacia' : '',
        editando ? 'pres-ficha--editando' : '',
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
            className={`btn btn-primary pres-ficha-btn pres-ficha-btn--editar pres-ficha-btn--lapiz ${editando ? 'is-on' : ''}`}
            disabled={!puedeEditar}
            aria-label={`Editar ${r.articulo}`}
            aria-expanded={editando}
            title={!lleno ? `Primero elegí ${tipo === 'Cliente' ? 'un cliente' : 'un constructor/arquitecto'}` : `Editar ${r.articulo}`}
            onClick={() => setEditando((x) => !x)}
          >
            <i className="fas fa-pen" aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-out pres-ficha-btn" disabled={!lleno || !onQuitar || editando} onClick={onQuitar}>
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
          {editando && onGuardado && (
            <FormContacto
              tipo={tipo}
              contacto={contacto}
              onCancelar={() => setEditando(false)}
              onGuardado={(c) => {
                setEditando(false)
                onGuardado(c)
              }}
            />
          )}
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
  onGuardado,
}: {
  cliente: Contacto | null
  arquitecto: Contacto | null
  /** Se está leyendo el contacto elegido de ese tipo: su card queda en esqueleto. */
  leyendo?: TipoContacto | null
  onQuitar: (tipo: TipoContacto) => void
  /** Se editó un contacto (ya quedó en Monday). */
  onGuardado?: (tipo: TipoContacto, c: Contacto) => void
}) {
  return (
    <div className="pres-fichas">
      <ContactoFicha
        tipo="Cliente"
        contacto={leyendo === 'Cliente' ? null : cliente}
        cargando={leyendo === 'Cliente'}
        onQuitar={() => onQuitar('Cliente')}
        onGuardado={onGuardado ? (c) => onGuardado('Cliente', c) : undefined}
      />
      <ContactoFicha
        tipo="Constructor"
        contacto={leyendo === 'Constructor' ? null : arquitecto}
        cargando={leyendo === 'Constructor'}
        onQuitar={() => onQuitar('Constructor')}
        onGuardado={onGuardado ? (c) => onGuardado('Constructor', c) : undefined}
      />
    </div>
  )
}
