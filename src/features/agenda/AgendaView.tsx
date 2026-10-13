import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { hoyLocal } from '@/features/op/DatosMedicion'
import { useClickOutside } from '@/hooks/useClickOutside'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import {
  COLOR_SIN_TIPO,
  MATERIALES,
  TIPOS_POR_DEFECTO,
  aberturasValidas,
  claveDeTurno,
  type TipoConfig,
  activo,
  colorDeTipo,
  defTipo,
  materialDe,
  semanasDelMes,
  type MaterialTurno,
  fechaHoraCorta,
  horarioOcupado,
} from '@/lib/agenda'
import {
  coloresTipoTurno,
  editarTurno,
  getTiposConfig,
  leerTurno,
  listarTurnos,
  mondayHabilitado,
  type Turno,
} from '@/services/monday'
import { useApp } from '@/state/hooks'
import { EstadoTurnoChip, TipoTurnoChip } from './chips'
import { NuevoTurno } from './NuevoTurno'
import { admiteAccion, useAccionesTurno, type AccionCalendario } from './useAccionesTurno'

const dos = (n: number) => String(n).padStart(2, '0')
const fechaLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
const horaLocal = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`

/** Una opción de un grupo de filtros: su color (sólo los tipos de turno) y cuántos turnos tiene. */
interface OpcionFiltro<T extends string> {
  id: T
  titulo: string
  color?: string
  n: number | null
}

/** Cuántas opciones de un grupo fijo entran en la barra; las demás van al menú "⋯". */
const OPCIONES_A_LA_VISTA = 3
/** El ancho del botón "⋯" y el espacio entre botones de la barra (los de agenda.css). */
const ANCHO_MAS = 30
const HUECO = 5

/**
 * Cuántas opciones entran a la vista en `disponible` px, con sus anchos: todas si entran; si no, las
 * que entran dejando lugar para el "⋯".
 */
function cuantasEntran(anchos: number[], disponible: number): number {
  const total = anchos.reduce((t, a, i) => t + a + (i ? HUECO : 0), 0)
  if (total <= disponible) return anchos.length
  let usado = ANCHO_MAS
  let n = 0
  for (const a of anchos) {
    if (usado + HUECO + a > disponible) break
    usado += HUECO + a
    n++
  }
  return n
}

/**
 * Un grupo de filtros de la barra (material, tipo de turno). Muestra las primeras opciones; si hay
 * más, el botón "⋯" abre la lista de las que no entraron, y avisa cuántas de ellas están tildadas.
 * `unico`: excluyente (se elige una sola opción, como un radio); si no, acumulativo.
 * `ajustable`: muestra tantas opciones como entren en el espacio libre de la barra (y el resto, en
 * el "⋯"); si no, las primeras `OPCIONES_A_LA_VISTA`.
 */
function GrupoFiltro<T extends string>({
  nombre,
  opciones,
  elegidos,
  onAlternar,
  unico = false,
  ajustable = false,
}: {
  nombre: string
  opciones: OpcionFiltro<T>[]
  elegidos: Set<T>
  onAlternar: (id: T) => void
  unico?: boolean
  ajustable?: boolean
}) {
  const icono = (on: boolean) => (unico ? (on ? 'fa-circle-dot' : 'fa-circle') : on ? 'fa-square-check' : 'fa-square')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useClickOutside(caja, () => setAbierto(false), abierto)
  /* Ajustable: se miden los botones (en una copia invisible) y el espacio del grupo, y se muestran
     los que entran. Se vuelve a medir si cambia el ancho o cambian las opciones (los números). */
  const grupo = useRef<HTMLDivElement>(null)
  const medidor = useRef<HTMLDivElement>(null)
  const [aLaVista, setALaVista] = useState(ajustable ? opciones.length : OPCIONES_A_LA_VISTA)
  const firma = opciones.map((o) => `${o.id}:${o.titulo}:${o.n}`).join('|')
  useLayoutEffect(() => {
    if (!ajustable || !grupo.current || !medidor.current) return
    const medir = () => {
      if (!grupo.current || !medidor.current) return
      const anchos = [...medidor.current.children].map((c) => (c as HTMLElement).offsetWidth)
      setALaVista(cuantasEntran(anchos, grupo.current.clientWidth))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(grupo.current)
    return () => ro.disconnect()
  }, [ajustable, firma])
  const vistas = opciones.slice(0, aLaVista)
  const resto = opciones.slice(aLaVista)
  const tildadosResto = resto.filter((o) => elegidos.has(o.id)).length
  return (
    <div
      ref={grupo}
      className={`ag-barra-grupo ${ajustable ? 'ag-barra-grupo--ajustable' : ''}`}
      role="group"
      aria-label={`Filtrar por ${nombre} (${unico ? 'se elige uno' : 'se pueden tildar varios'})`}
    >
      {ajustable && (
        <div ref={medidor} className="ag-medidor" aria-hidden="true">
          {opciones.map((o) => (
            <span key={o.id} className="ag-tab">
              <i className={`${unico ? 'far' : 'fas'} ${icono(false)}`} /> {o.titulo}
              {o.n !== null && <span className="ag-tab-n">{o.n}</span>}
            </span>
          ))}
        </div>
      )}
      {vistas.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={elegidos.has(o.id)}
          className={`ag-tab ${o.color ? 'ag-tab--tipo' : ''} ${elegidos.has(o.id) ? 'ag-tab--on' : ''}`}
          style={o.color ? { ['--tc' as string]: o.color } : undefined}
          onClick={() => onAlternar(o.id)}
        >
          <i className={`${unico ? 'far' : 'fas'} ${icono(elegidos.has(o.id))}`} /> {o.titulo}
          {o.n !== null && <span className="ag-tab-n">{o.n}</span>}
        </button>
      ))}
      {resto.length > 0 && (
        <div className="ag-mas" ref={caja}>
          <button
            type="button"
            className={`ag-mas-btn ${tildadosResto ? 'ag-mas-btn--on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={abierto}
            aria-label={`Más opciones de ${nombre}`}
            title={`Más opciones de ${nombre}`}
            onClick={() => setAbierto((a) => !a)}
          >
            <i className="fas fa-ellipsis" />
            {tildadosResto > 0 && <span className="ag-mas-n">{tildadosResto}</span>}
          </button>
          {abierto && (
            <div className="ag-mas-menu" role="menu">
              {resto.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={elegidos.has(o.id)}
                  className={`ag-mas-it ${elegidos.has(o.id) ? 'ag-mas-it--on' : ''}`}
                  onClick={() => onAlternar(o.id)}
                >
                  <i
                    className={`${unico ? 'far' : 'fas'} ${icono(elegidos.has(o.id))}`}
                    style={o.color ? { color: o.color } : undefined}
                  />
                  <span className="ag-mas-it-tit">{o.titulo}</span>
                  {o.n !== null && <span className="ag-tab-n">{o.n}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Las vistas del calendario, a la derecha de la barra. */
/**
 * Semana (`semanaMes`) es la grilla del mes —una fila por semana— con una columna a la izquierda
 * del lunes: una celda por semana, y la que se toca es la semana en la que se está parado.
 */
const VISTAS = [
  { id: 'dayGridMonth', titulo: 'Mes' },
  { id: 'semanaMes', titulo: 'Semana' },
] as const
type Vista = (typeof VISTAS)[number]['id']

/**
 * El día de hoy, que se actualiza solo: a la medianoche (y al volver a la pestaña, por si la
 * computadora estuvo suspendida) se vuelve a leer, y la pantalla se redibuja con el día nuevo.
 */
function useHoy(): string {
  const [hoy, setHoy] = useState(hoyLocal)
  useEffect(() => {
    const revisar = () => setHoy(hoyLocal())
    const ahora = new Date()
    const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 1)
    const timer = window.setTimeout(revisar, medianoche.getTime() - ahora.getTime())
    document.addEventListener('visibilitychange', revisar)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [hoy])
  return hoy
}

/** `YYYY-MM-DD` más `n` días. */
function fechaMasDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return fechaLocal(new Date(a, m - 1, d + n))
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** "5 – 11 oct", o "28 sept – 4 oct" si la semana cruza de mes. */
function rangoSemana(inicio: string, fin: string): string {
  const [, mi, di] = inicio.split('-').map(Number)
  const [, mf, df] = fin.split('-').map(Number)
  return mi === mf ? `${di} – ${df} ${MESES[mf - 1]}` : `${di} ${MESES[mi - 1]} – ${df} ${MESES[mf - 1]}`
}

/** Tilda o destilda una opción de un filtro acumulativo. */
function alternar<T>(s: Set<T>, x: T): Set<T> {
  const n = new Set(s)
  if (n.has(x)) n.delete(x)
  else n.add(x)
  return n
}

/**
 * El filtro por tipo: la clave de un tipo de la configuración (`TipoConfig.clave`), u "otros" para
 * los turnos de un tipo que no está configurado (o sin tipo).
 */
type FiltroTipo = string

/** El nombre del tipo, también para los viejos: el que va siempre en el bloque del turno. */
const tituloTipo = (t: Turno) => (t.tipo ? defTipo(t.tipo).titulo : t.etiquetaTipo || 'Sin tipo')

/**
 * Un turno como evento del calendario: el color de su tipo de turno (el de la etiqueta en Monday);
 * con hora, a su hora; sin hora, el día entero.
 */
function aEvento(t: Turno, colores: Record<string, string> | null): EventInput {
  const fondo = colorDeTipo(t.tipo, t.etiquetaTipo, colores)
  return {
    id: t.id,
    title: `${tituloTipo(t)} · ${t.cliente || t.nombre}`,
    start: t.hora ? `${t.fecha}T${t.hora}:00` : t.fecha,
    allDay: !t.hora,
    backgroundColor: fondo,
    borderColor: fondo,
    /* Blanco sobre los colores de Monday; sobre el gris de "sin tipo", oscuro. */
    textColor: fondo.toLowerCase() === COLOR_SIN_TIPO ? '#1f2937' : '#ffffff',
    classNames: ['ag-ev'],
    extendedProps: { turno: t },
  }
}

/** "2026-10-09" → "09/10/2026", para el botón de hoy. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** El bloque del turno: siempre el tipo de turno, y debajo el cliente. */
function ContenidoEvento({ ev }: { ev: EventContentArg }) {
  const t = ev.event.extendedProps.turno as Turno
  return (
    <div
      className="ag-ev-in"
      title={`${tituloTipo(t)} · ${t.cliente || t.nombre}${t.estado === 'pendiente' ? ' (pendiente de enviar)' : ''}`}
    >
      {ev.timeText && <span className="ag-ev-hora">{ev.timeText}</span>}
      <strong className="ag-ev-tipo">{tituloTipo(t)}</strong>
      <span className="ag-ev-cli">{t.cliente || t.nombre}</span>
    </div>
  )
}

/** Las acciones del turno, con su botón: las que admite su estado. */
const BOTONES: {
  accion: AccionCalendario
  texto: string
  icono: string
  clase: string
}[] = [
  {
    accion: 'asignar',
    texto: 'Enviar mensaje',
    icono: 'fa-paper-plane',
    clase: 'ag-acc--asignar',
  },
  {
    accion: 'confirmar',
    texto: 'Completar',
    icono: 'fa-circle-check',
    clase: 'ag-acc--ok',
  },
  {
    accion: 'reprogramar',
    texto: 'Reprogramar',
    icono: 'fa-calendar-days',
    clase: 'ag-acc--rep',
  },
  {
    accion: 'editar',
    texto: 'Editar',
    icono: 'fa-pen-to-square',
    clase: 'ag-acc--editar',
  },
  {
    accion: 'cancelar',
    texto: 'Cancelar',
    icono: 'fa-ban',
    clase: 'ag-acc--cancel',
  },
]

/**
 * Gestionar un turno del calendario: su ficha y las acciones que admite su estado —asignar,
 * completar, reprogramar, editar y cancelar—. Cada acción abre su ventana (las mismas de la
 * gestión de turnos) y, al terminar, el calendario se actualiza.
 */
function FichaTurno({
  turno,
  leido = false,
  onClose,
  onAccion,
  onCambio,
}: {
  turno: Turno
  /** El turno ya viene leído de Monday (se vuelve de una acción): se muestra tal cual, sin releerlo. */
  leido?: boolean
  onClose: () => void
  /** La acción elegida, con el turno tal como se leyó de Monday. */
  onAccion: (a: AccionCalendario, t: Turno) => void
  /** El turno cambió desde la ficha (las aberturas): el calendario lo actualiza. */
  onCambio: (t: Turno) => void
}) {
  const { usuario } = useApp()
  const [fresco, setFresco] = useState<Turno>(turno)
  /** Colocación: editando la cantidad de aberturas (el valor tipeado), o `null`. */
  const [abEditando, setAbEditando] = useState<string | null>(null)
  const [abGuardando, setAbGuardando] = useState(false)
  const [abError, setAbError] = useState('')
  /* Guarda la cantidad de aberturas en el turno de Monday (y deja la constancia). */
  const guardarAberturas = async () => {
    if (abEditando === null || abGuardando) return
    if (!aberturasValidas(abEditando)) return setAbError('Ingresá un número entero mayor a 0.')
    const n = Number(abEditando)
    if (String(n) === fresco.cantAberturas.trim()) return setAbEditando(null)
    setAbGuardando(true)
    setAbError('')
    try {
      await editarTurno(fresco.id, { aberturas: n, autor: usuario?.name ?? '' })
      const nuevo = { ...fresco, cantAberturas: String(n) }
      setFresco(nuevo)
      onCambio(nuevo)
      setAbEditando(null)
    } catch {
      setAbError('No se pudo guardar en Monday. Probá de nuevo.')
    } finally {
      setAbGuardando(false)
    }
  }
  const [leyendo, setLeyendo] = useState(!leido)
  useEffect(() => {
    if (leido) return
    let vivo = true
    leerTurno(turno.id)
      .then((t) => vivo && t && setFresco(t))
      .catch(() => {})
      .finally(() => vivo && setLeyendo(false))
    return () => {
      vivo = false
    }
  }, [turno.id, leido])
  const t = fresco
  const acciones = BOTONES.filter((b) => admiteAccion(t, b.accion))

  return (
    <Modal
      title="Turno"
      icon={<i className="fas fa-calendar-day modal-icon--info" />}
      onClose={onClose}
      className="ag-modal ag-ficha-turno agenda-v2"
    >
      {/* Hasta tener el turno leído de Monday no se muestra nada de él: sólo la espera. */}
      {leyendo ? (
        <div className="ag-ficha-cargando" role="status" aria-live="polite">
          <span className="ag-ficha-spin" aria-hidden="true" />
          <span className="ag-ficha-cargando-tit">Leyendo datos del turno...</span>
        </div>
      ) : (
        <>
          <p className="modal-clave ag-ficha-clave">
            {t.nombre}
            <span className="ag-clave-fecha">{t.fecha ? fechaHoraCorta(t.fecha, t.hora) : 'Sin fecha'}</span>
          </p>
          <dl className="ag-resumen">
            <dt>Estado</dt>
            <dd>
              <EstadoTurnoChip estado={t.estado} />
            </dd>
            <dt>Tipo de turno</dt>
            <dd>
              <TipoTurnoChip tipo={t.tipo} etiqueta={t.etiquetaTipo} />
            </dd>
            <dt>Cliente</dt>
            <dd>{t.cliente || <span className="ant-sd">Sin cliente</span>}</dd>
            <dt>Obra</dt>
            <dd>
              {t.obra || <span className="ant-sd">Sin obra</span>}
              {t.ubicacion && <span className="ant-detalle">{t.ubicacion}</span>}
            </dd>
            <dt>Pendientes de entrega</dt>
            <dd>{t.pendiente || <span className="ant-sd">Ninguno</span>}</dd>
            <dt>Material</dt>
            <dd>{t.material || <span className="ant-sd">Sin especificar</span>}</dd>
            {t.tipo === 'colocacion' && (
              <>
                <dt>Aberturas</dt>
                <dd>
                  {abEditando === null ? (
                    <span className="ag-ab-ver">
                      {t.cantAberturas || <span className="ant-sd">Sin dato</span>}
                      {admiteAccion(t, 'editar') && (
                        <button
                          type="button"
                          className="ag-ab-lapiz"
                          title="Editar la cantidad de aberturas a colocar"
                          aria-label="Editar la cantidad de aberturas a colocar"
                          onClick={() => {
                            setAbError('')
                            setAbEditando(t.cantAberturas.trim())
                          }}
                        >
                          <i className="fas fa-pen" />
                        </button>
                      )}
                    </span>
                  ) : (
                    <span className="ag-ab-editar">
                      <input
                        className={`ag-input ag-ab-input ${aberturasValidas(abEditando) ? '' : 'ag-input--falta'}`}
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        autoFocus
                        value={abEditando}
                        disabled={abGuardando}
                        aria-label="Cantidad de aberturas a colocar"
                        onChange={(e) => setAbEditando(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void guardarAberturas()
                          if (e.key === 'Escape') setAbEditando(null)
                        }}
                      />
                      <button
                        type="button"
                        className="ag-ab-ok"
                        title="Guardar"
                        aria-label="Guardar la cantidad de aberturas"
                        disabled={abGuardando}
                        onClick={() => void guardarAberturas()}
                      >
                        <i className={`fas ${abGuardando ? 'fa-circle-notch spin' : 'fa-check'}`} />
                      </button>
                      <button
                        type="button"
                        className="ag-ab-no"
                        title="Cancelar"
                        aria-label="Cancelar la edición"
                        disabled={abGuardando}
                        onClick={() => setAbEditando(null)}
                      >
                        <i className="fas fa-xmark" />
                      </button>
                      {abError && <span className="ag-ab-error">{abError}</span>}
                    </span>
                  )}
                </dd>
              </>
            )}
            <dt>Responsable</dt>
            <dd>{t.responsable || <span className="ant-sd">Sin responsable</span>}</dd>
          </dl>
          <div className="ag-ficha-acciones">
            {acciones.length === 0 ? (
              <span className="ant-sd">Este turno ya no admite acciones.</span>
            ) : (
              acciones.map((b) => (
                <button
                  key={b.accion}
                  type="button"
                  className={`ag-acc ${b.clase}`}
                  onClick={() => onAccion(b.accion, t)}
                >
                  <i className={`fas ${b.icono}`} /> {b.texto}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

/**
 * Agenda: el calendario de los turnos.
 *
 * Muestra los turnos ACTIVOS —Enviados y Pendientes de Enviar, todos con el mismo bloque—, cada
 * uno con su tipo de turno —en el color de su etiqueta en el tablero—, sobre verde si la obra es de
 * PVC y amarillo si es de Aluminio. Los filtros por tipo son acumulativos: se ven los turnos de
 * todos los tipos tildados (sin ninguno tildado, se ven todos). El material es excluyente: PVC,
 * Aluminio o sin material (o todos). Los dos grupos se cruzan: "Colocación y Reparación, de PVC".
 *
 *  - Click en un día o en un horario libre: el turno nuevo (`NuevoTurno`), con esa fecha y hora. Un
 *    horario con un turno activo no se puede tomar; se libera cuando ese turno se cumple o se cancela.
 *  - Click en un turno: su ficha y sus acciones (`useAccionesTurno`).
 */
export function AgendaView() {
  const { accionEnCurso } = useApp()
  const [turnos, setTurnos] = useState<Turno[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [filtros, setFiltros] = useState<Set<FiltroTipo>>(new Set())
  /** Los tipos de turno del tablero de configuración; los de siempre, mientras tanto o si no se pudo leer. */
  const [tiposCfg, setTiposCfg] = useState<TipoConfig[]>(TIPOS_POR_DEFECTO)
  const [materiales, setMateriales] = useState<Set<MaterialTurno>>(new Set())
  const [vista, setVista] = useState<Vista>('dayGridMonth')
  /** El título de lo que se ve ("Octubre de 2026", "5 – 11 oct 2026"), para el encabezado propio. */
  const [tituloVista, setTituloVista] = useState('')
  /** El primer día de lo que se ve (`YYYY-MM-DD`): en la semana, su lunes. */
  const [inicioVista, setInicioVista] = useState('')
  /** En Semana: el lunes de la semana en la que se está parado. */
  const [semanaSel, setSemanaSel] = useState('')
  /** En Semana: dónde cae cada fila de la grilla (y el encabezado), para alinear las celdas de la columna. */
  const [filas, setFilas] = useState<{
    cabeza: { top: number; alto: number } | null
    filas: { top: number; alto: number }[]
    total: number
  }>({
    cabeza: null,
    filas: [],
    total: 0,
  })
  const cajaFc = useRef<HTMLDivElement>(null)
  const calendario = useRef<FullCalendar>(null)
  const [colores, setColores] = useState<Record<string, string> | null>(null)
  const [nuevo, setNuevo] = useState<{ fecha: string; hora: string } | null>(null)
  /** El turno que se está editando (con el asistente del turno nuevo). */
  const [editando, setEditando] = useState<Turno | null>(null)
  const [ficha, setFicha] = useState<{ turno: Turno; leido: boolean } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<{
    titulo: string
    texto: string
  } | null>(null)
  const hoy = useHoy()
  /* El "ahora" del calendario cambia de identidad cuando cambia el día: así FullCalendar vuelve a
     marcar cuál es hoy (y qué días ya pasaron) sin recargar la pantalla. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ahora = useMemo(() => () => new Date(), [hoy])

  useEffect(() => {
    let vivo = true
    listarTurnos()
      .then((l) => {
        if (!vivo) return
        setTurnos(l.filter((t) => activo(t.estado)))
        setError(false)
      })
      .catch(() => {
        if (!vivo) return
        setTurnos([])
        setError(true)
      })
    return () => {
      vivo = false
    }
  }, [intento])

  /* Los colores de los tipos, del tablero. Si no se pueden leer, quedan los conocidos. */
  useEffect(() => {
    coloresTipoTurno()
      .then(setColores)
      .catch(() => setColores(null))
  }, [])

  /* Los tipos de turno, del tablero de configuración: se leen cada vez que se entra a la Agenda, así un
     tipo nuevo aparece en los filtros y en el turno nuevo sin tocar la app. */
  useEffect(() => {
    let vivo = true
    getTiposConfig()
      .then((t) => vivo && t.length > 0 && setTiposCfg(t))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  /* Un turno cambiado: si sigue activo se actualiza; si se cumplió o se canceló, sale del calendario. */
  const cambiar = (t: Turno) =>
    setTurnos((l) => {
      const sin = (l ?? []).filter((x) => x.id !== t.id)
      return activo(t.estado) ? [...sin, t] : sin
    })
  const acciones = useAccionesTurno({
    onCambio: cambiar,
    onNuevo: cambiar,
    onAviso: setAviso,
    /* Al volver de una acción, la ficha se muestra con lo que ya se había leído: sin otra espera. */
    onVolver: (t) => setFicha({ turno: t, leido: true }),
  })

  const clavesCfg = new Set(tiposCfg.map((x) => x.clave))
  const filtroDe = (t: Turno): FiltroTipo => {
    const clave = claveDeTurno(t)
    return clavesCfg.has(clave) ? clave : 'otros'
  }
  /*
   * Los tipos tildados se suman; el material es uno solo. Los dos grupos se cruzan (tipo Y material).
   * Cada filtro cuenta los turnos que se verían con el otro grupo como está.
   */
  const conFecha = useMemo(() => (turnos ?? []).filter((t) => t.fecha), [turnos])
  const pasaTipo = (t: Turno) => filtros.size === 0 || filtros.has(filtroDe(t))
  const pasaMaterial = (t: Turno) => materiales.size === 0 || materiales.has(materialDe(t.material))
  const visibles = useMemo(
    () => conFecha.filter((t) => pasaTipo(t) && pasaMaterial(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conFecha, filtros, materiales],
  )
  const semanas = useMemo(
    () => (vista === 'semanaMes' && inicioVista ? semanasDelMes(inicioVista) : []),
    [vista, inicioVista],
  )
  useEffect(() => {
    if (!semanas.length) return
    const deHoy = semanas.find((x) => hoy >= x.inicio && hoy <= x.fin && hoy.slice(0, 7) === inicioVista.slice(0, 7))
    /* Sin hoy en el mes: la primera semana que es mayormente del mes (su jueves cae en él). */
    const primera = semanas.find((x) => fechaMasDias(x.inicio, 3).slice(0, 7) === inicioVista.slice(0, 7)) ?? semanas[0]
    setSemanaSel(deHoy?.inicio ?? primera.inicio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanas])
  const finSel = semanaSel ? fechaMasDias(semanaSel, 6) : ''
  const enSemana = (fecha: string) => fecha >= semanaSel && fecha <= finSel
  /* En Semana sólo se ven los turnos de la semana elegida. */
  const eventos = useMemo(
    () =>
      (vista === 'semanaMes' && semanaSel ? visibles.filter((t) => enSemana(t.fecha)) : visibles).map((t) =>
        aEvento(t, colores),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibles, colores, vista, semanaSel],
  )

  /* En Semana, la columna de semanas se alinea con las filas de la grilla: se miden al dibujarse y
     cada vez que cambian de alto (más o menos turnos, otra semana, otro ancho de pantalla). */
  useLayoutEffect(() => {
    const caja = cajaFc.current
    if (vista !== 'semanaMes' || !caja) return
    const medir = () => {
      const base = caja.getBoundingClientRect().top
      const cab = caja.querySelector('.fc-col-header')?.getBoundingClientRect()
      const trs = [...caja.querySelectorAll('.fc-daygrid-body tbody tr[role="row"]')].map((tr) =>
        tr.getBoundingClientRect(),
      )
      setFilas({
        cabeza: cab ? { top: cab.top - base, alto: cab.height } : null,
        filas: trs.map((r) => ({ top: r.top - base, alto: r.height })),
        total: caja.getBoundingClientRect().height,
      })
    }
    const cuadro = requestAnimationFrame(medir)
    const ro = new ResizeObserver(medir)
    ro.observe(caja)
    return () => {
      cancelAnimationFrame(cuadro)
      ro.disconnect()
    }
  }, [vista, eventos, semanaSel])
  const cuenta = (f: FiltroTipo) => conFecha.filter((t) => pasaMaterial(t) && filtroDe(t) === f).length
  const cuentaMaterial = (m: MaterialTurno) =>
    conFecha.filter((t) => pasaTipo(t) && materialDe(t.material) === m).length
  const hayFiltros = filtros.size > 0 || materiales.size > 0
  const limpiarFiltros = () => {
    setFiltros(new Set())
    setMateriales(new Set())
  }
  const colorFiltro = (f: FiltroTipo) => {
    const cfg = tiposCfg.find((x) => x.clave === f)
    if (!cfg) return COLOR_SIN_TIPO
    return colorDeTipo(cfg.conocido, cfg.conocido ? defTipo(cfg.conocido).etiqueta : cfg.titulo, colores)
  }

  const alternarFiltro = (f: FiltroTipo) => setFiltros((s) => alternar(s, f))
  /* El material es excluyente: elegir uno reemplaza al anterior; elegirlo de nuevo vuelve a todos. */
  const alternarMaterial = (m: MaterialTurno) => setMateriales((s) => (s.has(m) ? new Set() : new Set([m])))

  const conDatos = turnos !== null
  const opcionesMaterial: OpcionFiltro<MaterialTurno>[] = MATERIALES.map((m) => ({
    id: m.id,
    titulo: m.titulo,
    n: conDatos ? cuentaMaterial(m.id) : null,
  }))
  const opcionesTipo: OpcionFiltro<FiltroTipo>[] = [
    ...tiposCfg.map((t) => ({ id: t.clave, titulo: t.titulo })),
    { id: 'otros', titulo: 'Otros' },
  ].map((o) => ({ ...o, color: colorFiltro(o.id), n: conDatos ? cuenta(o.id) : null }))

  /* "Filtros aplicados": lo tildado, en el orden de la barra, cada uno con su forma de quitarlo. */
  const aplicados: { clave: string; texto: string; color?: string; quitar: () => void }[] = [
    ...opcionesMaterial
      .filter((o) => materiales.has(o.id))
      .map((o) => ({ clave: `m-${o.id}`, texto: o.titulo, quitar: () => alternarMaterial(o.id) })),
    ...opcionesTipo
      .filter((o) => filtros.has(o.id))
      .map((o) => ({ clave: `t-${o.id}`, texto: o.titulo, color: o.color, quitar: () => alternarFiltro(o.id) })),
  ]

  /**
   * Cambia la vista. Con `fecha` (la semana o el día que se tocó en el mes), va a esa. Sin ella (los
   * botones de la barra), a hoy si hoy está en lo que se ve; si no, al comienzo de lo que se ve —el
   * mes elegido—, y no a la primera semana que asoma en la grilla.
   */
  const cambiarVista = (v: Vista, fecha?: Date) => {
    const api = calendario.current?.getApi()
    if (!api) return
    const { currentStart, currentEnd } = api.view
    const ahoraMismo = new Date()
    const destino = fecha ?? (ahoraMismo >= currentStart && ahoraMismo < currentEnd ? ahoraMismo : currentStart)
    api.changeView(v, destino)
    setVista(v)
  }

  const ocupado = !!accionEnCurso || acciones.ocupado

  /* Un día libre (mes o semana): el turno nuevo; la hora se elige al registrarlo. */
  const alElegirDia = (info: DateClickArg) => {
    if (ocupado) return
    const fecha = fechaLocal(info.date)
    const hora = info.allDay ? '' : horaLocal(info.date)
    if (fecha < hoy) {
      setBloqueo({
        titulo: 'Ese día ya pasó',
        texto: 'Los turnos se agendan de hoy en adelante. Elegí otro día.',
      })
      return
    }
    if (hora && horarioOcupado(turnos ?? [], fecha, hora)) {
      setBloqueo({
        titulo: 'Ese horario no está libre',
        texto: `El ${fechaHoraCorta(fecha, hora)} ya tiene un turno. Se libera cuando ese turno se completa o se cancela.`,
      })
      return
    }
    setAviso(null)
    setNuevo({ fecha, hora })
  }

  const alElegirTurno = (info: EventClickArg) => {
    if (ocupado) return
    /* Si el turno se eligió desde la ventanita de "+N más", se cierra: si no, queda encima de la ficha. */
    info.el.closest('.fc-popover')?.querySelector<HTMLElement>('.fc-popover-close')?.click()
    setAviso(null)
    setFicha({ turno: info.event.extendedProps.turno as Turno, leido: false })
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Agenda de Turnos"
        descripcion="Tocá un día para agendar un turno, o un turno para gestionarlo."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <div className="cobro-static">
        <div className="cobro-card">
          {/* La barra del calendario: material y tipo de turno, con las vistas a la derecha. */}
          <div className="ag-barra">
            <GrupoFiltro
              nombre="material"
              opciones={opcionesMaterial}
              elegidos={materiales}
              onAlternar={alternarMaterial}
              unico
            />
            <span className="ag-barra-div" aria-hidden="true" />
            <GrupoFiltro
              nombre="tipo de turno"
              ajustable
              opciones={opcionesTipo}
              elegidos={filtros}
              onAlternar={alternarFiltro}
            />
            <div className="ag-vistas" role="group" aria-label="Vista del calendario">
              {VISTAS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={vista === x.id}
                  className={`ag-vista ${vista === x.id ? 'ag-vista--on' : ''}`}
                  onClick={() => cambiarVista(x.id)}
                >
                  {x.titulo}
                </button>
              ))}
            </div>
          </div>

          {/* Debajo, separado por una línea: lo que el usuario filtró, cada uno con su cruz para quitarlo. */}
          <div className="ag-aplicados" aria-live="polite">
            <span className="ag-aplicados-tit">Filtros aplicados:</span>
            {aplicados.length === 0 ? (
              <span className="ag-aplicados-nada">Ninguno. Se ven todos los turnos.</span>
            ) : (
              aplicados.map((a) => (
                <span key={a.clave} className="ag-aplicado">
                  {a.color && <span className="ag-aplicado-color" style={{ background: a.color }} />}
                  {a.texto}
                  <button
                    type="button"
                    className="ag-aplicado-x"
                    aria-label={`Quitar el filtro ${a.texto}`}
                    onClick={a.quitar}
                  >
                    <i className="fas fa-xmark" />
                  </button>
                </span>
              ))
            )}
            {hayFiltros && (
              <button type="button" className="ag-link ag-limpiar" onClick={limpiarFiltros}>
                <i className="fas fa-filter-circle-xmark" /> Quitar todos
              </button>
            )}
          </div>

          <div className="ag-calendario">
            {/* El encabezado del calendario: las flechas para moverse, la fecha de hoy —sólo un dato, no
                un botón— y el título de lo que se ve, centrado. */}
            <div className="ag-cal-cabeza">
              <div className="ag-cal-nav">
                <button
                  type="button"
                  className="ag-cal-flecha"
                  aria-label="Anterior"
                  title="Anterior"
                  onClick={() => calendario.current?.getApi().prev()}
                >
                  <i className="fas fa-chevron-left" />
                </button>
                <button
                  type="button"
                  className="ag-cal-flecha"
                  aria-label="Siguiente"
                  title="Siguiente"
                  onClick={() => calendario.current?.getApi().next()}
                >
                  <i className="fas fa-chevron-right" />
                </button>
                <span className="ag-cal-hoy">
                  <i className="fas fa-calendar-day" aria-hidden="true" /> Hoy, {fechaCorta(hoy)}
                </span>
              </div>
              <h3 className="ag-cal-titulo">{tituloVista}</h3>
              <span aria-hidden="true" />
            </div>
            {turnos === null && (
              <div className="ag-calendario-cargando" role="status">
                <i className="fas fa-spinner fa-spin" /> Leyendo los turnos de la Agenda...
              </div>
            )}
            {error && (
              <p className="ag-calendario-error" role="alert">
                <i className="fas fa-circle-info" /> No se pudieron leer los turnos desde Monday.{' '}
                <button
                  type="button"
                  className="cobro-reintentar"
                  onClick={() => {
                    setTurnos(null)
                    setIntento((n) => n + 1)
                  }}
                >
                  Volver a intentar
                </button>
              </p>
            )}
            {/* Semana: a la izquierda del lunes, una celda por semana del mes, alineada con su fila. Tocar
                una es pararse en esa semana: sólo se ven sus turnos, y la celda lleva el borde azul. */}
            <div className={`ag-cal-cuerpo ${vista === 'semanaMes' ? 'ag-cal-cuerpo--semanas' : ''}`}>
              {vista === 'semanaMes' && (
                <div
                  className="ag-semanas"
                  style={{ height: filas.total || undefined }}
                  role="group"
                  aria-label="Semanas del mes"
                >
                  {filas.cabeza && (
                    <span className="ag-semanas-cab" style={{ top: filas.cabeza.top, height: filas.cabeza.alto }}>
                      Semana
                    </span>
                  )}
                  {semanas.map((x, i) => {
                    const fila = filas.filas[i]
                    if (!fila) return null
                    const on = x.inicio === semanaSel
                    const n = visibles.filter((t) => t.fecha >= x.inicio && t.fecha <= x.fin).length
                    return (
                      <button
                        key={x.inicio}
                        type="button"
                        aria-pressed={on}
                        className={`ag-semana ${on ? 'ag-semana--on' : ''}`}
                        style={{ top: fila.top, height: fila.alto }}
                        onClick={() => setSemanaSel(x.inicio)}
                      >
                        <span className="ag-semana-rango">{rangoSemana(x.inicio, x.fin)}</span>
                        <span className="ag-semana-n">{n === 1 ? '1 turno' : `${n} turnos`}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="ag-cal-fc" ref={cajaFc}>
                <FullCalendar
                  ref={calendario}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  locale={esLocale}
                  initialView="dayGridMonth"
                  views={{ semanaMes: { type: 'dayGridMonth' } }}
                  /* Tantas filas como semanas tiene el mes (no siempre 6). */
                  fixedWeekCount={false}
                  /* En Semana, los días fuera de la semana elegida se atenúan. */
                  dayCellClassNames={(a) =>
                    vista === 'semanaMes' && semanaSel && !enSemana(fechaLocal(a.date)) ? ['ag-dia-fuera'] : []
                  }
                  /* El encabezado es propio (arriba): la fecha de hoy es un dato, no un botón. */
                  headerToolbar={false}
                  firstDay={1}
                  height="auto"
                  /* En Semana, la semana elegida muestra todos sus turnos (sin "+N más"). */
                  dayMaxEvents={vista === 'semanaMes' ? false : 4}
                  /* Todos los turnos como bloque, también los que tienen hora: así siempre llevan el color de su tipo. */
                  eventDisplay="block"
                  now={ahora}
                  events={eventos}
                  eventContent={(ev) => <ContenidoEvento ev={ev} />}
                  dateClick={alElegirDia}
                  eventClick={alElegirTurno}
                  datesSet={(a) => {
                    setVista(a.view.type as Vista)
                    setTituloVista(a.view.title)
                    setInicioVista(fechaLocal(a.view.currentStart))
                  }}
                />
              </div>
            </div>
          </div>

          <div className="cobro-card-acts">
            {aviso && (
              <span className="cobro-bloqueo-inline cobro-bloqueo-inline--ok">
                <i className="fas fa-circle-check" /> {aviso}
              </span>
            )}
          </div>
        </div>
      </div>

      {editando && (
        <NuevoTurno
          tipos={tiposCfg}
          editar={editando}
          fecha={editando.fecha}
          hora={editando.hora}
          onCerrar={(texto) => {
            const t = editando
            setEditando(null)
            /* Sin guardar (Volver o la ×): de vuelta a la ficha del turno, sin releerlo. */
            if (!texto) return setFicha({ turno: t, leido: true })
            /* Guardados los cambios, se vuelven a leer los turnos: el calendario lo muestra como quedó. */
            setAviso(texto)
            setTurnos(null)
            setIntento((n) => n + 1)
          }}
          onCreado={cambiar}
        />
      )}

      {nuevo && (
        <NuevoTurno
          tipos={tiposCfg}
          fecha={nuevo.fecha}
          hora={nuevo.hora}
          onCerrar={(texto) => {
            setNuevo(null)
            if (!texto) return
            /* Se creó un turno (y se envió o no el mensaje): se vuelven a leer todos los turnos, así
               el calendario muestra el nuevo tal como quedó en Monday. */
            setAviso(texto)
            setTurnos(null)
            setIntento((n) => n + 1)
          }}
          onCreado={cambiar}
        />
      )}

      {ficha && (
        <FichaTurno
          key={`${ficha.turno.id}-${ficha.leido}`}
          turno={ficha.turno}
          leido={ficha.leido}
          onClose={() => setFicha(null)}
          onAccion={(accion, t) => {
            setFicha(null)
            /* Editar abre el mismo asistente del turno nuevo, con los datos del turno. */
            if (accion === 'editar') return setEditando(t)
            acciones.abrir(accion, t)
          }}
          onCambio={cambiar}
        />
      )}

      {acciones.modales}

      {bloqueo && (
        <AvisoModal titulo={bloqueo.titulo} onClose={() => setBloqueo(null)}>
          {bloqueo.texto}
        </AvisoModal>
      )}
    </section>
  )
}
