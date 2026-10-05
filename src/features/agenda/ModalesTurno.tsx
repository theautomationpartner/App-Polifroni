import { useEffect, useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  DATO_FINALIZACION,
  ROTULO_MEDICION,
  fechaLarga,
  faltantesFinalizacion,
  mensajeAsignacion,
  type DatosAviso,
  type Finalizacion,
} from '@/lib/agenda'
import { getMotivosCancelacion, type Turno } from '@/services/monday'

/**
 * Los datos de los avisos de un turno ya registrado, como los llenaba cada escenario:
 *  - A quién se saluda: en Colocación, la cuenta corriente de la obra; si no, el cliente.
 *  - La ubicación: en Reparación (y Medición), la del cliente; en Colocación, la de la obra; en
 *    Entrega/Reparto, la ubicación de entrega del turno.
 */
export function datosAviso(t: Turno, ubicacionCliente: string): DatosAviso {
  return {
    cliente: (t.tipo === 'colocacion' ? t.ctaCte : '') || t.cliente || t.nombre,
    tipo: t.tipo,
    etiquetaTipo: t.etiquetaTipo,
    fecha: t.fecha,
    hora: t.hora,
    ubicacion: t.tipo === 'reparacion' || t.tipo === 'medicion' ? ubicacionCliente || t.ubicacion : t.ubicacion,
    material: t.material,
    aberturas: t.cantAberturas,
  }
}

/** El mensaje de asignación de un turno ya registrado (asignado desde la gestión). */
export function textoAsignacion(t: Turno, saldo: number | null): string {
  const aprobacion = t.aprobacion === 'NO Aprobado' ? 'noAprobada' : t.aprobacion === 'Aprobado' ? 'aprobada' : null
  return mensajeAsignacion({
    cliente: t.cliente || t.nombre,
    tipo: t.tipo,
    etiquetaTipo: t.etiquetaTipo,
    fecha: t.fecha,
    hora: t.hora,
    ubicacion: t.ubicacion,
    material: t.material,
    aberturas: t.cantAberturas,
    obra: t.obra,
    saldo,
    aprobacion,
  })
}

/** El turno, en una línea: qué, a quién y cuándo. */
function Clave({ turno }: { turno: Turno }) {
  return (
    <p className="modal-clave">
      {turno.nombre}
      <span className="ag-clave-fecha">
        {turno.fecha ? `${fechaLarga(turno.fecha)}${turno.hora ? ` · ${turno.hora} hs` : ''}` : 'Sin fecha'}
      </span>
    </p>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Asignar
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Asignar un turno que está sin asignar: pasa a "Asignada". Después se pregunta si se le manda al
 * cliente el mensaje de asignación (la misma ventana que al crearlo).
 */
export function ModalAsignarTurno({ turno, onClose, onAsignar }: { turno: Turno; onClose: () => void; onAsignar: () => void }) {
  return (
    <Modal
      title="¿Asignar el turno?"
      icon={<i className="fas fa-calendar-check modal-icon--info" />}
      onClose={onClose}
      className="ag-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn btn-primary btn-marca" onClick={onAsignar}>
            <i className="fas fa-calendar-check" /> Sí, asignar turno
          </button>
        </>
      }
    >
      <Clave turno={turno} />
      <p className="modal-nota">
        El turno pasa de <strong>Pendiente</strong> a <strong>Asignado</strong>
      </p>
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Confirmar
 * ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Confirmar un turno asignado: queda "Cumplido" y no se puede deshacer, así que se advierte.
 *
 * Antes de confirmar se pide el estado de finalización: en Colocación, si fue total o parcial (va a
 * la obra y al mensaje de confirmación); en Medición, si se pudo medir (decide el mensaje).
 * Reparación y Entrega/Reparto se confirman sin dato. El mensaje al cliente se pregunta después.
 */
export function ModalConfirmarTurno({
  turno,
  onClose,
  onConfirmar,
}: {
  turno: Turno
  onClose: () => void
  onConfirmar: (f: Finalizacion) => void
}) {
  const uid = useId()
  const [fin, setFin] = useState<Finalizacion>({})
  const [faltan, setFaltan] = useState<string[]>([])
  const tipo = turno.tipo
  const dato = tipo ? DATO_FINALIZACION[tipo] : null

  const confirmar = () => {
    const f = faltantesFinalizacion(tipo, fin)
    setFaltan(f)
    if (f.length === 0) onConfirmar(fin)
  }

  return (
    <Modal
      title="¿Confirmar el turno?"
      icon={<i className="fas fa-circle-check ag-icono-verde" />}
      onClose={onClose}
      className="ag-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn ag-btn-verde" onClick={confirmar}>
            <i className="fas fa-circle-check" /> Sí, confirmar turno
          </button>
        </>
      }
    >
      <Clave turno={turno} />
      <p className="modal-nota">
        El turno pasa a <strong>Confirmado</strong> y queda registrado como <strong>Cumplido</strong> en la Agenda.
      </p>
      <p className="ag-irreversible" role="note">
        <i className="fas fa-triangle-exclamation" /> Esta acción es irreversible: un turno cumplido no se puede volver a
        abrir.
      </p>

      {tipo === 'colocacion' && (
        <fieldset className="ag-opciones">
          <legend className="campo-l">{dato} *</legend>
          {(['total', 'parcial'] as const).map((r) => (
            <label key={r} className={`ag-opcion ${fin.colocacion === r ? 'ag-opcion--on' : ''}`}>
              <input
                type="radio"
                name={`${uid}-col`}
                checked={fin.colocacion === r}
                onChange={() => {
                  setFin({ colocacion: r })
                  setFaltan([])
                }}
              />
              {r === 'total' ? 'Completa' : 'Parcial'}
            </label>
          ))}
          <p className="ag-nota">Queda en la etapa de producción de la obra como «Colocacion Total» o «Colocacion Parcial».</p>
        </fieldset>
      )}

      {tipo === 'medicion' && (
        <fieldset className="ag-opciones">
          <legend className="campo-l">{dato} *</legend>
          {(['medido', 'noMedido'] as const).map((r) => (
            <label key={r} className={`ag-opcion ${fin.medicion === r ? 'ag-opcion--on' : ''}`}>
              <input
                type="radio"
                name={`${uid}-med`}
                checked={fin.medicion === r}
                onChange={() => {
                  setFin({ medicion: r })
                  setFaltan([])
                }}
              />
              {ROTULO_MEDICION[r]}
            </label>
          ))}
          <p className="ag-nota">El mensaje de confirmación al cliente depende de este resultado.</p>
        </fieldset>
      )}

      {faltan.length > 0 && (
        <ul className="modal-faltantes">
          {faltan.map((f) => (
            <li key={f}>
              <i className="fas fa-circle-xmark" /> {f}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Cancelar
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface DatosCancelacion {
  motivo: string
  detalle: string
}

/** El motivo de cancelación, del catálogo del tablero: lo piden la cancelación y la reprogramación. */
function useMotivos(sugerido?: string) {
  const [motivos, setMotivos] = useState<string[] | null>(null)
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    let vivo = true
    getMotivosCancelacion()
      .then((m) => {
        if (!vivo) return
        setMotivos(m)
        if (sugerido && m.includes(sugerido)) setMotivo(sugerido)
      })
      .catch(() => vivo && setMotivos([]))
    return () => {
      vivo = false
    }
  }, [sugerido])
  return { motivos, motivo, setMotivo }
}

/** El selector del motivo y el detalle opcional, iguales en cancelar y reprogramar. */
function CamposMotivo({
  uid,
  titulo,
  motivos,
  motivo,
  setMotivo,
  detalle,
  setDetalle,
  falta,
}: {
  uid: string
  titulo: string
  motivos: string[] | null
  motivo: string
  setMotivo: (m: string) => void
  detalle: string
  setDetalle: (d: string) => void
  falta: boolean
}) {
  return (
    <>
      <label className="campo-l" htmlFor={`${uid}-motivo`}>
        {titulo} *
      </label>
      <select
        id={`${uid}-motivo`}
        className={`ag-select ${falta && !motivo ? 'ag-select--falta' : ''}`}
        value={motivo}
        disabled={motivos === null}
        aria-invalid={(falta && !motivo) || undefined}
        onChange={(e) => setMotivo(e.target.value)}
      >
        <option value="" disabled>
          {motivos === null ? 'Cargando motivos...' : 'Seleccionar...'}
        </option>
        {(motivos ?? []).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {falta && !motivo && (
        <p className="ag-falta-motivo" role="alert">
          <i className="fas fa-circle-exclamation" /> Elegí el motivo.
        </p>
      )}

      <label className="campo-l" htmlFor={`${uid}-detalle`}>
        Detalle <span className="ag-opcional">(opcional)</span>
      </label>
      <textarea
        id={`${uid}-detalle`}
        className="motivo-in"
        rows={2}
        maxLength={500}
        placeholder="Ej.: el cliente pidió pasarlo a la semana que viene"
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
      />
    </>
  )
}

/**
 * Cancelar un turno asignado: el mismo flujo que cancelar una OP —una ventana que pide el motivo y
 * nada se borra—, con el motivo elegido del catálogo del tablero (obligatorio) y un detalle
 * opcional. Cancelado, se pregunta si se le avisa al cliente (la misma ventana del envío).
 */
export function ModalCancelarTurno({
  turno,
  onClose,
  onConfirmar,
}: {
  turno: Turno
  onClose: () => void
  onConfirmar: (d: DatosCancelacion) => void
}) {
  const uid = useId()
  const { motivos, motivo, setMotivo } = useMotivos()
  const [detalle, setDetalle] = useState('')
  const [falta, setFalta] = useState(false)

  return (
    <Modal
      title="¿Cancelar el turno?"
      icon={<i className="fas fa-ban modal-icon--warn" />}
      onClose={onClose}
      className="ag-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={motivos === null}
            onClick={() => (motivo ? onConfirmar({ motivo, detalle }) : setFalta(true))}
          >
            <i className="fas fa-ban" /> Sí, cancelar turno
          </button>
        </>
      }
    >
      <Clave turno={turno} />
      <p className="modal-nota">
        El turno no se borra, queda «Cancelado» con el motivo como constancia
      </p>
      <CamposMotivo
        uid={uid}
        titulo="Motivo de cancelación"
        motivos={motivos}
        motivo={motivo}
        setMotivo={setMotivo}
        detalle={detalle}
        setDetalle={setDetalle}
        falta={falta}
      />
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Reprogramar
 * ──────────────────────────────────────────────────────────────────────────────── */

export interface DatosReprogramacion extends DatosCancelacion {
  /** `YYYY-MM-DD`: la fecha del turno nuevo. */
  fecha: string
  /** `HH:MM`, hora local del turno nuevo. */
  hora: string
  /** Colocación: la cantidad de aberturas del turno nuevo. */
  aberturas: number | null
}

/**
 * Reprogramar un turno asignado (RN-11): se cancela —con el motivo de la reprogramación, que queda
 * como motivo de cancelación— y se crea uno nuevo con sus mismos datos. Para el nuevo se pide la
 * fecha y la hora y, en una colocación, otra vez la cantidad de aberturas (arranca con la del turno
 * original).
 */
export function ModalReprogramarTurno({
  turno,
  hoy,
  onClose,
  onConfirmar,
}: {
  turno: Turno
  /** `YYYY-MM-DD`: la fecha nueva no puede ser anterior. */
  hoy: string
  onClose: () => void
  onConfirmar: (d: DatosReprogramacion) => void
}) {
  const uid = useId()
  /* Reprogramar es, casi siempre, un cambio de fecha. */
  const { motivos, motivo, setMotivo } = useMotivos('Cambio de fecha')
  const [detalle, setDetalle] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const colocacion = turno.tipo === 'colocacion'
  const [aberturas, setAberturas] = useState(turno.cantAberturas)
  const [faltan, setFaltan] = useState<string[]>([])
  const [marcar, setMarcar] = useState(false)

  const confirmar = () => {
    const n = aberturas.trim() === '' ? null : Number(aberturas)
    const f = [
      ...(!motivo ? ['Elegí el motivo de la reprogramación.'] : []),
      ...(!fecha ? ['Elegí la nueva fecha del turno.'] : fecha < hoy ? ['La nueva fecha no puede ser anterior a hoy.'] : []),
      ...(!hora ? ['Elegí la nueva hora del turno.'] : []),
      ...(colocacion && (n == null || !Number.isInteger(n) || n < 0) ? ['Indicá la cantidad de aberturas a colocar.'] : []),
    ]
    setMarcar(true)
    setFaltan(f)
    if (f.length === 0) onConfirmar({ motivo, detalle, fecha, hora, aberturas: colocacion ? n : null })
  }

  return (
    <Modal
      title="¿Reprogramar el turno?"
      icon={<i className="fas fa-calendar-days modal-icon--warn" />}
      onClose={onClose}
      className="ag-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn btn-primary btn-marca" disabled={motivos === null} onClick={confirmar}>
            <i className="fas fa-calendar-days" /> Sí, reprogramar turno
          </button>
        </>
      }
    >
      <Clave turno={turno} />
      <p className="modal-nota">
        Este turno queda <strong>Cancelado</strong> con el motivo de la reprogramación, y se crea uno nuevo con sus
        mismos datos en la fecha y la hora que elijas. El nuevo queda <strong>Sin asignar</strong>.
      </p>

      <CamposMotivo
        uid={uid}
        titulo="Motivo de la reprogramación"
        motivos={motivos}
        motivo={motivo}
        setMotivo={setMotivo}
        detalle={detalle}
        setDetalle={setDetalle}
        falta={marcar}
      />

      <div className="ag-reprogramar-campos">
        <div>
          <label className="campo-l" htmlFor={`${uid}-fecha`}>
            Nueva fecha del turno *
          </label>
          <input
            id={`${uid}-fecha`}
            className={`ag-input ${marcar && (!fecha || fecha < hoy) ? 'ag-input--falta' : ''}`}
            type="date"
            min={hoy}
            value={fecha}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div>
          <label className="campo-l" htmlFor={`${uid}-hora`}>
            Nueva hora del turno *
          </label>
          <input
            id={`${uid}-hora`}
            className={`ag-input ${marcar && !hora ? 'ag-input--falta' : ''}`}
            type="time"
            step={300}
            value={hora}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setHora(e.target.value)}
          />
        </div>
        {colocacion && (
          <div>
            <label className="campo-l" htmlFor={`${uid}-aberturas`}>
              Cantidad de aberturas *
            </label>
            <input
              id={`${uid}-aberturas`}
              className={`ag-input ${marcar && aberturas.trim() === '' ? 'ag-input--falta' : ''}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="Ej.: 4"
              value={aberturas}
              onChange={(e) => setAberturas(e.target.value)}
            />
          </div>
        )}
      </div>

      {faltan.length > 0 && (
        <ul className="modal-faltantes">
          {faltan.map((f) => (
            <li key={f}>
              <i className="fas fa-circle-xmark" /> {f}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
