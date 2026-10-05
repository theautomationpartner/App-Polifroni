import { useEffect, useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import {
  TIPOS_TURNO,
  admiteSinObra,
  aprobacionPorSaldo,
  defTipo,
  obrasParaTipo,
  type ObraDeCliente,
  type PendienteDeCliente,
  type TipoTurno,
} from '@/lib/agenda'
import { formatoCelular } from '@/lib/destinatario'
import { importe } from '@/lib/format'
import { etiquetaPaso } from '@/lib/pasos'
import { aberturasDeObras, getElementosCliente } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { AprobacionChip, EtapaChip } from './chips'
import { ModalErrorConsulta, conTope } from './ModalErrorConsulta'

/** Filas por página de la tabla de obras o pendientes. */
const POR_PAGINA = 6

const dinero = (n: number | null) => (n === null ? '—' : importe(String(Math.round(n * 100) / 100).replace('.', ',')))

/** Una columna de la tabla: su rótulo, su ancho fijo y cómo se dibuja la celda. */
interface Columna<T> {
  titulo: string
  /** Ancho de la columna (`table-layout: fixed`): no depende de lo que tenga adentro. */
  ancho: string
  centrada?: boolean
  celda: (fila: T) => ReactNode
}

const sd = <span className="ant-sd">—</span>

/** La obra, como el N° y el IDOP de la tabla de órdenes: el nombre arriba y la ubicación abajo. */
const colObra: Columna<ObraDeCliente> = {
  titulo: 'Obra',
  ancho: '34%',
  celda: (o) => (
    <>
      <span className="ant-nro">{o.nombre}</span>
      <span className="ant-detalle">{o.ubicacion || 'Sin ubicación'}</span>
    </>
  ),
}
const colMaterial: Columna<ObraDeCliente> = { titulo: 'Material', ancho: '12%', centrada: true, celda: (o) => o.material || sd }
const colEtapa: Columna<ObraDeCliente> = {
  titulo: 'Etapa de producción',
  ancho: '20%',
  centrada: true,
  celda: (o) => <EtapaChip texto={o.etapa} color={o.etapaColor} />,
}
const colCel: Columna<ObraDeCliente> = {
  titulo: 'Cel a coordinar',
  ancho: '18%',
  centrada: true,
  celda: (o) => (o.celCoordinar ? formatoCelular(o.celCoordinar) : sd),
}
const colSaldo: Columna<ObraDeCliente> = {
  titulo: 'Saldo',
  ancho: '14%',
  centrada: true,
  celda: (o) => <span className={`ant-num ${o.saldo !== null && o.saldo > 0 ? 'ag-saldo-deuda' : ''}`}>{dinero(o.saldo)}</span>,
}
const colAprobacion: Columna<ObraDeCliente> = {
  titulo: 'Aprobación',
  ancho: '14%',
  centrada: true,
  celda: (o) => <AprobacionChip aprobacion={aprobacionPorSaldo(o.saldo)} chico />,
}

/** Lo que muestra la tabla de cada tipo de turno: título, bajada, columnas y qué decir sin filas. */
interface Vista {
  titulo: string
  descripcion: string
  vacio: string
  buscando: string
}

const VISTA: Record<TipoTurno, Vista> = {
  colocacion: {
    titulo: 'Obras a colocar',
    descripcion: 'Las obras del cliente en «A Colocar», con sus aberturas y si están aprobadas por su saldo. Elegí la del turno.',
    vacio: 'El cliente no tiene obras en «A Colocar».',
    buscando: 'Buscando las obras a colocar del cliente...',
  },
  reparacion: {
    titulo: 'Obras del cliente',
    descripcion: 'Todas las obras del cliente. Elegí la que hay que reparar.',
    vacio: 'El cliente no tiene obras.',
    buscando: 'Buscando las obras del cliente...',
  },
  entrega: {
    titulo: 'Pendientes de entrega',
    descripcion: 'Lo vendido al cliente que todavía queda por entregar. Elegí el pendiente del reparto.',
    vacio: 'El cliente no tiene pendientes de entrega.',
    buscando: 'Buscando los pendientes de entrega del cliente...',
  },
  medicion: {
    titulo: 'Obras a medir',
    descripcion: 'Las obras del cliente en «A Medir». Elegí la que se va a medir.',
    vacio: 'El cliente no tiene obras en «A Medir».',
    buscando: 'Buscando las obras a medir del cliente...',
  },
}

/** Sin tipo elegido la tabla se ve igual, con columnas genéricas y la indicación de qué falta. */
const COLUMNAS_SIN_TIPO = [
  { titulo: 'Obra o pendiente', ancho: '40%' },
  { titulo: 'Material', ancho: '15%' },
  { titulo: 'Etapa de producción', ancho: '22%' },
  { titulo: 'Estado', ancho: '23%' },
]

/**
 * Crear Turno · Etapa 2: qué turno y sobre qué.
 *
 * La tabla es la de "Seleccionar OP A Enviar" de Producción: está SIEMPRE, con sus columnas fijas,
 * y se elige UNA fila con su casilla. Elegir el tipo de turno dispara la consulta a Monday —con la
 * animación de búsqueda en la propia tabla— y trae lo que corresponde (RN-03 a RN-06): Colocación,
 * las obras "A Colocar"; Medición, las "A Medir"; Reparación, todas las obras; Entrega/Reparto, los
 * pendientes de entrega. Cada tipo tiene su título, su bajada y sus columnas. Cambiar el tipo
 * descarta lo elegido (RN-02).
 *
 * Colocación y Reparación preguntan además si el turno es CON obra (por defecto: se buscan las obras
 * del cliente) o SIN obra: sin obra no hay tabla ni nada que elegir, y se pasa directo al registro.
 *
 * La tabla va de a 6 filas por página; el paginador está siempre, aunque entren todas en una.
 *
 * La fecha del turno se elige en la etapa siguiente, junto con el registro.
 */
export function CrearTurnoDatosView() {
  const dispatch = useDispatch()
  const { turno } = useApp()
  const { tipo, elementos, aberturas, elementoId, cliente, conObra } = turno
  /** Colocación o Reparación sin obra: no se busca ni se elige nada. */
  const sinObra = admiteSinObra(tipo) && !conObra

  /** Se está consultando Monday por lo que corresponde al tipo elegido. */
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  /** Se intentó continuar sin el tipo: la pregunta queda en rojo y se abre el aviso. */
  const [marcarTipo, setMarcarTipo] = useState(false)
  const [sinTipo, setSinTipo] = useState(false)
  const [sinElegir, setSinElegir] = useState(false)
  const [pagina, setPagina] = useState(0)

  /* Cada vez que se elige un tipo se consulta Monday: lo que se ofrece tiene que ser lo de ahora. */
  useEffect(() => {
    if (!tipo || !cliente || sinObra) return
    let vivo = true
    setBuscando(true)
    setError(false)
    void (async () => {
      try {
        const e = await conTope(getElementosCliente(cliente))
        /* Colocación: las aberturas de cada obra "A Colocar" se calculan acá, antes de mostrarlas. */
        const a = tipo === 'colocacion' ? await conTope(aberturasDeObras(obrasParaTipo('colocacion', e.obras))) : aberturas
        if (!vivo) return
        dispatch({ type: 'setTurno', cambios: { elementos: e, aberturas: a } })
      } catch {
        if (!vivo) return
        setError(true)
        setErrorMonday(`buscar ${VISTA[tipo].titulo.toLowerCase()}`)
      } finally {
        if (vivo) setBuscando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // Se consulta al elegir el tipo (o al reintentar), no cada vez que cambia lo leído.
  }, [tipo, cliente, intento, sinObra, dispatch])

  const def = tipo ? defTipo(tipo) : null
  const vista = tipo ? VISTA[tipo] : null
  const obras = tipo && elementos ? obrasParaTipo(tipo, elementos.obras) : []
  const pendientes = def?.origen === 'pendientes' ? (elementos?.pendientes ?? []) : []

  /* Las columnas de cada tipo. Las aberturas son de Colocación: se calculan al buscar. */
  const colAberturas: Columna<ObraDeCliente> = {
    titulo: 'Aberturas',
    ancho: '12%',
    centrada: true,
    celda: (o) => {
      const n = aberturas?.[o.id]
      return n == null ? <span className="ant-sd" title="La obra no tiene órdenes de producción con aberturas">Sin dato</span> : <span className="ant-num">{n}</span>
    },
  }
  const columnasObra: Columna<ObraDeCliente>[] =
    tipo === 'colocacion'
      ? [{ ...colObra, ancho: '30%' }, colMaterial, colAberturas, colSaldo, colAprobacion, { ...colEtapa, ancho: '18%' }]
      : [{ ...colObra, ancho: '40%' }, { ...colMaterial, ancho: '14%' }, { ...colCel, ancho: '22%' }, { ...colEtapa, ancho: '24%' }]
  const columnasPendiente: Columna<PendienteDeCliente>[] = [
    {
      titulo: 'Producto',
      ancho: '40%',
      celda: (p) => (
        <>
          <span className="ant-nro">{p.producto}</span>
          <span className="ant-detalle">{p.nombre}</span>
        </>
      ),
    },
    { titulo: 'Vendido', ancho: '13%', centrada: true, celda: (p) => <span className="ant-num">{p.vendido}</span> },
    { titulo: 'Entregado', ancho: '13%', centrada: true, celda: (p) => <span className="ant-num">{Math.max(0, p.vendido - p.pendiente)}</span> },
    { titulo: 'Por entregar', ancho: '13%', centrada: true, celda: (p) => <span className="ant-num ant-pend">{p.pendiente}</span> },
    {
      titulo: 'Estado',
      ancho: '21%',
      centrada: true,
      celda: (p) => (
        <span className={`ag-estado-pend ${p.pendiente <= 0 ? 'ag-estado-pend--ok' : ''}`}>
          {p.estado || (p.pendiente <= 0 ? 'Entregado' : 'Pend de Entregar')}
        </span>
      ),
    },
  ]

  const enPendientes = def?.origen === 'pendientes'
  const columnas: { titulo: string; ancho: string; centrada?: boolean }[] = !tipo
    ? COLUMNAS_SIN_TIPO.map((c, i) => ({ ...c, centrada: i > 0 }))
    : enPendientes
      ? columnasPendiente
      : columnasObra
  const span = columnas.length + 1
  const filas = enPendientes ? pendientes.length : obras.length
  const paginas = Math.max(1, Math.ceil(filas / POR_PAGINA))
  /* Si la página quedó fuera de rango (cambió lo leído), se va a la última. */
  const enPagina = Math.min(pagina, paginas - 1)
  const desde = enPagina * POR_PAGINA
  const pendientesVisibles = pendientes.slice(desde, desde + POR_PAGINA)
  const obrasVisibles = obras.slice(desde, desde + POR_PAGINA)
  /** Lo ya entregado se ve —la cuenta lo tiene vinculado— pero no se puede agendar. */
  const elegibles = enPendientes ? pendientes.filter((p) => p.pendiente > 0).length : obras.length

  const elegida = enPendientes
    ? (pendientes.find((p) => p.id === elementoId && p.pendiente > 0) ?? null)
    : (obras.find((o) => o.id === elementoId) ?? null)
  const nombreElegida = elegida ? ('producto' in elegida ? elegida.producto : elegida.nombre) : ''
  const obraElegida = !enPendientes ? (elegida as ObraDeCliente | null) : null
  const noAprobada = tipo === 'colocacion' && obraElegida && aprobacionPorSaldo(obraElegida.saldo) === 'noAprobada'

  const elegir = (id: string, on: boolean) => dispatch({ type: 'setTurno', cambios: { elementoId: on ? null : id } })

  const elegirTipo = (t: TipoTurno) => {
    if (t === tipo) return
    setPagina(0)
    /* Otro tipo es otro turno: vuelve a "Con Obra" y se descarta lo elegido para el anterior. */
    dispatch({ type: 'setTurno', cambios: { tipo: t, conObra: true, elementoId: null, cantAberturas: null, tipoReparacion: '' } })
  }

  const elegirConObra = (con: boolean) => {
    if (con === conObra) return
    setPagina(0)
    dispatch({ type: 'setTurno', cambios: { conObra: con, elementoId: null, cantAberturas: null } })
  }

  const continuar = () => {
    if (!tipo) {
      setMarcarTipo(true)
      setSinTipo(true)
      return
    }
    if (sinObra) {
      dispatch({ type: 'goto', paso: 'envio' })
      return
    }
    if (buscando) return
    if (!elegida) {
      setSinElegir(true)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  const cuerpoAviso = (contenido: ReactNode) => (
    <tr>
      <td colSpan={span} className="ant-aviso">
        {contenido}
      </td>
    </tr>
  )

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Datos del Turno"
        descripcion={
          <>
            Elegí el tipo de turno y sobre qué obra o pendiente es. Cliente:{' '}
            <strong>{cliente?.clienteNombre || cliente?.nombre}</strong>
          </>
        }
      />

      {/* La misma caja de "¿A quién vas a enviarle la orden?", con su borde rojo si falta. A su
          derecha, en Colocación y Reparación, si el turno es con obra o sin obra. */}
      <div className={`accion-cfg destino-cfg ${admiteSinObra(tipo) ? 'ag-cfg-doble' : ''}`}>
        <div className={`cfgbox ${marcarTipo && !tipo ? 'cfgbox--falta' : ''}`}>
          <div className="cfg-ic">
            <i className={`fas ${def?.icono ?? 'fa-calendar-plus'}`} />
          </div>
          <div className="cfg-c">
            <div className="cfg-l">¿Qué tipo de turno vas a agendar?</div>
            <select
              className="cfg-sel"
              aria-label="¿Qué tipo de turno vas a agendar?"
              aria-invalid={(marcarTipo && !tipo) || undefined}
              value={tipo ?? ''}
              disabled={buscando}
              onChange={(e) => elegirTipo(e.target.value as TipoTurno)}
            >
              <option value="" disabled hidden>
                Seleccionar...
              </option>
              {TIPOS_TURNO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        {admiteSinObra(tipo) && (
          <div className="cfgbox">
            <div className="cfg-ic">
              <i className={`fas ${conObra ? 'fa-house-chimney' : 'fa-person-digging'}`} />
            </div>
            <div className="cfg-c">
              <div className="cfg-l">¿El turno es con obra o sin obra?</div>
              <select
                className="cfg-sel"
                aria-label="¿El turno es con obra o sin obra?"
                value={conObra ? 'con' : 'sin'}
                disabled={buscando}
                onChange={(e) => elegirConObra(e.target.value === 'con')}
              >
                <option value="con">Con Obra</option>
                <option value="sin">Sin Obra</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {sinObra ? null : (
      <div className="cobro-static ag-tabla-turno">
        <div className="cobro-card">
          <h3 className="cobro-card-title">{vista?.titulo ?? 'Obras y pendientes del cliente'}</h3>
          <p className="cobro-card-desc">
            {vista?.descripcion ?? 'Elegí arriba el tipo de turno: según cuál sea, se listan las obras o los pendientes que corresponden.'}
          </p>

          {/* La tabla está SIEMPRE, con sus columnas fijas: sin tipo, buscando, vacía o con filas. */}
          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija">
              <colgroup>
                <col className="ant-w-check" />
                {columnas.map((c) => (
                  <col key={c.titulo + c.ancho} style={{ width: c.ancho }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="ant-col-check" />
                  {columnas.map((c, i) => (
                    <th key={`${c.titulo}-${i}`} className={c.centrada ? 'ant-col-cen' : undefined}>
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!tipo
                  ? cuerpoAviso(
                      <>
                        <i className="fas fa-circle-info" /> Elegí el tipo de turno para ver qué se puede agendar.
                      </>,
                    )
                  : buscando
                    ? cuerpoAviso(
                        <>
                          <i className="fas fa-spinner fa-spin" /> {vista?.buscando}
                        </>,
                      )
                    : error
                      ? cuerpoAviso(
                          <>
                            <i className="fas fa-circle-info" /> No se pudo leer desde Monday.{' '}
                            <button type="button" className="cobro-reintentar" onClick={() => setIntento((n) => n + 1)}>
                              Volver a intentar
                            </button>
                          </>,
                        )
                      : filas === 0
                        ? cuerpoAviso(
                            <>
                              <i className="fas fa-circle-info" /> {vista?.vacio}
                            </>,
                          )
                        : enPendientes
                          ? pendientesVisibles.map((p) => {
                              const on = elegida?.id === p.id
                              const vedada = p.pendiente <= 0
                              return (
                                <tr
                                  key={p.id}
                                  className={`ant-row ${on ? 'ant-row--on' : ''} ${vedada ? 'ant-row--off' : ''}`}
                                  title={vedada ? 'Ya está entregado: no queda nada por entregar.' : undefined}
                                >
                                  <td className="ant-col-check">
                                    <input
                                      type="checkbox"
                                      className="ant-check"
                                      checked={on}
                                      disabled={vedada}
                                      onChange={() => elegir(p.id, on)}
                                      aria-label={`Elegir ${p.producto}`}
                                    />
                                  </td>
                                  {columnasPendiente.map((c, i) => (
                                    <td key={i} className={c.centrada ? 'ant-col-cen' : undefined}>
                                      {c.celda(p)}
                                    </td>
                                  ))}
                                </tr>
                              )
                            })
                          : obrasVisibles.map((o) => {
                              const on = elegida?.id === o.id
                              return (
                                <tr key={o.id} className={`ant-row ${on ? 'ant-row--on' : ''}`}>
                                  <td className="ant-col-check">
                                    <input
                                      type="checkbox"
                                      className="ant-check"
                                      checked={on}
                                      onChange={() => elegir(o.id, on)}
                                      aria-label={`Elegir ${o.nombre}`}
                                    />
                                  </td>
                                  {columnasObra.map((c, i) => (
                                    <td key={i} className={c.centrada ? 'ant-col-cen' : undefined}>
                                      {c.celda(o)}
                                    </td>
                                  ))}
                                </tr>
                              )
                            })}
              </tbody>
            </table>
          </div>

          {/* El paginador está siempre, aunque entren todas en una página: así no aparece y
              desaparece al cambiar de tipo. */}
          <div className="obras-pager">
            <button type="button" className="obras-pager-btn" disabled={enPagina === 0} onClick={() => setPagina(enPagina - 1)}>
              <i className="fas fa-chevron-left" /> Anterior
            </button>
            <span className="obras-pager-info">
              Página {enPagina + 1} de {paginas} · {filas}{' '}
              {enPendientes ? (filas === 1 ? 'pendiente' : 'pendientes') : filas === 1 ? 'obra' : 'obras'}
            </span>
            <button
              type="button"
              className="obras-pager-btn"
              disabled={enPagina >= paginas - 1}
              onClick={() => setPagina(enPagina + 1)}
            >
              Siguiente <i className="fas fa-chevron-right" />
            </button>
          </div>

          {/* El renglón de avisos de la tabla de órdenes: reserva su lugar, aparezca o no. */}
          <div className="cobro-card-acts">
            {/* Obra No aprobada: la advertencia del saldo va en este mismo renglón, en lugar de
                "Obra elegida". */}
            {tipo && !buscando && !error && filas > 0 && noAprobada && (
              <span className="cobro-bloqueo-inline cobro-bloqueo-inline--warn">
                <i className="fas fa-triangle-exclamation" />
                <span>
                  La obra tiene saldo pendiente: queda <strong>No aprobada</strong> y el mensaje de asignación incluye el aviso
                  de saldo pendiente.
                </span>
              </span>
            )}
            {tipo && !buscando && !error && filas > 0 && !noAprobada && (
              <span
                className={`cobro-bloqueo-inline ${
                  elegida ? 'cobro-bloqueo-inline--ok' : elegibles === 0 ? '' : 'cobro-bloqueo-inline--info'
                }`}
              >
                <i className={`fas ${elegida ? 'fa-circle-check' : elegibles === 0 ? 'fa-circle-exclamation' : 'fa-circle-info'}`} />{' '}
                {elegida
                  ? `${enPendientes ? 'Pendiente elegido' : 'Obra elegida'}: ${nombreElegida}.`
                  : elegibles === 0
                    ? 'No queda nada por entregar: todos los pendientes ya están entregados.'
                    : `${elegibles} ${enPendientes ? (elegibles === 1 ? 'pendiente' : 'pendientes') : elegibles === 1 ? 'obra' : 'obras'} para elegir. Tildá ${enPendientes ? 'el del turno' : 'la del turno'}.`}
              </span>
            )}
          </div>
        </div>
      </div>
      )}

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'crearTurno')} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {sinTipo && (
        <AvisoModal titulo="Elegí el tipo de turno" onClose={() => setSinTipo(false)}>
          Contestá arriba «¿Qué tipo de turno vas a agendar?»: de eso depende qué obras o pendientes se pueden elegir.
        </AvisoModal>
      )}
      {sinElegir && def && (
        <AvisoModal
          titulo={def.origen === 'pendientes' ? 'Elegí el pendiente a entregar' : 'Elegí la obra del turno'}
          onClose={() => setSinElegir(false)}
        >
          Seleccioná en la tabla {def.origen === 'pendientes' ? 'el pendiente' : 'la obra'} del turno para pasar al registro.
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </section>
  )
}
