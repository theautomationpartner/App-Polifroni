import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { EditarCelular } from '@/features/envio/EditarCelular'
import { EstadoEnvioContacto } from '@/features/envio/EnviarOp'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { celularValido, formatoMonday, normalizarCelular } from '@/lib/destinatario'
import { actualizarCelularCliente } from '@/services/monday'
import { MensajeTurno } from './MensajeTurno'
import { enviarTextoWsp } from './notificar'

/** El botón "Confirmar y Enviar", con los mismos estados que el envío de la OP. */
type EstadoEnvio = 'idle' | 'enviando' | 'enviado' | 'error'

/** Cuánto queda a la vista "Enviado exitosamente" antes de cerrar. */
const MOSTRAR_OK_MS = 1400

/**
 * Lo que impide mandarle el mensaje al cliente: las mismas reglas del envío de la OP (sin celular,
 * o con uno que WhatsApp no puede usar). Vacío = se puede mandar.
 */
export function faltantesCelular(celular: string): string[] {
  if (!celular) return ['No hay un celular de WhatsApp cargado para el cliente.']
  if (!celularValido(normalizarCelular(celular))) return [`El celular del cliente (${celular}) no tiene un formato válido.`]
  return []
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?'

/**
 * La ventana que pregunta si se le manda un mensaje del turno al cliente: la de la asignación al
 * crearlo, y la de asignación, confirmación y cancelación en la gestión. Es UNA sola, con el mismo
 * comportamiento en todos lados:
 *
 *  - El destinatario como en el envío de la OP: nombre, celular validado y "Editar" (el mismo
 *    `EditarCelular` de Producción, que guarda el número en la ficha del cliente).
 *  - El mensaje real que le llega.
 *  - "Confirmar y Enviar", el botón azul del envío de la OP: Enviando → Enviado exitosamente, o
 *    Error de Envío con el motivo debajo (y se reintenta tocándolo). Con el envío confirmado se
 *    cierra sola (`onTerminar(true)`).
 *  - El botón de no enviar (`textoNo`) cierra sin mandar nada (`onTerminar(false)`).
 *
 * `registrar` deja en el tablero cómo salió cada intento (enviado o error de envío). Si falla, el
 * mensaje ya salió igual: se termina con `onTerminar(true, aviso)`.
 *
 * No se cierra con la X: lo que la abre ya quedó escrito en Monday y hay que elegir qué sigue.
 */
export function EnvioMensaje({
  titulo,
  children,
  texto,
  textoNo,
  cliente,
  registrar,
  onCelular,
  onTerminar,
}: {
  titulo: string
  /** Lo que se explica arriba del destinatario. */
  children?: ReactNode
  texto: string
  textoNo: string
  /** El cliente del turno: su id en 👤 Clientes (para editar el celular), su nombre y su celular. */
  cliente: { id: string; nombre: string; celular: string }
  registrar: (enviado: boolean) => Promise<void>
  /** El celular se corrigió con "Editar": quien abrió la ventana sigue con el número nuevo. */
  onCelular: (celular: string) => void
  onTerminar: (enviado: boolean, aviso?: string) => void
}) {
  const [estado, setEstado] = useState<EstadoEnvio>('idle')
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null)
  useAccionEnCurso('Esperá a que termine el envío del mensaje.', estado === 'enviando')
  useEffect(
    () => () => {
      if (cierre.current) clearTimeout(cierre.current)
    },
    [],
  )

  const celular = cliente.celular
  const celularOk = faltantesCelular(celular).length === 0

  const enviar = async () => {
    if (estado === 'enviando' || estado === 'enviado') return
    const f = faltantesCelular(celular)
    if (f.length) {
      setFaltan(f)
      return
    }
    setError(null)
    setEstado('enviando')
    const envio = await enviarTextoWsp(normalizarCelular(celular), texto)
    if (envio.resultado !== 'enviado') {
      /* Queda constancia en el tablero de que el envío falló. */
      await registrar(false).catch(() => {})
      setError(envio.problema || 'No se pudo enviar el mensaje.')
      setEstado('error')
      return
    }
    let aviso: string | undefined
    try {
      await registrar(true)
    } catch {
      /* El mensaje ya salió: lo que falló es dejarlo anotado. */
      aviso = 'El mensaje se envió, pero no se pudo dejar anotado en el turno de Monday. Revisalo en la Agenda.'
    }
    setEstado('enviado')
    cierre.current = setTimeout(() => onTerminar(true, aviso), MOSTRAR_OK_MS)
  }

  return (
    <>
      <Modal
        title={titulo}
        icon={<i className="fab fa-whatsapp msj-ic" />}
        onClose={() => {}}
        cerrable={false}
        className="ag-modal"
        actions={
          /* No enviar a la izquierda y "Confirmar y Enviar" a la derecha, centrados en la fila. */
          <>
            <button
              type="button"
              className="btn btn-out"
              disabled={estado === 'enviando' || estado === 'enviado'}
              onClick={() => onTerminar(false)}
            >
              {textoNo}
            </button>
            {/* El mismo botón azul del envío de la OP, con sus estados. */}
            <button
              type="button"
              className="btn-block btn-block--enviar btn-mayus"
              style={{
                background: estado === 'enviado' ? 'var(--green)' : estado === 'error' ? 'var(--red)' : 'var(--primary-blue)',
                ...(estado === 'enviado' ? { opacity: 1 } : {}),
              }}
              disabled={estado === 'enviando' || estado === 'enviado'}
              aria-busy={estado === 'enviando'}
              title={estado === 'error' ? 'Tocá para reintentar el envío' : undefined}
              onClick={() => void enviar()}
            >
              {estado === 'enviando' ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando...
                </>
              ) : estado === 'enviado' ? (
                <>
                  <i className="fas fa-check" /> Enviado exitosamente
                </>
              ) : estado === 'error' ? (
                <>
                  <i className="fas fa-xmark" /> Error de Envío
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane" /> Confirmar y Enviar
                </>
              )}
            </button>
          </>
        }
      >
        {children}

        {/* El destinatario, como en el envío de la OP: nombre, celular validado y "Editar". */}
        <div className="selc ag-destinatario">
          <div className={`citem ${celularOk ? '' : 'citem--sin-dato'}`}>
            <div className="cinfo">
              <div className="cava" style={{ background: 'var(--primary-blue)' }}>
                {iniciales(cliente.nombre)}
              </div>
              <div>
                <div className="citem-name">{cliente.nombre || 'Sin nombre'}</div>
                <div className={`citem-sub ${celularOk ? '' : 'citem-sub--falta'}`}>
                  {!celular ? 'SIN TELEFONO' : celularOk ? formatoMonday(celular) : `TELEFONO INVALIDO (${celular})`}
                  <button
                    type="button"
                    className="citem-editar"
                    disabled={estado === 'enviando' || !cliente.id}
                    title={
                      estado === 'enviando'
                        ? 'Esperá a que termine el envío'
                        : !cliente.id
                          ? 'El turno no tiene un cliente vinculado'
                          : undefined
                    }
                    onClick={() => setEditando(true)}
                  >
                    Editar
                  </button>
                </div>
              </div>
            </div>
            <div className="citem-right">
              <span className="cbadge ok">Cliente</span>
              <EstadoEnvioContacto
                estado={estado === 'enviado' ? 'ok' : estado === 'idle' ? 'idle' : estado === 'error' ? 'error' : 'enviando'}
                motivo={error ?? undefined}
              />
            </div>
          </div>
        </div>

        <div className="ag-modal-msj">
          <MensajeTurno texto={texto} celular={celularOk ? normalizarCelular(celular) : ''} />
        </div>

        {/* El detalle del error de envío, arriba de los botones. */}
        {estado === 'error' && error && (
          <div className="enviar-row">
            <div className="enviar-avisos" role="status" aria-live="polite">
              <p className="enviar-aviso enviar-aviso--err">
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                <span style={{ whiteSpace: 'pre-line' }}>
                  <strong>No se pudo enviar.</strong> {error}
                </span>
              </p>
            </div>
          </div>
        )}
      </Modal>

      {editando && cliente.id && (
        <EditarCelular
          rol="Cliente"
          nombre={cliente.nombre}
          actual={celular}
          queSeEnvia="el mensaje del turno"
          guardar={(nuevo) => actualizarCelularCliente(cliente.id, nuevo)}
          onCerrar={() => setEditando(false)}
          onActualizado={(nuevo) => {
            /* Un error de envío anterior ya no corresponde: el número cambió. */
            setError(null)
            setEstado('idle')
            onCelular(nuevo)
          }}
        />
      )}

      {faltan && (
        <AvisoModal titulo="Todavía no se puede enviar" faltantes={faltan} onClose={() => setFaltan(null)}>
          Corregí el celular con «Editar» y volvé a tocar «Confirmar y Enviar»:
        </AvisoModal>
      )}
    </>
  )
}
