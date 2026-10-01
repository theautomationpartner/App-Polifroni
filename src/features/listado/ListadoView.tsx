import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { Modal } from '@/components/ui/Modal'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { nombreOrden } from '@/features/shared/nombreOrden'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { destinoDe, type Rol } from '@/lib/destinatario'
import { VISTA_ESTADO, admite, type EstadoOrden } from '@/lib/estadosOp'
import {
  buscarObrasConsulta,
  cancelarOrden,
  getIndiceConsulta,
  getIndiceObras,
  getObra,
  getUrlArchivo,
  leerOrden,
  mondayHabilitado,
  ordenesDeObra,
  type ResumenOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'

/** Lo que se pide mientras no hay obra: va en rojo debajo del buscador. */
const AYUDA_SIN_OBRA = 'Buscá y cargá una obra para ver sus órdenes de producción'

/** Órdenes por página de la tabla. */
const POR_PAGINA = 6

type Filtro = 'todas' | Extract<EstadoOrden, 'pendiente' | 'confirmada' | 'taller' | 'cancelada'>

/** Los filtros de la tabla, en el orden del circuito: los estados que una OP puede tener en el tablero. */
const FILTROS: Filtro[] = ['todas', 'pendiente', 'confirmada', 'taller', 'cancelada']

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

/** "Cliente" / "Constructor", si es uno de los dos. */
const comoRol = (t: string): Rol | null => (t === 'Cliente' || t === 'Constructor' ? t : null)

/**
 * Consultar órdenes de producción.
 *
 * Se busca la OBRA —por su nombre, el cliente, el IDOP o el N° de una de sus órdenes, con el mismo
 * buscador de "Enviar"— y se listan TODAS sus órdenes de producción, en la tabla de "Seleccionar OP
 * A Enviar". Arriba, los datos básicos de la obra: nombre, ID, tipo y cuántas órdenes tiene.
 *
 * La tabla va de a 6 órdenes por página, se filtra por estado y muestra, en las confirmadas, quién confirmó (el responsable que
 * se eligió al enviarla, `🤖Responsable de Confirmar`). Desde cada fila se puede CANCELAR la orden:
 * queda en "Cancelada" con el motivo escrito. Nada se borra.
 */
export function ListadoView() {
  const dispatch = useDispatch()
  const { usuario } = useApp()

  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [obra, setObra] = useState<Obra | null>(null)
  const [cargandoObra, setCargandoObra] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState(false)

  /** Las órdenes de la obra. `null` = leyéndolas. */
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [errorOrdenes, setErrorOrdenes] = useState(false)
  const [intento, setIntento] = useState(0)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [pagina, setPagina] = useState(0)

  /** La que se va a cancelar: la ventana pide el motivo. */
  const [aCancelar, setACancelar] = useState<ResumenOrden | null>(null)
  const [motivo, setMotivo] = useState('')
  /** La que se está cancelando en Monday: su fila muestra la espera. */
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  /** Las que se cancelaron en esta visita: la fila lleva la etiqueta "Cancelada" con su entrada. */
  const [recienCanceladas, setRecienCanceladas] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de cancelarse la orden.', cancelandoId !== null)

  /* El índice completo (con cliente, IDOP y N° de orden) tarda unos segundos en armarse: mientras
     tanto se sugiere por nombre con el índice rápido de "Enviar", que ya suele estar en memoria. */
  useEffect(() => {
    let vivo = true
    let completo = false
    getIndiceObras()
      .then((obras) => vivo && !completo && setIndice(indexar(obras)))
      .catch(() => {})
    getIndiceConsulta()
      .then((obras) => {
        completo = true
        if (vivo) setIndice(indexar(obras))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  /** Lee la obra completa y, con ella, sus órdenes. */
  const abrir = async (id: string) => {
    setCargandoObra(true)
    setAviso(null)
    try {
      const o = await getObra(id)
      if (!o) {
        setObra(null)
        setNoEncontrada(true)
        return
      }
      setObra(o)
      setFiltro('todas')
      setRecienCanceladas(new Set())
      setOrdenes(null)
      setIntento((n) => n + 1)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'buscar la obra' })
    } finally {
      setCargandoObra(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: buscarObrasConsulta,
    abrir,
    onSinResultados: () => setNoEncontrada(true),
    pedidoVacio: 'Escribí el nombre de la obra, el cliente, el IDOP o el N° de orden para buscar.',
  })
  const ayuda = ayudaDe(b, indice.length > 0, !!obra || cargandoObra, AYUDA_SIN_OBRA)

  useEffect(() => {
    if (!obra) return
    let vivo = true
    ordenesDeObra(obra.ordenesIds)
      .then((lista) => {
        if (!vivo) return
        setOrdenes(lista)
        setErrorOrdenes(false)
      })
      .catch(() => {
        if (!vivo) return
        setOrdenes([])
        setErrorOrdenes(true)
      })
    return () => {
      vivo = false
    }
    // Se relee al abrir otra obra (`intento`) o con "Volver a intentar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento])

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todas: 0, pendiente: 0, confirmada: 0, taller: 0, cancelada: 0 }
    for (const o of ordenes ?? []) {
      c.todas++
      if (o.estadoOrden in c) c[o.estadoOrden as Filtro]++
    }
    return c
  }, [ordenes])

  const filtradas = (ordenes ?? []).filter((o) => filtro === 'todas' || o.estadoOrden === filtro)
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  /* Si la página quedó fuera de rango (se canceló la última de un filtro), se va a la última. */
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)

  /* Otra obra u otro filtro vuelven a la primera página. */
  useEffect(() => setPagina(0), [filtro, intento])

  const verPdf = async (o: ResumenOrden) => {
    const pdf = o.opFinal.find((a) => !a.esImagen) ?? o.opFinal[0]
    if (!pdf) return
    const ventana = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (ventana) ventana.location.href = url
    } catch {
      ventana?.close()
      dispatch({ type: 'errorMonday', accion: 'abrir el documento' })
    }
  }

  /** Quién confirmó: el nombre del responsable y su rol, si la orden tiene uno guardado. */
  const confirmo = (o: ResumenOrden): string | null => {
    const rol = comoRol(o.confirmador)
    if (!rol || !obra) return null
    const nombre = destinoDe(obra, rol).nombre
    return `${nombre || 'Sin nombre'} (${rol.toUpperCase()})`
  }

  const cancelar = async () => {
    const o = aCancelar
    if (!o || !motivo.trim() || cancelandoId) return
    const texto = motivo.trim()
    setACancelar(null)
    setMotivo('')
    setAviso(null)
    setCancelandoId(o.id)
    try {
      /* Se relee antes de escribir: si mientras tanto salió al taller o ya se canceló, no se toca. */
      const fresca = await leerOrden(o.id)
      if (!fresca || !admite(fresca.estadoOrden, 'cancelar')) {
        setBloqueo(
          fresca
            ? `${nombreOrden(fresca)} ahora está «${VISTA_ESTADO[fresca.estadoOrden].rotulo}» y ya no se puede cancelar.`
            : 'La orden ya no está en el tablero.',
        )
        if (fresca) setOrdenes((lista) => (lista ?? []).map((x) => (x.id === fresca.id ? fresca : x)))
        return
      }
      await cancelarOrden(o.id, texto, usuario?.name ?? '')
      setOrdenes((lista) =>
        (lista ?? []).map((x) => (x.id === o.id ? { ...x, estadoOrden: 'cancelada', estado: 'Cancelada', motivo: texto } : x)),
      )
      setRecienCanceladas((s) => new Set(s).add(o.id))
      setAviso(`${nombreOrden(o)} quedó cancelada. Para corregirla, generá una orden nueva.`)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cancelar la orden' })
    } finally {
      setCancelandoId(null)
    }
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar Órdenes de Producción"
        descripcion="Buscá la obra por su nombre, el cliente, el IDOP o el N° de orden, y mirá en qué estado se encuentra cada una de sus órdenes."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <BuscadorObras
        b={b}
        placeholder="Buscar obra por nombre, cliente, IDOP o N° de orden"
        ayuda={ayuda}
        ayudaEnRojo={ayuda === AYUDA_SIN_OBRA}
        deshabilitado={!mondayHabilitado()}
        ocupado={cargandoObra}
      />

      {b.error && <Aviso tono="err">{b.error}</Aviso>}

      <FichaObra obra={cargandoObra ? null : obra} cargando={cargandoObra} />

      {/* La tabla de "Seleccionar OP A Enviar", sin la casilla y con la acción de cancelar. */}
      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">Órdenes de producción obtenidas</h3>
          <p className="cobro-card-desc">
            {obra
              ? `Todas las órdenes de producción de ${obra.nombre}. Filtralas por estado y cancelá la que ya no corresponda.`
              : 'Las órdenes de producción de la obra aparecen acá cuando la buscás.'}
          </p>

          <div className="filtro-ops consulta-filtros" role="tablist" aria-label="Filtrar por estado">
            {FILTROS.map((f) => {
              const activo = filtro === f
              const color = f === 'todas' ? 'var(--marca)' : VISTA_ESTADO[f].color
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  className={`filtro-op ${activo ? 'filtro-op--on' : ''}`}
                  style={activo ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, #fff)` } : undefined}
                  disabled={!obra}
                  onClick={() => setFiltro(f)}
                >
                  {f !== 'todas' && <span className="filtro-punto" style={{ background: color }} />}
                  {f === 'todas' ? 'Todas' : VISTA_ESTADO[f].rotulo}
                  <span className="filtro-n">{conteo[f]}</span>
                </button>
              )
            })}
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija consulta-tabla">
              <colgroup>
                <col className="cq-w-orden" />
                <col className="cq-w-fecha" />
                <col className="cq-w-medido" />
                <col className="cq-w-fecha" />
                <col className="cq-w-estado" />
                <col className="cq-w-op" />
                <col className="cq-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Orden de producción</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Fecha de medición</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">OP final</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {!obra ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-magnifying-glass" /> Buscá una obra para ver sus órdenes de producción.
                    </td>
                  </tr>
                ) : ordenes === null ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes de la obra...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {errorOrdenes ? (
                        'No se pudieron leer las órdenes desde Monday.'
                      ) : ordenes.length === 0 ? (
                        <>
                          <strong>{obra.nombre}</strong> todavía no tiene órdenes de producción.
                        </>
                      ) : (
                        <>No hay órdenes «{VISTA_ESTADO[filtro as EstadoOrden].rotulo}» en esta obra.</>
                      )}{' '}
                      {(errorOrdenes || ordenes.length === 0) && (
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
                      )}
                    </td>
                  </tr>
                ) : (
                  visibles.map((o) => {
                    const cancelando = cancelandoId === o.id
                    const recien = recienCanceladas.has(o.id)
                    const quien = o.estadoOrden === 'confirmada' || o.estadoOrden === 'taller' ? confirmo(o) : null
                    return (
                      <tr
                        key={o.id}
                        className={[
                          'ant-row',
                          cancelando ? 'ant-row--cancelando' : '',
                          o.estadoOrden === 'cancelada' ? 'ant-row--cancelada' : '',
                          recien ? 'ant-row--recien' : '',
                        ].join(' ')}
                        title={o.estadoOrden === 'cancelada' && o.motivo ? `Motivo: ${o.motivo}` : undefined}
                      >
                        <td>
                          <span className="ant-nro">{o.numero ? `N° ${o.numero}` : 'Sin N°'}</span>
                          <span className="ant-detalle">{[o.idOp, o.tipo].filter(Boolean).join(' · ') || '—'}</span>
                        </td>
                        <td className="ant-col-cen">{fecha(o.creada) || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">{o.medidoPor || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">
                          {o.fechaMedicion ? o.fechaMedicion.split('-').reverse().join('/') : <span className="ant-sd">—</span>}
                        </td>
                        <td className="ant-col-cen">
                          <EstadoOrdenBadge estado={o.estadoOrden} chico />
                          {quien && (
                            <span className="ant-confirmo" title="Responsable de confirmar la orden">
                              <i className="fas fa-user-check" /> {quien}
                            </span>
                          )}
                        </td>
                        <td className="ant-col-cen">
                          {o.opFinal.length > 0 ? (
                            <button type="button" className="ant-ver" onClick={() => void verPdf(o)}>
                              <i className="fas fa-file-pdf" /> Ver
                            </button>
                          ) : (
                            <span className="ant-sd">—</span>
                          )}
                        </td>
                        <td className="ant-col-cen">
                          {o.estadoOrden === 'cancelada' ? (
                            <span className="ant-cancelada">
                              <i className="fas fa-ban" /> Cancelada
                            </span>
                          ) : admite(o.estadoOrden, 'cancelar') ? (
                            <button
                              type="button"
                              className="ant-cancelar"
                              disabled={cancelandoId !== null}
                              aria-busy={cancelando}
                              aria-label={`Cancelar ${o.idOp || nombreOrden(o)}`}
                              onClick={() => {
                                setMotivo('')
                                setACancelar(o)
                              }}
                            >
                              {cancelando ? (
                                <>
                                  <i className="fas fa-circle-notch spin" /> Cancelando…
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-ban" /> Cancelar
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="ant-sd" title="Una orden enviada al taller ya no se cancela">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {paginas > 1 && (
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
                Página {enPagina + 1} de {paginas} · {filtradas.length}{' '}
                {filtradas.length === 1 ? 'orden' : 'órdenes'}
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
            {aviso && (
              <span className="cobro-bloqueo-inline cobro-bloqueo-inline--ok">
                <i className="fas fa-circle-check" /> {aviso}
              </span>
            )}
          </div>
        </div>
      </div>

      {aCancelar && (
        <Modal
          title="¿Cancelar la orden?"
          icon={<i className="fas fa-ban modal-icon--warn" />}
          onClose={() => setACancelar(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setACancelar(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!motivo.trim()}
                title={motivo.trim() ? undefined : 'Escribí el motivo de la cancelación'}
                onClick={() => void cancelar()}
              >
                <i className="fas fa-ban" /> Cancelar la orden
              </button>
            </>
          }
        >
          <p className="modal-clave">{nombreOrden(aCancelar)}</p>
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
        <AvisoModal titulo="No se puede cancelar" onClose={() => setBloqueo(null)}>
          {bloqueo}
        </AvisoModal>
      )}

      {noEncontrada && (
        <AvisoModal titulo="Obra no encontrada" onClose={() => setNoEncontrada(false)}>
          No se encontró ninguna obra con ese nombre, cliente, IDOP o N° de orden. Probá con una parte
          del nombre o pegá el id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}

/**
 * Los datos básicos de la obra, con el encabezado de la ficha de "Enviar": el ID, el nombre y, a la
 * derecha, el tipo y cuántas órdenes tiene. En esqueleto mientras no hay obra o se lee.
 */
function FichaObra({ obra, cargando }: { obra: Obra | null; cargando: boolean }) {
  const vacio = !obra || cargando
  const n = obra?.ordenesIds.length ?? 0
  return (
    <div className={`card no-radius cliente-ficha consulta-ficha ${vacio ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
            </>
          ) : (
            <>
              <span className="client-id">ID: {obra.idObra || obra.id}</span>
              <h2 className="client-name">{obra.nombre}</h2>
            </>
          )}
        </div>
        <div className="status-indicators">
          {vacio ? (
            <>
              <span className="skeleton skeleton--tipo" />
              <span className="skeleton skeleton--estado" />
            </>
          ) : (
            <>
              <span
                className={`obra-tipo ${obra.tipo.texto ? '' : 'obra-tipo--falta'}`}
                style={obra.tipo.texto ? { background: obra.tipo.color || '#579bfc' } : undefined}
                title="Tipo de obra (columna Tipo)"
              >
                {obra.tipo.texto || 'Sin tipo'}
              </span>
              <div className="status-indicator">
                <span className="status-dot" style={{ background: n ? '#fdab3d' : '#c4c4c4' }} />
                {n === 0
                  ? 'Sin Órdenes de Producción asignadas'
                  : `${n} ${n === 1 ? 'Orden de Producción asignada' : 'Órdenes de Producción asignadas'}`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
