import { Fragment, useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  FILTROS_GESTION,
  INDICES_CERRADOS,
  accionesPresupuesto,
  etiquetaEnviarA,
  fechaLocal,
  formatoImporte,
  pasaFiltro,
  yaEnviado,
  type FiltroGestion,
} from '@/lib/presupuesto'
import { normalizar } from '@/lib/texto'
import {
  RespuestaRechazada,
  getUrlArchivo,
  leerPresupuestoGestion,
  listarPresupuestosGestion,
  mondayHabilitado,
  registrarEnvioGestion,
  responderPresupuesto,
  type PresupuestoEnviado,
  type PresupuestoGestion,
} from '@/services/monday'
import { useApp } from '@/state/hooks'
import { EnvioPresupuestos } from './EnvioPresupuestos'
import {
  FichaPresupuesto,
  ModalConfirmarPresupuesto,
  ModalPerderPresupuesto,
  SituacionChip,
  fechaCorta,
  type AccionFila,
  type FilaGestion,
} from './ModalesPresupuesto'
import { Etiquetas, verPdfMonday } from './TablaPresupuestos'

/** Presupuestos por página de la tabla. */
const POR_PAGINA = 8
/** Lo que dura la animación de cierre de la fila desplegada (la misma de la OP). */
const CIERRE_MS = 220
const COLUMNAS = 8

/** El PDF del presupuesto, bajado de Monday: sale por WhatsApp desde la app, como en la etapa 3. */
async function bajarPdf(p: PresupuestoEnviado): Promise<File> {
  if (!p.pdf) throw new Error('El presupuesto no tiene PDF.')
  const r = await fetch(await getUrlArchivo(p.pdf.assetId))
  if (!r.ok) throw new Error(`No se pudo bajar el PDF (HTTP ${r.status})`)
  const blob = await r.blob()
  return new File([blob], p.pdf.nombre || 'Presupuesto.pdf', { type: blob.type || 'application/pdf' })
}

/** El envío abierto en una fila: el PDF ya bajado y la clave (un reintento manda la misma). */
interface EnvioAbierto {
  subId: string
  archivo: File
  clave: string | null
  reenvio: boolean
}

/**
 * Consultar y Gestionar Presupuestos (regla del usuario, 13/10/2026).
 *
 * Una fila por PRESUPUESTO (subelemento) de todas las bolsas que no están Ganadas ni Perdidas: su
 * último envío, la bolsa, tipo, color, total pactado, el PDF y su respuesta. El campo filtra en vivo;
 * las pestañas, por envío y respuesta. Un click en la fila abre su ficha (último envío y recordatorio).
 *
 *  - ENVIAR / REENVIAR (según si ya salió): despliega la fila con el bloque de envío de la etapa 3
 *    (`EnvioPresupuestos`), como el reenvío de una OP. En un reenvío, los textos y el WhatsApp lo dicen.
 *  - CONFIRMAR (no si la bolsa está vencida): lo mismo que la confirmación del cliente por el enlace.
 *  - PERDIDO: lo mismo que "Rechazar" del enlace (sólo el presupuesto).
 *
 * Confirmar y Perdido los hace el servidor, por el mismo camino que el enlace. Uno resuelto en esta
 * visita sigue en la tabla, con su resultado y sin acciones, hasta la próxima consulta.
 */
export function GestionarPresupuestosView() {
  const { usuario, accionEnCurso } = useApp()

  const [lista, setLista] = useState<PresupuestoGestion[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroGestion>('todos')
  const [pagina, setPagina] = useState(0)

  const [ficha, setFicha] = useState<FilaGestion | null>(null)
  const [modal, setModal] = useState<{ accion: 'confirmar' | 'perder'; fila: FilaGestion } | null>(null)
  const [envio, setEnvio] = useState<EnvioAbierto | null>(null)
  const [cerrando, setCerrando] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  /** Los presupuestos que ya salieron con la fila abierta: el bloque queda en "Enviado exitosamente". */
  const [enviados, setEnviados] = useState<Set<string>>(() => new Set())
  const [trabajando, setTrabajando] = useState<{ id: string; titulo: string; detalle: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<{ titulo: string; texto: string } | null>(null)

  useAccionEnCurso('Esperá a que termine de actualizarse el presupuesto.', trabajando !== null)

  useEffect(() => {
    let vivo = true
    listarPresupuestosGestion(INDICES_CERRADOS)
      .then((l) => {
        if (!vivo) return
        setLista(l)
        setError(false)
      })
      .catch(() => {
        if (!vivo) return
        setLista([])
        setError(true)
      })
    return () => {
      vivo = false
    }
  }, [intento])

  /** Todas las filas: un presupuesto por fila, con su bolsa. */
  const filas = useMemo<FilaGestion[]>(() => (lista ?? []).flatMap((bolsa) => bolsa.presupuestos.map((p) => ({ bolsa, p }))), [lista])

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (
      filas
        .filter(
          ({ bolsa, p }) =>
            pasaFiltro(filtro, p) &&
            (!q ||
              [bolsa.nombre, bolsa.idPresupuesto, p.nombre, bolsa.cliente?.nombre ?? '', bolsa.arquitecto?.nombre ?? '', p.tipo, p.color].some(
                (v) => normalizar(v).includes(q),
              )),
        )
        /* Los que todavía no salieron, primero; después, del envío más reciente al más viejo. */
        .sort((a, b) => (b.p.fechaEnvio || '9999').localeCompare(a.p.fechaEnvio || '9999') || b.p.id.localeCompare(a.p.id))
    )
  }, [filas, busqueda, filtro])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)
  useEffect(() => setPagina(0), [busqueda, filtro, intento])

  const cuenta = (f: FiltroGestion) => filas.filter(({ p }) => pasaFiltro(f, p)).length

  /** Cambia un presupuesto (y, si hace falta, su bolsa) en la lista, sin volver a leer todo. */
  const actualizar = (bolsaId: string, subId: string, cambios: Partial<PresupuestoEnviado>, bolsa: Partial<PresupuestoGestion> = {}) =>
    setLista((l) =>
      (l ?? []).map((b) =>
        b.id !== bolsaId
          ? b
          : { ...b, ...bolsa, presupuestos: b.presupuestos.map((p) => (p.id === subId ? { ...p, ...cambios } : p)) },
      ),
    )

  /* ── Enviar / Reenviar: la fila se despliega con el bloque de envío ───────────────────────────── */

  const cerrarEnvio = () => {
    if (!envio) return
    const id = envio.subId
    setCerrando(id)
    setTimeout(() => {
      setEnvio((e) => (e?.subId === id ? null : e))
      setCerrando(null)
      setEnviados((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }, CIERRE_MS)
  }

  const alternarEnvio = async ({ p }: FilaGestion, reenvio: boolean) => {
    if (envio?.subId === p.id) return cerrarEnvio()
    if (envio) cerrarEnvio()
    setAviso(null)
    setAbriendo(p.id)
    try {
      const archivo = await bajarPdf(p)
      setEnvio({ subId: p.id, archivo, clave: p.clave || null, reenvio })
    } catch {
      setBloqueo({ titulo: 'No se pudo abrir el envío', texto: 'No se pudo bajar el PDF del presupuesto desde Monday. Probá de nuevo en unos segundos.' })
    } finally {
      setAbriendo(null)
    }
  }

  /* ── Confirmar / Perdido: lo mismo que el enlace, en el servidor ──────────────────────────────── */

  const responder = async (f: FilaGestion, r: { tipo: 'confirmar'; ubicacion: string; coordinador: string } | { tipo: 'rechazar'; motivo: string }) => {
    setModal(null)
    setFicha(null)
    setAviso(null)
    const confirma = r.tipo === 'confirmar'
    setTrabajando({
      id: f.p.id,
      titulo: confirma ? 'Confirmando el presupuesto...' : 'Dando el presupuesto por perdido...',
      detalle: confirma
        ? 'El presupuesto queda Confirmado y sus datos pasan a la bolsa. La obra y su registro en la cuenta corriente se crean enseguida.'
        : 'El presupuesto queda Rechazado.',
    })
    try {
      await responderPresupuesto(f.p.id, r, usuario?.name ?? '')
      if (confirma) {
        /* La bolsa quedó Ganada: sus otros presupuestos ya no se gestionan. */
        actualizar(f.bolsa.id, f.p.id, { confirmacion: 'Confirmado' }, { estado: 'Ganado', colorEstado: '#00c875' })
        setAviso(`${f.p.nombre} de ${f.bolsa.nombre} quedó Confirmado. La obra y su registro en la cuenta corriente se están creando.`)
      } else {
        actualizar(f.bolsa.id, f.p.id, { confirmacion: 'Rechazado', motivo: r.motivo })
        setAviso(`${f.p.nombre} de ${f.bolsa.nombre} quedó Rechazado.`)
      }
    } catch (e) {
      if (e instanceof RespuestaRechazada && e.yaRespondido) {
        /* Ya respondió el cliente por el enlace u otro usuario: se trae cómo quedó. */
        void leerPresupuestoGestion(f.bolsa.id)
          .then((b) => b && setLista((l) => (l ?? []).map((x) => (x.id === b.id ? b : x))))
          .catch(() => {})
        setBloqueo({ titulo: 'El presupuesto ya tiene respuesta', texto: e.message })
      } else {
        setBloqueo({
          titulo: confirma ? 'No se pudo confirmar el presupuesto' : 'No se pudo dar por perdido',
          texto: e instanceof Error ? e.message : 'Probá de nuevo en unos segundos.',
        })
      }
    } finally {
      setTrabajando(null)
    }
  }

  const accion = (f: FilaGestion, a: AccionFila) => {
    setFicha(null)
    if (a === 'enviar' || a === 'reenviar') void alternarEnvio(f, a === 'reenviar')
    else setModal({ accion: a, fila: f })
  }

  const ocupado = trabajando !== null || !!accionEnCurso

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar y Gestionar Presupuestos"
        descripcion="Los presupuestos de las bolsas que todavía no se ganaron ni se perdieron. Envialos o reenvialos, confirmalos o dalos por perdidos. Tocá una fila para ver su ficha."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como <strong>VITE_MONDAY_TOKEN</strong> y
          reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

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
              placeholder="Buscar por presupuesto, cliente, constructor, tipo o color"
              aria-label="Buscar presupuestos"
              autoComplete="off"
              value={busqueda}
              disabled={lista === null}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <span className="search-helper" role="status" aria-live="polite">
            {lista === null
              ? 'Leyendo los presupuestos...'
              : `${filtradas.length} de ${filas.length} ${filas.length === 1 ? 'presupuesto' : 'presupuestos'}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <div className="ag-filtros">
            <div className="ag-tabs" role="tablist" aria-label="Filtrar por envío y respuesta">
              {FILTROS_GESTION.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  className={`ag-tab ${filtro === f.id ? 'ag-tab--on' : ''}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.titulo}
                  {lista !== null && <span className="ag-tab-n">{cuenta(f.id)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija ag-tabla pres-tabla pres-tabla--subs">
              <colgroup>
                <col className="pres-w-fecha" />
                <col className="pres-w-pres" />
                <col className="pres-w-tipo" />
                <col className="pres-w-color" />
                <col className="pres-w-total" />
                <col className="pres-w-pdf" />
                <col className="pres-w-estado" />
                <col className="pres-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Último envío</th>
                  <th>Presupuesto</th>
                  <th>Tipo</th>
                  <th>Color</th>
                  <th className="ant-col-der">Total pactado</th>
                  <th className="ant-col-cen">PDF</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {lista === null ? (
                  <tr>
                    <td colSpan={COLUMNAS} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Leyendo los presupuestos...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNAS} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error
                        ? 'No se pudieron leer los presupuestos desde Monday.'
                        : busqueda.trim()
                          ? `Ningún presupuesto coincide con «${busqueda.trim()}».`
                          : 'No hay presupuestos con estos filtros.'}{' '}
                      {error && (
                        <button
                          type="button"
                          className="cobro-reintentar"
                          onClick={() => {
                            setLista(null)
                            setIntento((n) => n + 1)
                          }}
                        >
                          Volver a intentar
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  visibles.map((f) => {
                    const { bolsa, p } = f
                    const acciones = accionesPresupuesto(bolsa.estado, p)
                    const enCurso = trabajando?.id === p.id
                    const abierta = envio?.subId === p.id
                    const quien = [bolsa.cliente?.nombre, bolsa.arquitecto?.nombre].filter(Boolean).join(' · ')
                    const fila = (
                      <tr
                        key={p.id}
                        className={['ant-row', 'pres-fila-click', enCurso ? 'ant-row--cancelando' : ''].join(' ')}
                        tabIndex={0}
                        title="Ver la ficha del presupuesto"
                        onClick={() => setFicha(f)}
                        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setFicha(f)}
                      >
                        <td>
                          {p.fechaEnvio ? (
                            <span className="ant-nro">{fechaCorta(p.fechaEnvio)}</span>
                          ) : (
                            /* Los enviados antes de la columna de fecha no la tienen. */
                            <span className="ant-sd">{yaEnviado(p.estadoEnvio) ? 'Sin fecha' : 'Sin enviar'}</span>
                          )}
                        </td>
                        <td className="ag-turno" title={`${bolsa.nombre} · ${p.nombre}`}>
                          <span className="ag-turno-cli">{bolsa.nombre}</span>
                          <span className="ant-detalle">{[p.nombre, quien].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td>{p.tipo ? <Etiquetas tipo={p.tipo} color="" /> : <span className="ant-sd">—</span>}</td>
                        <td>{p.color ? <Etiquetas tipo="" color={p.color} /> : <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-der">
                          {p.total !== null ? <span className="ant-nro">{formatoImporte(p.total)}</span> : <span className="ant-sd">—</span>}
                        </td>
                        <td className="ant-col-cen" onClick={(e) => e.stopPropagation()}>
                          {p.pdf ? (
                            <button
                              type="button"
                              className="ant-pdf-btn"
                              title="Ver el PDF del presupuesto"
                              aria-label={`Ver el PDF de ${p.nombre}`}
                              onClick={() => p.pdf && void verPdfMonday(p.pdf.assetId)}
                            >
                              <i className="fas fa-file-pdf" /> Ver
                            </button>
                          ) : (
                            <span className="ant-sd">Sin PDF</span>
                          )}
                        </td>
                        <td className="ant-col-cen">
                          <SituacionChip p={p} />
                        </td>
                        <td className="ant-col-cen ag-col-acc" onClick={(e) => e.stopPropagation()}>
                          {enCurso ? (
                            <span className="ag-trabajando">
                              <i className="fas fa-circle-notch spin" /> Actualizando…
                            </span>
                          ) : !acciones.envio && !acciones.confirmar && !acciones.perder ? null : (
                            <div className="ag-acciones">
                              {acciones.envio && (
                                <button
                                  type="button"
                                  className={`ant-reenviar ${abierta ? 'ant-reenviar--on' : ''}`}
                                  disabled={ocupado || abriendo !== null}
                                  aria-expanded={abierta}
                                  aria-busy={abriendo === p.id}
                                  onClick={() => void alternarEnvio(f, acciones.envio === 'reenviar')}
                                >
                                  {abriendo === p.id ? (
                                    <>
                                      <i className="fas fa-circle-notch spin" /> Abriendo…
                                    </>
                                  ) : (
                                    <>
                                      <i className={`fas ${abierta ? 'fa-chevron-up' : acciones.envio === 'reenviar' ? 'fa-rotate-right' : 'fa-paper-plane'}`} />{' '}
                                      {abierta ? 'Cerrar' : acciones.envio === 'reenviar' ? 'Reenviar' : 'Enviar'}
                                    </>
                                  )}
                                </button>
                              )}
                              {acciones.confirmar && (
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--ok"
                                  disabled={ocupado}
                                  onClick={() => accion(f, 'confirmar')}
                                >
                                  <i className="fas fa-circle-check" /> Confirmar
                                </button>
                              )}
                              {acciones.perder && (
                                <button type="button" className="ag-acc ag-acc--cancel" disabled={ocupado} onClick={() => accion(f, 'perder')}>
                                  <i className="fas fa-thumbs-down" /> Perdido
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                    if (!abierta || !envio) return fila
                    return (
                      <Fragment key={p.id}>
                        {fila}
                        <tr className={`ant-reenvio ${cerrando === p.id ? 'ant-reenvio--cierra' : ''}`}>
                          <td colSpan={COLUMNAS}>
                            <div className="cq-envio">
                              <EnvioPresupuestos
                                key={`${p.id}-${envio.reenvio}`}
                                cliente={bolsa.cliente}
                                arquitecto={bolsa.arquitecto}
                                enviarA={bolsa.enviarA}
                                presupuestos={[{ id: p.id, archivo: envio.archivo, tipo: p.tipo, color: p.color, clave: envio.clave }]}
                                enviado={enviados.has(p.id)}
                                reenvio={envio.reenvio}
                                sinContactos="La bolsa no tiene un cliente ni un constructor/arquitecto vinculado: vinculalo en Monday."
                                onClaves={(l) => setEnvio((e) => (e && e.subId === p.id ? { ...e, clave: l[0]?.clave ?? e.clave } : e))}
                                onEnviado={(e) => {
                                  setEnviados((s) => new Set(s).add(p.id))
                                  const primerEnvio = !yaEnviado(p.estadoEnvio)
                                  const fecha = fechaLocal(new Date(e.cuando))
                                  const clave = e.claves[p.id] ?? null
                                  const enviarA = etiquetaEnviarA(e.roles)
                                  void registrarEnvioGestion({ subId: p.id, bolsaId: bolsa.id, fecha, clave, enviarA, primerEnvio })
                                    .then(() => {
                                      actualizar(
                                        bolsa.id,
                                        p.id,
                                        { estadoEnvio: 'Enviado', fechaEnvio: fecha, ...(clave ? { clave } : {}) },
                                        { ...(enviarA ? { enviarA } : {}), ...(primerEnvio ? { estado: 'Presupuesto Enviado' } : {}) },
                                      )
                                      setAviso(`${p.nombre} de ${bolsa.nombre} se ${envio.reenvio ? 'reenvió' : 'envió'} por WhatsApp.`)
                                    })
                                    .catch(() =>
                                      setBloqueo({
                                        titulo: 'Se envió, pero no se registró',
                                        texto: `El presupuesto salió por WhatsApp, pero no se pudo dejar asentado en Monday (Enviado y su fecha${clave ? ', con la clave del enlace' : ''}). Cargalo a mano en el subelemento ${p.nombre}.`,
                                      }),
                                    )
                                }}
                                onCelular={(rol, celular) =>
                                  setLista((l) =>
                                    (l ?? []).map((b) =>
                                      b.id !== bolsa.id
                                        ? b
                                        : rol === 'Cliente'
                                          ? { ...b, cliente: b.cliente ? { ...b.cliente, celular } : null }
                                          : { ...b, arquitecto: b.arquitecto ? { ...b.arquitecto, celular } : null },
                                    ),
                                  )
                                }
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

          {lista !== null && (
            <div className="obras-pager">
              <button type="button" className="obras-pager-btn" disabled={enPagina === 0} onClick={() => setPagina(enPagina - 1)}>
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {filtradas.length} {filtradas.length === 1 ? 'presupuesto' : 'presupuestos'}
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

      {ficha && <FichaPresupuesto fila={ficha} onClose={() => setFicha(null)} onAccion={(a) => accion(ficha, a)} />}
      {modal?.accion === 'confirmar' && (
        <ModalConfirmarPresupuesto
          fila={modal.fila}
          onClose={() => setModal(null)}
          onConfirmar={(ubicacion, coordinador) => void responder(modal.fila, { tipo: 'confirmar', ubicacion, coordinador })}
        />
      )}
      {modal?.accion === 'perder' && (
        <ModalPerderPresupuesto
          fila={modal.fila}
          onClose={() => setModal(null)}
          onConfirmar={(motivo) => void responder(modal.fila, { tipo: 'rechazar', motivo })}
        />
      )}

      {trabajando && <ModalCargando titulo={trabajando.titulo} detalle={trabajando.detalle} />}

      {bloqueo && (
        <AvisoModal titulo={bloqueo.titulo} onClose={() => setBloqueo(null)}>
          {bloqueo.texto}
        </AvisoModal>
      )}
    </section>
  )
}
