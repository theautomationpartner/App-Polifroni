import { Fragment, useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { enElTaller } from '@/lib/estadosOp'
import { etiquetaPaso } from '@/lib/pasos'
import { composicion, esDvh, ordenParaCortes } from '@/lib/vidrios'
import { ordenesDeObra, vidriosDeOrdenes, type ResumenOrden, type VidrioDeOrden } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/** Órdenes por página de la tabla. */
const POR_PAGINA = 6
/** Lo que dura la animación de plegar los vidrios de una orden (ver `.vid-detalle--cierra`). */
const CIERRE_MS = 220

/** Las piezas de una OP: la suma de las cantidades de sus vidrios. */
const piezas = (vs: VidrioDeOrden[]) => vs.reduce((n, v) => n + (v.cantidad ?? 0), 0)

/**
 * Solicitud de cortes de vidrio · Etapa 2: qué vidrios se piden.
 *
 * Las órdenes de la obra que ya salieron al taller, en la misma tabla que "Seleccionar OP A Enviar",
 * de a 6 por página. Elegir una orden con su casilla la despliega y muestra sus vidrios —los
 * subelementos con Tipo = "Vidrio": la composición, simple o DVH con cada capa, las medidas y la
 * cantidad—; destildarla la pliega. Arrancan todas sin elegir, plegadas.
 */
export function VidriosSeleccionView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { vidriosOps } = useApp()
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [vidrios, setVidrios] = useState<Record<string, VidrioDeOrden[]>>({})
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [faltan, setFaltan] = useState(false)
  const [pagina, setPagina] = useState(0)
  /** Las que se acaban de destildar: sus vidrios salen con su animación antes de desaparecer. */
  const [cerrando, setCerrando] = useState<Set<string>>(new Set())

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const enTaller = (await ordenesDeObra(obra.ordenesIds)).filter((o) => enElTaller(o.estadoOrden, o.envioTaller))
        const porOp = await vidriosDeOrdenes(enTaller.map((o) => o.id))
        if (!vivo) return
        /* Sólo las que tienen vidrios y todavía no se pidieron (ver `ordenParaCortes`). */
        const todas = enTaller.filter((o) =>
          ordenParaCortes({ enTaller: true, estadoVidrios: o.estadoVidrios, vidrios: (porOp[o.id] ?? []).length }),
        )
        setOrdenes(todas)
        /* Una elegida antes que ya no entra (se pidió mientras tanto) sale de la solicitud. */
        if (vidriosOps.some((id) => !todas.some((o) => o.id === id))) {
          dispatch({ type: 'setVidriosOps', ids: vidriosOps.filter((id) => todas.some((o) => o.id === id)) })
        }
        setVidrios(porOp)
        setError(false)
      } catch {
        if (!vivo) return
        setOrdenes([])
        setError(true)
      }
    })()
    return () => {
      vivo = false
    }
    // Se relee al abrir la etapa o con "Volver a intentar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra, intento])

  const paginas = Math.max(1, Math.ceil((ordenes ?? []).length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = (ordenes ?? []).slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)

  const elegidas = (ordenes ?? []).filter((o) => vidriosOps.includes(o.id))
  const totalPiezas = elegidas.reduce((n, o) => n + piezas(vidrios[o.id] ?? []), 0)
  /** Elegir la orden la despliega; destildarla la pliega con su animación. */
  const alternar = (id: string) => {
    if (cerrando.has(id)) return
    const elegida = vidriosOps.includes(id)
    dispatch({ type: 'setVidriosOps', ids: elegida ? vidriosOps.filter((x) => x !== id) : [...vidriosOps, id] })
    if (!elegida || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setCerrando((c) => new Set(c).add(id))
    setTimeout(
      () =>
        setCerrando((c) => {
          const n = new Set(c)
          n.delete(id)
          return n
        }),
      CIERRE_MS,
    )
  }

  const continuar = () => {
    if (elegidas.every((o) => (vidrios[o.id] ?? []).length === 0)) {
      setFaltan(true)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Seleccionar Ordenes"
        descripcion="Revisá los vidrios de las órdenes que ya salieron al taller y tildá las órdenes cuyos vidrios vas a pedir."
      />

      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">Órdenes enviadas al taller</h3>
          <p className="cobro-card-desc">
            Órdenes de {obra.nombre} que ya están en el taller y tienen sus vidrios pendientes de solicitar.
            Debajo de cada una, los vidrios que lleva: la
            composición, las medidas y la cantidad de piezas.
          </p>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija vid-tabla">
              <colgroup>
                <col className="ant-w-check" />
                <col className="ant-w-orden" />
                <col className="ant-w-fecha" />
                <col className="ant-w-medido" />
                <col className="ant-w-fecha" />
                <col className="ant-w-estado" />
                <col className="ant-w-op" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ant-col-check" />
                  <th>Orden de producción</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Fecha de medición</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Vidrios</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes y sus vidrios...
                    </td>
                  </tr>
                ) : ordenes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error ? 'No se pudieron leer las órdenes desde Monday.' : `${obra.nombre} no tiene órdenes en el taller con vidrios pendientes de solicitar.`}{' '}
                      <button
                        type="button"
                        className="cobro-reintentar"
                        onClick={() => {
                          setOrdenes(null)
                          setIntento((n) => n + 1)
                        }}
                      >
                        Volver a intentar
                      </button>
                    </td>
                  </tr>
                ) : (
                  visibles.map((o) => {
                    const vs = vidrios[o.id] ?? []
                    const on = vidriosOps.includes(o.id)
                    const sinVidrios = vs.length === 0
                    /* Elegida, se ve desplegada; recién destildada, se ve mientras se pliega. */
                    const abierta = !sinVidrios && (on || cerrando.has(o.id))
                    return (
                      <Fragment key={o.id}>
                        {/* La casilla elige la orden y la despliega; destildarla la pliega. */}
                        <tr
                          className={`ant-row vid-fila ${on ? 'ant-row--on' : ''} ${sinVidrios ? 'ant-row--off' : ''} ${abierta ? 'vid-fila--abierta' : ''}`}
                          title={sinVidrios ? 'Esta orden no tiene vidrios cargados como subelementos.' : undefined}
                        >
                          <td className="ant-col-check">
                            <input
                              type="checkbox"
                              className="ant-check"
                              checked={on && !sinVidrios}
                              disabled={sinVidrios}
                              onChange={() => alternar(o.id)}
                              aria-label={`Pedir los vidrios de ${o.idOp || o.nombre}`}
                            />
                          </td>
                          <td>
                            <span className="ant-nro">{o.numero ? `N° ${o.numero}` : 'Sin N°'}</span>
                            <span className="ant-detalle">{[o.idOp, o.tipo].filter(Boolean).join(' · ') || '—'}</span>
                          </td>
                          <td className="ant-col-cen">{fecha(o.creada)}</td>
                          <td className="ant-col-cen">{o.medidoPor || <span className="ant-sd">—</span>}</td>
                          <td className="ant-col-cen">
                            {o.fechaMedicion ? o.fechaMedicion.split('-').reverse().join('/') : <span className="ant-sd">—</span>}
                          </td>
                          <td className="ant-col-cen">
                            <EstadoOrdenBadge estado={o.estadoOrden} chico />
                          </td>
                          <td className="ant-col-cen">
                            {sinVidrios ? (
                              <span className="ant-sd">Sin vidrios</span>
                            ) : (
                              <span className="vid-abrir" aria-hidden="true">
                                <span className="vid-cuenta">
                                  {piezas(vs)} {piezas(vs) === 1 ? 'pieza' : 'piezas'}
                                </span>
                                <i className={`fas fa-chevron-down vid-chev ${on ? 'vid-chev--on' : ''}`} />
                              </span>
                            )}
                          </td>
                        </tr>
                        {abierta && (
                          <tr
                            className={`vid-detalle ${on ? '' : 'vid-detalle--fuera'} ${cerrando.has(o.id) ? 'vid-detalle--cierra' : ''}`}
                          >
                            <td colSpan={7}>
                              <table className="vid-sub">
                                <colgroup>
                                  <col className="vid-w-modelo" />
                                  <col className="vid-w-tipo" />
                                  <col className="vid-w-comp" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-med" />
                                  <col className="vid-w-cant" />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Modelo</th>
                                    <th>Tipo</th>
                                    <th>Composición (mm)</th>
                                    <th>Ancho (mm)</th>
                                    <th>Alto (mm)</th>
                                    <th>Cantidad</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vs.map((v) => (
                                    <tr key={v.id}>
                                      <td className="vid-modelo">{v.modelo || '—'}</td>
                                      <td>
                                        <span className={`vid-tipo ${esDvh(v) ? 'vid-tipo--dvh' : ''}`}>
                                          {esDvh(v) ? 'DVH' : 'Simple'}
                                        </span>
                                      </td>
                                      <td>
                                        {esDvh(v) ? (
                                          <span className="vid-capas" title="Vidrio 1 · Cámara · Vidrio 2">
                                            <span className="vid-capa">{v.comp1 || '—'}</span>
                                            <span className="vid-capa vid-capa--camara">{v.camara || '—'}</span>
                                            <span className="vid-capa">{v.comp2 || '—'}</span>
                                          </span>
                                        ) : (
                                          <span className="vid-capas">
                                            <span className="vid-capa">{composicion(v)}</span>
                                          </span>
                                        )}
                                      </td>
                                      <td className="vid-num">{v.ancho || '—'}</td>
                                      <td className="vid-num">{v.alto || '—'}</td>
                                      <td className="vid-cant">
                                        {v.cantidad ?? <span className="vid-falta">Sin cantidad</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* El paginador está siempre, aunque entren todas en una página. */}
          {ordenes !== null && (
            <div className="obras-pager">
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina === 0}
                onClick={() => setPagina(enPagina - 1)}
              >
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {ordenes.length} {ordenes.length === 1 ? 'orden' : 'órdenes'}
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
          )}

          <div className="cobro-card-acts">
            {ordenes && ordenes.length > 0 && (
              <span className={`cobro-bloqueo-inline ${elegidas.length ? 'cobro-bloqueo-inline--ok' : 'cobro-bloqueo-inline--info'}`}>
                <i className={`fas ${elegidas.length ? 'fa-circle-check' : 'fa-circle-info'}`} />{' '}
                {elegidas.length
                  ? `${elegidas.length} ${elegidas.length === 1 ? 'orden elegida' : 'órdenes elegidas'} · ${totalPiezas} ${totalPiezas === 1 ? 'pieza' : 'piezas'} de vidrio para pedir.`
                  : 'Tildá las órdenes cuyos vidrios vas a pedir.'}
              </span>
            )}
          </div>
        </div>
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'vidrios')} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {faltan && (
        <AvisoModal titulo="Elegí qué vidrios pedir" onClose={() => setFaltan(false)}>
          Tildá en la tabla al menos una orden con vidrios para armar la solicitud de cortes.
        </AvisoModal>
      )}
    </section>
  )
}
