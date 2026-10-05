import { useEffect, useId, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { hoyLocal } from '@/features/op/DatosMedicion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { admiteSinObra, aprobacionPorSaldo, defTipo, faltantesAlta, fechaLarga, mensajeAsignacion } from '@/lib/agenda'
import {
  asignarTipoTurno,
  crearTurno,
  getTiposReparacion,
  registrarAsignacion,
  type TipoReparacion,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { AprobacionChip, EstadoTurnoChip, TipoTurnoChip } from './chips'
import { CrearTurnoDatosView } from './CrearTurnoDatosView'
import { EnvioMensaje } from './EnvioMensaje'

type Fase = 'preguntando' | 'registrando' | null

/**
 * Crear Turno · Etapa 3: revisar y registrar.
 *
 * Una sola card, "Turno a registrar": el resumen de lo elegido y, adentro, lo último que se decide
 * —la fecha del turno; en Colocación, la cantidad de aberturas (arranca con la que se calculó de la
 * obra y se puede corregir); en Reparación, el tipo de reparación (las etiquetas de la Agenda)—.
 *
 * "Registrar Turno" abre la ventana "Registrando el turno..." y crea el turno en la Agenda, en
 * "Pendiente", con todos los datos cargados MENOS el tipo de turno: el tipo se escribe recién cuando
 * Monday devolvió el ítem, porque ese cambio dispara una automatización nativa del tablero.
 *
 * Registrado, se pregunta si se le manda al cliente el mensaje de asignación, que se ve en esa misma
 * ventana (RN-09):
 *  - Sí → sale el WhatsApp (360messenger) y, confirmado, el turno pasa a "Asignada". Si no sale, se
 *    dice por qué y se puede reintentar o dejarlo Pendiente.
 *  - No → queda "Pendiente"; el mensaje se manda después desde la gestión.
 *
 * Un reintento no vuelve a crear el turno (`registradoId`) ni a escribir el tipo si ya quedó.
 */
export function CrearTurnoRegistrarView() {
  const dispatch = useDispatch()
  const { turno, usuario } = useApp()
  const [fase, setFase] = useState<Fase>(null)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [marcar, setMarcar] = useState(false)
  const [tiposReparacion, setTiposReparacion] = useState<TipoReparacion[] | null>(null)
  /** El tipo de turno ya quedó escrito en el ítem creado (ver `asignarTipoTurno`). */
  const [tipoEscrito, setTipoEscrito] = useState(false)
  const uid = useId()
  useAccionEnCurso('Esperá a que termine de registrarse el turno.', fase === 'registrando')

  const { cliente, tipo, elementos, elementoId, fecha, hora, aberturas, conObra, cantAberturas, tipoReparacion } = turno

  /* Reparación: las etiquetas de `✋ Tipo de Reparacion`, leídas del tablero. */
  useEffect(() => {
    if (tipo !== 'reparacion' || tiposReparacion) return
    let vivo = true
    getTiposReparacion()
      .then((t) => vivo && setTiposReparacion(t))
      .catch(() => vivo && setTiposReparacion([]))
    return () => {
      vivo = false
    }
  }, [tipo, tiposReparacion])

  if (!cliente || !tipo) return <CrearTurnoDatosView />
  const sinObra = admiteSinObra(tipo) && !conObra
  if (!sinObra && !elementos) return <CrearTurnoDatosView />
  const def = defTipo(tipo)
  const obra = !sinObra && def.origen === 'obras' ? (elementos?.obras.find((o) => o.id === elementoId) ?? null) : null
  const pendiente = def.origen === 'pendientes' ? (elementos?.pendientes.find((p) => p.id === elementoId) ?? null) : null
  const aprobacion = tipo === 'colocacion' && obra ? aprobacionPorSaldo(obra.saldo) : null
  const calculadas = obra && aberturas ? (aberturas[obra.id] ?? null) : null
  /** Las aberturas del turno: las corregidas a mano o, si no, las calculadas de la obra. */
  const nAberturas = cantAberturas ?? calculadas
  const elemento = obra?.nombre ?? pendiente?.producto ?? ''
  /* El cliente del turno es el asignado en la cuenta corriente; sin uno, el nombre de la cuenta. */
  const nombreCliente = cliente.clienteNombre || cliente.nombre
  const reparacion = tiposReparacion?.find((t) => t.nombre === tipoReparacion) ?? null

  const texto = mensajeAsignacion({
    cliente: nombreCliente,
    tipo,
    etiquetaTipo: def.etiqueta,
    fecha,
    hora,
    /* La de la obra; sin obra (o en una entrega), la del cliente. */
    ubicacion: obra?.ubicacion || cliente.ubicacion,
    material: obra?.material ?? '',
    aberturas: nAberturas,
    obra: obra?.nombre ?? '',
    saldo: obra?.saldo ?? null,
    aprobacion,
  })

  const cambiar = (cambios: Partial<typeof turno>) => dispatch({ type: 'setTurno', cambios })

  /* El cierre de la operación reemplaza a la pregunta: la ventana de la pregunta se baja. */
  const cerrar = (asignado: boolean, detalle?: string) => {
    setFase(null)
    dispatch({
      type: 'exito',
      exito: {
        texto: asignado ? 'Turno registrado y asignado' : 'Turno registrado como Pendiente',
        detalle: detalle ?? `${def.titulo} · ${nombreCliente} · ${fechaLarga(fecha)}${hora ? ` · ${hora} hs` : ''}`,
      },
    })
  }

  const registrar = async () => {
    if (fase) return
    /* RN-01: sin fecha y hora (o con una fecha pasada), o sin el tipo de reparación, no se registra. */
    const f = faltantesAlta(
      { clienteId: cliente.id, tipo, elementoId, fecha, hora, conObra, tipoReparacion },
      hoyLocal(),
    )
    if (f.length) {
      setMarcar(true)
      setFaltan(f)
      return
    }
    setFase('registrando')
    try {
      /* 1. El ítem, con todo lo cargado menos el tipo. Un reintento no lo vuelve a crear. */
      let id = turno.registradoId
      if (!id) {
        id = await crearTurno({
          cliente,
          tipo,
          fecha,
          hora,
          obra,
          pendiente,
          aberturas: tipo === 'colocacion' ? nAberturas : null,
          aprobacion,
          tipoReparacion: reparacion,
          /* La persona logueada en la app queda como responsable del turno. */
          responsableId: usuario?.id ?? null,
        })
        cambiar({ registradoId: id })
      }
      /* 2. Con el ítem ya creado, el tipo: es el cambio que dispara la automatización de Monday. */
      if (!tipoEscrito) {
        await asignarTipoTurno(id, tipo)
        setTipoEscrito(true)
      }
      setFase('preguntando')
    } catch {
      setFase(null)
      dispatch({
        type: 'errorMonday',
        accion: turno.registradoId ? 'completar el tipo del turno en la Agenda' : 'registrar el turno en la Agenda',
      })
    }
  }

  const ocupado = fase === 'registrando'

  return (
    <section className="view paso-layout obras-v2 agenda-v2">
      <PasoHeader />
      <PasoTitulo titulo="Registrar Turno" descripcion="Revisá los datos, elegí la fecha y la hora, y registrá el turno en la Agenda." />

      {turno.reprograma && (
        <Aviso tono="info">
          Reprogramación de <strong>{turno.reprograma.nombre}</strong>, que ya quedó cancelado.
        </Aviso>
      )}

      <div className="card card-pad ag-registro-unico">
        <h3 className="resumen-title">Turno a registrar</h3>
        <dl className="ag-resumen">
          <dt>Cliente</dt>
          <dd>
            {nombreCliente}
            {!cliente.clienteId && <span className="ant-detalle">La cuenta no tiene un cliente asignado</span>}
          </dd>
          <dt>Cuenta corriente</dt>
          <dd>{cliente.nombre}</dd>
          <dt>Tipo de turno</dt>
          <dd>
            <TipoTurnoChip tipo={tipo} etiqueta={def.etiqueta} />
          </dd>
          <dt>{def.origen === 'pendientes' ? 'Pendiente a entregar' : 'Obra'}</dt>
          <dd>
            {sinObra ? (
              <span className="ant-sd">Sin obra</span>
            ) : (
              <>
                {elemento}
                {pendiente && (
                  <span className="ant-detalle">
                    {pendiente.pendiente} {pendiente.pendiente === 1 ? 'unidad pendiente' : 'unidades pendientes'} de {pendiente.vendido}
                  </span>
                )}
                {obra?.ubicacion && <span className="ant-detalle">{obra.ubicacion}</span>}
              </>
            )}
          </dd>
          {tipo === 'colocacion' && !sinObra && (
            <>
              <dt>Estado de aprobación</dt>
              <dd>
                <AprobacionChip aprobacion={aprobacion} />
              </dd>
            </>
          )}
          <dt>Estado al registrarlo</dt>
          {/* Nace Pendiente; el mensaje de asignación, si se envía, lo pasa a Asignado. */}
          <dd className="ag-estado-registro">
            <EstadoTurnoChip estado="pendiente" />
            <span className="ag-estado-nota">(Si se envía el mensaje de asignación, el turno resulta Asignado)</span>
          </dd>
        </dl>

        {/* Lo último que se decide, dentro de la misma card. */}
        <div className="ag-registro-campos">
          <div className="med-campo">
            <label className="med-l" htmlFor={`${uid}-fecha`}>
              Fecha de turno *
            </label>
            <div className={`med-conic ${marcar && !fecha ? 'ag-fecha--falta' : ''}`}>
              <i className="fas fa-calendar-day" aria-hidden="true" />
              <input
                id={`${uid}-fecha`}
                className="med-input med-fecha"
                type="date"
                min={hoyLocal()}
                value={fecha}
                disabled={ocupado}
                aria-invalid={(marcar && !fecha) || undefined}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => cambiar({ fecha: e.target.value })}
              />
            </div>
          </div>

          <div className="med-campo">
            <label className="med-l" htmlFor={`${uid}-hora`}>
              Hora de turno *
            </label>
            <div className={`med-conic ${marcar && !hora ? 'ag-fecha--falta' : ''}`}>
              <i className="fas fa-clock" aria-hidden="true" />
              <input
                id={`${uid}-hora`}
                className="med-input med-fecha"
                type="time"
                step={300}
                value={hora}
                disabled={ocupado}
                aria-invalid={(marcar && !hora) || undefined}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => cambiar({ hora: e.target.value })}
              />
            </div>
          </div>

          {tipo === 'colocacion' && (
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-aberturas`}>
                Cantidad de aberturas
              </label>
              <div className="med-conic">
                <i className="fas fa-border-all" aria-hidden="true" />
                <input
                  id={`${uid}-aberturas`}
                  className="med-input"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder={sinObra ? 'Cuántas aberturas se colocan' : 'Sin dato de la obra'}
                  value={nAberturas ?? ''}
                  disabled={ocupado}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    const n = Number(v)
                    cambiar({ cantAberturas: v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)) })
                  }}
                />
              </div>
            </div>
          )}

          {tipo === 'reparacion' && (
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-reparacion`}>
                Tipo de reparación *
              </label>
              <div className={`med-conic ${marcar && !tipoReparacion ? 'ag-fecha--falta' : ''}`}>
                <i className="fas fa-screwdriver-wrench" aria-hidden="true" />
                <select
                  id={`${uid}-reparacion`}
                  className="med-input"
                  value={tipoReparacion}
                  disabled={ocupado || !tiposReparacion}
                  aria-invalid={(marcar && !tipoReparacion) || undefined}
                  onChange={(e) => cambiar({ tipoReparacion: e.target.value })}
                >
                  <option value="" disabled>
                    {tiposReparacion ? 'Seleccionar...' : 'Leyendo los tipos de reparación...'}
                  </option>
                  {(tiposReparacion ?? []).map((t) => (
                    <option key={t.id} value={t.nombre}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" disabled={fase !== null} onClick={() => void registrar()}>
          <i className="fas fa-calendar-check" /> Registrar Turno
        </button>
      </PieEtapa>

      {fase === 'registrando' && (
        <ModalCargando
          titulo="Registrando el turno en la Agenda..."
          detalle="Se está creando el turno en el tablero con todos los datos cargados."
        />
      )}
      {fase === 'preguntando' && turno.registradoId && (
        <EnvioMensaje
          titulo="¿Desea enviar el mensaje de asignación al cliente?"
          texto={texto}
          textoNo="No, dejarlo Pendiente"
          cliente={{ id: cliente.clienteId, nombre: nombreCliente, celular: cliente.celular }}
          registrar={(enviado) => registrarAsignacion(turno.registradoId!, enviado, hoyLocal())}
          onCelular={(nuevo) => cambiar({ cliente: { ...cliente, celular: nuevo } })}
          onTerminar={(enviado, aviso) => cerrar(enviado && !aviso, aviso)}
        >
          <p className="modal-clave">El turno ya quedó registrado en la Agenda.</p>
          <p className="modal-nota">
            Si lo enviás, el turno pasa a <strong>Asignado</strong>. Si no, queda <strong>Pendiente</strong> y lo podés
            enviar más tarde desde «Consultar y Gestionar Turnos».
          </p>
        </EnvioMensaje>
      )}

      {faltan && (
        <AvisoModal titulo="Todavía no se puede registrar" faltantes={faltan} onClose={() => setFaltan(null)}>
          Completá lo siguiente para registrar el turno:
        </AvisoModal>
      )}
    </section>
  )
}
