import { Fragment, useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { Modal } from '@/components/ui/Modal'
import { DocumentoOrden } from '@/features/envio/DocumentoOrden'
import { EnviarOp } from '@/features/envio/EnviarOp'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { nombreOrden } from '@/features/shared/nombreOrden'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { VISTA_ESTADO, admite } from '@/lib/estadosOp'
import { normalizar } from '@/lib/texto'
import {
  cancelarOrden,
  getObra,
  leerOrden,
  listarOrdenes,
  mondayHabilitado,
  type ResumenOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'

/** Lo que dura la animación de plegar el reenvío (ver `.ant-reenvio--cierra`). */
const CIERRE_MS = 220

/** Órdenes por página de la tabla. */
const POR_PAGINA = 6

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

/** "IDOP-041" también se encuentra como "idop 41" o "41": sin guiones, espacios ni ceros adelante. */
const compacto = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '')
const sinCeros = (s: string) => s.replace(/(\D|^)0+(\d)/g, '$1$2')

/**
 * Consultar órdenes de producción.
 *
 * Al entrar se traen TODAS las órdenes del tablero que esperan la confirmación del cliente o del
 * constructor ("Enviada Pend Confirmar" en `🤖Estado OP`), sin tener que buscar la obra. El campo de
 * arriba filtra en vivo esas órdenes, por su ID (IDOP o id del ítem), su N° de orden o el nombre de
 * su obra.
 *
 * La tabla va de a 6 órdenes por página. Desde cada fila se puede:
 *  - REENVIAR: debajo de la fila se despliegan su documento y el mismo "Enviar OP" de la operación
 *    de envío, que llama al escenario con los mismos datos.
 *  - CANCELAR: queda en "Cancelada" con el motivo escrito. Nada se borra.
 */
export function ListadoView() {
  const dispatch = useDispatch()
  const { usuario, accionEnCurso } = useApp()

  /** Las pendientes de confirmar. `null` = leyéndolas. */
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
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

  /** La orden desplegada para reenviarla: debajo de su fila aparecen el documento y el envío. */
  const [reenviandoId, setReenviandoId] = useState<string | null>(null)
  /** La que está leyendo su obra para desplegarse. */
  const [abriendoId, setAbriendoId] = useState<string | null>(null)
  /** Las obras ya leídas, por id: el envío necesita la obra completa (destinatarios, celulares). */
  const [obras, setObras] = useState<Record<string, Obra>>({})
  /** Las que se reenviaron mientras su panel está abierto: el envío queda en verde y fijo. */
  const [reenviadas, setReenviadas] = useState<Set<string>>(new Set())
  /** La que se está plegando: el panel sale con su animación antes de desaparecer. */
  const [cerrandoId, setCerrandoId] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de cancelarse la orden.', cancelandoId !== null)

  useEffect(() => {
    let vivo = true
    listarOrdenes({ soloPendientes: true })
      .then((lista) => {
        if (!vivo) return
        setOrdenes(lista)
        setError(false)
      })
      .catch(() => {
        if (!vivo) return
        setOrdenes([])
        setError(true)
      })
    return () => {
      vivo = false
    }
  }, [intento])

  /* Búsqueda en vivo sobre lo traído: ID (IDOP o id del ítem), N° de orden o nombre de la obra. */
  const filtradas = useMemo(() => {
    const t = normalizar(busqueda.trim())
    const tc = compacto(busqueda)
    if (!tc) return ordenes ?? []
    return (ordenes ?? []).filter((o) => {
      const ids = [o.idOp, o.id, o.numero].map(compacto)
      return (
        ids.some((x) => x.includes(tc) || sinCeros(x).includes(sinCeros(tc))) ||
        normalizar(o.obraNombre).includes(t) ||
        compacto(o.obraNombre).includes(tc)
      )
    })
  }, [ordenes, busqueda])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  /* Si la página quedó fuera de rango (la búsqueda achicó la lista), se va a la última. */
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)

  /* Otra búsqueda, o la lista releída, vuelven a la primera página. */
  useEffect(() => setPagina(0), [busqueda, intento])

  /** Despliega (o pliega) el reenvío de una orden. La primera vez lee su obra. */
  /**
   * Pliega el panel abierto. Se puede reenviar todas las veces que haga falta: al cerrarlo se olvida
   * el "Enviado exitosamente", y al volver a abrirlo el envío arranca de cero.
   */
  const cerrarReenvio = (animar = true) => {
    const id = reenviandoId
    if (!id) return
    const olvidar = () => {
      setReenviandoId((actual) => (actual === id ? null : actual))
      setCerrandoId(null)
      setReenviadas((r) => {
        const n = new Set(r)
        n.delete(id)
        return n
      })
    }
    if (!animar || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      olvidar()
      return
    }
    setCerrandoId(id)
    setTimeout(olvidar, CIERRE_MS)
  }

  const alternarReenvio = async (o: ResumenOrden) => {
    if (cerrandoId) return
    if (reenviandoId === o.id) {
      cerrarReenvio()
      return
    }
    /* Abrir otra pliega la anterior en el acto: un solo panel por vez. */
    if (reenviandoId) cerrarReenvio(false)
    if (!o.obraId) {
      setBloqueo('Esta orden no está vinculada a ninguna obra: no hay a quién reenviársela.')
      return
    }
    if (!obras[o.obraId]) {
      setAbriendoId(o.id)
      try {
        const obra = await getObra(o.obraId)
        if (!obra) {
          setBloqueo('No se encontró la obra de esta orden en el tablero de obras.')
          return
        }
        setObras((m) => ({ ...m, [o.obraId]: obra }))
      } catch {
        dispatch({ type: 'errorMonday', accion: 'leer la obra de la orden' })
        return
      } finally {
        setAbriendoId(null)
      }
    }
    setReenviandoId(o.id)
  }

  const cancelar = async () => {
    const o = aCancelar
    if (!o || !motivo.trim() || cancelandoId) return
    const texto = motivo.trim()
    setACancelar(null)
    setMotivo('')
    setAviso(null)
    if (reenviandoId === o.id) cerrarReenvio(false)
    setCancelandoId(o.id)
    try {
      /* Se relee antes de escribir: si mientras tanto la confirmaron o ya se canceló, no se toca. */
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

  const total = ordenes?.length ?? 0

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar Órdenes de Producción"
        descripcion="Las órdenes enviadas que esperan la confirmación del cliente o del constructor. Buscalas por su ID, el N° de orden o el nombre de la obra."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      {/* El mismo campo del buscador de obras, pero filtra en vivo las órdenes ya traídas. */}
      <div className="card unified-toolbar consulta-buscador">
        <div className="search-container">
          <div className="search-wrapper">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              className="search-input"
              placeholder="Buscar por ID, N° de orden o nombre de obra"
              aria-label="Buscar órdenes de producción"
              autoComplete="off"
              value={busqueda}
              disabled={ordenes === null}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <span className="search-helper" role="status" aria-live="polite">
            {ordenes === null
              ? 'Buscando las órdenes pendientes de confirmar...'
              : busqueda.trim()
                ? `${filtradas.length} de ${total} ${total === 1 ? 'orden' : 'órdenes'}`
                : `${total} ${total === 1 ? 'orden pendiente' : 'órdenes pendientes'} de confirmar`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">Órdenes pendientes de confirmar</h3>
          <p className="cobro-card-desc">
            Todas las órdenes de producción enviadas que todavía no confirmó el cliente o el constructor.
            Reenviá la que haga falta o cancelá la que ya no corresponda.
          </p>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija consulta-tabla">
              <colgroup>
                <col className="cq-w-orden" />
                <col className="cq-w-obra" />
                <col className="cq-w-fecha" />
                <col className="cq-w-medido" />
                <col className="cq-w-estado" />
                <col className="cq-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Orden de producción</th>
                  <th>Obra</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={6} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes pendientes de confirmar...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error
                        ? 'No se pudieron leer las órdenes desde Monday.'
                        : total === 0
                          ? 'No hay órdenes pendientes de confirmar.'
                          : `Ninguna orden coincide con «${busqueda.trim()}».`}{' '}
                      {(error || total === 0) && (
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
                    const abierta = reenviandoId === o.id
                    const fila = (
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
                        <td className="ant-obra" title={o.obraNombre}>
                          {o.obraNombre || <span className="ant-sd">Sin obra vinculada</span>}
                        </td>
                        <td className="ant-col-cen">{fecha(o.creada) || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">{o.medidoPor || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">
                          <EstadoOrdenBadge estado={o.estadoOrden} chico />
                        </td>
                        <td className="ant-col-cen ant-col-acc">
                          {admite(o.estadoOrden, 'reenviar') && (
                            <button
                              type="button"
                              className={`ant-reenviar ${abierta ? 'ant-reenviar--on' : ''}`}
                              disabled={!!accionEnCurso || abriendoId !== null}
                              title={accionEnCurso ?? undefined}
                              aria-expanded={abierta}
                              aria-busy={abriendoId === o.id}
                              onClick={() => void alternarReenvio(o)}
                            >
                              {abriendoId === o.id ? (
                                <>
                                  <i className="fas fa-circle-notch spin" /> Abriendo…
                                </>
                              ) : (
                                <>
                                  <i className={`fas ${abierta ? 'fa-chevron-up' : 'fa-rotate-right'}`} />{' '}
                                  {abierta ? 'Cerrar' : 'Reenviar'}
                                </>
                              )}
                            </button>
                          )}
                          {o.estadoOrden === 'cancelada' ? (
                            <span className="ant-cancelada">
                              <i className="fas fa-ban" /> Cancelada
                            </span>
                          ) : admite(o.estadoOrden, 'cancelar') ? (
                            <button
                              type="button"
                              className="ant-cancelar"
                              disabled={cancelandoId !== null || !!accionEnCurso}
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
                          ) : null}
                        </td>
                      </tr>
                    )
                    const obra = obras[o.obraId]
                    if (!abierta || !obra) return fila
                    return (
                      <Fragment key={o.id}>
                        {fila}
                        <tr className={`ant-reenvio ${cerrandoId === o.id ? 'ant-reenvio--cierra' : ''}`}>
                          <td colSpan={6}>
                            <div className="emision-grid emision-grid--mitades">
                              <div className="card card-pad">
                                <h3 className="resumen-title">Documento que se envía</h3>
                                <DocumentoOrden orden={o} cargando={false} />
                              </div>
                              <EnviarOp
                                modo="cliente"
                                orden={o}
                                listo={o.opFinal.length > 0 && o.estadoOrden === 'pendiente'}
                                avisoNoListo={
                                  o.opFinal.length === 0
                                    ? 'La orden no tiene la OP final adjunta'
                                    : 'Esta orden ya no está pendiente de confirmar: no se reenvía'
                                }
                                contexto={{
                                  obra,
                                  enviado: reenviadas.has(o.id),
                                  onEnviado: () => {
                                    setReenviadas((r) => new Set(r).add(o.id))
                                    setAviso(`${nombreOrden(o)} se reenvió al cliente o al constructor.`)
                                    /* Se relee la orden: el envío pudo dejarle el link nuevo. */
                                    void leerOrden(o.id)
                                      .then((f) => f && setOrdenes((l) => (l ?? []).map((x) => (x.id === f.id ? f : x))))
                                      .catch(() => {})
                                  },
                                  onObra: (nueva) => setObras((m) => ({ ...m, [nueva.id]: nueva })),
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* El paginador está siempre, aunque entren todas en una página: así no aparece y
              desaparece al buscar. Mientras se leen las órdenes, todavía no hay qué paginar. */}
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
        <AvisoModal titulo="No se puede hacer" onClose={() => setBloqueo(null)}>
          {bloqueo}
        </AvisoModal>
      )}
    </section>
  )
}
