import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { useApp, useDispatch } from '@/state/hooks'

/** Cuánto se ve el "Enviado exitosamente" antes de que la operación se finalice sola. */
const PAUSA_ENVIADO_MS = 900

/**
 * "Finalizar Operación", el cierre de la última etapa (el de La Batea).
 *
 * Con la orden enviada, registra y abre el cierre (`CierreOperacion`): volver al inicio o elegir
 * otra operación. Sin enviar, pregunta antes: lo
 * que se generó queda en el tablero, pero la orden no le llegó a nadie —y es fácil creer que sí—.
 *
 * Apenas el envío sale bien, se finaliza SOLA: no hace falta tocar el botón. Se deja ver un momento
 * el "Enviado exitosamente" y enseguida se registra y aparece el cierre. El botón queda igual, para
 * finalizar a mano si el registro falló o si se finaliza sin enviar.
 *
 * `registrar`: lo que hay que escribir en Monday al cerrar. Lo usan las órdenes nuevas al cliente
 * (Aluminio y PVC), que no dejan nada en el tablero hasta este botón: la orden, su PDF y su envío
 * se registran recién acá, con la ventana de espera arriba.
 */
export function FinalizarOperacion({
  detalle,
  registrar,
}: {
  detalle?: string
  registrar?: () => Promise<void>
}) {
  const { enviado, accionEnCurso, destino } = useApp()
  const dispatch = useDispatch()
  const [preguntar, setPreguntar] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de registrarse la orden.', registrando)

  /* El cierre automático: sólo cuando el envío pasa a "enviado" estando en esta pantalla. Volver a
     una etapa ya enviada con el stepper no dispara nada; ahí se finaliza con el botón. */
  const enviadoAntes = useRef(enviado)
  const cerrarRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    const recien = enviado && !enviadoAntes.current
    enviadoAntes.current = enviado
    if (!recien) return
    const t = setTimeout(() => void cerrarRef.current(), PAUSA_ENVIADO_MS)
    return () => clearTimeout(t)
  }, [enviado])

  const cerrar = async () => {
    if (registrando) return
    setPreguntar(false)
    if (registrar) {
      setRegistrando(true)
      try {
        await registrar()
      } catch (e) {
        /* El detalle técnico va a la consola; en pantalla, qué pasó y qué hacer. Lo que ya se
           escribió queda en el borrador: el reintento reusa la misma OP. */
        console.warn('[finalizar] no se pudo registrar la orden', e)
        setError(
          'Monday no respondió al intentar registrar la orden. Reintentá en unos segundos; si la falla persiste, contactate con el soporte de TAP.',
        )
        return
      } finally {
        setRegistrando(false)
      }
    }
    dispatch({
      type: 'exito',
      exito: {
        texto: enviado
          ? destino === 'taller'
            ? 'OP enviada al taller'
            : 'OP enviada al cliente'
          : registrar
            ? 'Orden registrada'
            : 'Operación finalizada',
        detalle,
      },
    })
  }

  /* El cierre automático usa la versión de `cerrar` de este render: la que ve el envío recién
     guardado en el borrador. */
  cerrarRef.current = cerrar

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!!accionEnCurso}
        title={accionEnCurso ?? undefined}
        onClick={() => (enviado ? void cerrar() : setPreguntar(true))}
      >
        <i className="fas fa-flag-checkered" /> Finalizar Operación
      </button>

      {preguntar && (
        <Modal
          title="La orden todavía no se envió"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setPreguntar(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPreguntar(false)}>
                Volver
              </button>
              <button type="button" className="btn btn-primary btn-marca" onClick={() => void cerrar()}>
                Finalizar igual
              </button>
            </>
          }
        >
          {registrar
            ? 'La orden se registra en el sistema, pero no le llegó a nadie. Podés mandarla después desde «Consultar órdenes de producción».'
            : 'Lo que se cargó queda guardado en el tablero, pero la orden no le llegó a nadie. Podés mandarla después desde «Consultar órdenes de producción».'}
        </Modal>
      )}

      {registrando && (
        <ModalCargando
          titulo={enviado ? 'Registrando orden y envío en el sistema...' : 'Registrando orden en el sistema...'}
          detalle={
            enviado
              ? 'Guardamos la orden de producción en Monday con su PDF y dejamos constancia del envío. Esperá unos segundos.'
              : 'Guardamos la orden de producción en Monday con su PDF. Esperá unos segundos.'
          }
        />
      )}

      {error && (
        <AvisoModal titulo="No se pudo registrar la orden" onClose={() => setError(null)}>
          {error}
        </AvisoModal>
      )}
    </>
  )
}
