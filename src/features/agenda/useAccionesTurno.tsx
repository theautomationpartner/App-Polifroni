import { useEffect, useId, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { hoyLocal } from '@/features/op/DatosMedicion'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  VISTA_TURNO,
  admiteTurno,
  etiquetaResultado,
  fechaHoraCorta,
  horarioOcupado,
  mensajeCancelacion,
  mensajeConfirmacion,
  mensajeMedicion,
  mensajeReagendado,
  textoResultado,
  type AccionTurno,
  type EstadoTurno,
  type Finalizacion,
} from '@/lib/agenda'
import {
  asignarTipoTurno,
  cancelarTurno,
  confirmarTurno,
  contactoDeCliente,
  crearTurnoReprogramado,
  editarTurno,
  escribirEtiquetaTipo,
  getTiposReparacion,
  idsOrdenesDeObra,
  leerTurno,
  listarTurnos,
  marcarNotificacion,
  opsDeTurno,
  registrarAsignacion,
  saldoDeObra,
  type TipoReparacion,
  type Turno,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { registrarActividad } from './actividad'
import { EnvioMensaje } from './EnvioMensaje'
import { ModalOrdenes, type OpElegida } from './ModalOrdenes'
import {
  ModalCancelarTurno,
  ModalConfirmarTurno,
  ModalReprogramarTurno,
  datosAviso,
  textoAsignacion,
  type DatosCancelacion,
  type DatosReprogramacion,
} from './ModalesTurno'

/** Las acciones sobre un turno del calendario: las de la gestión, más editar. */
export type AccionCalendario = AccionTurno | 'editar'

/** Una acción abierta sobre un turno: la ventana que la pide. */
type Abierta = { accion: AccionCalendario; turno: Turno }

/** El mensaje que se pregunta si se envía, después de asignar, confirmar, cancelar o reprogramar. */
type Envio = { mensaje: 'asignacion' | 'confirmacion' | 'cancelacion' | 'reasignacion'; turno: Turno; texto: string; celular: string }

const TITULO_ENVIO: Record<Envio['mensaje'], string> = {
  asignacion: '¿Desea enviar el mensaje de asignación al cliente?',
  confirmacion: '¿Desea enviar el mensaje de confirmación del turno al cliente?',
  cancelacion: '¿Desea enviar el mensaje de cancelación del turno al cliente?',
  reasignacion: '¿Desea enviar el mensaje de reasignación del turno al cliente?',
}

/** ¿El turno admite la acción? Editar, mientras siga activo; el resto, según su estado. */
export const admiteAccion = (t: Turno, accion: AccionCalendario): boolean =>
  accion === 'editar' ? t.estado === 'pendiente' || t.estado === 'asignado' : admiteTurno(t.estado, accion)

/* ────────────────────────────────────────────────────────────────────────────────
 * Editar
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface DatosEdicion {
  aberturas?: number | null
  tipoReparacionId?: number | null
  ops?: OpElegida[]
}

/**
 * Editar un turno activo SIN moverlo de fecha (eso es reprogramar): la cantidad de aberturas
 * (Colocación), el tipo de reparación (Reparación) y las OP de su obra vinculadas al turno.
 */
function ModalEditarTurno({ turno, onClose, onGuardar }: { turno: Turno; onClose: () => void; onGuardar: (d: DatosEdicion) => void }) {
  const uid = useId()
  const colocacion = turno.tipo === 'colocacion'
  const reparacion = turno.tipo === 'reparacion'
  const [aberturas, setAberturas] = useState(turno.cantAberturas)
  const [tipos, setTipos] = useState<TipoReparacion[] | null>(null)
  const [tipoRep, setTipoRep] = useState('')
  /** Las OP de la obra y las ya vinculadas: `null` mientras se leen. */
  const [ordenesObra, setOrdenesObra] = useState<string[] | null>(turno.obraId ? null : [])
  const [ops, setOps] = useState<OpElegida[] | null>(null)
  const [opsTocadas, setOpsTocadas] = useState(false)
  const [verOps, setVerOps] = useState(false)

  useEffect(() => {
    let vivo = true
    if (reparacion) void getTiposReparacion().then((t) => vivo && setTipos(t)).catch(() => vivo && setTipos([]))
    if (turno.obraId) {
      void Promise.all([idsOrdenesDeObra(turno.obraId), opsDeTurno(turno.id)])
        .then(([deObra, vinculadas]) => {
          if (!vivo) return
          setOrdenesObra(deObra)
          setOps(vinculadas.map((id) => ({ id, nombre: id })))
        })
        .catch(() => {
          if (!vivo) return
          setOrdenesObra([])
          setOps([])
        })
    }
    return () => {
      vivo = false
    }
  }, [turno.id, turno.obraId, reparacion])

  const nada = !colocacion && !reparacion && !turno.obraId

  const guardar = () => {
    const d: DatosEdicion = {}
    if (colocacion) {
      const n = aberturas.trim() === '' ? null : Number(aberturas)
      d.aberturas = n != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null
    }
    if (reparacion && tipoRep) d.tipoReparacionId = tipos?.find((t) => t.nombre === tipoRep)?.id ?? null
    if (opsTocadas && ops) d.ops = ops
    onGuardar(d)
  }

  return (
    <>
      <Modal
        title="Editar el turno"
        icon={<i className="fas fa-pen-to-square modal-icon--info" />}
        onClose={onClose}
        className="ag-modal"
        actions={
          <>
            <button type="button" className="btn btn-out" onClick={onClose}>
              Volver
            </button>
            {!nada && (
              <button type="button" className="btn btn-primary btn-marca" onClick={guardar}>
                <i className="fas fa-floppy-disk" /> Guardar cambios
              </button>
            )}
          </>
        }
      >
        <p className="modal-clave">
          {turno.nombre}
          <span className="ag-clave-fecha">{turno.fecha ? fechaHoraCorta(turno.fecha, turno.hora) : 'Sin fecha'}</span>
        </p>
        <p className="modal-nota">
          {nada
            ? 'Este turno no tiene datos para editar. Para cambiarle la fecha o la hora, reprogramalo.'
            : 'Los cambios quedan en el turno, sin moverlo de fecha. Para cambiar la fecha o la hora, reprogramalo.'}
        </p>

        <div className="carga-grid ag-editar-campos">
          {colocacion && (
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-ab`}>
                Cantidad de aberturas
              </label>
              <div className="med-conic">
                <i className="fas fa-border-all" aria-hidden="true" />
                <input
                  id={`${uid}-ab`}
                  className="med-input"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="Ej.: 4"
                  value={aberturas}
                  onChange={(e) => setAberturas(e.target.value)}
                />
              </div>
            </div>
          )}
          {reparacion && (
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-rep`}>
                Tipo de reparación
              </label>
              <SelectBuscable
                id={`${uid}-rep`}
                valor={tipoRep}
                opciones={(tipos ?? []).map((t) => ({ valor: t.nombre, texto: t.nombre }))}
                placeholder="Sin cambios"
                cargando={tipos === null}
                textoCargando="Leyendo los tipos de reparación…"
                onElegir={setTipoRep}
              />
            </div>
          )}
          {turno.obraId && (
            <div className="med-campo">
              <span className="med-l">Órdenes de producción</span>
              <button type="button" className="btn btn-out ag-ver-op" disabled={ops === null || ordenesObra === null} onClick={() => setVerOps(true)}>
                <i className="fas fa-industry" /> Ver OP{ops && ops.length ? ` (${ops.length} vinculada${ops.length === 1 ? '' : 's'})` : ''}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {verOps && ordenesObra && ops && (
        <ModalOrdenes
          obraNombre={turno.obra || turno.nombre}
          ordenesIds={ordenesObra}
          elegidas={ops.map((o) => o.id)}
          onClose={() => setVerOps(false)}
          onListo={(elegidas) => {
            setOps(elegidas)
            setOpsTocadas(true)
            setVerOps(false)
          }}
        />
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * El hook
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Las acciones sobre un turno ya registrado, las mismas que tenía "Consultar y Gestionar Turnos":
 *
 *  - Sin asignar → ASIGNAR: pasa a "Asignada" y se pregunta si se manda el mensaje de asignación.
 *  - Asignado → CONFIRMAR (completar): advierte que es irreversible, pide el estado de finalización
 *    y pasa a "Cumplido"; después se pregunta si se manda el mensaje de confirmación.
 *  - Asignado → CANCELAR: pide el motivo y pasa a "Cancelado"; después, el mensaje de cancelación.
 *  - Asignado → REPROGRAMAR: cancela este turno y crea otro en la fecha y hora nuevas (que tienen
 *    que estar libres); después, el mensaje de reasignación, que deja el nuevo "Asignada".
 *  - Activo → EDITAR: aberturas, tipo de reparación y OP, sin moverlo de fecha.
 *
 * Cada mensaje se pregunta con la ventana compartida (`EnvioMensaje`), y cada operación deja su
 * actividad en el turno. Antes de cada acción el turno se relee: otra persona pudo haberlo movido.
 *
 * Quien lo usa recibe cada turno cambiado (`onCambio`), el turno nuevo de una reprogramación
 * (`onNuevo`) y el renglón que cuenta cómo quedó (`onAviso`). Si la ventana de una acción se cierra
 * sin hacer nada (Volver), `onVolver` recibe el turno: así se vuelve a su ficha.
 */
export function useAccionesTurno({
  onCambio,
  onNuevo,
  onAviso,
  onVolver,
}: {
  onCambio: (t: Turno) => void
  onNuevo: (t: Turno) => void
  onAviso: (texto: string) => void
  onVolver?: (t: Turno) => void
}) {
  const dispatch = useDispatch()
  const { usuario } = useApp()
  const [abierta, setAbierta] = useState<Abierta | null>(null)
  const [envio, setEnvio] = useState<Envio | null>(null)
  const [trabajando, setTrabajando] = useState<{ titulo: string; detalle: string } | null>(null)
  const [bloqueo, setBloqueo] = useState<string | null>(null)
  /** La actividad de la última operación no se pudo registrar: se suma al aviso. */
  const [sinActividad, setSinActividad] = useState(false)
  const hoy = hoyLocal()
  const autor = usuario?.name ?? ''

  useAccionEnCurso('Esperá a que termine de actualizarse el turno.', trabajando !== null)

  const avisar = (texto: string) => onAviso(sinActividad ? `${texto} No se pudo registrar la actividad en el turno: revisalo en Monday.` : texto)

  /* Arrepentido: se cierra la ventana de la acción sin escribir nada y se vuelve a la ficha. */
  const volver = () => {
    const t = abierta?.turno
    setAbierta(null)
    if (t) onVolver?.(t)
  }

  const abrir = (accion: AccionCalendario, turno: Turno) => {
    setSinActividad(false)
    /* Enviar el mensaje de un turno pendiente no tiene ventana previa: va directo al mensaje. */
    if (accion === 'asignar') return void asignar(turno)
    setAbierta({ accion, turno })
  }

  const actividad = async (...args: Parameters<typeof registrarActividad>) => {
    if (!(await registrarActividad(...args))) setSinActividad(true)
  }

  /** Relee el turno antes de tocarlo. Si ya no admite la acción, se dice por qué y no se escribe nada. */
  const fresco = async (t: Turno, accion: AccionCalendario): Promise<Turno | null> => {
    const f = await leerTurno(t.id)
    if (!f) {
      setBloqueo('El turno ya no está en la Agenda.')
      return null
    }
    if (!admiteAccion(f, accion)) {
      onCambio(f)
      setBloqueo(`El turno ahora está «${VISTA_TURNO[f.estado].rotulo}» y ya no se puede hacer eso.`)
      return null
    }
    return f
  }

  /**
   * Relee el turno después de escribirlo, para mostrar lo que quedó en Monday. Con `estado`, ese es
   * el estado recién escrito y manda sobre lo leído: así el calendario lo saca o lo cambia aunque la
   * lectura llegue con el estado anterior (o falle).
   */
  const releer = async (base: Turno, estado?: EstadoTurno): Promise<Turno> => {
    const leido = (await leerTurno(base.id).catch(() => null)) ?? base
    const nuevo = estado ? { ...leido, estado } : leido
    onCambio(nuevo)
    return nuevo
  }

  const preguntarMensaje = async (mensaje: Envio['mensaje'], t: Turno, armar: (ubicacionCliente: string) => string) => {
    const contacto = await contactoDeCliente(t.clienteId).catch(() => ({ celular: '', ubicacion: '' }))
    setEnvio({ mensaje, turno: t, texto: armar(contacto.ubicacion), celular: contacto.celular })
  }

  const asignar = async (t: Turno) => {
    setAbierta(null)
    setTrabajando({ titulo: 'Preparando el mensaje...', detalle: 'Se están leyendo el turno y el contacto del cliente.' })
    try {
      const f = await fresco(t, 'asignar')
      if (!f) return
      /* El estado no se toca acá: pasa a Enviado recién cuando el mensaje sale (registrarEnvio). */
      const nuevo = f
      const saldo = nuevo.tipo === 'colocacion' && nuevo.aprobacion === 'NO Aprobado' ? await saldoDeObra(nuevo.obraId).catch(() => null) : null
      await preguntarMensaje('asignacion', nuevo, () => textoAsignacion(nuevo, saldo))
    } catch {
      dispatch({ type: 'errorMonday', accion: 'preparar el mensaje del turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const confirmar = async (t: Turno, fin: Finalizacion) => {
    setAbierta(null)
    setTrabajando({ titulo: 'Completando el turno...', detalle: 'Se está registrando el turno como Cumplido en la Agenda.' })
    try {
      const f = await fresco(t, 'confirmar')
      if (!f) return
      const resultado = etiquetaResultado(f.tipo, fin)
      await confirmarTurno(f.id, { etiquetaResultado: resultado, resultado: textoResultado(f.tipo, fin), autor, hoy })
      const nuevo = await releer(f, 'cumplido')
      await actividad('confirmacion', nuevo, { autor, resultado: textoResultado(f.tipo, fin) })
      await preguntarMensaje('confirmacion', nuevo, (ubicacionCliente) =>
        f.tipo === 'medicion' && fin.medicion
          ? mensajeMedicion(nuevo.cliente || nuevo.nombre, fin.medicion)
          : mensajeConfirmacion({ ...datosAviso(nuevo, ubicacionCliente), servicio: resultado || nuevo.resultado || nuevo.etiquetaTipo }),
      )
    } catch {
      dispatch({ type: 'errorMonday', accion: 'completar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const cancelar = async (t: Turno, d: DatosCancelacion) => {
    setAbierta(null)
    setTrabajando({ titulo: 'Cancelando el turno...', detalle: 'Se está pasando el turno a Cancelado en la Agenda.' })
    try {
      const f = await fresco(t, 'cancelar')
      if (!f) return
      await cancelarTurno(f.id, { motivo: d.motivo, detalle: d.detalle, autor, hoy })
      const nuevo = await releer(f, 'cancelado')
      await actividad('cancelacion', nuevo, { autor, motivo: d.motivo, detalle: d.detalle })
      await preguntarMensaje('cancelacion', nuevo, (ubicacionCliente) => mensajeCancelacion(datosAviso(nuevo, ubicacionCliente)))
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cancelar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const reprogramar = async (t: Turno, d: DatosReprogramacion) => {
    setAbierta(null)
    setTrabajando({ titulo: 'Reprogramando el turno...', detalle: 'Se verifica que el horario nuevo esté libre.' })
    try {
      const f = await fresco(t, 'reprogramar')
      if (!f) return
      /* El horario nuevo tiene que estar libre: se lee la Agenda en el momento, no lo que se ve. */
      const activos = await listarTurnos()
      if (horarioOcupado(activos, d.fecha, d.hora, f.id)) {
        setBloqueo(`El ${fechaHoraCorta(d.fecha, d.hora)} ya tiene un turno. Elegí otro horario para reprogramarlo.`)
        return
      }
      setTrabajando({ titulo: 'Reprogramando el turno...', detalle: 'Se cancela este turno y se crea el nuevo en la Agenda.' })
      /* 1. El turno original, cancelado con el motivo de la reprogramación. */
      await cancelarTurno(f.id, {
        motivo: d.motivo,
        detalle: [`Reprogramado para el ${fechaHoraCorta(d.fecha, d.hora)}.`, d.detalle.trim()].filter(Boolean).join(' '),
        autor,
        hoy,
      })
      const cancelado = await releer(f, 'cancelado')
      /* 2. El nuevo, con los datos del original y la fecha nueva; el tipo, después de creado. */
      setTrabajando({ titulo: 'Creando el turno nuevo...', detalle: `Se está registrando el turno del ${fechaHoraCorta(d.fecha, d.hora)}.` })
      const nuevoId = await crearTurnoReprogramado(f, { fecha: d.fecha, hora: d.hora, aberturas: d.aberturas, responsableId: usuario?.id ?? null })
      if (f.tipo) await asignarTipoTurno(nuevoId, f.tipo)
      else if (f.etiquetaTipo) await escribirEtiquetaTipo(nuevoId, f.etiquetaTipo)
      await actividad('reprogramacion', cancelado, { autor, motivo: d.motivo, detalle: d.detalle, nuevaFecha: d.fecha, nuevaHora: d.hora })
      const leido = await leerTurno(nuevoId).catch(() => null)
      const nuevo: Turno = leido ?? {
        ...f,
        id: nuevoId,
        fecha: d.fecha,
        hora: d.hora,
        estado: 'pendiente',
        etiquetaEstado: 'Pendiente de Enviar',
        cantAberturas: d.aberturas != null ? String(d.aberturas) : f.cantAberturas,
        responsable: autor,
      }
      onNuevo(nuevo)
      /* 3. El mensaje de reasignación: su envío deja el turno nuevo Asignada. */
      await preguntarMensaje('reasignacion', nuevo, (ubicacionCliente) =>
        mensajeReagendado({ ...datosAviso(nuevo, ubicacionCliente), cliente: nuevo.cliente || nuevo.nombre, ubicacion: ubicacionCliente || nuevo.ubicacion }),
      )
    } catch {
      dispatch({ type: 'errorMonday', accion: 'reprogramar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const editar = async (t: Turno, d: DatosEdicion) => {
    setAbierta(null)
    setTrabajando({ titulo: 'Guardando los cambios...', detalle: 'Se está actualizando el turno en la Agenda.' })
    try {
      const f = await fresco(t, 'editar')
      if (!f) return
      await editarTurno(f.id, { ...d, autor })
      await releer(f)
      avisar(`Se guardaron los cambios del turno de ${f.cliente || f.nombre}.`)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'editar el turno' })
    } finally {
      setTrabajando(null)
    }
  }

  const terminarEnvio = (e: Envio, enviado: boolean, avisoEnvio?: string) => {
    setEnvio(null)
    /* Enviada la asignación (o la reasignación) el turno queda Asignado; si no, como estaba. */
    const asigna = enviado && (e.mensaje === 'asignacion' || e.mensaje === 'reasignacion')
    void releer(e.turno, asigna ? 'asignado' : e.turno.estado)
    if (avisoEnvio) return avisar(avisoEnvio)
    const quien = e.turno.cliente || e.turno.nombre
    if (e.mensaje === 'reasignacion') {
      const cuando = fechaHoraCorta(e.turno.fecha, e.turno.hora)
      return avisar(
        enviado
          ? `El turno de ${quien} se reprogramó para el ${cuando} y quedó Enviado. Se le avisó al cliente.`
          : `El turno de ${quien} se reprogramó para el ${cuando}: quedó uno nuevo Pendiente de Enviar.`,
      )
    }
    const que = { asignacion: 'quedó enviado', confirmacion: 'quedó cumplido', cancelacion: 'quedó cancelado' }[e.mensaje]
    avisar(`El turno de ${quien} ${que}.${enviado ? ' Se le avisó al cliente.' : ''}`)
  }

  const registrarEnvio = (e: Envio) => async (enviado: boolean) => {
    if (e.mensaje === 'reasignacion') {
      await registrarAsignacion(e.turno.id, enviado, hoy)
      if (enviado) await actividad('asignacion', { ...e.turno, estado: 'asignado' }, { autor })
      return
    }
    if (e.mensaje === 'asignacion') {
      await registrarAsignacion(e.turno.id, enviado, hoy)
      if (enviado) await actividad('asignacion', { ...e.turno, estado: 'asignado' }, { autor })
      return
    }
    else await marcarNotificacion(e.turno.id, e.mensaje, enviado)
  }

  const modales = (
    <>
      {abierta?.accion === 'confirmar' && (
        <ModalConfirmarTurno turno={abierta.turno} onClose={volver} onConfirmar={(fin) => void confirmar(abierta.turno, fin)} />
      )}
      {abierta?.accion === 'cancelar' && (
        <ModalCancelarTurno turno={abierta.turno} onClose={volver} onConfirmar={(d) => void cancelar(abierta.turno, d)} />
      )}
      {abierta?.accion === 'reprogramar' && (
        <ModalReprogramarTurno
          turno={abierta.turno}
          hoy={hoy}
          onClose={volver}
          onConfirmar={(d) => void reprogramar(abierta.turno, d)}
        />
      )}
      {abierta?.accion === 'editar' && (
        <ModalEditarTurno turno={abierta.turno} onClose={volver} onGuardar={(d) => void editar(abierta.turno, d)} />
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
              ? 'El turno está Pendiente de Enviar en la Agenda.'
              : envio.mensaje === 'confirmacion'
                ? 'El turno quedó Cumplido en la Agenda.'
                : envio.mensaje === 'reasignacion'
                  ? `El turno se reprogramó para el ${fechaHoraCorta(envio.turno.fecha, envio.turno.hora)}.`
                  : 'El turno quedó Cancelado en la Agenda.'}
          </p>
          <p className="modal-nota">
            {envio.mensaje === 'reasignacion'
              ? 'Si enviás el mensaje de reasignación, el turno nuevo pasa a Enviado. Si no, queda Pendiente de Enviar.'
              : envio.mensaje === 'asignacion'
                ? 'Si lo enviás, el turno pasa a Enviado. Si no, queda Pendiente de Enviar.'
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
    </>
  )

  return { abrir, modales, ocupado: trabajando !== null || envio !== null }
}
