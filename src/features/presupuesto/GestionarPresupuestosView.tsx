import { Fragment, useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  ETIQUETA_GANADO,
  FILTROS_BOLSA,
  accionesPresupuesto,
  etiquetaEnviarA,
  fechaLocal,
  formatoImporte,
  gestionable,
  pasaFiltroBolsa,
  yaEnviado,
  type FiltroBolsa,
} from '@/lib/presupuesto'
import { normalizar } from '@/lib/texto'
import {
  RespuestaRechazada,
  getUrlArchivo,
  leerPresupuestoGestion,
  leerPresupuestosDeBolsa,
  listarPresupuestosGestion,
  marcarBolsaPerdida,
  mondayHabilitado,
  registrarEnvioGestion,
  responderPresupuesto,
  type PresupuestoEnviado,
  type PresupuestoGestion,
  type RespuestaPresupuesto,
} from '@/services/monday'
import { useApp } from '@/state/hooks'
import { EnvioPresupuestos } from './EnvioPresupuestos'
import {
  FichaPresupuesto,
  ModalConfirmarPresupuesto,
  ModalGanarPresupuesto,
  ModalPerderBolsa,
  SituacionChip,
  fechaCorta,
  type AccionFila,
  type FilaGestion,
} from './ModalesPresupuesto'
import { ModalNuevoPresupuesto } from './NuevoPresupuesto'
import { Etiquetas, verPdfMonday } from './TablaPresupuestos'

/** Bolsas por página de la tabla. */
const POR_PAGINA = 10
/** Lo que dura la animación de cierre de la fila desplegada (la misma de la OP). */
const CIERRE_MS = 220
/** Columnas de la tabla de bolsas y de la de sus presupuestos. */
const COLUMNAS = 5
const COLUMNAS_SUB = 7

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

/** Los presupuestos de una bolsa, leídos de Monday al abrirla. */
type Subs = PresupuestoEnviado[] | 'cargando' | 'error'

/**
 * Consultar y Gestionar Presupuestos (reglas del usuario, 13/10 y 15/10/2026).
 *
 * Una fila por BOLSA (el ítem): cliente - ID Presupuesto, su estado y su total pactado. El campo filtra
 * en vivo; las pestañas, por el estado de la bolsa. Un click en la fila la abre: sus presupuestos
 * (subelementos) se leen de Monday y se listan debajo, con las mismas filas: ID PDF, último envío,
 * tipo, color, el PDF y su estado. Un click en un presupuesto abre su ficha.
 *
 * En la bolsa:
 *  - +NUEVO: otro presupuesto para la bolsa (`ModalNuevoPresupuesto`). No en una Ganada.
 *  - PERDIDO: la bolsa pasa a "Perdido" y sale de la lista (no se listan las Perdidas ni las vencidas).
 * En cada presupuesto:
 *  - ENVIAR / REENVIAR (según si ya salió): despliega la fila con el bloque de envío.
 *  - CONFIRMAR: con el total pactado, la dirección y el coordinador; la bolsa queda Ganada. Gana uno
 *    solo: los demás de la bolsa ya no se confirman.
 *  - GANAR: el que el cliente confirmó por WhatsApp ("Confirmado - Pend de Cerrar"), con el total.
 *
 * Confirmar y Ganar los hace el servidor, por el mismo camino que el enlace.
 */
export function GestionarPresupuestosView() {
  const { usuario, accionEnCurso } = useApp()

  const [lista, setLista] = useState<PresupuestoGestion[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroBolsa>('todos')
  const [pagina, setPagina] = useState(0)
  /** La bolsa abierta y los presupuestos leídos de cada una. */
  const [abierta, setAbierta] = useState<string | null>(null)
  const [subs, setSubs] = useState<Record<string, Subs>>({})

  const [ficha, setFicha] = useState<FilaGestion | null>(null)
  const [modal, setModal] = useState<{ accion: 'confirmar' | 'ganar'; fila: FilaGestion } | null>(null)
  const [perdiendo, setPerdiendo] = useState<PresupuestoGestion | null>(null)
  const [nuevo, setNuevo] = useState<PresupuestoGestion | null>(null)
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
    listarPresupuestosGestion()
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

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (lista ?? []).filter(
      (b) =>
        pasaFiltroBolsa(filtro, b.estado) &&
        (!q || [b.nombre, b.idPresupuesto, b.cliente?.nombre ?? '', b.arquitecto?.nombre ?? ''].some((v) => normalizar(v).includes(q))),
    )
  }, [lista, busqueda, filtro])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)
  useEffect(() => setPagina(0), [busqueda, filtro, intento])

  const cuenta = (f: FiltroBolsa) => (lista ?? []).filter((b) => pasaFiltroBolsa(f, b.estado)).length

  /* ── Los presupuestos de una bolsa: se leen de Monday al abrirla ────────────────────────────── */

  const cargarSubs = (bolsaId: string) => {
    setSubs((s) => ({ ...s, [bolsaId]: Array.isArray(s[bolsaId]) ? s[bolsaId] : 'cargando' }))
    leerPresupuestosDeBolsa(bolsaId)
      .then((l) => setSubs((s) => ({ ...s, [bolsaId]: l })))
      .catch(() => setSubs((s) => ({ ...s, [bolsaId]: 'error' })))
  }

  const alternarBolsa = (b: PresupuestoGestion) => {
    if (abierta === b.id) {
      setAbierta(null)
      return
    }
    if (envio) cerrarEnvio()
    setAbierta(b.id)
    cargarSubs(b.id)
  }

  /** Cambia un presupuesto (y, si hace falta, su bolsa) en la lista, sin volver a leer todo. */
  const actualizar = (bolsaId: string, subId: string, cambios: Partial<PresupuestoEnviado>, bolsa: Partial<PresupuestoGestion> = {}) => {
    setSubs((s) => {
      const l = s[bolsaId]
      return Array.isArray(l) ? { ...s, [bolsaId]: l.map((p) => (p.id === subId ? { ...p, ...cambios } : p)) } : s
    })
    if (Object.keys(bolsa).length) setLista((l) => (l ?? []).map((b) => (b.id === bolsaId ? { ...b, ...bolsa } : b)))
  }

  /** Se corrigió el celular de un contacto: la bolsa sigue con el número nuevo. */
  const cambiarCelular = (bolsaId: string, rol: 'Cliente' | 'Constructor', celular: string) =>
    setLista((l) =>
      (l ?? []).map((b) =>
        b.id !== bolsaId
          ? b
          : rol === 'Cliente'
            ? { ...b, cliente: b.cliente ? { ...b.cliente, celular } : null }
            : { ...b, arquitecto: b.arquitecto ? { ...b.arquitecto, celular } : null },
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

  /* ── Confirmar / Ganar: lo mismo que el enlace, en el servidor ──────────────────────── */

  const responder = async (f: FilaGestion, r: RespuestaPresupuesto) => {
    setModal(null)
    setFicha(null)
    setAviso(null)
    setTrabajando({
      id: f.p.id,
      titulo: r.tipo === 'confirmar' ? 'Confirmando el presupuesto...' : 'Ganando el presupuesto...',
      detalle: 'El presupuesto queda Ganado, con su tipo, color, total y PDF. La obra y su registro en la cuenta corriente se crean enseguida.',
    })
    try {
      await responderPresupuesto(f.p.id, r, usuario?.name ?? '')
      /* La bolsa quedó Ganada: gana uno solo, sus otros presupuestos ya no se confirman. */
      actualizar(
        f.bolsa.id,
        f.p.id,
        { confirmacion: 'Confirmado' },
        { estado: ETIQUETA_GANADO, colorEstado: '#00c875', total: r.total, ubicacionObra: r.ubicacion },
      )
      setAviso(`${f.p.nombre} de ${f.bolsa.nombre} quedó Ganado. La obra y su registro en la cuenta corriente se están creando.`)
    } catch (e) {
      if (e instanceof RespuestaRechazada && e.yaRespondido) {
        /* Ya respondió el cliente por el enlace u otro usuario: se trae cómo quedó. */
        void leerPresupuestoGestion(f.bolsa.id)
          .then((b) => b && setLista((l) => (l ?? []).map((x) => (x.id === b.id ? b : x))))
          .catch(() => {})
        cargarSubs(f.bolsa.id)
        setBloqueo({ titulo: r.tipo === 'ganar' ? 'El presupuesto ya no se puede ganar' : 'El presupuesto ya tiene respuesta', texto: e.message })
      } else {
        setBloqueo({
          titulo: r.tipo === 'confirmar' ? 'No se pudo confirmar el presupuesto' : 'No se pudo ganar el presupuesto',
          texto: e instanceof Error ? e.message : 'Probá de nuevo en unos segundos.',
        })
      }
    } finally {
      setTrabajando(null)
    }
  }

  /** Da la bolsa por perdida: pasa a "Perdido" en Monday y sale de la lista. */
  const perder = async (b: PresupuestoGestion) => {
    setPerdiendo(null)
    setAviso(null)
    setTrabajando({
      id: b.id,
      titulo: 'Dando el presupuesto por perdido...',
      detalle: 'El presupuesto queda Perdido y deja de aparecer en esta lista.',
    })
    try {
      await marcarBolsaPerdida(b.id)
      setLista((l) => (l ?? []).filter((x) => x.id !== b.id))
      if (abierta === b.id) setAbierta(null)
      setAviso(`${b.nombre} quedó Perdido.`)
    } catch {
      setBloqueo({ titulo: 'No se pudo dar por perdido', texto: 'No se pudo actualizar el presupuesto en Monday. Probá de nuevo en unos segundos.' })
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

  /** Un presupuesto (subelemento) de la bolsa, con sus acciones y, si está abierto, su envío. */
  const filaPresupuesto = (f: FilaGestion) => {
    const { bolsa, p } = f
    const acciones = accionesPresupuesto(bolsa.estado, p)
    const enCurso = trabajando?.id === p.id
    const abiertaEnvio = envio?.subId === p.id
    const fila = (
      <tr
        key={p.id}
        className={['ant-row', 'pres-fila-click', enCurso ? 'ant-row--cancelando' : ''].join(' ')}
        tabIndex={0}
        title="Ver la ficha del presupuesto"
        onClick={() => setFicha(f)}
        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setFicha(f)}
      >
        <td className="ag-turno">
          <span className="ag-turno-cli">{p.nombre}</span>
        </td>
        <td>
          {p.fechaEnvio ? (
            <span className="ant-nro">{fechaCorta(p.fechaEnvio)}</span>
          ) : (
            /* Los enviados antes de la columna de fecha no la tienen. */
            <span className="ant-sd">{yaEnviado(p.estadoEnvio) ? 'Sin fecha' : 'Sin enviar'}</span>
          )}
        </td>
        <td>{p.tipo ? <Etiquetas tipo={p.tipo} color="" /> : <span className="ant-sd">—</span>}</td>
        <td>{p.color ? <Etiquetas tipo="" color={p.color} /> : <span className="ant-sd">—</span>}</td>
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
          <SituacionChip p={p} estadoBolsa={bolsa.estado} />
        </td>
        <td className="ant-col-cen ag-col-acc" onClick={(e) => e.stopPropagation()}>
          {enCurso ? (
            <span className="ag-trabajando">
              <i className="fas fa-circle-notch spin" /> Actualizando…
            </span>
          ) : !acciones.envio && !acciones.confirmar && !acciones.ganar ? null : (
            <div className="ag-acciones">
              {acciones.envio && (
                <button
                  type="button"
                  className={`ant-reenviar ${abiertaEnvio ? 'ant-reenviar--on' : ''}`}
                  disabled={ocupado || abriendo !== null}
                  aria-expanded={abiertaEnvio}
                  aria-busy={abriendo === p.id}
                  onClick={() => void alternarEnvio(f, acciones.envio === 'reenviar')}
                >
                  {abriendo === p.id ? (
                    <>
                      <i className="fas fa-circle-notch spin" /> Abriendo…
                    </>
                  ) : (
                    <>
                      <i className={`fas ${abiertaEnvio ? 'fa-chevron-up' : acciones.envio === 'reenviar' ? 'fa-rotate-right' : 'fa-paper-plane'}`} />{' '}
                      {abiertaEnvio ? 'Cerrar' : acciones.envio === 'reenviar' ? 'Reenviar' : 'Enviar'}
                    </>
                  )}
                </button>
              )}
              {acciones.confirmar && (
                <button type="button" className="ag-acc ag-acc--ok" disabled={ocupado} onClick={() => accion(f, 'confirmar')}>
                  <i className="fas fa-circle-check" /> Confirmar
                </button>
              )}
              {acciones.ganar && (
                <button type="button" className="ag-acc ag-acc--ok" disabled={ocupado} onClick={() => accion(f, 'ganar')}>
                  <i className="fas fa-trophy" /> Ganar
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    )
    if (!abiertaEnvio || !envio) return fila
    return (
      <Fragment key={p.id}>
        {fila}
        <tr className={`ant-reenvio ${cerrando === p.id ? 'ant-reenvio--cierra' : ''}`}>
          <td colSpan={COLUMNAS_SUB}>
            <div className="cq-envio">
              <EnvioPresupuestos
                key={`${p.id}-${envio.reenvio}`}
                cliente={bolsa.cliente}
                arquitecto={bolsa.arquitecto}
                enviarA={bolsa.enviarA}
                presupuestos={[{ id: p.id, archivo: envio.archivo, tipo: p.tipo, color: p.color, clave: envio.clave }]}
                enviado={enviados.has(p.id)}
                reenvio={envio.reenvio}
                sinContactos="El presupuesto no tiene un cliente ni un constructor/arquitecto vinculado: vinculalo en Monday."
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
                onCelular={(rol, celular) => cambiarCelular(bolsa.id, rol, celular)}
              />
            </div>
          </td>
        </tr>
      </Fragment>
    )
  }

  /** Los presupuestos de la bolsa abierta: la tabla de adentro, con las mismas filas. */
  const presupuestosDe = (bolsa: PresupuestoGestion) => {
    const l = subs[bolsa.id]
    return (
      <tr className="pres-subs-fila">
        <td colSpan={COLUMNAS}>
          <div className="pres-subs">
            <table className="ant-tabla ant-tabla--fija ag-tabla pres-tabla pres-tabla--subs">
              <colgroup>
                <col className="pres-w-idpdf" />
                <col className="pres-w-fecha" />
                <col className="pres-w-tipo" />
                <col className="pres-w-color" />
                <col className="pres-w-pdf" />
                <col className="pres-w-estado" />
                <col className="pres-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>ID PDF</th>
                  <th>Último envío</th>
                  <th>Tipo</th>
                  <th>Color</th>
                  <th className="ant-col-cen">PDF</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {l === undefined || l === 'cargando' ? (
                  <tr>
                    <td colSpan={COLUMNAS_SUB} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Leyendo los presupuestos de {bolsa.nombre}...
                    </td>
                  </tr>
                ) : l === 'error' ? (
                  <tr>
                    <td colSpan={COLUMNAS_SUB} className="ant-aviso">
                      <i className="fas fa-circle-info" /> No se pudieron leer los presupuestos desde Monday.{' '}
                      <button type="button" className="cobro-reintentar" onClick={() => cargarSubs(bolsa.id)}>
                        Volver a intentar
                      </button>
                    </td>
                  </tr>
                ) : l.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNAS_SUB} className="ant-aviso">
                      <i className="fas fa-circle-info" /> Todavía no tiene presupuestos cargados.
                    </td>
                  </tr>
                ) : (
                  l.map((p) => filaPresupuesto({ bolsa, p }))
                )}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar Presupuestos No Ganados"
        descripcion="Lista completo de todos los presupuestos que aun no se ganaron. Podes reenviar, confirmar o dar por perdido cualquiera de ellos"
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
              placeholder="Buscar por cliente, constructor o ID de presupuesto"
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
              : `${filtradas.length} de ${lista.length} ${lista.length === 1 ? 'presupuesto' : 'presupuestos'}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <div className="ag-filtros">
            <div className="ag-tabs" role="tablist" aria-label="Filtrar por estado del presupuesto">
              {FILTROS_BOLSA.map((f) => (
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
            <table className="ant-tabla ant-tabla--fija ag-tabla pres-tabla pres-tabla--bolsas">
              <colgroup>
                <col className="pres-w-pres" />
                <col className="pres-w-constr" />
                <col className="pres-w-estado" />
                <col className="pres-w-total" />
                <col className="pres-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Presupuesto</th>
                  <th>Constructor/Arquitecto</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-der">Total pactado</th>
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
                  visibles.map((b) => {
                    const abiertaB = abierta === b.id
                    const admiteNuevo = gestionable(b.estado)
                    return (
                      <Fragment key={b.id}>
                        <tr
                          className={['ant-row', 'pres-fila-click', abiertaB ? 'pres-bolsa--abierta' : ''].join(' ')}
                          tabIndex={0}
                          aria-expanded={abiertaB}
                          title={abiertaB ? 'Cerrar los presupuestos' : 'Ver los presupuestos'}
                          onClick={() => alternarBolsa(b)}
                          onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && alternarBolsa(b)}
                        >
                          <td className="ag-turno" title={`${b.nombre} - ${b.idPresupuesto}`}>
                            <span className="ag-turno-cli">
                              <i className={`fas fa-chevron-right pres-chev ${abiertaB ? 'pres-chev--on' : ''}`} aria-hidden="true" />{' '}
                              {[b.nombre, b.idPresupuesto].filter(Boolean).join(' - ')}
                            </span>
                          </td>
                          <td>{b.arquitecto?.nombre ? <span className="ant-detalle">{b.arquitecto.nombre}</span> : <span className="ant-sd">—</span>}</td>
                          <td className="ant-col-cen">
                            {b.estado ? (
                              <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: b.colorEstado || '#c4c4c4' }}>
                                {b.estado}
                              </span>
                            ) : (
                              <span className="ant-sd">Sin estado</span>
                            )}
                          </td>
                          <td className="ant-col-der">
                            {b.total !== null ? <span className="ant-nro">{formatoImporte(b.total)}</span> : <span className="ant-sd">—</span>}
                          </td>
                          <td className="ant-col-cen ag-col-acc" onClick={(e) => e.stopPropagation()}>
                            <div className="ag-acciones">
                              <button
                                type="button"
                                className="ant-reenviar pres-nuevo"
                                disabled={ocupado || !admiteNuevo}
                                title={admiteNuevo ? 'Cargar y enviar otro presupuesto' : `El presupuesto está ${b.estado}: no se le cargan otros`}
                                onClick={() => {
                                  setAviso(null)
                                  setNuevo(b)
                                }}
                              >
                                <i className="fas fa-plus" /> Nuevo
                              </button>
                              <button
                                type="button"
                                className="ag-acc ag-acc--cancel pres-perdido"
                                disabled={ocupado || !admiteNuevo}
                                title={admiteNuevo ? 'Dar el presupuesto por perdido' : `El presupuesto está ${b.estado}: no se da por perdido`}
                                onClick={() => {
                                  setAviso(null)
                                  setPerdiendo(b)
                                }}
                              >
                                <i className="fas fa-thumbs-down" /> Perdido
                              </button>
                            </div>
                          </td>
                        </tr>
                        {abiertaB && presupuestosDe(b)}
                      </Fragment>
                    )
                  })
                )}
                {/* Hasta completar la página: la tabla no cambia de alto al buscar, filtrar o llegar a la última. */}
                {Array.from({ length: POR_PAGINA - Math.max(1, lista === null ? 0 : visibles.length) }, (_, i) => (
                  <tr key={`relleno-${i}`} className="pres-fila-relleno" aria-hidden="true">
                    <td colSpan={COLUMNAS}>
                      <span className="pres-relleno-alto" />
                    </td>
                  </tr>
                ))}
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
          onConfirmar={(d) => void responder(modal.fila, { tipo: 'confirmar', ...d })}
        />
      )}
      {modal?.accion === 'ganar' && (
        <ModalGanarPresupuesto
          fila={modal.fila}
          onClose={() => setModal(null)}
          onGanar={(d) => void responder(modal.fila, { tipo: 'ganar', ...d })}
        />
      )}
      {perdiendo && <ModalPerderBolsa bolsa={perdiendo} onClose={() => setPerdiendo(null)} onConfirmar={() => void perder(perdiendo)} />}
      {nuevo && (
        <ModalNuevoPresupuesto
          bolsa={nuevo}
          onClose={(sinRegistrar) => {
            setNuevo(null)
            if (sinRegistrar) {
              setBloqueo({
                titulo: 'Se envió, pero no se registró',
                texto: `El presupuesto salió por WhatsApp, pero no quedó en Monday. Cargalo a mano como subelemento de ${nuevo.nombre} (${nuevo.idPresupuesto}).`,
              })
            }
          }}
          onRegistrado={({ enviarA }) => {
            /* El presupuesto nuevo se suma a la lista de la bolsa: se vuelven a leer sus presupuestos. */
            setLista((l) => (l ?? []).map((x) => (x.id === nuevo.id ? { ...x, enviarA } : x)))
            setAbierta(nuevo.id)
            cargarSubs(nuevo.id)
            setAviso(`Se envió un presupuesto nuevo de ${nuevo.nombre} y quedó en su lista.`)
          }}
          onCelular={(rol, celular) => cambiarCelular(nuevo.id, rol, celular)}
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
