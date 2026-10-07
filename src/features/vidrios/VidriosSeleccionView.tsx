import { Fragment, useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { enElTaller } from '@/lib/estadosOp'
import { etiquetaPaso } from '@/lib/pasos'
import { cantidadValida, composicion, esDvh, medidaValida, ordenParaCortes, ordenVisibleEnCortes } from '@/lib/vidrios'
import {
  actualizarVidrios,
  ordenesDeObra,
  vidriosDeOrdenes,
  type CambioVidrio,
  type ResumenOrden,
  type VidrioDeOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/** Órdenes por página de la tabla. */
const POR_PAGINA = 6
/** Lo que dura la animación de plegar los vidrios de una orden (ver `.vid-detalle--cierra`). */
const CIERRE_MS = 220

/** Las piezas de una OP: la suma de las cantidades de sus vidrios. */
const piezas = (vs: VidrioDeOrden[]) => vs.reduce((n, v) => n + (v.cantidad ?? 0), 0)

/** Lo que se está escribiendo en un vidrio en edición: los tres campos como texto. */
type Borrador = { ancho: string; alto: string; cantidad: string }
const borradorDe = (v: VidrioDeOrden): Borrador => ({ ancho: v.ancho, alto: v.alto, cantidad: v.cantidad == null ? '' : String(v.cantidad) })
const borradorValido = (b: Borrador) => medidaValida(b.ancho) && medidaValida(b.alto) && cantidadValida(b.cantidad)

/**
 * Solicitud de cortes de vidrio · Etapa 2: qué vidrios se piden.
 *
 * Las órdenes de la obra que ya salieron al taller, en la misma tabla que "Seleccionar OP A Enviar",
 * de a 6 por página. Elegir una orden con su casilla la despliega y muestra sus vidrios —los
 * subelementos con datos de vidrio: la composición, simple o DVH con cada capa, las medidas y la
 * cantidad—; destildarla la pliega. Arrancan todas sin elegir, plegadas. Las que no tienen vidrios
 * (`🤖Tiene Vidrios` sin tildar) se muestran apagadas, sin casilla para elegir: no hay nada que pedir de ellas.
 *
 * Cada orden desplegada se puede corregir: "Editar" abre el ancho, el alto y la cantidad de sus
 * vidrios para escribirlos, y el mismo botón —ahora "Guardar"— escribe en Monday sólo los vidrios
 * que cambiaron (sus subelementos, ver `actualizarVidrios`).
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
  /** Las órdenes en edición: por orden, lo escrito en cada uno de sus vidrios (por id). */
  const [edicion, setEdicion] = useState<Record<string, Record<string, Borrador>>>({})
  /** La orden que se está guardando en Monday. */
  const [guardando, setGuardando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)

  useAccionEnCurso('Esperá a que se guarden los vidrios.', guardando !== null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const enTaller = (await ordenesDeObra(obra.ordenesIds)).filter((o) => enElTaller(o.estadoOrden, o.envioTaller))
        /* `🤖Tiene Vidrios` dice cuáles traen vidrios: sólo de ésas se leen los subelementos. */
        const porOp = await vidriosDeOrdenes(enTaller.filter((o) => o.tieneVidrios).map((o) => o.id))
        if (!vivo) return
        const datos = (o: ResumenOrden) => ({
          enTaller: true,
          estadoVidrios: o.estadoVidrios,
          vidrios: o.tieneVidrios ? (porOp[o.id] ?? []).length : 0,
        })
        /* Las que tienen vidrios sin pedir y, sin poder elegirse, las que no tienen vidrios (ver
           `ordenVisibleEnCortes`). Las ya solicitadas, colocadas o canceladas no se muestran. */
        const todas = enTaller.filter((o) => ordenVisibleEnCortes(datos(o)))
        const aptas = todas.filter((o) => ordenParaCortes(datos(o)))
        setOrdenes(todas)
        /* Una elegida antes que ya no se puede pedir (se pidió mientras tanto) sale de la solicitud. */
        if (vidriosOps.some((id) => !aptas.some((o) => o.id === id))) {
          dispatch({ type: 'setVidriosOps', ids: vidriosOps.filter((id) => aptas.some((o) => o.id === id)) })
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

  const editar = (id: string) =>
    setEdicion((e) => ({ ...e, [id]: Object.fromEntries((vidrios[id] ?? []).map((v) => [v.id, borradorDe(v)])) }))

  const escribir = (op: string, vidrio: string, campo: keyof Borrador, valor: string) =>
    setEdicion((e) => ({ ...e, [op]: { ...e[op], [vidrio]: { ...e[op][vidrio], [campo]: valor } } }))

  /** Guarda en Monday sólo los vidrios que cambiaron; sin cambios, sólo cierra la edición. */
  const guardar = async (id: string) => {
    const escritos = edicion[id] ?? {}
    const originales = vidrios[id] ?? []
    const cambiados = originales.filter((v) => {
      const b = escritos[v.id]
      return b && (b.ancho.trim() !== v.ancho || b.alto.trim() !== v.alto || b.cantidad.trim() !== (v.cantidad == null ? '' : String(v.cantidad)))
    })
    if (cambiados.some((v) => !borradorValido(escritos[v.id]))) {
      setAviso({
        titulo: 'Revisá los vidrios',
        texto: 'El ancho y el alto van en mm enteros (por ejemplo 843 o 1.013) y la cantidad es un número de 1 en adelante.',
      })
      return
    }
    const cambios: CambioVidrio[] = cambiados.map((v) => ({
      id: v.id,
      ancho: escritos[v.id].ancho.trim(),
      alto: escritos[v.id].alto.trim(),
      cantidad: Number(escritos[v.id].cantidad),
    }))
    if (cambios.length) {
      setGuardando(id)
      try {
        await actualizarVidrios(cambios)
      } catch (e) {
        console.warn('[vidrios] no se pudieron guardar los vidrios', e)
        setAviso({
          titulo: 'No se pudieron guardar los vidrios',
          texto: 'Monday no respondió. Lo que escribiste sigue en la tabla: volvé a tocar «Guardar» en unos segundos.',
        })
        return
      } finally {
        setGuardando(null)
      }
      const porId = new Map(cambios.map((c) => [c.id, c]))
      setVidrios((todos) => ({
        ...todos,
        [id]: (todos[id] ?? []).map((v) => {
          const c = porId.get(v.id)
          return c ? { ...v, ancho: c.ancho, alto: c.alto, cantidad: c.cantidad } : v
        }),
      }))
    }
    setEdicion((e) => {
      const resto = { ...e }
      delete resto[id]
      return resto
    })
  }

  const continuar = () => {
    if (Object.keys(edicion).length) {
      setAviso({
        titulo: 'Hay vidrios en edición',
        texto: 'Tocá «Guardar» en las órdenes que estás editando antes de continuar: si no, la solicitud sale con las medidas anteriores.',
      })
      return
    }
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
            Debajo de cada una, los vidrios que lleva: la composición, las medidas y la cantidad de piezas.
            Las que no tienen vidrios se muestran apagadas y no se pueden elegir.
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
                <col className="vid-w-acc" />
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
                  <th className="ant-col-cen">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={8} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes y sus vidrios...
                    </td>
                  </tr>
                ) : ordenes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="ant-aviso">
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
                    const escritos = edicion[o.id]
                    const enEdicion = !!escritos
                    const guardandoEsta = guardando === o.id
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
                              disabled={sinVidrios || enEdicion}
                              title={enEdicion ? 'Guardá los vidrios antes de destildar la orden' : undefined}
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
                          <td className="ant-col-cen">
                            {/* Editar abre las medidas y la cantidad de los vidrios; Guardar las escribe. */}
                            <button
                              type="button"
                              className={`btn ${enEdicion ? 'btn-primary btn-marca' : 'btn-out'} vid-editar`}
                              disabled={!on || sinVidrios || guardando !== null}
                              title={
                                sinVidrios
                                  ? 'Esta orden no tiene vidrios para editar'
                                  : !on
                                    ? 'Elegí la orden para ver y editar sus vidrios'
                                    : undefined
                              }
                              onClick={() => (enEdicion ? void guardar(o.id) : editar(o.id))}
                            >
                              {guardandoEsta ? (
                                <>
                                  <i className="fas fa-circle-notch spin" /> Guardando
                                </>
                              ) : enEdicion ? (
                                <>
                                  <i className="fas fa-floppy-disk" /> Guardar
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-pen" /> Editar
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {abierta && (
                          <tr
                            className={`vid-detalle ${on ? '' : 'vid-detalle--fuera'} ${cerrando.has(o.id) ? 'vid-detalle--cierra' : ''}`}
                          >
                            <td colSpan={8}>
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
                                      {enEdicion && escritos[v.id] ? (
                                        <>
                                          {(['ancho', 'alto', 'cantidad'] as const).map((campo) => {
                                            const valor = escritos[v.id][campo]
                                            const ok = campo === 'cantidad' ? cantidadValida(valor) : medidaValida(valor)
                                            return (
                                              <td key={campo}>
                                                <input
                                                  className={`vid-input ${ok ? '' : 'vid-input--mal'}`}
                                                  inputMode="numeric"
                                                  value={valor}
                                                  disabled={guardandoEsta}
                                                  onChange={(e) => escribir(o.id, v.id, campo, e.target.value)}
                                                  aria-label={`${campo === 'cantidad' ? 'Cantidad' : campo === 'ancho' ? 'Ancho' : 'Alto'} de ${v.modelo || 'el vidrio'}`}
                                                />
                                              </td>
                                            )
                                          })}
                                        </>
                                      ) : (
                                        <>
                                          <td className="vid-num">{v.ancho || '—'}</td>
                                          <td className="vid-num">{v.alto || '—'}</td>
                                          <td className="vid-cant">
                                            {v.cantidad ?? <span className="vid-falta">Sin cantidad</span>}
                                          </td>
                                        </>
                                      )}
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
      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
    </section>
  )
}
