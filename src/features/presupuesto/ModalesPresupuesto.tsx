import { useId, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { sinCodigo } from '@/lib/destinatario'
import { accionesPresupuesto, esSinArquitecto, formatoImporte, situacionDe, yaEnviado, type SituacionPresupuesto } from '@/lib/presupuesto'
import type { PresupuestoEnviado, PresupuestoGestion } from '@/services/monday'
import { Etiquetas, verPdfMonday } from './TablaPresupuestos'

/** Una fila de la consulta: el presupuesto (subelemento) y su bolsa. */
export interface FilaGestion {
  bolsa: PresupuestoGestion
  p: PresupuestoEnviado
}

/** "2026-10-05" → "05/10/2026". */
export const fechaCorta = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

/** Cómo se ve la respuesta de un presupuesto: el texto y el color de su pastilla. */
export function rotuloSituacion(s: SituacionPresupuesto, enviado: boolean): { texto: string; color: string } {
  if (s === 'confirmado') return { texto: 'Confirmado', color: '#00c875' }
  if (s === 'rechazado') return { texto: 'Rechazado', color: '#df2f4a' }
  if (s === 'error') return { texto: 'Error de Confirmación', color: '#fdab3d' }
  return enviado ? { texto: 'Pend. de confirmar', color: '#579bfc' } : { texto: 'Sin enviar', color: '#c4c4c4' }
}

export function SituacionChip({ p }: { p: PresupuestoEnviado }) {
  const r = rotuloSituacion(situacionDe(p.confirmacion), yaEnviado(p.estadoEnvio))
  return (
    <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: r.color }}>
      {r.texto}
    </span>
  )
}

/** El presupuesto en la ventana: la bolsa y el presupuesto, como la clave del turno en la Agenda. */
function Clave({ f }: { f: FilaGestion }) {
  return (
    <p className="modal-clave">
      {f.bolsa.nombre}
      <span className="ag-clave-fecha">{[f.p.nombre, f.bolsa.idPresupuesto].filter(Boolean).join(' · ')}</span>
    </p>
  )
}

/** Un dato fijo de la ventana: el rótulo y el valor. */
function Dato({ l, v }: { l: string; v: ReactNode }) {
  return (
    <div className="pres-dato">
      <span className="campo-l">{l}</span>
      <span className="pres-dato-v">{v || <span className="ant-sd">—</span>}</span>
    </div>
  )
}

/** Quiénes pueden coordinar la obra: el cliente y, si hay uno de verdad, el constructor (como el enlace). */
export function coordinadoresDe(b: PresupuestoGestion): { nombre: string; rol: 'Cliente' | 'Arquitecto' }[] {
  const lista: { nombre: string; rol: 'Cliente' | 'Arquitecto' }[] = []
  const cliente = sinCodigo(b.cliente?.nombre ?? '')
  const arquitecto = sinCodigo(b.arquitecto?.nombre ?? '')
  if (cliente) lista.push({ nombre: cliente, rol: 'Cliente' })
  if (arquitecto && !esSinArquitecto(b.arquitecto) && arquitecto !== cliente) {
    lista.push({ nombre: arquitecto, rol: 'Arquitecto' })
  }
  return lista
}

/**
 * Confirmar un presupuesto desde la app (regla del usuario, 13/10/2026): pide lo mismo que el
 * formulario del enlace —la dirección de la obra y quién la coordina— y hace lo mismo que la
 * confirmación del cliente: el presupuesto Confirmado, sus datos en la bolsa, la constancia, la obra y
 * su registro en la cuenta corriente.
 */
export function ModalConfirmarPresupuesto({
  fila: f,
  onClose,
  onConfirmar,
}: {
  fila: FilaGestion
  onClose: () => void
  onConfirmar: (ubicacion: string, coordinador: string) => void
}) {
  const uid = useId()
  const opciones = coordinadoresDe(f.bolsa)
  const [ubicacion, setUbicacion] = useState('')
  const [coordinador, setCoordinador] = useState(opciones.length === 1 ? opciones[0].nombre : '')
  const [faltan, setFaltan] = useState<string[]>([])

  const confirmar = () => {
    const falta = [
      ...(!ubicacion.trim() ? ['Ingresá la dirección de la obra (calle y número).'] : []),
      ...(!coordinador ? ['Elegí quién coordina la obra.'] : []),
    ]
    setFaltan(falta)
    if (!falta.length) onConfirmar(ubicacion.trim(), coordinador)
  }

  return (
    <Modal
      title="¿Desea confirmar el siguiente presupuesto?"
      icon={<i className="fas fa-circle-check ag-icono-verde" />}
      onClose={onClose}
      className="ag-modal pres-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn ag-btn-verde" onClick={confirmar}>
            <i className="fas fa-circle-check" /> Sí, confirmar presupuesto
          </button>
        </>
      }
    >
      <Clave f={f} />
      <p className="modal-nota">Dicho presupuesto se confirmará y se registrará como Obra.</p>

      {/* `carga-grid`: los campos en bordó, como en la carga del presupuesto. */}
      <div className="carga-grid pres-modal-campos">
        <div className="pres-datos-fijos">
          <Dato l="Tipo de carpintería" v={f.p.tipo} />
          <Dato l="Color" v={f.p.color} />
          <Dato l="Total pactado" v={f.p.total !== null ? formatoImporte(f.p.total) : ''} />
          <Dato l="Cliente" v={f.bolsa.cliente?.nombre ?? ''} />
        </div>

        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-ubic`}>
            Dirección de la obra *
          </label>
          <div className={`med-conic ${faltan.some((x) => x.includes('dirección')) ? 'pres-falta' : ''}`}>
            <i className="fas fa-location-dot" aria-hidden="true" />
            <input
              id={`${uid}-ubic`}
              className="med-input"
              type="text"
              maxLength={300}
              placeholder="Calle y número, p. ej. Pujol 1147"
              value={ubicacion}
              onChange={(e) => {
                setUbicacion(e.target.value)
                setFaltan([])
              }}
            />
          </div>
        </div>

        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-coord`}>
            Coordinador de la obra *
          </label>
          <SelectBuscable
            id={`${uid}-coord`}
            valor={coordinador}
            opciones={opciones.map((o) => ({ valor: o.nombre, texto: `${o.nombre} · ${o.rol}` }))}
            placeholder={opciones.length ? 'Elegí quién coordina la obra' : 'La bolsa no tiene cliente ni constructor'}
            falta={faltan.some((x) => x.includes('coordina'))}
            onElegir={(v) => {
              setCoordinador(v)
              setFaltan([])
            }}
          />
        </div>
      </div>

      {faltan.length > 0 && (
        <ul className="modal-faltantes">
          {faltan.map((x) => (
            <li key={x}>
              <i className="fas fa-circle-xmark" /> {x}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/**
 * Dar un presupuesto por perdido (regla del usuario, 13/10/2026): lo mismo que "Rechazar" del enlace.
 * El presupuesto queda Rechazado, con el motivo si se escribe (opcional). La bolsa y sus otros
 * presupuestos no cambian.
 */
export function ModalPerderPresupuesto({
  fila: f,
  onClose,
  onConfirmar,
}: {
  fila: FilaGestion
  onClose: () => void
  onConfirmar: (motivo: string) => void
}) {
  const uid = useId()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      title="¿Dar el presupuesto por perdido?"
      icon={<i className="fas fa-thumbs-down modal-icon--warn" />}
      onClose={onClose}
      className="ag-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onConfirmar(motivo.trim())}>
            <i className="fas fa-thumbs-down" /> Sí, dar por perdido
          </button>
        </>
      }
    >
      <Clave f={f} />
      <p className="modal-nota">
        El presupuesto queda <strong>Rechazado</strong>. La bolsa y sus otros presupuestos no cambian.
      </p>
      <label className="campo-l" htmlFor={`${uid}-motivo`}>
        Motivo <span className="med-l-sub">opcional</span>
      </label>
      <textarea
        id={`${uid}-motivo`}
        className="motivo-in"
        rows={3}
        maxLength={1000}
        placeholder="Ej.: el cliente eligió otro proveedor"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
    </Modal>
  )
}

export type AccionFila = 'enviar' | 'reenviar' | 'confirmar' | 'perder'

/** El recordatorio de los 5 días, dicho para el usuario. */
function textoRecordatorio(estado: string): { texto: string; ok: boolean | null } {
  const e = estado.trim()
  if (e === 'Enviado') return { texto: 'Enviado', ok: true }
  if (e === 'Error de Envio') return { texto: 'Error al enviarlo', ok: false }
  if (e === 'Enviando') return { texto: 'Enviándose', ok: null }
  return { texto: 'Todavía no se envió', ok: null }
}

/**
 * La ficha de un presupuesto (como la del turno en la Agenda): sus datos, el último envío y el
 * recordatorio de los 5 días —cuándo sale y si ya salió—, con sus acciones.
 */
export function FichaPresupuesto({
  fila: f,
  onClose,
  onAccion,
}: {
  fila: FilaGestion
  onClose: () => void
  onAccion: (a: AccionFila) => void
}) {
  const { p, bolsa } = f
  const acciones = accionesPresupuesto(bolsa.estado, p)
  const rec = textoRecordatorio(bolsa.estadoRecordatorio)
  const s = situacionDe(p.confirmacion)
  const envio = acciones.envio
  return (
    <Modal
      title="Presupuesto"
      icon={<i className="fas fa-file-invoice-dollar modal-icon--info" />}
      onClose={onClose}
      className="ag-modal ag-ficha-turno agenda-v2"
    >
      <p className="modal-clave ag-ficha-clave">
        {bolsa.nombre}
        <span className="ag-clave-fecha">{[p.nombre, bolsa.idPresupuesto].filter(Boolean).join(' · ')}</span>
      </p>
      <dl className="ag-resumen">
        <dt>Estado</dt>
        <dd>
          <SituacionChip p={p} />
        </dd>
        <dt>Carpintería</dt>
        <dd>{p.tipo || p.color ? <Etiquetas tipo={p.tipo} color={p.color} /> : <span className="ant-sd">Sin especificar</span>}</dd>
        <dt>Total pactado</dt>
        <dd>{p.total !== null ? formatoImporte(p.total) : <span className="ant-sd">Sin total</span>}</dd>
        <dt>Cliente</dt>
        <dd>{bolsa.cliente?.nombre || <span className="ant-sd">Sin cliente</span>}</dd>
        <dt>Constructor/Arquitecto</dt>
        <dd>{bolsa.arquitecto?.nombre || <span className="ant-sd">Sin constructor</span>}</dd>
        <dt>Último envío</dt>
        <dd>
          {p.fechaEnvio ? (
            fechaCorta(p.fechaEnvio)
          ) : (
            <span className="ant-sd">{yaEnviado(p.estadoEnvio) ? 'Enviado (sin fecha registrada)' : 'Todavía no se envió'}</span>
          )}
        </dd>
        <dt>Recordatorio</dt>
        <dd>
          {bolsa.fechaRecordatorio ? fechaCorta(bolsa.fechaRecordatorio) : <span className="ant-sd">Sin fecha de recordatorio</span>}
          <span className="ant-detalle">
            {rec.ok === true && <i className="fas fa-circle-check pres-rec-ok" />}
            {rec.ok === false && <i className="fas fa-circle-exclamation pres-rec-err" />} Mensaje de recordatorio: {rec.texto}
          </span>
        </dd>
        {s === 'rechazado' && (
          <>
            <dt>Motivo</dt>
            <dd>{p.motivo || <span className="ant-sd">Sin motivo</span>}</dd>
          </>
        )}
        <dt>PDF</dt>
        <dd>
          {p.pdf ? (
            <button type="button" className="btn btn-out pres-ver" onClick={() => p.pdf && void verPdfMonday(p.pdf.assetId)}>
              <i className="fas fa-file-pdf" /> Ver presupuesto
            </button>
          ) : (
            <span className="ant-sd">Sin PDF</span>
          )}
        </dd>
      </dl>
      <div className="ag-ficha-acciones">
        {!envio && !acciones.confirmar && !acciones.perder ? (
          <span className="ant-sd">Este presupuesto ya no admite acciones.</span>
        ) : (
          <>
            {envio && (
              <button type="button" className="ag-acc ag-acc--asignar" onClick={() => onAccion(envio)}>
                <i className={`fas ${envio === 'reenviar' ? 'fa-rotate-right' : 'fa-paper-plane'}`} /> {envio === 'reenviar' ? 'Reenviar' : 'Enviar'}
              </button>
            )}
            {acciones.confirmar && (
              <button type="button" className="ag-acc ag-acc--ok" onClick={() => onAccion('confirmar')}>
                <i className="fas fa-circle-check" /> Confirmar
              </button>
            )}
            {acciones.perder && (
              <button type="button" className="ag-acc ag-acc--cancel" onClick={() => onAccion('perder')}>
                <i className="fas fa-thumbs-down" /> Perdido
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
