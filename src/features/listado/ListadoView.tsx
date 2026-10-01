import { useCallback, useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { CuentaBadge, EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader } from '@/features/shared/PasoHeader'
import { nombreOrden } from '@/features/shared/nombreOrden'
import {
  FILTROS_CONSULTA,
  VISTA_ESTADO,
  accionesDe,
  admite,
  type AccionOrden,
  type EstadoOrden,
} from '@/lib/estadosOp'
import { normalizar } from '@/lib/texto'
import {
  cancelarOrden,
  cuentasDeObras,
  getObra,
  getUrlArchivo,
  leerOrden,
  listarOrdenes,
  type CuentaDeObra,
  type ResumenOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'

/** Renglones por página. Con la página llena de huecos, los botones del pie no se mueven. */
const POR_PAGINA = 10

type Filtro = EstadoOrden | 'todas'

/** Cómo se ofrece cada acción rápida en el renglón. */
const BOTON: Record<Exclude<AccionOrden, 'cancelar'>, { texto: string; icono: string }> = {
  enviar: { texto: 'Enviar', icono: 'fa-paper-plane' },
  reenviar: { texto: 'Reenviar', icono: 'fa-rotate-right' },
  taller: { texto: 'A taller', icono: 'fa-industry' },
}

const fechaCorta = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''

/**
 * Consultar órdenes de producción.
 *
 * Lee el tablero de ÓRDENES, no el de obras: la pregunta es "¿en qué está cada OP?", y una obra
 * puede tener varias, cada una en su punto. Por eso cada renglón es una orden, con su obra y la
 * cuenta del cliente al lado —activa o dada de baja—.
 *
 * Desde acá se actúa sobre una orden sin tener que buscarla de nuevo: Enviar, Reenviar o mandar al
 * taller abren la pantalla de esa acción con la orden ya elegida; Cancelar la deja en "Cancelada"
 * con el motivo escrito. Nada se borra.
 */
export function ListadoView() {
  const dispatch = useDispatch()
  const { usuario } = useApp()

  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [cuentas, setCuentas] = useState<Record<string, CuentaDeObra>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [abriendo, setAbriendo] = useState(false)
  const [cancelando, setCancelando] = useState<ResumenOrden | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'err'; texto: string } | null>(null)
  const [bloqueo, setBloqueo] = useState<string | null>(null)

  const traer = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const lista = await listarOrdenes()
      setOrdenes(lista)
      /* La cuenta de cada obra va aparte: si falla, la consulta se muestra igual, sin el estado. */
      void cuentasDeObras(lista.map((o) => o.obraId))
        .then(setCuentas)
        .catch(() => setCuentas({}))
    } catch {
      setError('No se pudo traer el listado desde Monday. Probá de nuevo en unos segundos.')
      setOrdenes((previas) => previas ?? [])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void traer()
  }, [traer])

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todas: 0 } as Record<Filtro, number>
    for (const e of FILTROS_CONSULTA) c[e] = 0
    for (const o of ordenes ?? []) {
      c.todas++
      c[o.estadoOrden] = (c[o.estadoOrden] ?? 0) + 1
    }
    return c
  }, [ordenes])

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (ordenes ?? []).filter((o) => {
      if (filtro !== 'todas' && o.estadoOrden !== filtro) return false
      if (!q) return true
      const cliente = cuentas[o.obraId]?.cliente ?? ''
      return normalizar([o.nombre, o.idOp, o.numero, o.obraNombre, cliente].join(' ')).includes(q)
    })
  }, [ordenes, filtro, busqueda, cuentas])

  /* Cambiar el filtro o la búsqueda vuelve a la primera página: seguir en la 4 de algo que ahora
     tiene una sola deja la lista vacía sin motivo. */
  useEffect(() => setPagina(0), [filtro, busqueda])

  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA))
  const visibles = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const huecos = paginas > 1 ? POR_PAGINA - visibles.length : 0

  /** Abre la pantalla de la acción con la orden ya elegida. */
  const abrir = async (o: ResumenOrden, accion: Exclude<AccionOrden, 'cancelar'>) => {
    if (!o.obraId) {
      setBloqueo('Esta orden no está vinculada a ninguna obra: no hay a quién mandársela.')
      return
    }
    setAbriendo(true)
    try {
      const obra = await getObra(o.obraId)
      if (!obra) {
        setBloqueo('No se encontró la obra de esta orden en el tablero de obras.')
        return
      }
      dispatch({ type: 'abrirOrden', obra, destino: accion === 'taller' ? 'taller' : 'cliente', ordenId: o.id })
    } catch {
      dispatch({ type: 'errorMonday', accion: 'abrir la obra de la orden' })
    } finally {
      setAbriendo(false)
    }
  }

  const verPdf = async (o: ResumenOrden) => {
    const pdf = o.opFinal.find((a) => !a.esImagen) ?? o.opFinal[0]
    if (!pdf) return
    const ventana = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (ventana) ventana.location.href = url
      else window.open(url, '_blank', 'noreferrer')
    } catch {
      ventana?.close()
      dispatch({ type: 'errorMonday', accion: 'abrir el documento' })
    }
  }

  const confirmarCancelacion = async () => {
    const o = cancelando
    if (!o || !motivo.trim() || guardando) return
    setGuardando(true)
    try {
      /* Se relee antes de escribir: si ya salió al taller mientras tanto, no se cancela. */
      const fresca = await leerOrden(o.id)
      if (!fresca || !admite(fresca.estadoOrden, 'cancelar')) {
        setCancelando(null)
        setBloqueo(
          fresca
            ? `${nombreOrden(fresca)} ahora está «${VISTA_ESTADO[fresca.estadoOrden].rotulo}» y ya no se puede cancelar.`
            : 'La orden ya no está en el tablero.',
        )
        await traer()
        return
      }
      await cancelarOrden(o.id, motivo, usuario?.name ?? '')
      setOrdenes((lista) =>
        (lista ?? []).map((x) =>
          x.id === o.id ? { ...x, estadoOrden: 'cancelada', estado: 'Cancelada', motivo: motivo.trim() } : x,
        ),
      )
      setCancelando(null)
      setMotivo('')
      setAviso({ tono: 'ok', texto: `${nombreOrden(o)} quedó cancelada. Para corregirla, generá una orden nueva.` })
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cancelar la orden' })
    } finally {
      setGuardando(false)
    }
  }

  const chips: Filtro[] = ['todas', ...FILTROS_CONSULTA]

  return (
    <section className="view paso-layout obras-v2">
      {/* La misma barra de contexto que el resto: la sección, la operación y el usuario. La
          consulta no tiene etapas, así que el stepper queda reservado en fantasma. */}
      <PasoHeader />

      <header className="header-section">
        <div className="step-indicator-main">
          <div className="step-badge-main">
            <i className="fas fa-table-list" />
          </div>
          <div className="step-details-main">
            <h1 className="step-title-main">Órdenes de Producción</h1>
            <p className="step-desc-main">Filtrá por estado. Cada orden tiene a mano lo que se puede hacer con ella.</p>
          </div>
        </div>
      </header>

      <div className="card filtros">
        <div className="filtro-grupo">
          <div className="filtro-l">
            <i className="fas fa-filter" /> Estado
          </div>
          <div className="filtro-ops" role="tablist" aria-label="Filtrar por estado">
            {chips.map((f) => {
              const activo = filtro === f
              const color = f === 'todas' ? '#0073ea' : VISTA_ESTADO[f].color
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  className={`filtro-op ${activo ? 'filtro-op--on' : ''}`}
                  style={activo ? { borderColor: color, background: `${color}22`, color: '#0f172a' } : undefined}
                  onClick={() => setFiltro(f)}
                >
                  {f !== 'todas' && <span className="filtro-punto" style={{ background: color }} />}
                  {f === 'todas' ? 'Todas' : VISTA_ESTADO[f].rotulo}
                  <span className="filtro-n">{conteo[f] ?? 0}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="filtro-busca">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            className="filtro-busca-in"
            placeholder="Buscar por obra, cliente, IDOP o N° de orden"
            aria-label="Buscar órdenes"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {error && <Aviso tono="err">{error}</Aviso>}
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <div className="card">
        <div className="obras-lista-cab">
          <div>
            <div className="obras-lista-t">
              {cargando && !ordenes ? 'Buscando…' : `${filas.length} ${filas.length === 1 ? 'orden' : 'órdenes'}`}
            </div>
            <div className="obras-lista-sub">
              {filtro === 'todas' ? 'Todas las órdenes del tablero' : `En estado «${VISTA_ESTADO[filtro].rotulo}»`}
            </div>
          </div>
          <button type="button" className="btn-actualizar" disabled={cargando} onClick={() => void traer()}>
            <i className={`fas fa-rotate ${cargando ? 'spin' : ''}`} /> Actualizar
          </button>
        </div>

        {cargando && !ordenes && (
          <div className="obras-fantasma" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="obra-sk" key={i}>
                <span className="obra-row-main">
                  <span className="sk sk--t" />
                  <span className="sk sk--s" />
                </span>
                <span className="sk sk--m" />
                <span className="obra-row-chips">
                  <span className="sk sk--chip" />
                </span>
                <span className="sk sk--ir" />
              </div>
            ))}
          </div>
        )}

        {ordenes && filas.length === 0 && !error && (
          <div className="obras-vacio">
            {busqueda
              ? 'Ninguna orden coincide con la búsqueda.'
              : filtro === 'todas'
                ? 'Todavía no hay órdenes en el tablero.'
                : `No hay órdenes «${VISTA_ESTADO[filtro].rotulo}».`}
          </div>
        )}

        {ordenes &&
          visibles.map((o) => {
            const cuenta = cuentas[o.obraId]
            const acciones = accionesDe(o.estadoOrden)
            return (
              <div className="op-row" key={o.id}>
                <span className="op-row-main">
                  <span className="obra-row-titulo">
                    <i className="fas fa-file-lines obra-row-ic" />
                    <span className="obra-row-name">{o.idOp || 'OP'}</span>
                    {o.numero && <span className="op-row-nro">N° {o.numero}</span>}
                    {o.tipo && <span className="op-row-tipo">{o.tipo}</span>}
                  </span>
                  <span className="obra-row-meta">
                    <span>
                      <i className="fas fa-helmet-safety" /> {o.obraNombre || 'Sin obra vinculada'}
                    </span>
                    {o.creada && (
                      <span>
                        <i className="far fa-calendar" /> {fechaCorta(o.creada)}
                      </span>
                    )}
                  </span>
                  {o.estadoOrden === 'cancelada' && o.motivo && (
                    <span className="op-row-motivo" title={o.motivo}>
                      <i className="fas fa-comment-slash" /> {o.motivo.split('\n')[0]}
                    </span>
                  )}
                </span>

                <span className="obra-row-cliente">
                  <span className="obra-row-cl-l">
                    <i className="fas fa-user" /> Cliente
                  </span>
                  <span className="obra-row-cl-v">{cuenta?.cliente || '—'}</span>
                  <CuentaBadge activa={cuenta?.activa} />
                </span>

                <span className="op-row-estado">
                  <EstadoOrdenBadge estado={o.estadoOrden} />
                </span>

                <span className="op-row-acc">
                  {o.opFinal.length > 0 && (
                    <button type="button" className="op-acc" title="Ver la OP final" onClick={() => void verPdf(o)}>
                      <i className="fas fa-file-pdf" /> PDF
                    </button>
                  )}
                  {acciones
                    .filter((a): a is Exclude<AccionOrden, 'cancelar'> => a !== 'cancelar')
                    .map((a) => (
                      <button
                        key={a}
                        type="button"
                        className="op-acc op-acc--pri"
                        onClick={() => void abrir(o, a)}
                      >
                        <i className={`fas ${BOTON[a].icono}`} /> {BOTON[a].texto}
                      </button>
                    ))}
                  {acciones.includes('cancelar') && (
                    <button
                      type="button"
                      className="op-acc op-acc--peligro"
                      aria-label={`Cancelar ${o.idOp}`}
                      onClick={() => {
                        setAviso(null)
                        setMotivo('')
                        setCancelando(o)
                      }}
                    >
                      <i className="fas fa-ban" /> Cancelar
                    </button>
                  )}
                </span>
              </div>
            )
          })}

        {Array.from({ length: huecos }, (_, i) => (
          <div className="op-row op-row--hueco" key={`h${i}`} aria-hidden="true" />
        ))}

        {paginas > 1 && (
          <div className="obras-pager">
            <button
              type="button"
              className="obras-pager-btn"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              <i className="fas fa-chevron-left" /> Anterior
            </button>
            <span className="obras-pager-info">
              Página {pagina + 1} de {paginas} · {filas.length} órdenes
            </span>
            <button
              type="button"
              className="obras-pager-btn"
              disabled={pagina >= paginas - 1}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente <i className="fas fa-chevron-right" />
            </button>
          </div>
        )}
      </div>

      {cancelando && (
        <Modal
          title="¿Cancelar la orden?"
          icon={<i className="fas fa-ban modal-icon--warn" />}
          onClose={() => !guardando && setCancelando(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" disabled={guardando} onClick={() => setCancelando(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!motivo.trim() || guardando}
                title={motivo.trim() ? undefined : 'Escribí el motivo de la cancelación'}
                onClick={() => void confirmarCancelacion()}
              >
                {guardando ? (
                  <>
                    <i className="fas fa-circle-notch spin" /> Cancelando…
                  </>
                ) : (
                  'Cancelar la orden'
                )}
              </button>
            </>
          }
        >
          <p className="modal-clave">{nombreOrden(cancelando)}</p>
          <p className="modal-nota">
            La orden no se borra: queda en «Cancelada» con el motivo, como constancia. Si el cliente
            pidió un cambio, después generá una orden nueva.
          </p>
          <label className="campo-l" htmlFor="motivo-cancel">
            Motivo
          </label>
          <textarea
            id="motivo-cancel"
            className="motivo-in"
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="Ej.: el cliente pidió cambiar el color a negro"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Modal>
      )}

      {bloqueo && (
        <AvisoModal titulo="No se puede hacer" onClose={() => setBloqueo(null)}>
          {bloqueo}
        </AvisoModal>
      )}

      {abriendo && <ModalCargando titulo="Abriendo la orden" detalle="Leyendo la obra del tablero…" />}
    </section>
  )
}
