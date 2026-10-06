import { useEffect, useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { conTope } from '@/features/agenda/ModalErrorConsulta'
import { faltantesGanar, importeDe, tipoObraDe } from '@/lib/presupuesto'
import {
  ArchivoMuyPesado,
  datosClienteObra,
  getUrlArchivo,
  prepararArchivoParaSubir,
  type DatosClienteObra,
  type PresupuestoEnviado,
  type PresupuestoGestion,
} from '@/services/monday'
import type { DatosGanar } from './ganar'

/** "2026-10-05" → "05/10/2026". */
const fechaCorta = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

/** Cómo se nombra un presupuesto enviado en la lista: su ID, tipo, color y cuándo se envió. */
const rotulo = (s: PresupuestoEnviado) =>
  [s.nombre, s.tipo, s.color, fechaCorta(s.fechaEnvio)].filter(Boolean).join(' · ')

/** El presupuesto en la ventana: su nombre y su ID, como la clave del turno en la Agenda. */
function Clave({ p }: { p: PresupuestoGestion }) {
  return (
    <p className="modal-clave">
      {p.nombre}
      <span className="ag-clave-fecha">{[p.idPresupuesto, p.estado].filter(Boolean).join(' · ')}</span>
    </p>
  )
}

/** Un dato fijo de la ventana: el rótulo y el valor. */
function Dato({ l, v }: { l: string; v: string }) {
  return (
    <div className="pres-dato">
      <span className="campo-l">{l}</span>
      <span className="pres-dato-v">{v || <span className="ant-sd">—</span>}</span>
    </div>
  )
}

/**
 * Abre el PDF en otra pestaña. La pestaña se abre ANTES de pedir la dirección firmada: abrirla
 * después de esperar a Monday la frena el bloqueador de ventanas del navegador.
 */
async function verPdf(assetId: string) {
  const w = window.open('', '_blank')
  try {
    const url = await getUrlArchivo(assetId)
    if (w) w.location.href = url
    else window.open(url, '_blank')
  } catch {
    w?.close()
    throw new Error('No se pudo abrir el PDF.')
  }
}

/**
 * Ganar el presupuesto: "¿Desea confirmar el siguiente presupuesto?". Se confirma y se registra como
 * obra.
 *
 * Se elige cuál de los presupuestos enviados es el ganado (por defecto, el último): de él salen el
 * tipo de carpintería, el color y el PDF final, que se completan solos. Se pide el Total Pactado y,
 * si lo hay, el Plano de Aberturas. La cuenta corriente donde se registra la obra es la del cliente
 * (si tiene más de una activa, se elige).
 *
 * `previo`: un intento anterior ya escribió parte en Monday. Los datos quedan fijos, para que el
 * reintento termine lo mismo que se empezó.
 */
export function ModalGanarPresupuesto({
  presupuesto: p,
  responsable,
  previo,
  onClose,
  onConfirmar,
}: {
  presupuesto: PresupuestoGestion
  /** A quién se asigna la obra (✋Asignado a:). */
  responsable: string
  previo: { datos: DatosGanar; cliente: DatosClienteObra } | null
  onClose: () => void
  onConfirmar: (datos: DatosGanar, cliente: DatosClienteObra) => void
}) {
  const uid = useId()
  const fijo = !!previo
  const conPdf = p.presupuestos.filter((s) => s.pdf)
  const [elegidoId, setElegidoId] = useState(
    previo?.datos.elegido.id ?? (conPdf[conPdf.length - 1] ?? p.presupuestos[p.presupuestos.length - 1])?.id ?? '',
  )
  const [total, setTotal] = useState(previo ? String(previo.datos.total).replace('.', ',') : '')
  const [plano, setPlano] = useState<File | null>(previo?.datos.plano ?? null)
  const [errorPlano, setErrorPlano] = useState('')
  const [preparando, setPreparando] = useState(false)
  const [cliente, setCliente] = useState<DatosClienteObra | null>(previo?.cliente ?? null)
  const [errorCliente, setErrorCliente] = useState(false)
  const [cuentaId, setCuentaId] = useState(previo?.datos.cuentaId ?? '')
  const [faltan, setFaltan] = useState<string[]>([])
  const [errorVer, setErrorVer] = useState('')

  const elegido = p.presupuestos.find((s) => s.id === elegidoId) ?? null

  /* Las cuentas corrientes, el celular y la ubicación del cliente: se leen al abrir. */
  useEffect(() => {
    if (previo || !p.cliente) return
    let vivo = true
    conTope(datosClienteObra(p.cliente.id))
      .then((c) => {
        if (!vivo) return
        setCliente(c)
        if (c.cuentas.length === 1) setCuentaId(c.cuentas[0].id)
      })
      .catch(() => vivo && setErrorCliente(true))
    return () => {
      vivo = false
    }
  }, [p.cliente, previo])

  const cargarPlano = async (f: File) => {
    setErrorPlano('')
    setPreparando(true)
    try {
      setPlano(await prepararArchivoParaSubir(f))
    } catch (e) {
      setErrorPlano(e instanceof ArchivoMuyPesado ? e.message : 'No se pudo preparar el plano. Probá de nuevo.')
    } finally {
      setPreparando(false)
    }
  }

  const leyendoCliente = !!p.cliente && !cliente && !errorCliente

  const confirmar = () => {
    if (leyendoCliente || preparando) return
    const f = faltantesGanar({
      presupuestoElegido: !!elegido,
      conPdf: !!elegido?.pdf,
      total,
      conCliente: !!p.cliente,
      cuentas: cliente?.cuentas.length ?? 0,
      cuentaElegida: !!cuentaId,
    })
    if (errorCliente) f.push('No se pudieron leer las cuentas corrientes del cliente. Cerrá la ventana y volvé a intentar.')
    setFaltan(f)
    if (f.length || !elegido || !cliente) return
    onConfirmar({ elegido, cuentaId, total: importeDe(total) ?? 0, plano }, cliente)
  }

  const cuentas = cliente?.cuentas ?? []

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
          <button type="button" className="btn ag-btn-verde" disabled={leyendoCliente || preparando} onClick={confirmar}>
            <i className="fas fa-trophy" /> {fijo ? 'Reintentar' : 'Sí, confirmar presupuesto'}
          </button>
        </>
      }
    >
      <Clave p={p} />
      <p className="modal-nota">
        Dicho presupuesto se confirmará y se registrará como Obra.
      </p>
      {fijo && (
        <p className="ag-irreversible" role="note">
          <i className="fas fa-triangle-exclamation" /> El intento anterior quedó a mitad de camino: se completa con los mismos
          datos.
        </p>
      )}

      {/* `carga-grid`: los campos en bordó, como en la carga del presupuesto. */}
      <div className="carga-grid pres-modal-campos">
        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-pres`}>
            Presupuesto ganado *
          </label>
          <div className="pres-ver-fila">
            <SelectBuscable
              id={`${uid}-pres`}
              valor={elegidoId}
              opciones={p.presupuestos.map((x) => ({ valor: x.id, texto: `${rotulo(x)}${x.pdf ? '' : ' (sin PDF)'}` }))}
              placeholder={p.presupuestos.length ? 'Elegí el presupuesto ganado' : 'No tiene presupuestos enviados'}
              disabled={fijo || p.presupuestos.length <= 1}
              onElegir={(v) => {
                setElegidoId(v)
                setFaltan([])
              }}
            />
            <button
              type="button"
              className="btn btn-out pres-ver"
              disabled={!elegido?.pdf}
              title={elegido?.pdf ? 'Abrir el PDF del presupuesto en otra pestaña' : 'Este presupuesto no tiene PDF'}
              onClick={() => {
                setErrorVer('')
                if (elegido?.pdf) void verPdf(elegido.pdf.assetId).catch(() => setErrorVer('No se pudo abrir el PDF. Probá de nuevo.'))
              }}
            >
              <i className="fas fa-file-pdf" /> Ver presupuesto
            </button>
          </div>
          {errorVer && <span className="pres-error">{errorVer}</span>}
        </div>

        <div className="pres-datos-fijos">
          <Dato l="Tipo de carpintería" v={elegido?.tipo ?? ''} />
          <Dato l="Color" v={elegido?.color ?? ''} />
          <Dato l="Tipo de obra" v={tipoObraDe(elegido?.tipo ?? '')} />
          <Dato l="Cliente" v={p.cliente?.nombre ?? ''} />
          <Dato l="Constructor/Arquitecto" v={p.arquitecto?.nombre || 'SIN ARQUITECTO'} />
          <Dato l="Asignado a" v={responsable} />
        </div>

        {p.cliente && (
          <div className="med-campo">
            <label className="campo-l" htmlFor={`${uid}-cta`}>
              Cuenta corriente *
            </label>
            {leyendoCliente ? (
              <span className="pres-dato-v">
                <i className="fas fa-circle-notch spin" /> Leyendo las cuentas corrientes del cliente...
              </span>
            ) : cuentas.length > 1 ? (
              <SelectBuscable
                id={`${uid}-cta`}
                valor={cuentaId}
                opciones={cuentas.map((c) => ({ valor: c.id, texto: c.nombre }))}
                placeholder="Elegí la cuenta corriente"
                disabled={fijo}
                falta={faltan.some((f) => f.includes('cuenta corriente'))}
                onElegir={setCuentaId}
              />
            ) : (
              <span className="pres-dato-v">
                {cuentas[0]?.nombre ?? (errorCliente ? 'No se pudo leer' : <span className="pres-error">Sin cuenta corriente activa</span>)}
              </span>
            )}
          </div>
        )}

        <div className="med-campo">
          <label className="campo-l" htmlFor={`${uid}-total`}>
            Total Pactado *
          </label>
          <div className={`med-conic ${faltan.some((f) => f.includes('Total')) ? 'pres-falta' : ''}`}>
            <i className="fas fa-dollar-sign" aria-hidden="true" />
            <input
              id={`${uid}-total`}
              className="med-input"
              type="text"
              inputMode="decimal"
              placeholder="Ej.: 1.731.694,48"
              value={total}
              disabled={fijo}
              onChange={(e) => {
                setTotal(e.target.value)
                setFaltan([])
              }}
            />
          </div>
        </div>

        <div className="med-campo">
          <span className="campo-l">
            Plano de Aberturas <span className="med-l-sub">opcional</span>
          </span>
          <div className="carga-grid pres-plano">
            <SoltarArchivo
              id={`${uid}-plano`}
              archivo={plano?.name ?? null}
              estado={preparando ? 'procesando' : errorPlano ? 'error' : plano ? 'listo' : 'vacio'}
              titulo={preparando ? 'Procesando…' : errorPlano ? 'No se pudo cargar' : plano ? 'Plano cargado' : undefined}
              detalle={errorPlano || (plano ? undefined : 'Soltá el PDF del plano de aberturas, o hacé click para elegirlo')}
              deshabilitado={fijo || preparando}
              onArchivo={(f) => void cargarPlano(f)}
              onQuitar={plano && !fijo ? () => setPlano(null) : undefined}
            />
          </div>
        </div>
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

/** Dar el presupuesto por perdido: pasa a "Perdido" y deja de gestionarse. */
export function ModalPerderPresupuesto({
  presupuesto: p,
  onClose,
  onConfirmar,
}: {
  presupuesto: PresupuestoGestion
  onClose: () => void
  onConfirmar: () => void
}) {
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
          <button type="button" className="btn btn-danger" onClick={onConfirmar}>
            <i className="fas fa-thumbs-down" /> Sí, dar por perdido
          </button>
        </>
      }
    >
      <Clave p={p} />
      <p className="modal-nota">
        El presupuesto pasa a <strong>Perdido</strong> y deja de listarse en la consulta.
      </p>
    </Modal>
  )
}
