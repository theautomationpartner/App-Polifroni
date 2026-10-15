import { useEffect, useId, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { conTope } from '@/features/agenda/ModalErrorConsulta'
import {
  CLAVES_ALTA,
  DATO_NO_ENCONTRADO,
  ROTULO_ALTA,
  alVacio,
  cuitValido,
  desdeArca,
  erroresAlta,
  formatoCuit,
  soloDigitos,
  type ClaveAlta,
  type TipoAlta,
  type ValoresAlta,
} from '@/lib/altaContacto'
import { consultarArca, type DatosDeArca } from '@/services/arca'
import { crearContacto, existeContactoConCuit, leerOpcionesAlta, type OpcionesAlta } from '@/services/monday/altaContacto'
import type { Contacto } from '@/services/monday/presupuestos'

const PESTANAS: { tipo: TipoAlta; texto: string; icono: string }[] = [
  { tipo: 'Cliente', texto: 'Cliente', icono: 'fa-user' },
  { tipo: 'Constructor', texto: 'Constructor/Arquitecto', icono: 'fa-helmet-safety' },
]

const ICONO: Partial<Record<ClaveAlta, string>> = {
  nombre: 'fa-user',
  cuit: 'fa-id-card',
  celular: 'fa-whatsapp fab',
  email: 'fa-envelope',
}

const CUIT_INVALIDO = 'El CUIT o CUIL no es válido: revisá los 11 números.'

type Consulta = { estado: 'sin' | 'consultando' | 'ok' | 'error'; mensaje: string; datoViejo: boolean }
const SIN_CONSULTA: Consulta = { estado: 'sin', mensaje: '', datoViejo: false }

/** Un campo del formulario: texto con su ícono o, en los estados, el desplegable de la app. */
function Campo({
  clave,
  valor,
  opciones,
  error,
  deshabilitado,
  onCambio,
}: {
  clave: ClaveAlta
  valor: string
  /** Las etiquetas del tablero, si el campo es un estado. */
  opciones?: string[]
  /** El texto en rojo debajo del campo. Con él, el borde también va en rojo. */
  error?: string
  deshabilitado: boolean
  onCambio: (v: string) => void
}) {
  const uid = useId()
  const icono = ICONO[clave] ?? 'fa-id-card'
  return (
    <div className="med-campo">
      <label className="med-l" htmlFor={`${uid}-c`}>
        {ROTULO_ALTA[clave]}
        {clave === 'nombre' || clave === 'cuit' ? ' *' : ''}
      </label>
      {opciones ? (
        <SelectBuscable
          id={`${uid}-c`}
          valor={valor}
          opciones={opciones.map((o) => ({ valor: o, texto: o }))}
          placeholder={`Elegí ${ROTULO_ALTA[clave].toLowerCase()}`}
          cargando={opciones.length === 0}
          disabled={deshabilitado}
          falta={!!error}
          onElegir={onCambio}
        />
      ) : (
        <div className={`med-conic ${error ? 'pres-falta' : ''}`}>
          <i className={icono.includes('fab') ? icono : `fas ${icono}`} aria-hidden="true" />
          <input
            id={`${uid}-c`}
            className="med-input"
            type={clave === 'email' ? 'email' : 'text'}
            inputMode={clave === 'celular' || clave === 'cuit' ? 'numeric' : undefined}
            placeholder={clave === 'cuit' ? '20-12345678-9' : clave === 'celular' ? 'Ej.: 249 436-9123' : undefined}
            autoComplete="off"
            value={valor}
            disabled={deshabilitado}
            aria-invalid={!!error}
            onChange={(e) => onCambio(e.target.value)}
          />
        </div>
      )}
      {error && <span className="pres-error pres-alta-error">{error}</span>}
    </div>
  )
}

/**
 * El alta de un cliente o de un constructor/arquitecto (regla del usuario, 15/10/2026): dos pestañas, una por
 * tablero, con sus campos. El flujo obliga a depender de ARCA primero: al escribir un CUIT/CUIL válido se
 * consulta el padrón y se completan solos la razón social, la condición fiscal y el tipo. Lo que ARCA no trae
 * queda con borde rojo y la frase «No se encontro este dato en la consulta», y se completa a mano.
 *
 * Aceptar no guarda sin una consulta a ARCA intentada y sin los datos válidos. Volver (o la X) cierra y no
 * deja nada: todo el estado vive acá y se descarta con la ventana.
 */
export function ModalAltaContacto({
  cuitInicial,
  onVolver,
  onCreado,
}: {
  /** Lo que se buscó, si era un CUIT/CUIL: el formulario arranca con él. */
  cuitInicial: string
  onVolver: () => void
  /** El contacto ya está en Monday: quien llama lo pone en su card y cierra. */
  onCreado: (tipo: TipoAlta, contacto: Contacto) => void
}) {
  const [tipo, setTipo] = useState<TipoAlta>('Cliente')
  const [v, setV] = useState<ValoresAlta>(() => ({ ...alVacio(), cuit: formatoCuit(cuitInicial) }))
  const [opciones, setOpciones] = useState<Partial<Record<TipoAlta, OpcionesAlta>>>({})
  const [errorOpciones, setErrorOpciones] = useState(false)
  const [consulta, setConsulta] = useState<Consulta>(SIN_CONSULTA)
  const [datosArca, setDatosArca] = useState<DatosDeArca | null>(null)
  /** Hubo una consulta a ARCA para el CUIT que está escrito (con o sin éxito). */
  const [consultado, setConsultado] = useState(false)
  const [errores, setErrores] = useState<Partial<Record<ClaveAlta, string>>>({})
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [reintento, setReintento] = useState(0)

  /** Los campos que completó ARCA (y no el usuario): cambian o se vacían con otro CUIT. */
  const deArca = useRef(new Set<ClaveAlta>())
  /** El CUIT (en dígitos) con que se consultó. Sirve para descartar respuestas viejas y para no repetir. */
  const consultadoCon = useRef('')
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  /* Las opciones de cada tablero: llegan una vez, para los desplegables y para traducir lo de ARCA. */
  useEffect(() => {
    if (opciones[tipo]) return
    let activo = true
    conTope(leerOpcionesAlta(tipo))
      .then((o) => activo && setOpciones((x) => ({ ...x, [tipo]: o })))
      .catch(() => activo && setErrorOpciones(true))
    return () => {
      activo = false
    }
  }, [tipo, opciones])

  /* El CUIT válido dispara la consulta; uno que deja de serlo descarta lo que había traído. */
  const cuitDigitos = soloDigitos(v.cuit)
  useEffect(() => {
    if (!cuitValido(cuitDigitos)) {
      if (consultadoCon.current) {
        consultadoCon.current = ''
        setConsultado(false)
        setDatosArca(null)
        setConsulta(SIN_CONSULTA)
        setV((x) => {
          const limpio = { ...x }
          for (const k of deArca.current) limpio[k] = ''
          return limpio
        })
        deArca.current.clear()
      }
      return
    }
    if (consultadoCon.current === cuitDigitos) return
    consultadoCon.current = cuitDigitos
    setConsulta({ estado: 'consultando', mensaje: '', datoViejo: false })
    void consultarArca(cuitDigitos).then((r) => {
      if (!vivo.current || consultadoCon.current !== cuitDigitos) return
      setConsultado(true)
      if (r.ok) {
        setDatosArca(r.datos)
        setConsulta({ estado: 'ok', mensaje: '', datoViejo: r.datos.datoViejo })
      } else {
        setDatosArca(null)
        setConsulta({ estado: 'error', mensaje: r.mensaje, datoViejo: false })
      }
    })
  }, [cuitDigitos, reintento])

  /* Lo que trajo ARCA va a los campos, con las etiquetas de ESTE tablero (al cambiar de pestaña se vuelve a
     traducir). Pisa lo que ARCA completó antes y los vacíos; nunca lo que el usuario escribió. */
  const opcionesTipo = opciones[tipo]
  useEffect(() => {
    if (!datosArca || !opcionesTipo) return
    const nuevo = desdeArca(datosArca, opcionesTipo)
    setV((x) => {
      const r = { ...x }
      for (const k of ['nombre', 'tipo', 'condicion'] as const) {
        const propio = deArca.current.has(k)
        const dato = nuevo[k]
        if (dato && (propio || !x[k])) {
          r[k] = dato
          deArca.current.add(k)
        } else if (!dato && propio) {
          r[k] = ''
          deArca.current.delete(k)
        }
      }
      return r
    })
  }, [datosArca, opcionesTipo])

  const cambiar = (clave: ClaveAlta, valor: string) => {
    deArca.current.delete(clave)
    setV((x) => ({ ...x, [clave]: clave === 'cuit' ? formatoCuit(valor) : valor }))
    setErrores((x) => ({ ...x, [clave]: undefined }))
    setErrorGuardar('')
  }

  const cambiarPestana = (t: TipoAlta) => {
    if (t === tipo || guardando) return
    setTipo(t)
    setErrores({})
    setErrorGuardar('')
    /* La categoría es sólo del constructor y los estados cambian de etiquetas entre tableros: lo que no
       existe en el otro se descarta (ARCA lo vuelve a traducir). */
    setV((x) => ({ ...x, categoria: '' }))
  }

  const opcionesDe = (clave: ClaveAlta): string[] | undefined => {
    if (clave !== 'tipo' && clave !== 'condicion' && clave !== 'categoria') return undefined
    return opcionesTipo?.[clave] ?? []
  }

  /** El texto rojo de un campo: el error de formato o de lo que falta, o «No se encontro…» si ARCA no lo trajo. */
  const textoRojo = (clave: ClaveAlta): string | undefined => {
    if (errores[clave]) return errores[clave]
    if (clave === 'cuit') return cuitDigitos.length === 11 && !cuitValido(cuitDigitos) ? CUIT_INVALIDO : undefined
    /* Los estados se completan recién cuando se conocen las etiquetas del tablero. */
    if (!opcionesTipo && (clave === 'tipo' || clave === 'condicion')) return undefined
    if (consultado && consulta.estado !== 'consultando' && !v[clave].trim()) return DATO_NO_ENCONTRADO
    return undefined
  }

  const aceptar = async () => {
    if (guardando) return
    setErrorGuardar('')
    if (!cuitValido(cuitDigitos)) {
      setErrores({ cuit: v.cuit.trim() ? CUIT_INVALIDO : 'Ingresá el CUIT o CUIL.' })
      return
    }
    if (!consultado) {
      setErrorGuardar('Primero hay que consultar ARCA con el CUIT o CUIL. Esperá a que termine la consulta.')
      return
    }
    const e = erroresAlta(tipo, v)
    /* Una etiqueta que el tablero no tiene (quedó de la otra pestaña) haría fallar el alta entera. */
    for (const k of ['tipo', 'condicion', 'categoria'] as const) {
      if (v[k] && opcionesTipo && !opcionesTipo[k].includes(v[k])) e[k] = 'Elegí una opción de la lista.'
    }
    if (!opcionesTipo) {
      setErrorGuardar('Todavía no se leyeron las opciones del tablero. Probá de nuevo en unos segundos.')
      return
    }
    setErrores(e)
    if (Object.keys(e).length) return
    setGuardando(true)
    try {
      const existente = await conTope(existeContactoConCuit(tipo, cuitDigitos))
      if (existente) {
        setErrores({ cuit: `Ya existe «${existente.nombre}» con este CUIT o CUIL en el tablero de ${tipo === 'Cliente' ? 'Clientes' : 'Constructor/Arquitecto'}.` })
        return
      }
      const contacto = await conTope(crearContacto(tipo, v))
      if (vivo.current) onCreado(tipo, contacto)
    } catch {
      if (vivo.current) setErrorGuardar('No se pudo guardar en Monday. Probá de nuevo en unos segundos.')
    } finally {
      if (vivo.current) setGuardando(false)
    }
  }

  const consultando = consulta.estado === 'consultando'

  /** Vuelve a consultar el mismo CUIT (la consulta anterior falló). */
  const reintentar = () => {
    consultadoCon.current = ''
    setReintento((n) => n + 1)
  }

  return (
    <Modal
      title="Alta nueva"
      icon={<i className="fas fa-user-plus ag-icono-verde" />}
      onClose={() => !guardando && onVolver()}
      className="ag-modal pres-modal pres-alta"
      actions={
        <>
          <button type="button" className="btn btn-out" disabled={guardando} onClick={onVolver}>
            Volver
          </button>
          <button
            type="button"
            className="btn btn-primary btn-marca"
            disabled={guardando || consultando}
            onClick={() => void aceptar()}
          >
            {guardando ? (
              <>
                <i className="fas fa-circle-notch spin" /> Guardando...
              </>
            ) : (
              'Aceptar'
            )}
          </button>
        </>
      }
    >
      <div className="pres-alta-tabs" role="tablist" aria-label="Tipo de alta">
        {PESTANAS.map((p) => (
          <button
            key={p.tipo}
            type="button"
            role="tab"
            aria-selected={tipo === p.tipo}
            className={`pres-alta-tab ${tipo === p.tipo ? 'pres-alta-tab--on' : ''}`}
            disabled={guardando}
            onClick={() => cambiarPestana(p.tipo)}
          >
            <i className={`fas ${p.icono}`} aria-hidden="true" /> {p.texto}
          </button>
        ))}
      </div>

      <p className="pres-alta-ayuda" role="status" aria-live="polite">
        {consultando ? (
          <>
            <i className="fas fa-circle-notch spin" /> Consultando ARCA...
          </>
        ) : consulta.estado === 'ok' ? (
          <>
            <i className="fas fa-circle-check pres-alta-ok" /> Datos traídos de ARCA
            {consulta.datoViejo ? ' (ARCA no respondió: son los últimos datos que se conocían)' : ''}. Completá lo que falte.
          </>
        ) : consulta.estado === 'error' ? (
          <>
            <span className="pres-error">{consulta.mensaje}</span>{' '}
            <button type="button" className="pres-alta-reintentar" onClick={reintentar}>
              Reintentar consulta
            </button>
          </>
        ) : (
          'Escribí el CUIT o CUIL: ARCA completa el resto.'
        )}
      </p>

      <div className="carga-grid pres-alta-campos">
        {CLAVES_ALTA[tipo].map((clave) => (
          <Campo
            key={`${tipo}-${clave}`}
            clave={clave}
            valor={v[clave]}
            opciones={opcionesDe(clave)}
            error={textoRojo(clave)}
            deshabilitado={guardando}
            onCambio={(x) => cambiar(clave, x)}
          />
        ))}
      </div>

      {errorOpciones && !opcionesTipo && (
        <p className="pres-error">No se pudieron leer las opciones del tablero desde Monday. Cerrá y probá de nuevo.</p>
      )}
      {errorGuardar && <p className="pres-error">{errorGuardar}</p>}
    </Modal>
  )
}
