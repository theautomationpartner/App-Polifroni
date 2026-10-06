import { Fragment, useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { DocumentoOrden } from '@/features/envio/DocumentoOrden'
import { EnviarOp } from '@/features/envio/EnviarOp'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { nombreOrden } from '@/features/shared/nombreOrden'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { ETIQUETA_OP, VISTA_ESTADO, admite, completable, estadoDeOrden } from '@/lib/estadosOp'
import {
  TITULO_FILTRO,
  accionesConsulta,
  categoriaConsulta,
  filtrosConsulta,
  vistaConsulta,
  type FiltroConsulta,
} from '@/lib/permisos'
import { normalizar } from '@/lib/texto'
import {
  cancelarOrden,
  completarProduccion,
  getObra,
  getUrlArchivo,
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
 * Qué órdenes se ven y qué se puede hacer con cada una depende del team del usuario (ver
 * `vistaConsulta` y `accionesConsulta` en `lib/permisos`):
 *  - Admin: las que esperan la confirmación del cliente o del constructor ("Enviada Pend
 *    Confirmar"), las que todavía no tienen estado y las enviadas al taller; con todas las acciones.
 *  - Produccion: SÓLO las enviadas al taller, y sólo para FINALIZAR su producción. No ve —ni el
 *    servidor le permite— reenviar ni cancelar.
 * El campo de arriba filtra en vivo, por el ID (IDOP o id del ítem), el N° de orden o la obra.
 *
 * La tabla va de a 6 órdenes por página. Desde cada fila se puede:
 *  - REENVIAR (pendientes) o ENVIAR (sin etiqueta): debajo de la fila se despliegan su documento y el
 *    mismo "Enviar OP" de la operación de envío. Una sin etiqueta se envía sólo con la OP final.
 *  - CANCELAR: queda en "Cancelada" con el motivo escrito. Nada se borra.
 *  - FINALIZAR (enviadas al taller): pregunta si se está seguro y la OP pasa a "Produccion
 *    Completada" por `/api/produccion-completada`, que relee la OP y sólo la mueve si sigue en el
 *    taller. La fila queda bloqueada ("Finalizada") por el resto de la visita.
 */
export function ListadoView() {
  const dispatch = useDispatch()
  const { usuario, accionEnCurso } = useApp()
  const roles = usuario?.roles
  /** Qué órdenes trae la consulta según el team: producción sólo ve las del taller. */
  const vista = vistaConsulta(roles)
  /** Los filtros del rol: el admin elige; producción queda fija en "Enviadas al taller". */
  const filtros = filtrosConsulta(roles)
  const soloTaller = vista.taller && !vista.pendientes && !vista.sinEtiqueta

  /** Las pendientes de confirmar y las sin etiqueta. `null` = leyéndolas. */
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filtroElegido, setFiltro] = useState<FiltroConsulta>(filtros.inicial)
  /* Un filtro que el rol no tiene no se aplica nunca (producción no puede salir del suyo). */
  const filtro: FiltroConsulta = filtros.opciones.includes(filtroElegido) ? filtroElegido : filtros.inicial
  /**
   * En qué filtro cayó cada orden AL LEERLA. Se usa ésa y no la del momento: una orden que se
   * finaliza o se cancela en esta visita sigue en su pestaña, con su candado o su etiqueta, en vez
   * de desaparecer apenas se toca.
   */
  const [categorias, setCategorias] = useState<Record<string, FiltroConsulta | null>>({})

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

  /** La que se va a finalizar: la ventana pide la confirmación. */
  const [aFinalizar, setAFinalizar] = useState<ResumenOrden | null>(null)
  /** La que se está finalizando en Monday: mientras tanto se ve la ventana de espera. */
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null)
  /** Las finalizadas en esta visita: la fila queda bloqueada aunque se relea la lista. */
  const [finalizadas, setFinalizadas] = useState<Set<string>>(new Set())

  useAccionEnCurso(
    finalizandoId !== null ? 'Esperá a que termine de finalizarse la orden.' : 'Esperá a que termine de cancelarse la orden.',
    cancelandoId !== null || finalizandoId !== null,
  )

  useEffect(() => {
    let vivo = true
    /* Sin ningún estado para ver (un rol sin consulta), no se pide nada: sin filtros, la lectura
       traería el tablero entero. */
    if (!vista.pendientes && !vista.sinEtiqueta && !vista.taller) {
      setOrdenes([])
      return
    }
    listarOrdenes({ soloPendientes: vista.pendientes, sinEtiqueta: vista.sinEtiqueta, enTaller: vista.taller })
      .then((lista) => {
        if (!vivo) return
        setOrdenes(lista)
        setCategorias(Object.fromEntries(lista.map((o) => [o.id, categoriaConsulta(o)])))
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
  }, [intento, vista.pendientes, vista.sinEtiqueta, vista.taller])

  const categoriaDe = (o: ResumenOrden) => (o.id in categorias ? categorias[o.id] : categoriaConsulta(o))
  /** Las órdenes de un filtro. "Todas" es todo lo traído. */
  const delFiltro = (f: FiltroConsulta) => (ordenes ?? []).filter((o) => f === 'todas' || categoriaDe(o) === f)

  /* El filtro elegido y la búsqueda en vivo sobre lo traído: ID (IDOP o id del ítem), N° de orden o
     nombre de la obra. */
  const filtradas = useMemo(() => {
    const t = normalizar(busqueda.trim())
    const tc = compacto(busqueda)
    const base = (ordenes ?? []).filter((o) => {
      if (filtro === 'todas') return true
      const c = o.id in categorias ? categorias[o.id] : categoriaConsulta(o)
      return c === filtro
    })
    if (!tc) return base
    return base.filter((o) => {
      const ids = [o.idOp, o.id, o.numero].map(compacto)
      return (
        ids.some((x) => x.includes(tc) || sinCeros(x).includes(sinCeros(tc))) ||
        normalizar(o.obraNombre).includes(t) ||
        compacto(o.obraNombre).includes(tc)
      )
    })
  }, [ordenes, busqueda, filtro, categorias])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  /* Si la página quedó fuera de rango (la búsqueda achicó la lista), se va a la última. */
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)

  /* Otra búsqueda, o la lista releída, vuelven a la primera página. */
  useEffect(() => setPagina(0), [busqueda, intento, filtro])

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

  /** ¿Ya no se puede finalizar? Finalizada en esta visita, o fuera del taller según el tablero. */
  const finalizadaLa = (o: ResumenOrden) => finalizadas.has(o.id) || o.estadoOrden === 'completada'

  const finalizar = async () => {
    const o = aFinalizar
    if (!o || finalizandoId) return
    setAFinalizar(null)
    if (finalizadaLa(o) || !completable(o.estadoOrden)) return
    setAviso(null)
    setFinalizandoId(o.id)
    try {
      const r = await completarProduccion(o.id)
      if (!r.ok) {
        /* Mientras tanto alguien la movió: se muestra en qué estado quedó y no se toca. */
        if (r.estado) {
          const etiqueta = r.estado
          setOrdenes((lista) =>
            (lista ?? []).map((x) =>
              x.id === o.id ? { ...x, estado: etiqueta, estadoOrden: estadoDeOrden(etiqueta, x.opFinal.length > 0) } : x,
            ),
          )
        }
        setBloqueo(
          r.estado
            ? `${nombreOrden(o)} ahora está «${VISTA_ESTADO[estadoDeOrden(r.estado, o.opFinal.length > 0)].rotulo}» y ya no se puede finalizar.`
            : 'La orden ya no está en el tablero de órdenes.',
        )
        return
      }
      setOrdenes((lista) =>
        (lista ?? []).map((x) => (x.id === o.id ? { ...x, estado: ETIQUETA_OP.completada, estadoOrden: 'completada' } : x)),
      )
      setFinalizadas((f) => new Set(f).add(o.id))
      setAviso(`La producción de ${nombreOrden(o)} quedó completada.`)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'finalizar la producción de la orden' })
    } finally {
      setFinalizandoId(null)
    }
  }

  /** La OP que se abre con "Ver": la OP final si la tiene; si no, la original (Aluminio). */
  const pdfDe = (o: ResumenOrden) =>
    o.opFinal.find((a) => !a.esImagen) ?? o.opFinal[0] ?? o.etmo.find((a) => !a.esImagen) ?? o.etmo[0] ?? null

  /**
   * Abre el PDF de la OP en otra pestaña. La pestaña se abre EN el clic —si se abre después de
   * esperar a Monday, el navegador la bloquea como ventana emergente— y recién después se le carga
   * la dirección firmada del archivo (que vence en una hora: por eso se pide en el momento).
   */
  const verPdf = async (o: ResumenOrden) => {
    const pdf = pdfDe(o)
    if (!pdf) return
    const pestana = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (pestana) pestana.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      pestana?.close()
      setBloqueo(`No se pudo abrir el PDF de ${nombreOrden(o)}. Probá de nuevo en unos segundos.`)
    }
  }

  const total = ordenes?.length ?? 0
  /** Cómo se nombra lo que lista la consulta, según lo que ve el rol. */
  const queSeLista = soloTaller ? 'enviadas al taller' : 'pendientes de confirmar, sin enviar y en el taller'

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar Órdenes de Producción"
        descripcion={
          soloTaller
            ? 'Las órdenes enviadas al taller. Finalizá la producción de las que ya terminaron; buscalas por su ID, el N° de orden o el nombre de la obra.'
            : 'Las órdenes que esperan la confirmación del cliente o del constructor, las que todavía no se enviaron y las que están en el taller. Buscalas por su ID, el N° de orden o el nombre de la obra.'
        }
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
              ? `Buscando las órdenes ${queSeLista}...`
              : busqueda.trim()
                ? `${filtradas.length} de ${total} ${total === 1 ? 'orden' : 'órdenes'}`
                : `${total} ${total === 1 ? 'orden' : 'órdenes'} ${queSeLista}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">{soloTaller ? 'Órdenes enviadas al taller' : 'Órdenes de producción'}</h3>
          <p className="cobro-card-desc">
            {soloTaller
              ? 'Finalizá la producción de las órdenes enviadas al taller que ya terminaron de producirse.'
              : 'Las órdenes que todavía no confirmó el cliente o el constructor, las que todavía no tienen estado y las enviadas al taller. Enviá o reenviá la que haga falta, cancelá la que ya no corresponda o finalizá la producción de las del taller.'}
          </p>

          {/* Los filtros de la tabla. Producción tiene uno solo, fijo: "Enviadas al taller". */}
          <div className="cq-filtros">
            <div className="cq-tabs" role="tablist" aria-label="Filtrar por estado">
              {filtros.opciones.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f}
                  className={`cq-tab ${filtro === f ? 'cq-tab--on' : ''} ${filtros.fijo ? 'cq-tab--fijo' : ''}`}
                  disabled={filtros.fijo}
                  title={filtros.fijo ? 'Tu equipo ve sólo las órdenes enviadas al taller' : undefined}
                  onClick={() => setFiltro(f)}
                >
                  {filtros.fijo && <i className="fas fa-lock" aria-hidden="true" />}
                  {TITULO_FILTRO[f]}
                  {ordenes !== null && <span className="cq-tab-n">{delFiltro(f).length}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija consulta-tabla">
              <colgroup>
                <col className="cq-w-orden" />
                <col className="cq-w-obra" />
                <col className="cq-w-fecha" />
                <col className="cq-w-medido" />
                <col className="cq-w-estado" />
                <col className="cq-w-op" />
                <col className="cq-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Orden de producción</th>
                  <th>Obra</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">OP</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes {queSeLista}...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error
                        ? 'No se pudieron leer las órdenes desde Monday.'
                        : total === 0
                          ? `No hay órdenes ${queSeLista}.`
                          : busqueda.trim()
                            ? `Ninguna orden coincide con «${busqueda.trim()}».`
                            : `No hay órdenes en «${TITULO_FILTRO[filtro]}».`}{' '}
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
                    /* Lo que este usuario puede hacer con ESTA orden (su team y el estado de la OP). */
                    const acciones = accionesConsulta(roles, o)
                    /* Sin etiqueta en 🤖Estado OP: todavía no se envió. Se ofrece ENVIAR (la primera
                       vez); el envío se habilita sólo si la OP final está adjunta. */
                    const primerEnvio = acciones.includes('enviar')
                    /* "Generada Pend de Enviar": la OP se generó y quedó en el tablero sin enviar. Se
                       termina desde acá ("Completar Carga"): es su PRIMER envío, no un reenvío. */
                    const completarCarga = primerEnvio && estadoDeOrden(o.estado, true) === 'generada' && !!o.estado.trim()
                    const puedeEnviar = primerEnvio || acciones.includes('reenviar')
                    const finalizada = finalizadaLa(o)
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
                        <td className="ant-col-cen">
                          {pdfDe(o) ? (
                            <button
                              type="button"
                              className="ant-ver"
                              title={`Abrir el PDF de ${o.idOp || nombreOrden(o)} en otra pestaña`}
                              onClick={() => void verPdf(o)}
                            >
                              <i className="fas fa-eye" /> Ver
                            </button>
                          ) : (
                            <span className="ant-sd" title="La orden no tiene un PDF adjunto">
                              Sin PDF
                            </span>
                          )}
                        </td>
                        <td className="ant-col-cen ant-col-acc">
                          {puedeEnviar && (
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
                                  <i
                                    className={`fas ${abierta ? 'fa-chevron-up' : completarCarga ? 'fa-file-circle-check' : primerEnvio ? 'fa-paper-plane' : 'fa-rotate-right'}`}
                                  />{' '}
                                  {abierta ? 'Cerrar' : completarCarga ? 'Completar Carga' : primerEnvio ? 'Enviar' : 'Reenviar'}
                                </>
                              )}
                            </button>
                          )}
                          {finalizada ? (
                            <span className="ant-finalizada" title="La producción de esta orden ya se finalizó">
                              <i className="fas fa-lock" /> Finalizada
                            </span>
                          ) : acciones.includes('finalizar') ? (
                            /* Sin espera propia: mientras se finaliza, la muestra la ventana. */
                            <button
                              type="button"
                              className="ant-finalizar"
                              disabled={finalizandoId !== null || !!accionEnCurso}
                              aria-label={`Finalizar la producción de ${o.idOp || nombreOrden(o)}`}
                              onClick={() => setAFinalizar(o)}
                            >
                              <i className="fas fa-flag-checkered" /> Finalizar
                            </button>
                          ) : null}
                          {o.estadoOrden === 'cancelada' ? (
                            <span className="ant-cancelada">
                              <i className="fas fa-ban" /> Cancelada
                            </span>
                          ) : acciones.includes('cancelar') ? (
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
                    if (!abierta || !obra || !puedeEnviar) return fila
                    return (
                      <Fragment key={o.id}>
                        {fila}
                        <tr className={`ant-reenvio ${cerrandoId === o.id ? 'ant-reenvio--cierra' : ''}`}>
                          <td colSpan={7}>
                            <div className="emision-grid emision-grid--mitades">
                              <div className="card card-pad">
                                <h3 className="resumen-title">Documento que se envía</h3>
                                <DocumentoOrden orden={o} cargando={false} />
                              </div>
                              <EnviarOp
                                modo="cliente"
                                orden={o}
                                listo={
                                  o.opFinal.length > 0 && (o.estadoOrden === 'pendiente' || o.estadoOrden === 'generada')
                                }
                                avisoNoListo={
                                  o.opFinal.length === 0
                                    ? 'La orden no tiene la OP final adjunta: no se puede enviar'
                                    : 'Esta orden ya no está pendiente de confirmar: no se reenvía'
                                }
                                contexto={{
                                  obra,
                                  enviado: reenviadas.has(o.id),
                                  onEnviado: () => {
                                    setReenviadas((r) => new Set(r).add(o.id))
                                    setAviso(
                                      `${nombreOrden(o)} se ${primerEnvio ? 'envió' : 'reenvió'} al cliente o al constructor.`,
                                    )
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

      {aFinalizar && (
        <Modal
          title="¿Finalizar la producción?"
          icon={<i className="fas fa-flag-checkered modal-icon--ok" />}
          onClose={() => setAFinalizar(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setAFinalizar(null)}>
                Volver
              </button>
              <button type="button" className="btn btn-green" onClick={() => void finalizar()}>
                <i className="fas fa-check" /> Sí, finalizar producción
              </button>
            </>
          }
        >
          <p>¿Estás seguro de finalizar la producción de la orden?</p>
          <p className="modal-clave">{nombreOrden(aFinalizar)}</p>
          <p className="modal-nota">La orden pasa a «Producción completada» y ya no se puede volver a finalizar.</p>
        </Modal>
      )}

      {finalizandoId && (
        <ModalCargando titulo="Finalizando producción..." detalle="Se está pasando la orden a Producción Completada en Monday." />
      )}

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
