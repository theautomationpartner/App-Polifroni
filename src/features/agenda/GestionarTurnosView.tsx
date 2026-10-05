import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { hoyLocal } from '@/features/op/DatosMedicion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  TIPOS_TURNO,
  VISTA_TURNO,
  activo,
  admiteTurno,
  etiquetaResultado,
  fechaCorta,
  fechaHoraCorta,
  mensajeCancelacion,
  mensajeConfirmacion,
  mensajeMedicion,
  mensajeReagendado,
  textoResultado,
  type AccionTurno,
  type EstadoTurno,
  type Finalizacion,
  type TipoTurno,
} from '@/lib/agenda'
import { normalizar } from '@/lib/texto'
import {
  asignarTipoTurno,
  asignarTurno,
  cancelarTurno,
  confirmarTurno,
  contactoDeCliente,
  crearTurnoReprogramado,
  escribirEtiquetaTipo,
  leerTurno,
  listarTurnos,
  marcarNotificacion,
  mondayHabilitado,
  registrarAsignacion,
  saldoDeObra,
  type Turno,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { registrarActividad } from './actividad'
import { EstadoTurnoChip, TipoTurnoChip } from './chips'
import { EnvioMensaje } from './EnvioMensaje'
import {
  ModalAsignarTurno,
  ModalCancelarTurno,
  ModalConfirmarTurno,
  ModalReprogramarTurno,
  datosAviso,
  textoAsignacion,
  type DatosCancelacion,
  type DatosReprogramacion,
} from './ModalesTurno'

/** Turnos por página de la tabla. */
const POR_PAGINA = 8

/** Sólo se listan los turnos sin asignar y los asignados: los cumplidos y cancelados ya no se gestionan. */
type Filtro = 'activos' | 'pendiente' | 'asignado'

const FILTROS: { id: Filtro; titulo: string }[] = [
  { id: 'activos', titulo: 'Todos' },
  { id: 'pendiente', titulo: 'Sin asignar' },
  { id: 'asignado', titulo: 'Asignados' },
]

/** "jue 15/10/2026", corto para la tabla. */
const diaCorto = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
}

/** Una acción abierta sobre un turno: la ventana que la pide. */
type Abierta = { accion: AccionTurno; turno: Turno }

/** El mensaje que se pregunta si se envía, después de asignar, confirmar o cancelar. */
type Envio = { mensaje: 'asignacion' | 'confirmacion' | 'cancelacion' | 'reasignacion'; turno: Turno; texto: string; celular: string }

const TITULO_ENVIO: Record<Envio['mensaje'], string> = {
  asignacion: '¿Desea enviar el mensaje de asignación al cliente?',
  confirmacion: '¿Desea enviar el mensaje de confirmación del turno al cliente?',
  cancelacion: '¿Desea enviar el mensaje de cancelación del turno al cliente?',
  reasignacion: '¿Desea enviar el mensaje de reasignación del turno al cliente?',
}

/**
 * Consultar y gestionar turnos.
 *
 * Al entrar se traen de la Agenda SÓLO los turnos sin asignar (Pendiente) y los asignados, del más
 * próximo al más lejano. El campo filtra en vivo por cliente, obra, pendiente o nombre del turno; los
 * filtros, por estado y por tipo.
 *
 *  - Sin asignar → ASIGNAR: pasa a "Asignada" y se pregunta si se manda el mensaje de asignación.
 *  - Asignado → CONFIRMAR: advierte que es irreversible, pide el dato de finalización y pasa a
 *    "Cumplido"; después se pregunta si se manda el mensaje de confirmación.
 *  - Asignado → CANCELAR: pide el motivo y pasa a "Cancelado"; después se pregunta si se manda el
 *    mensaje de cancelación. REPROGRAMAR cancela y abre "Crear Turnos" con sus datos (RN-11).
 *
 * El mensaje se pregunta siempre con la misma ventana que al crear un turno (`EnvioMensaje`).
 *
 * Un turno confirmado o cancelado en esta visita sigue en la tabla, con el estilo de su resultado, y
 * sin acciones. La próxima vez que se consulten los turnos ya no aparece.
 *
 * Antes de cada acción el turno se relee del tablero: otra persona pudo haberlo movido.
 */
export function GestionarTurnosView() {
  const dispatch = useDispatch()
  const { usuario, accionEnCurso } = useApp()

  const [turnos, setTurnos] = useState<Turno[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('activos')
  const [tipo, setTipo] = useState<TipoTurno | ''>('')
  const [pagina, setPagina] = useState(0)
  /** Los confirmados o cancelados en esta visita: siguen a la vista hasta la próxima consulta. */
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())

  const [abierta, setAbierta] = useState<Abierta | null>(null)
  /** La actividad de la última operación no se pudo registrar: se suma al aviso. */
  const [sinActividad, setSinActividad] = useState(false)
  const [envio, setEnvio] = useState<Envio | null>(null)
  /** Lo que está corriendo, para la ventana de espera. */
  const [trabajando, setTrabajando] = useState<{ id: string; titulo: string; detalle: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de actualizarse el turno.', trabajando !== null)

  useEffect(() => {
    let vivo = true
    listarTurnos()
      .then((l) => {
        if (!vivo) return
        /* Sólo los que se gestionan: sin asignar y asignados. */
        setTurnos(l.filter((t) => activo(t.estado)))
        setResueltos(new Set())
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

  /** Un turno resuelto en esta visita se ve en "Todos" y en "Asignados", que es de donde salió. */
  const pasa = (f: Filtro, t: Turno) =>
    resueltos.has(t.id) ? f !== 'pendiente' : f === 'activos' ? activo(t.estado) : f === t.estado

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (turnos ?? [])
      .filter(
        (x) =>
          pasa(filtro, x) &&
          (!tipo || x.tipo === tipo) &&
          (!q || [x.nombre, x.cliente, x.obra, x.pendiente, x.id].some((v) => normalizar(v).includes(q))),
      )
      .sort((a, b) => {
        /* Del más próximo al más lejano (por día y hora); los que no tienen fecha, al final. */
        if (!a.fecha !== !b.fecha) return a.fecha ? -1 : 1
        return a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id)
      })
    // `pasa` depende de `resueltos`, que ya está en la lista.
  }, [turnos, busqueda, filtro, tipo, resueltos])

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtrados.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)
  useEffect(() => setPagina(0), [busqueda, filtro, tipo, intento])

  const cuenta = (f: Filtro) => (turnos ?? []).filter((x) => pasa(f, x)).length
  const hoy = hoyLocal()

  const reemplazar = (t: Turno) => setTurnos((l) => (l ?? []).map((x) => (x.id === t.id ? t : x)))

  /** Abre la ventana de una acción. */
  const abrir = (accion: AccionTurno, turno: Turno) => {
    setAviso(null)
    setSinActividad(false)
    setAbierta({ accion, turno })
  }

  /** La actividad de la operación en el turno (Emails & Activities). Si falla, se avisa y se sigue. */
  const actividad = async (...args: Parameters<typeof registrarActividad>) => {
    if (!(await registrarActividad(...args))) setSinActividad(true)
  }

  /**
   * Relee el turno antes de tocarlo. Si mientras tanto lo movieron y ya no admite la acción, se
   * dice por qué y no se escribe nada.
   */
  const fresco = async (t: Turno, accion: AccionTurno): Promise<Turno | null> => {
    const f = await leerTurno(t.id)
    if (!f) {
      setBloqueo('El turno ya no está en la Agenda.')
      setTurnos((l) => (l ?? []).filter((x) => x.id !== t.id))
      return null
    }
    if (!admiteTurno(f.estado, accion)) {
      reemplazar(f)
      setBloqueo(`El turno ahora está «${VISTA_TURNO[f.estado].rotulo}» y ya no se puede hacer eso.`)
      return null
    }
    return f
  }

  /** Relee el turno después de escribirlo, para mostrar lo que quedó en Monday. */
  const releer = async (id: string): Promise<Turno | null> => {
    const nuevo = await leerTurno(id).catch(() => null)
    if (nuevo) reemplazar(nuevo)
    return nuevo
  }

  /** Abre la pregunta del mensaje, con el celular y la dirección del cliente del turno. */
  const preguntarMensaje = async (mensaje: Envio['mensaje'], t: Turno, armar: (ubicacionCliente: string) => string) => {
    const contacto = await contactoDeCliente(t.clienteId).catch(() => ({ celular: '', ubicacion: '' }))
    setEnvio({ mensaje, turno: t, texto: armar(contacto.ubicacion), celular: contacto.celular })
  }

  const asignar = async (t: Turno) => {
    setAbierta(null)
    setTrabajando({ id: t.id, titulo: 'Asignando el turno...', detalle: 'Se está pasando el turno a Asignado en la Agenda.' })
    try {
      const f = await fresco(t, 'asignar')
      if (!f) return
      await asignarTurno(f.id)
      const nuevo = (await releer(f.id)) ?? { ...f, estado: 'asignado' as EstadoTurno }
      await actividad('asignacion', nuevo, { autor: usuario?.name ?? '' })
      /* Colocación No aprobada: el aviso del mensaje lleva el saldo de la obra, leído en el momento. */
      const saldo = nuevo.tipo === 'colocacion' && nuevo.aprobacion === 'NO Aprobado' ? await saldoDeObra(nuevo.obraId).catch(() => null) : null
      await preguntarMensaje('asignacion', nuevo, () => textoAsignacion(nuevo, saldo))
    } catch {
      dispatch({ type: 'errorMonday', accion: 'asignar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const confirmar = async (t: Turno, fin: Finalizacion) => {
    setAbierta(null)
    setTrabajando({ id: t.id, titulo: 'Confirmando el turno...', detalle: 'Se está registrando el turno como Cumplido en la Agenda.' })
    try {
      const f = await fresco(t, 'confirmar')
      if (!f) return
      const resultado = etiquetaResultado(f.tipo, fin)
      await confirmarTurno(f.id, {
        etiquetaResultado: resultado,
        resultado: textoResultado(f.tipo, fin),
        autor: usuario?.name ?? '',
        hoy,
        obraId: f.obraId,
      })
      setResueltos((s) => new Set(s).add(f.id))
      const nuevo = (await releer(f.id)) ?? { ...f, estado: 'cumplido' as EstadoTurno }
      await actividad('confirmacion', nuevo, { autor: usuario?.name ?? '', resultado: textoResultado(f.tipo, fin) })
      /* Medición: el mensaje es el de su resultado (medido, o sin poder medir). */
      await preguntarMensaje('confirmacion', nuevo, (ubicacionCliente) =>
        f.tipo === 'medicion' && fin.medicion
          ? mensajeMedicion(nuevo.cliente || nuevo.nombre, fin.medicion)
          : mensajeConfirmacion({ ...datosAviso(nuevo, ubicacionCliente), servicio: resultado || nuevo.resultado || nuevo.etiquetaTipo }),
      )
    } catch {
      dispatch({ type: 'errorMonday', accion: 'confirmar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const cancelar = async (t: Turno, d: DatosCancelacion) => {
    setAbierta(null)
    setTrabajando({ id: t.id, titulo: 'Cancelando el turno...', detalle: 'Se está pasando el turno a Cancelado en la Agenda.' })
    try {
      const f = await fresco(t, 'cancelar')
      if (!f) return
      await cancelarTurno(f.id, { motivo: d.motivo, detalle: d.detalle, autor: usuario?.name ?? '', hoy })
      setResueltos((s) => new Set(s).add(f.id))
      const nuevo = (await releer(f.id)) ?? { ...f, estado: 'cancelado' as EstadoTurno }
      await actividad('cancelacion', nuevo, { autor: usuario?.name ?? '', motivo: d.motivo, detalle: d.detalle })
      await preguntarMensaje('cancelacion', nuevo, (ubicacionCliente) => mensajeCancelacion(datosAviso(nuevo, ubicacionCliente)))
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cancelar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  /**
   * Reprogramar (RN-11): este turno queda Cancelado con el motivo de la reprogramación, y se crea uno
   * nuevo con sus mismos datos en la fecha nueva (y, en una colocación, con la cantidad de aberturas
   * que se volvió a pedir). El nuevo nace Sin asignar y aparece en la tabla.
   */
  const reprogramar = async (t: Turno, d: DatosReprogramacion) => {
    setAbierta(null)
    setTrabajando({ id: t.id, titulo: 'Reprogramando el turno...', detalle: 'Se cancela este turno y se crea el nuevo en la Agenda.' })
    try {
      const f = await fresco(t, 'reprogramar')
      if (!f) return
      /* 1. El turno original, cancelado con el motivo de la reprogramación. */
      await cancelarTurno(f.id, {
        motivo: d.motivo,
        detalle: [`Reprogramado para el ${fechaHoraCorta(d.fecha, d.hora)}.`, d.detalle.trim()].filter(Boolean).join(' '),
        autor: usuario?.name ?? '',
        hoy,
      })
      setResueltos((s) => new Set(s).add(f.id))
      const cancelado = (await releer(f.id)) ?? { ...f, estado: 'cancelado' as EstadoTurno }
      /* 2. El nuevo, con los datos del original y la fecha nueva; el tipo, después de creado. */
      setTrabajando({ id: t.id, titulo: 'Creando el turno nuevo...', detalle: `Se está registrando el turno del ${fechaHoraCorta(d.fecha, d.hora)}.` })
      const nuevoId = await crearTurnoReprogramado(f, { fecha: d.fecha, hora: d.hora, aberturas: d.aberturas, responsableId: usuario?.id ?? null })
      if (f.tipo) await asignarTipoTurno(nuevoId, f.tipo)
      else if (f.etiquetaTipo) await escribirEtiquetaTipo(nuevoId, f.etiquetaTipo)
      await actividad('reprogramacion', cancelado, { autor: usuario?.name ?? '', motivo: d.motivo, detalle: d.detalle, nuevaFecha: d.fecha, nuevaHora: d.hora })
      const leido = await leerTurno(nuevoId).catch(() => null)
      if (leido) setTurnos((l) => [...(l ?? []), leido])
      setAviso(`El turno de ${f.cliente || f.nombre} se reprogramó para el ${fechaHoraCorta(d.fecha, d.hora)}: quedó uno nuevo Sin asignar.`)
      /* 3. ¿Se le avisa al cliente? El mensaje de reasignación, y su envío deja el turno nuevo Asignada.
         Si el nuevo todavía no se pudo leer, se arma con lo que se sabe: es el original con su fecha nueva. */
      const nuevo: Turno = leido ?? {
        ...f,
        id: nuevoId,
        fecha: d.fecha,
        hora: d.hora,
        estado: 'pendiente',
        etiquetaEstado: 'Pendiente',
        cantAberturas: d.aberturas != null ? String(d.aberturas) : f.cantAberturas,
        responsable: usuario?.name ?? '',
      }
      /* Se saluda al cliente y la ubicación es la suya (la del turno, si el cliente no tiene). */
      await preguntarMensaje('reasignacion', nuevo, (ubicacionCliente) =>
        mensajeReagendado({
          ...datosAviso(nuevo, ubicacionCliente),
          cliente: nuevo.cliente || nuevo.nombre,
          ubicacion: ubicacionCliente || nuevo.ubicacion,
        }),
      )
    } catch {
      dispatch({ type: 'errorMonday', accion: 'reprogramar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  /** Cómo quedó, en el renglón de avisos de la tabla, después de la pregunta del mensaje. */
  const terminarEnvio = (e: Envio, enviado: boolean, avisoEnvio?: string) => {
    setEnvio(null)
    if (e.mensaje === 'reasignacion') {
      const cuando = fechaHoraCorta(e.turno.fecha, e.turno.hora)
      setAviso(
        avisoEnvio ??
          (enviado
            ? `El turno de ${e.turno.cliente || e.turno.nombre} se reprogramó para el ${cuando} y quedó Asignado. Se le avisó al cliente.`
            : `El turno de ${e.turno.cliente || e.turno.nombre} se reprogramó para el ${cuando}: quedó uno nuevo Sin asignar.`),
      )
      void releer(e.turno.id)
      return
    }
    const que = { asignacion: 'quedó asignado', confirmacion: 'quedó cumplido', cancelacion: 'quedó cancelado' }[e.mensaje]
    setAviso(avisoEnvio ?? `El turno de ${e.turno.cliente || e.turno.nombre} ${que}.${enviado ? ' Se le avisó al cliente.' : ''}`)
    void releer(e.turno.id)
  }

  const registrarEnvio = (e: Envio) => async (enviado: boolean) => {
    if (e.mensaje === 'reasignacion') {
      /* El mensaje de reasignación enviado deja el turno nuevo "Asignada" (y queda su actividad). */
      await registrarAsignacion(e.turno.id, enviado, hoy)
      if (enviado) await actividad('asignacion', { ...e.turno, estado: 'asignado' }, { autor: usuario?.name ?? '' })
      return
    }
    if (e.mensaje === 'asignacion') await registrarAsignacion(e.turno.id, enviado, hoy)
    else await marcarNotificacion(e.turno.id, e.mensaje, enviado)
  }

  const total = turnos?.length ?? 0
  const ocupado = trabajando !== null || !!accionEnCurso

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar y Gestionar Turnos"
        descripcion="Los turnos sin asignar y los asignados de la Agenda. Asigná los pendientes, y confirmá, reprogramá o cancelá los asignados."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
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
              placeholder="Buscar por cliente, obra, pendiente o turno"
              aria-label="Buscar turnos"
              autoComplete="off"
              value={busqueda}
              disabled={turnos === null}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <span className="search-helper" role="status" aria-live="polite">
            {turnos === null
              ? 'Leyendo los turnos de la Agenda...'
              : `${filtrados.length} de ${total} ${total === 1 ? 'turno' : 'turnos'}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <div className="ag-filtros">
            <div className="ag-tabs" role="tablist" aria-label="Filtrar por estado">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  className={`ag-tab ${filtro === f.id ? 'ag-tab--on' : ''}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.titulo}
                  {turnos !== null && <span className="ag-tab-n">{cuenta(f.id)}</span>}
                </button>
              ))}
            </div>
            <select
              className="ag-select ag-select--tipo"
              aria-label="Filtrar por tipo de turno"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoTurno | '')}
            >
              <option value="">Todos los tipos</option>
              {TIPOS_TURNO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </select>
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija ag-tabla">
              <colgroup>
                <col className="ag-w-fecha" />
                <col className="ag-w-turno" />
                <col className="ag-w-tipo" />
                <col className="ag-w-estado" />
                <col className="ag-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Turno</th>
                  <th className="ant-col-cen">Tipo</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {turnos === null ? (
                  <tr>
                    <td colSpan={5} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Leyendo los turnos de la Agenda...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error
                        ? 'No se pudieron leer los turnos desde Monday.'
                        : busqueda.trim()
                          ? `Ningún turno coincide con «${busqueda.trim()}».`
                          : 'No hay turnos con estos filtros.'}{' '}
                      {error && (
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
                      )}
                    </td>
                  </tr>
                ) : (
                  visibles.map((t) => {
                    const enCurso = trabajando?.id === t.id
                    const vencido = activo(t.estado) && !!t.fecha && t.fecha < hoy
                    const esHoy = t.fecha === hoy
                    const sobre = t.obra || t.pendiente
                    return (
                      <tr
                        key={t.id}
                        className={[
                          'ant-row',
                          enCurso ? 'ant-row--cancelando' : '',
                          t.estado === 'cumplido' ? 'ag-row--cumplida' : '',
                          t.estado === 'cancelado' ? 'ag-row--cancelada' : '',
                        ].join(' ')}
                        title={t.estado === 'cancelado' && t.motivoCancelacion ? `Motivo: ${t.motivoCancelacion}` : undefined}
                      >
                        <td>
                          {t.fecha ? (
                            <>
                              <span className="ant-nro">{fechaCorta(t.fecha)}</span>
                              <span className={`ant-detalle ${vencido ? 'ag-vencido' : esHoy ? 'ag-hoy' : ''}`}>
                                {/* El día y, si el turno la tiene, la hora. */}
                                {[esHoy ? 'Hoy' : diaCorto(t.fecha), t.hora ? `${t.hora} hs` : '', vencido ? 'ya pasó' : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </>
                          ) : (
                            <span className="ant-sd">Sin fecha</span>
                          )}
                        </td>
                        <td className="ag-turno" title={t.nombre}>
                          <span className="ag-turno-cli">{t.cliente || <span className="ant-sd">Sin cliente</span>}</span>
                          <span className="ant-detalle">{sobre || t.nombre}</span>
                        </td>
                        <td className="ant-col-cen">
                          <TipoTurnoChip tipo={t.tipo} etiqueta={t.etiquetaTipo} />
                        </td>
                        <td className="ant-col-cen">
                          <EstadoTurnoChip estado={t.estado} />
                        </td>
                        <td className="ant-col-cen ag-col-acc">
                          {enCurso ? (
                            <span className="ag-trabajando">
                              <i className="fas fa-circle-notch spin" /> Actualizando…
                            </span>
                          ) : t.estado === 'cumplido' ? (
                            <span className="ag-resuelto ag-resuelto--ok">
                              <i className="fas fa-circle-check" /> Turno cumplido
                            </span>
                          ) : t.estado === 'cancelado' ? null /* Cancelado: la columna queda vacía. */ : admiteTurno(t.estado, 'asignar') ? (
                            <div className="ag-acciones">
                              <button type="button" className="ag-acc ag-acc--asignar" disabled={ocupado} onClick={() => abrir('asignar', t)}>
                                <i className="fas fa-calendar-check" /> Asignar
                              </button>
                            </div>
                          ) : (
                            <div className="ag-acciones">
                              <button type="button" className="ag-acc ag-acc--ok" disabled={ocupado} onClick={() => abrir('confirmar', t)}>
                                <i className="fas fa-circle-check" /> Confirmar
                              </button>
                              <button type="button" className="ag-acc ag-acc--rep" disabled={ocupado} onClick={() => abrir('reprogramar', t)}>
                                <i className="fas fa-calendar-days" /> Reprogramar
                              </button>
                              <button type="button" className="ag-acc ag-acc--cancel" disabled={ocupado} onClick={() => abrir('cancelar', t)}>
                                <i className="fas fa-ban" /> Cancelar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {turnos !== null && (
            <div className="obras-pager">
              <button type="button" className="obras-pager-btn" disabled={enPagina === 0} onClick={() => setPagina(enPagina - 1)}>
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {filtrados.length} {filtrados.length === 1 ? 'turno' : 'turnos'}
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
                {sinActividad && ' No se pudo registrar la actividad en el turno: revisalo en Monday.'}
              </span>
            )}
          </div>
        </div>
      </div>

      {abierta?.accion === 'asignar' && (
        <ModalAsignarTurno turno={abierta.turno} onClose={() => setAbierta(null)} onAsignar={() => void asignar(abierta.turno)} />
      )}
      {abierta?.accion === 'confirmar' && (
        <ModalConfirmarTurno
          turno={abierta.turno}
          onClose={() => setAbierta(null)}
          onConfirmar={(fin) => void confirmar(abierta.turno, fin)}
        />
      )}
      {abierta?.accion === 'cancelar' && (
        <ModalCancelarTurno
          turno={abierta.turno}
          onClose={() => setAbierta(null)}
          onConfirmar={(d) => void cancelar(abierta.turno, d)}
        />
      )}
      {abierta?.accion === 'reprogramar' && (
        <ModalReprogramarTurno
          turno={abierta.turno}
          hoy={hoy}
          onClose={() => setAbierta(null)}
          onConfirmar={(d) => void reprogramar(abierta.turno, d)}
        />
      )}

      {envio && (
        <EnvioMensaje
          titulo={TITULO_ENVIO[envio.mensaje]}
          texto={envio.texto}
          textoNo="No enviar mensaje"
          cliente={{ id: envio.turno.clienteId, nombre: envio.turno.cliente || envio.turno.nombre, celular: envio.celular }}
          registrar={registrarEnvio(envio)}
          onCelular={(nuevo) => setEnvio((e) => (e ? { ...e, celular: nuevo } : e))}
          onTerminar={(enviado, avisoEnvio) => terminarEnvio(envio, enviado, avisoEnvio)}
        >
          <p className="modal-clave">
            {envio.mensaje === 'asignacion'
              ? 'El turno quedó Asignado en la Agenda.'
              : envio.mensaje === 'confirmacion'
                ? 'El turno quedó Cumplido en la Agenda.'
                : envio.mensaje === 'reasignacion'
                  ? `El turno se reprogramó para el ${fechaHoraCorta(envio.turno.fecha, envio.turno.hora)}.`
                  : 'El turno quedó Cancelado en la Agenda.'}
          </p>
          <p className="modal-nota">
            {envio.mensaje === 'reasignacion'
              ? 'Si enviás el mensaje de reasignación, el turno nuevo pasa a Asignado. Si no, queda Sin asignar.'
              : 'Si querés, avisale al cliente por WhatsApp. Si no, cerrá con «No enviar mensaje».'}
          </p>
        </EnvioMensaje>
      )}

      {trabajando && <ModalCargando titulo={trabajando.titulo} detalle={trabajando.detalle} />}

      {bloqueo && (
        <AvisoModal titulo="No se puede hacer" onClose={() => setBloqueo(null)}>
          {bloqueo}
        </AvisoModal>
      )}
    </section>
  )
}
