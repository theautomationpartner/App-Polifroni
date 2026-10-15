import { useId, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { sinCodigo } from '@/lib/destinatario'
import {
  ETIQUETA_PEND_CERRAR,
  accionesPresupuesto,
  esSinArquitecto,
  formatoImporte,
  importeDe,
  situacionDe,
  yaEnviado,
  type SituacionPresupuesto,
} from '@/lib/presupuesto'
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
export function rotuloSituacion(s: SituacionPresupuesto, enviado: boolean, pendCerrar = false): { texto: string; color: string } {
  /* Confirmado por WhatsApp, falta el total pactado (regla del usuario, 15/10/2026). */
  if (s === 'confirmado' && pendCerrar) return { texto: 'Confirmado · Pend. de cerrar', color: '#9d50dd' }
  if (s === 'confirmado') return { texto: 'Confirmado', color: '#00c875' }
  if (s === 'rechazado') return { texto: 'Rechazado', color: '#df2f4a' }
  if (s === 'error') return { texto: 'Error de Confirmación', color: '#fdab3d' }
  return enviado ? { texto: 'Pend. de confirmar', color: '#579bfc' } : { texto: 'Sin enviar', color: '#c4c4c4' }
}

export function SituacionChip({ p, estadoBolsa = '' }: { p: PresupuestoEnviado; estadoBolsa?: string }) {
  const r = rotuloSituacion(situacionDe(p.confirmacion), yaEnviado(p.estadoEnvio), estadoBolsa.trim() === ETIQUETA_PEND_CERRAR)
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

/** El coordinador que dejó la confirmación ("Nombre (Cliente)") → el nombre, si sigue en la lista. */
function coordinadorPrevio(texto: string, opciones: { nombre: string }[]): string {
  const nombre = texto.replace(/\s*\((Cliente|Arquitecto)\)\s*$/, '').trim()
  return opciones.find((o) => o.nombre === nombre)?.nombre ?? (opciones.length === 1 ? opciones[0].nombre : '')
}

/** El Total Pactado: obligatorio al confirmar desde la app y al ganar (regla del usuario, 15/10/2026). */
function CampoTotal({ id, valor, falta, onCambiar }: { id: string; valor: string; falta: boolean; onCambiar: (v: string) => void }) {
  return (
    <div className="med-campo">
      <label className="campo-l" htmlFor={id}>
        Total pactado *
      </label>
      <div className={`med-conic ${falta ? 'pres-falta' : ''}`}>
        <i className="fas fa-dollar-sign" aria-hidden="true" />
        <input
          id={id}
          className="med-input"
          type="text"
          inputMode="decimal"
          placeholder="Ej.: 1.297.684"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
        />
      </div>
    </div>
  )
}

/** Dirección, coordinador y total: lo que piden Confirmar y Ganar, con lo que falta marcado. */
function useCierre(f: FilaGestion, previo: boolean) {
  const opciones = coordinadoresDe(f.bolsa)
  const [ubicacion, setUbicacion] = useState(previo ? f.bolsa.ubicacionObra : '')
  const [coordinador, setCoordinador] = useState(
    previo ? coordinadorPrevio(f.bolsa.coordinadorObra, opciones) : opciones.length === 1 ? opciones[0].nombre : '',
  )
  const [total, setTotal] = useState('')
  const [faltan, setFaltan] = useState<string[]>([])
  const validar = (): { ubicacion: string; coordinador: string; total: number } | null => {
    const importe = importeDe(total)
    const falta = [
      ...(!ubicacion.trim() ? ['Ingresá la dirección de la obra (calle y número).'] : []),
      ...(!coordinador ? ['Elegí quién coordina la obra.'] : []),
      ...(importe === null || importe <= 0 ? ['Ingresá el total pactado (un importe mayor a cero).'] : []),
    ]
    setFaltan(falta)
    return falta.length || importe === null ? null : { ubicacion: ubicacion.trim(), coordinador, total: importe }
  }
  const limpiar = () => setFaltan([])
  return { opciones, ubicacion, setUbicacion, coordinador, setCoordinador, total, setTotal, faltan, limpiar, validar }
}

/** Los campos de dirección, coordinador y total, en bordó (`carga-grid`), como en la carga del presupuesto. */
function CamposCierre({ f, c }: { f: FilaGestion; c: ReturnType<typeof useCierre> }) {
  const uid = useId()
  return (
    <>
      <div className="carga-grid pres-modal-campos">
        <div className="pres-datos-fijos">
          <Dato l="Tipo de carpintería" v={f.p.tipo} />
          <Dato l="Color" v={f.p.color} />
          <Dato l="Cliente" v={f.bolsa.cliente?.nombre ?? ''} />
        </div>

        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-ubic`}>
            Dirección de la obra *
          </label>
          <div className={`med-conic ${c.faltan.some((x) => x.includes('dirección')) ? 'pres-falta' : ''}`}>
            <i className="fas fa-location-dot" aria-hidden="true" />
            <input
              id={`${uid}-ubic`}
              className="med-input"
              type="text"
              maxLength={300}
              placeholder="Calle y número, p. ej. Pujol 1147"
              value={c.ubicacion}
              onChange={(e) => {
                c.setUbicacion(e.target.value)
                c.limpiar()
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
            valor={c.coordinador}
            opciones={c.opciones.map((o) => ({ valor: o.nombre, texto: `${o.nombre} · ${o.rol}` }))}
            placeholder={c.opciones.length ? 'Elegí quién coordina la obra' : 'El presupuesto no tiene cliente ni constructor'}
            falta={c.faltan.some((x) => x.includes('coordina'))}
            onElegir={(v) => {
              c.setCoordinador(v)
              c.limpiar()
            }}
          />
        </div>

        <CampoTotal
          id={`${uid}-total`}
          valor={c.total}
          falta={c.faltan.some((x) => x.includes('total'))}
          onCambiar={(v) => {
            c.setTotal(v)
            c.limpiar()
          }}
        />
      </div>

      {c.faltan.length > 0 && (
        <ul className="modal-faltantes">
          {c.faltan.map((x) => (
            <li key={x}>
              <i className="fas fa-circle-xmark" /> {x}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Confirmar un presupuesto desde la app (reglas del usuario, 13/10 y 15/10/2026): pide lo mismo que el
 * formulario del enlace —la dirección de la obra y quién la coordina— y además el total pactado, y en
 * un solo paso lo confirma y lo gana: el presupuesto Confirmado, sus datos en la bolsa, la constancia,
 * la bolsa Ganada, la obra y su registro en la cuenta corriente.
 */
export function ModalConfirmarPresupuesto({
  fila: f,
  onClose,
  onConfirmar,
}: {
  fila: FilaGestion
  onClose: () => void
  onConfirmar: (datos: { ubicacion: string; coordinador: string; total: number }) => void
}) {
  const c = useCierre(f, false)
  const confirmar = () => {
    const datos = c.validar()
    if (datos) onConfirmar(datos)
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
      <p className="modal-nota">
        Dicho presupuesto se confirmará, quedará <strong>Ganado</strong> y se registrará como Obra, con su movimiento en la
        cuenta corriente del cliente.
      </p>
      <CamposCierre f={f} c={c} />
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
        Este presupuesto queda <strong>Rechazado</strong>. Los demás presupuestos del mismo cliente no cambian.
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

/**
 * Ganar un presupuesto que el cliente confirmó por WhatsApp (regla del usuario, 15/10/2026): la bolsa
 * está "Confirmado - Pend de Cerrar" y falta el total pactado. La dirección y el coordinador vienen de
 * la confirmación y se pueden corregir. Queda Ganado y se crean la obra y su movimiento en la cuenta
 * corriente.
 */
export function ModalGanarPresupuesto({
  fila: f,
  onClose,
  onGanar,
}: {
  fila: FilaGestion
  onClose: () => void
  onGanar: (datos: { ubicacion: string; coordinador: string; total: number }) => void
}) {
  const c = useCierre(f, true)
  const ganar = () => {
    const datos = c.validar()
    if (datos) onGanar(datos)
  }
  return (
    <Modal
      title="¿Desea ganar el siguiente presupuesto?"
      icon={<i className="fas fa-trophy ag-icono-verde" />}
      onClose={onClose}
      className="ag-modal pres-modal"
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn ag-btn-verde" onClick={ganar}>
            <i className="fas fa-trophy" /> Sí, ganar presupuesto
          </button>
        </>
      }
    >
      <Clave f={f} />
      <p className="modal-nota">
        El cliente ya lo confirmó. Con el total pactado queda <strong>Ganado</strong> y se registra como Obra, con su
        movimiento en la cuenta corriente del cliente.
      </p>
      <CamposCierre f={f} c={c} />
    </Modal>
  )
}

export type AccionFila = 'enviar' | 'reenviar' | 'confirmar' | 'perder' | 'ganar'

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
          <SituacionChip p={p} estadoBolsa={bolsa.estado} />
        </dd>
        <dt>Carpintería</dt>
        <dd>{p.tipo || p.color ? <Etiquetas tipo={p.tipo} color={p.color} /> : <span className="ant-sd">Sin especificar</span>}</dd>
        {bolsa.total !== null && (
          <>
            <dt>Total pactado</dt>
            <dd>{formatoImporte(bolsa.total)}</dd>
          </>
        )}
        {s === 'confirmado' && (
          <>
            <dt>Dirección de la obra</dt>
            <dd>{bolsa.ubicacionObra || <span className="ant-sd">Sin dirección</span>}</dd>
            <dt>Coordinador</dt>
            <dd>{bolsa.coordinadorObra || <span className="ant-sd">Sin coordinador</span>}</dd>
          </>
        )}
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
        {!envio && !acciones.confirmar && !acciones.perder && !acciones.ganar ? (
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
            {acciones.ganar && (
              <button type="button" className="ag-acc ag-acc--ok" onClick={() => onAccion('ganar')}>
                <i className="fas fa-trophy" /> Ganar
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
